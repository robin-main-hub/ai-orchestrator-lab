import type {
  ModelDescriptor,
  ProviderCompletionMessage,
  ProviderCompletionRequest,
  ProviderCompletionResponse,
  ProviderCompletionUsage,
  ProviderKind,
  ProviderCompletionChunkEvent,
} from "@ai-orchestrator/protocol";
import type { AdapterRuntimeContext, LlmAdapter } from "./adapter.js";
import { AdapterError, redactSecretsForLog, truncateForLog } from "./errors.js";
import { createRequestSignal } from "./signal.js";
import { responseToChunks, chunksToLines } from "./streamUtils.js";
import type { AdapterFetchLike } from "./openAiCompatibleAdapter.js";

/**
 * Adapter for the OpenAI **Responses API** dialect (`POST {baseUrl}/responses`),
 * as served by the local codexopen proxy (:10200). It differs from the
 * chat-completions dialect: the prompt goes into a top-level `input` array of
 * `{role, content}` turns, the system prompt goes into a top-level
 * `instructions` field, the output budget is `max_output_tokens`, and the
 * answer text is assembled from `output[]` message items whose `content[]`
 * carry `type: "output_text"` parts. Usage is `{input_tokens, output_tokens,
 * total_tokens}`.
 *
 * Model discovery still uses the standard OpenAI `GET {baseUrl}/models`
 * endpoint (the proxy serves it), so it is identical to the chat dialect.
 */
export type OpenAiResponsesAdapterOptions = {
  profileId: string;
  kind?: ProviderKind;
  baseUrl: string;
  modelIds?: string[];
  supportsModelList?: boolean;
  requiresAuth?: boolean;
  defaultSystemPrompt?: string;
  maxTokens?: number;
  /**
   * When set, forwarded as the top-level `temperature`. Left undefined by
   * default because the codexopen proxy fronts many vendors (incl. reasoning
   * models that reject a temperature) — the live-verified request omits it.
   */
  temperature?: number;
  /**
   * Header used to carry the resolved secret. codexopen expects
   * `x-codexopen-api-key: <key>` (only for non-loopback binding); the OpenAI
   * default is `authorization: Bearer <key>`.
   */
  authHeaderName?: string;
  /** Prefix prepended to the secret in the auth header (e.g. "Bearer "). */
  authHeaderValuePrefix?: string;
  headers?: Record<string, string>;
  fetchImpl?: AdapterFetchLike;
  maxContextMessages?: number;
};

export type OpenAiResponsesInputMessage = {
  role: "system" | "assistant" | "user" | "tool";
  content: string;
};

type OpenAiResponsesOutputContentPart = {
  type?: string;
  text?: string;
};

type OpenAiResponsesOutputItem = {
  type?: string;
  role?: string;
  content?: OpenAiResponsesOutputContentPart[];
};

type OpenAiResponsesUsage = {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
};

type OpenAiResponsesResponseBody = {
  id?: string;
  object?: string;
  status?: string;
  error?: unknown;
  output?: OpenAiResponsesOutputItem[];
  output_text?: string;
  usage?: OpenAiResponsesUsage;
};

type OpenAIModelListResponse = {
  data?: Array<{
    id?: string;
    context_length?: number;
  }>;
};

const DEFAULT_SYSTEM_PROMPT =
  "Answer directly in Korean when the user writes Korean. Do not reveal reasoning or a thinking process.";
const DEFAULT_MAX_TOKENS = 4096;

export class OpenAiResponsesAdapter implements LlmAdapter {
  readonly profileId: string;
  readonly kind: ProviderKind;
  private readonly baseUrl: string;
  private readonly modelIds: string[];
  private readonly supportsModelList: boolean;
  private readonly requiresAuth: boolean;
  private readonly defaultSystemPrompt: string;
  private readonly maxTokens: number;
  private readonly temperature: number | undefined;
  private readonly authHeaderName: string;
  private readonly authHeaderValuePrefix: string;
  private readonly headers: Record<string, string>;
  private readonly fetchImpl: AdapterFetchLike;
  private readonly maxContextMessages: number;

  constructor(options: OpenAiResponsesAdapterOptions) {
    this.profileId = options.profileId;
    this.kind = options.kind ?? "openai";
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.modelIds = options.modelIds ?? [];
    this.supportsModelList = options.supportsModelList ?? true;
    this.requiresAuth = options.requiresAuth ?? true;
    this.defaultSystemPrompt = options.defaultSystemPrompt ?? DEFAULT_SYSTEM_PROMPT;
    this.maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
    this.temperature = options.temperature;
    this.authHeaderName = (options.authHeaderName ?? "authorization").toLowerCase();
    this.authHeaderValuePrefix =
      options.authHeaderValuePrefix ?? (this.authHeaderName === "authorization" ? "Bearer " : "");
    this.headers = options.headers ?? {};
    this.fetchImpl = options.fetchImpl ?? (fetch as unknown as AdapterFetchLike);
    this.maxContextMessages = options.maxContextMessages ?? 30;
  }

