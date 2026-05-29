import type {
  ModelDescriptor,
  ProviderCompletionMessage,
  ProviderCompletionRequest,
  ProviderCompletionResponse,
  ProviderKind,
  ProviderCompletionChunkEvent,
} from "@ai-orchestrator/protocol";
import type { AdapterRuntimeContext, LlmAdapter } from "./adapter.js";
import { AdapterError, redactSecretsForLog, truncateForLog } from "./errors.js";
import { createRequestSignal } from "./signal.js";
import { responseToChunks, chunksToLines } from "./streamUtils.js";

export type AdapterFetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
  body?: any;
}>;

export type OpenAICompatibleAdapterOptions = {
  profileId: string;
  kind?: ProviderKind;
  baseUrl: string;
  modelIds?: string[];
  supportsModelList?: boolean;
  requiresAuth?: boolean;
  defaultSystemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  extraBody?: Record<string, unknown>;
  headers?: Record<string, string>;
  fetchImpl?: AdapterFetchLike;
};

type OpenAIChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

type OpenAIModelListResponse = {
  data?: Array<{
    id?: string;
    context_length?: number;
  }>;
};

const DEFAULT_SYSTEM_PROMPT =
  "Answer directly in Korean when the user writes Korean. Do not reveal reasoning or a thinking process.";
const DEFAULT_MAX_TOKENS = 512;
const DEFAULT_TEMPERATURE = 0.2;

export class OpenAICompatibleAdapter implements LlmAdapter {
  readonly profileId: string;
  readonly kind: ProviderKind;
  private readonly baseUrl: string;
  private readonly modelIds: string[];
  private readonly supportsModelList: boolean;
  private readonly requiresAuth: boolean;
  private readonly defaultSystemPrompt: string;
  private readonly maxTokens: number;
  private readonly temperature: number;
  private readonly extraBody: Record<string, unknown>;
  private readonly headers: Record<string, string>;
  private readonly fetchImpl: AdapterFetchLike;