  async discoverModels(ctx: AdapterRuntimeContext): Promise<ModelDescriptor[]> {
    if (!this.supportsModelList) {
      return this.createStaticModels();
    }

    const endpoint = `${this.baseUrl}/models`;
    try {
      const secret = await this.resolveSecret(ctx);
      const response = await this.fetchImpl(endpoint, {
        method: "GET",
        headers: this.createHeaders(secret),
        signal: createRequestSignal(ctx),
      });
      const rawText = await response.text();
      if (!response.ok) {
        throw createHttpAdapterError(response.status, rawText, "model discovery failed");
      }

      const parsed = JSON.parse(rawText) as OpenAIModelListResponse;
      const models = (parsed.data ?? [])
        .map((entry) => entry.id?.trim())
        .filter((id): id is string => Boolean(id));

      return (models.length ? models : this.modelIds).map((id) => this.createModelDescriptor(id));
    } catch (error) {
      reportAdapterError(ctx, error);
      return this.createStaticModels();
    }
  }

  async complete(
    request: ProviderCompletionRequest,
    ctx: AdapterRuntimeContext,
  ): Promise<ProviderCompletionResponse> {
    const createdAt = new Date().toISOString();
    const endpoint = `${this.baseUrl}/responses`;

    try {
      const secret = await this.resolveSecret(ctx);
      const response = await this.fetchImpl(endpoint, {
        method: "POST",
        headers: this.createHeaders(secret),
        body: JSON.stringify(this.createRequestBody(request)),
        signal: createRequestSignal(ctx),
      });
      const rawText = await response.text();
      if (!response.ok) {
        throw createHttpAdapterError(response.status, rawText, "responses completion failed");
      }

      const parsed = JSON.parse(rawText) as OpenAiResponsesResponseBody;
      // A 200 can still carry a proxied provider error or an unfinished status.
      const providerError = extractResponsesError(parsed);
      if (providerError) {
        throw new AdapterError("provider", `responses completion failed: ${providerError}`, {
          providerRawSnippet: truncateForLog(redactSecretsForLog(rawText)),
        });
      }

      const content = parseResponsesOutputText(parsed).trim();
      if (!content) {
        throw new AdapterError("provider", "OpenAI Responses provider returned an empty response", {
          providerRawSnippet: truncateForLog(redactSecretsForLog(rawText)),
        });
      }

      return {
        id: `provider_completion_response_${request.id}_openai_responses`,
        requestId: request.id,
        providerProfileId: this.profileId,
        modelId: request.modelId,
        route: request.routePreference,
        status: "succeeded",
        content,
        endpoint,
        usage: parseResponsesUsage(parsed.usage),
        createdAt,
      };
    } catch (error) {
      const adapterError = normalizeOpenAiResponsesError(error);
      reportAdapterError(ctx, adapterError);
      return {
        id: `provider_completion_response_${request.id}_openai_responses_failed`,
        requestId: request.id,
        providerProfileId: this.profileId,
        modelId: request.modelId,
        route: request.routePreference,
        status: "failed",
        endpoint,
        error: `[${adapterError.category}] ${adapterError.message}`,
        createdAt,
      };
    }
  }

  async *completeStreaming(
    request: ProviderCompletionRequest,
    ctx: AdapterRuntimeContext,
  ): AsyncIterable<ProviderCompletionChunkEvent> {
    const createdAt = new Date().toISOString();
    const endpoint = `${this.baseUrl}/responses`;

    try {
      const secret = await this.resolveSecret(ctx);
      const response = await this.fetchImpl(endpoint, {
        method: "POST",
        headers: this.createHeaders(secret),
        body: JSON.stringify({ ...this.createRequestBody(request), stream: true }),
        signal: createRequestSignal(ctx),
      });

      if (!response.ok) {
        const rawText = await response.text();
        throw createHttpAdapterError(response.status, rawText, "responses streaming failed");
      }

      const chunks = responseToChunks(response.body);
      const lines = chunksToLines(chunks);
      let sequence = 0;
      let finalContent = "";
      let lastUsage: ProviderCompletionUsage | undefined;
      let providerError: string | undefined;

      for await (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const dataStr = line.slice(5).trim();
        if (!dataStr || dataStr === "[DONE]") {
          continue;
        }

        let parsed: any;
        try {
          parsed = JSON.parse(dataStr);
        } catch {
          continue;
        }

        const eventType = parsed?.type;
        if (eventType === "response.output_text.delta") {
          const delta = typeof parsed.delta === "string" ? parsed.delta : "";
          if (delta) {
            finalContent += delta;
            yield {
              type: "delta",
              requestId: request.id,
              sequence: sequence++,
              delta,
            };
          }
          continue;
        }

        if (eventType === "response.completed" || eventType === "response.incomplete") {
          const body = parsed.response as OpenAiResponsesResponseBody | undefined;
          if (body) {
            const err = extractResponsesError(body);
            if (err) {
              providerError = err;
            }
            if (body.usage) {
              lastUsage = parseResponsesUsage(body.usage);
              yield { type: "usage", requestId: request.id, usage: lastUsage };
            }
            // Prefer the fully-assembled text if deltas were sparse/missing.
            const assembled = parseResponsesOutputText(body).trim();
            if (assembled && assembled.length > finalContent.length) {
              finalContent = assembled;
            }
          }
          continue;
        }

        if (eventType === "response.failed" || eventType === "error") {
          providerError =
            extractResponsesError(parsed.response ?? parsed) ?? "responses stream reported an error";
          continue;
        }
      }

      if (providerError) {
        throw new AdapterError("provider", `responses streaming failed: ${providerError}`);
      }

      yield {
        type: "done",
        requestId: request.id,
        finalContent,
        stopReason: "end_turn",
        usage: lastUsage,
        endpoint,
        createdAt,
        completedAt: new Date().toISOString(),
      };
    } catch (error) {
      const adapterError = normalizeOpenAiResponsesError(error);
      reportAdapterError(ctx, adapterError);
      yield {
        type: "error",
        requestId: request.id,
        error: {
          category: adapterError.category,
          message: adapterError.message,
          status: adapterError.status,
          retryAfterSec: adapterError.retryAfterSec,
          providerRawSnippet: adapterError.providerRawSnippet,
        },
      };
    }
  }

  private async resolveSecret(ctx: AdapterRuntimeContext) {
    const secret = await ctx.resolveSecret();
    if (this.requiresAuth && !secret) {
      throw new AdapterError("auth", "OpenAI Responses provider secret is missing");
    }
    return secret;
  }

  private createHeaders(secret: string | undefined): Record<string, string> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      ...this.headers,
    };
    if (secret) {
      headers[this.authHeaderName] = `${this.authHeaderValuePrefix}${secret}`;
    }
    return headers;
  }

  private createRequestBody(request: ProviderCompletionRequest): Record<string, unknown> {
    return createResponsesRequestBody(request, {
      defaultSystemPrompt: this.defaultSystemPrompt,
      maxTokens: this.maxTokens,
      temperature: this.temperature,
      maxContextMessages: this.maxContextMessages,
    });
  }

  private createStaticModels() {
    return this.modelIds.map((id) => this.createModelDescriptor(id));
  }

  private createModelDescriptor(id: string): ModelDescriptor {
    return {
      id,
      name: id,
      providerProfileId: this.profileId,
      contextWindow: inferContextWindow(id),
      supportsStreaming: true,
      supportsTools: !/mini|haiku|flash/i.test(id),
      inputModalities: ["text"],
      tags: [this.kind, "openai-responses"],
    };
  }
}

/**
 * Builds the Responses API request body. System turns are concatenated into
 * `instructions`; the remaining turns become the `input` array. The default
 * system prompt is prepended so behavior matches the chat dialect.
 */
export function createResponsesRequestBody(
  request: ProviderCompletionRequest,
  options: {
    defaultSystemPrompt?: string;
    maxTokens?: number;
    temperature?: number;
    maxContextMessages?: number;
  } = {},
): Record<string, unknown> {
  const { instructions, input } = createResponsesInput(
    request.messages,
    options.defaultSystemPrompt ?? DEFAULT_SYSTEM_PROMPT,
    options.maxContextMessages ?? 30,
  );

  const body: Record<string, unknown> = {
    model: request.modelId,
    input,
    max_output_tokens: request.maxOutputTokens ?? options.maxTokens ?? DEFAULT_MAX_TOKENS,
  };
  if (instructions) {
    body.instructions = instructions;
  }
  if (typeof options.temperature === "number") {
    body.temperature = options.temperature;
  }
  return body;
}

/**
 * Splits provider messages into the Responses `instructions` string (from
 * system turns, with the default prompt first) and the `input` message array
 * (user/assistant/tool turns, capped to the most recent `maxContextMessages`).
 */