  constructor(options: OpenAICompatibleAdapterOptions) {
    this.profileId = options.profileId;
    this.kind = options.kind ?? "openai";
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.modelIds = options.modelIds ?? [];
    this.supportsModelList = options.supportsModelList ?? true;
    this.requiresAuth = options.requiresAuth ?? true;
    this.defaultSystemPrompt = options.defaultSystemPrompt ?? DEFAULT_SYSTEM_PROMPT;
    this.maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
    this.temperature = options.temperature ?? DEFAULT_TEMPERATURE;
    this.extraBody = options.extraBody ?? {};
    this.headers = options.headers ?? {};
    this.fetchImpl = options.fetchImpl ?? fetch;
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
    const endpoint = `${this.baseUrl}/chat/completions`;

    try {
      const secret = await this.resolveSecret(ctx);
      const response = await this.fetchImpl(endpoint, {
        method: "POST",
        headers: this.createHeaders(secret),
        body: JSON.stringify(this.createRequestBody(request.modelId, request.messages)),
        signal: createRequestSignal(ctx),
      });
      const rawText = await response.text();
      if (!response.ok) {
        throw createHttpAdapterError(response.status, rawText, "chat completion failed");
      }

      const parsed = JSON.parse(rawText) as OpenAIChatCompletionResponse;
      const content = parsed.choices?.[0]?.message?.content?.trim();
      if (!content) {
        throw new AdapterError("provider", "OpenAI-compatible provider returned an empty response", {
          providerRawSnippet: truncateForLog(redactSecretsForLog(rawText)),
        });
      }

      return {
        id: `provider_completion_response_${request.id}_openai_compatible`,
        requestId: request.id,
        providerProfileId: this.profileId,
        modelId: request.modelId,
        route: request.routePreference,
        status: "succeeded",
        content,
        endpoint,
        usage: {
          inputTokens: parsed.usage?.prompt_tokens,
          outputTokens: parsed.usage?.completion_tokens,
          totalTokens: parsed.usage?.total_tokens,
        },
        createdAt,
      };
    } catch (error) {
      const adapterError = normalizeOpenAICompatibleError(error);
      reportAdapterError(ctx, adapterError);
      return {
        id: `provider_completion_response_${request.id}_openai_compatible_failed`,
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
    const endpoint = `${this.baseUrl}/chat/completions`;

    try {
      const secret = await this.resolveSecret(ctx);
      const requestBody = {
        ...this.createRequestBody(request.modelId, request.messages),
        stream: true,
        stream_options: { include_usage: true },
      };

      const response = await this.fetchImpl(endpoint, {
        method: "POST",
        headers: this.createHeaders(secret),
        body: JSON.stringify(requestBody),
        signal: createRequestSignal(ctx),
      });

      if (!response.ok) {
        const rawText = await response.text();
        throw createHttpAdapterError(response.status, rawText, "chat completion streaming failed");
      }

      const chunks = responseToChunks(response.body);
      const lines = chunksToLines(chunks);
      let sequence = 0;
      let finalContent = "";
      let lastUsage: any = undefined;

      for await (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const dataStr = line.slice(5).trim();
        if (dataStr === "[DONE]") {
          break;
        }

        let parsed: any;
        try {
          parsed = JSON.parse(dataStr);
        } catch (e) {
          continue;
        }

        const choice = parsed.choices?.[0];
        const delta = choice?.delta;
        const content = delta?.content;

        if (content) {
          finalContent += content;
          yield {
            type: "delta",
            requestId: request.id,
            sequence: sequence++,
            delta: content,
          };
        }

        if (parsed.usage) {
          lastUsage = {
            inputTokens: parsed.usage.prompt_tokens,
            outputTokens: parsed.usage.completion_tokens,
            totalTokens: parsed.usage.total_tokens,
          };
          yield {
            type: "usage",
            requestId: request.id,
            usage: lastUsage,
          };
        }
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
      const adapterError = normalizeOpenAICompatibleError(error);
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
      throw new AdapterError("auth", "OpenAI-compatible provider secret is missing");
    }
    return secret;
  }

  private createHeaders(secret: string | undefined): Record<string, string> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      ...this.headers,
    };
    if (secret) {
      headers.authorization = `Bearer ${secret}`;
    }
    return headers;
  }

  private createRequestBody(modelId: string, messages: ProviderCompletionMessage[]) {
    return {
      model: modelId,
      messages: createOpenAIChatMessages(messages, this.defaultSystemPrompt),
      max_tokens: this.maxTokens,
      temperature: this.temperature,
      ...this.extraBody,
    };
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
      inputModalities: inferInputModalities(id),
      tags: [this.kind, "openai-compatible"],
    };
  }
}

export function createOpenAIChatMessages(
  messages: ProviderCompletionMessage[],
  defaultSystemPrompt = DEFAULT_SYSTEM_PROMPT,
) {
  const systemParts = [defaultSystemPrompt];
  const chatMessages: Array<{ role: "assistant" | "user" | "tool"; content: string }> = [];

  for (const message of messages) {
    const content = message.content.trim();
    if (!content) continue;
    if (message.role === "system") {
      systemParts.push(content);
      continue;
    }
    chatMessages.push({
      role: message.role === "assistant" ? "assistant" : message.role === "tool" ? "tool" : "user",
      content,
    });
  }

  return [
    {
      role: "system" as const,
      content: systemParts.join("\n\n"),
    },
    ...chatMessages.slice(-8),
  ];
}

// createRequestSignal moved to ./signal.ts.

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

function normalizeOpenAICompatibleError(error: unknown): AdapterError {
  if (error instanceof AdapterError) {
    return error;
  }
  if (error instanceof Error && error.name === "AbortError") {
    return new AdapterError("network", "OpenAI-compatible request timed out or was aborted", { cause: error });
  }
  return new AdapterError("network", error instanceof Error ? error.message : String(error), { cause: error });
}

function reportAdapterError(ctx: AdapterRuntimeContext, error: unknown) {
  const adapterError = normalizeOpenAICompatibleError(error);
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

function inferInputModalities(modelId: string): Array<"text" | "image" | "document"> {
  const id = modelId.toLowerCase();
  const modalities: Array<"text" | "image" | "document"> = ["text"];
  if (/gpt-5|gpt-4\.1|grok|vision|multimodal|omni/.test(id)) {
    modalities.push("image", "document");
  } else if (/qwen|deepseek|coder|rag|kimi/.test(id)) {
    modalities.push("document");
  }
  return Array.from(new Set(modalities));
}