export function createResponsesInput(
  messages: ProviderCompletionMessage[],
  defaultSystemPrompt = DEFAULT_SYSTEM_PROMPT,
  maxContextMessages = 30,
): { instructions: string; input: OpenAiResponsesInputMessage[] } {
  const contextLimit = Math.max(0, Math.trunc(maxContextMessages));
  const systemParts = defaultSystemPrompt ? [defaultSystemPrompt] : [];
  const input: OpenAiResponsesInputMessage[] = [];

  for (const message of messages) {
    if (typeof message.content !== "string") continue;
    const content = message.content.trim();
    if (!content) continue;
    if (message.role === "system") {
      systemParts.push(content);
      continue;
    }
    input.push({
      role: message.role === "assistant" ? "assistant" : message.role === "tool" ? "tool" : "user",
      content,
    });
  }

  return {
    instructions: systemParts.join("\n\n"),
    input: contextLimit > 0 ? input.slice(-contextLimit) : [],
  };
}

/**
 * Assembles the answer text from a Responses body: every `output[]` item of
 * type "message" contributes its `content[]` parts of type "output_text".
 * Falls back to a top-level `output_text` convenience field if present.
 */
export function parseResponsesOutputText(body: OpenAiResponsesResponseBody): string {
  const parts: string[] = [];
  for (const item of body.output ?? []) {
    if (item?.type && item.type !== "message") continue;
    for (const part of item?.content ?? []) {
      if (part?.type === "output_text" && typeof part.text === "string") {
        parts.push(part.text);
      }
    }
  }
  if (parts.length === 0 && typeof body.output_text === "string") {
    return body.output_text;
  }
  return parts.join("");
}

/** Maps Responses `{input_tokens, output_tokens, total_tokens}` → meter usage. */
export function parseResponsesUsage(usage: OpenAiResponsesUsage | undefined): ProviderCompletionUsage {
  return {
    inputTokens: usage?.input_tokens,
    outputTokens: usage?.output_tokens,
    totalTokens: usage?.total_tokens,
  };
}

/**
 * Surfaces a proxied provider error carried inside a 200 body (the codexopen
 * proxy sometimes wraps an upstream failure as JSON) or an unfinished status.
 * Returns a human-readable message, or undefined when the response is a clean
 * completion.
 */
function extractResponsesError(body: OpenAiResponsesResponseBody | undefined): string | undefined {
  if (!body) return undefined;
  const error = (body as { error?: unknown }).error;
  if (error) {
    if (typeof error === "string") return error;
    if (typeof error === "object") {
      const message = (error as { message?: unknown }).message;
      if (typeof message === "string" && message) return message;
      const detail = (error as { detail?: unknown }).detail;
      if (typeof detail === "string" && detail) return detail;
      return truncateForLog(redactSecretsForLog(JSON.stringify(error)));
    }
  }
  const detail = (body as { detail?: unknown }).detail;
  if (typeof detail === "string" && detail) return detail;
  if (body.status && body.status !== "completed" && body.status !== "in_progress") {
    // "failed" / "incomplete" / "cancelled" with no usable output
    if (parseResponsesOutputText(body).trim().length === 0) {
      return `provider returned status "${body.status}"`;
    }
  }
  return undefined;
}

function createHttpAdapterError(status: number, rawText: string, label: string) {
  const snippet = truncateForLog(redactSecretsForLog(rawText));
  if (status === 401 || status === 403) {
    return new AdapterError("credential_expired", `${label}: upstream rejected credentials (${status})`, {
      status,
      providerRawSnippet: snippet,
    });
  }
  if (status === 429) {
    return new AdapterError("rate_limit", `${label}: upstream rate limited the request`, {
      status,
      providerRawSnippet: snippet,
    });
  }
  if (status >= 400 && status < 500) {
    return new AdapterError("bad_request", `${label}: upstream rejected the request (${status})`, {
      status,
      providerRawSnippet: snippet,
    });
  }
  if (status >= 500) {
    return new AdapterError("provider", `${label}: upstream provider failed (${status})`, {
      status,
      providerRawSnippet: snippet,
    });
  }
  return new AdapterError("unknown", `${label}: unexpected upstream status (${status})`, {
    status,
    providerRawSnippet: snippet,
  });
}

function normalizeOpenAiResponsesError(error: unknown): AdapterError {
  if (error instanceof AdapterError) {
    return error;
  }
  if (error instanceof Error && error.name === "AbortError") {
    return new AdapterError("network", "OpenAI Responses request timed out or was aborted", { cause: error });
  }
  return new AdapterError("network", error instanceof Error ? error.message : String(error), { cause: error });
}

function reportAdapterError(ctx: AdapterRuntimeContext, error: unknown) {
  const adapterError = normalizeOpenAiResponsesError(error);
  if (adapterError.providerRawSnippet) {
    ctx.onRawError?.(adapterError.status ?? 0, adapterError.providerRawSnippet);
  }
}

function inferContextWindow(modelId: string) {
  const id = modelId.toLowerCase();
  if (id.includes("qwen") || id.includes("gpt-5") || id.includes("grok") || id.includes("deepseek")) {
    return 128_000;
  }
  if (id.includes("o3") || id.includes("o4")) {
    return 200_000;
  }
  return 64_000;
}
