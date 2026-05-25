import type {
  ModelDescriptor,
  ProviderCompletionMessage,
  ProviderCompletionRequest,
  ProviderCompletionResponse,
} from "@ai-orchestrator/protocol";
import type { AdapterRuntimeContext, LlmAdapter } from "./adapter.js";
import { AdapterError, redactSecretsForLog, truncateForLog } from "./errors.js";
import type { AdapterFetchLike } from "./openAiCompatibleAdapter.js";
import { createRequestSignal } from "./signal.js";

/**
 * Ollama `/api/chat` adapter.
 *
 * Local-first LLM runner used as a fallback / private RAG worker per the
 * work-board model hierarchy. Default base URL targets a local Ollama
 * daemon. No authentication — Ollama exposes its API on localhost by
 * design, so `requiresAuth` defaults to false.
 *
 * Differences from the OpenAI-compatible wire format:
 *   - endpoint is `/api/chat` (not `/v1/chat/completions`)
 *   - request body uses `options.num_predict` and `options.temperature`,
 *     not flat top-level `max_tokens` / `temperature`
 *   - response shape is `{ message: { content }, prompt_eval_count,
 *     eval_count, done, done_reason }`, not the OpenAI `choices` envelope
 *   - model list lives at `/api/tags`, response keyed by `models[].name`
 *   - streaming is line-delimited JSON (one JSON object per line); v1
 *     of this adapter forces `stream: false` and treats the buffered
 *     reply as authoritative
 */

export type OllamaAdapterOptions = {
  profileId: string;
  /** Base URL of the Ollama daemon. Default: http://127.0.0.1:11434 */
  baseUrl?: string;
  /**
   * Fallback model list when /api/tags is unreachable or empty. Most
   * deployments leave this empty and let discovery fill it dynamically.
   */
  modelIds?: string[];
  /** Require a non-empty secret. Defaults to false (Ollama is local, no auth). */
  requiresAuth?: boolean;
  /** Output token cap (num_predict). Default: 512. */
  defaultNumPredict?: number;
  /** Sampling temperature. Default: 0.2. */
  temperature?: number;
  /** Extra options merged into the body's `options` object. */
  extraOptions?: Record<string, unknown>;
  /** Extra body fields merged at the top level. */
  extraBody?: Record<string, unknown>;
  /** Extra headers merged onto every request. */
  headers?: Record<string, string>;
  /** Inject fetch for tests; defaults to the global. */
  fetchImpl?: AdapterFetchLike;
};

type OllamaChatResponse = {
  model?: string;
  created_at?: string;
  message?: {
    role?: string;
    content?: string;
  };
  done?: boolean;
  done_reason?: "stop" | "length" | "load" | string;
  prompt_eval_count?: number;
  eval_count?: number;
  total_duration?: number;
  error?: string;
};

type OllamaTagsResponse = {
  models?: Array<{
    name?: string;
    model?: string;
    size?: number;
    digest?: string;
    details?: {
      family?: string;
      parameter_size?: string;
      quantization_level?: string;
    };
  }>;
};

const DEFAULT_BASE_URL = "http://127.0.0.1:11434";
const DEFAULT_NUM_PREDICT = 512;
const DEFAULT_TEMPERATURE = 0.2;

export class OllamaAdapter implements LlmAdapter {
  readonly profileId: string;
  readonly kind = "ollama" as const;
  private readonly baseUrl: string;
  private readonly modelIds: string[];
  private readonly requiresAuth: boolean;
  private readonly defaultNumPredict: number;
  private readonly temperature: number;
  private readonly extraOptions: Record<string, unknown>;
  private readonly extraBody: Record<string, unknown>;
  private readonly headers: Record<string, string>;
  private readonly fetchImpl: AdapterFetchLike;

  constructor(options: OllamaAdapterOptions) {
    this.profileId = options.profileId;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.modelIds = options.modelIds ?? [];
    this.requiresAuth = options.requiresAuth ?? false;
    this.defaultNumPredict = options.defaultNumPredict ?? DEFAULT_NUM_PREDICT;
    this.temperature = options.temperature ?? DEFAULT_TEMPERATURE;
    this.extraOptions = options.extraOptions ?? {};
    this.extraBody = options.extraBody ?? {};
    this.headers = options.headers ?? {};
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async discoverModels(ctx: AdapterRuntimeContext): Promise<ModelDescriptor[]> {
    const endpoint = `${this.baseUrl}/api/tags`;
    try {
      const secret = await this.resolveSecret(ctx);
      const response = await this.fetchImpl(endpoint, {
        method: "GET",
        headers: this.createHeaders(secret),
        signal: createRequestSignal(ctx),
      });
      const rawText = await response.text();
      if (!response.ok) {
        throw createHttpAdapterError(response.status, rawText, "ollama model discovery failed");
      }
      const parsed = JSON.parse(rawText) as OllamaTagsResponse;
      const names = (parsed.models ?? [])
        .map((entry) => entry.name?.trim() || entry.model?.trim())
        .filter((id): id is string => Boolean(id));
      const ids = names.length > 0 ? names : this.modelIds;
      return ids.map((id) => this.createModelDescriptor(id));
    } catch (error) {
      reportAdapterError(ctx, error);
      // Ollama discovery is best-effort: if /api/tags is unreachable
      // (daemon not running, wrong port) we still surface whatever static
      // modelIds the caller provided so the UI shows something pickable.
      return this.modelIds.map((id) => this.createModelDescriptor(id));
    }
  }

  async complete(
    request: ProviderCompletionRequest,
    ctx: AdapterRuntimeContext,
  ): Promise<ProviderCompletionResponse> {
    const createdAt = new Date().toISOString();
    const endpoint = `${this.baseUrl}/api/chat`;

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
        throw createHttpAdapterError(response.status, rawText, "ollama chat completion failed");
      }

      const parsed = JSON.parse(rawText) as OllamaChatResponse;

      // Ollama can return 200 with an `error` field set (e.g. model not
      // loaded, bad payload). Treat as provider error.
      if (parsed.error) {
        throw new AdapterError("provider", `ollama returned an error: ${parsed.error}`, {
          providerRawSnippet: truncateForLog(redactSecretsForLog(rawText)),
        });
      }

      const content = parsed.message?.content?.trim();
      if (!content) {
        throw new AdapterError("provider", "ollama returned an empty response", {
          providerRawSnippet: truncateForLog(redactSecretsForLog(rawText)),
        });
      }

      return {
        id: `provider_completion_response_${request.id}_ollama`,
        requestId: request.id,
        providerProfileId: this.profileId,
        modelId: request.modelId,
        route: request.routePreference,
        status: "succeeded",
        content,
        endpoint,
        usage: normalizeOllamaUsage(parsed),
        createdAt,
      };
    } catch (error) {
      const adapterError = normalizeOllamaError(error);
      reportAdapterError(ctx, adapterError);
      return {
        id: `provider_completion_response_${request.id}_ollama_failed`,
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

  private async resolveSecret(ctx: AdapterRuntimeContext) {
    const secret = await ctx.resolveSecret();
    if (this.requiresAuth && !secret) {
      throw new AdapterError("auth", "ollama provider secret is missing");
    }
    return secret;
  }

  private createHeaders(secret: string | undefined): Record<string, string> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      ...this.headers,
    };
    if (secret) {
      // Some deployments front Ollama with a reverse proxy that wants a
      // Bearer token; honor that when the caller passed one.
      headers.authorization = `Bearer ${secret}`;
    }
    return headers;
  }

  private createRequestBody(request: ProviderCompletionRequest) {
    return {
      model: request.modelId,
      messages: createOllamaMessages(request.messages),
      stream: false,
      options: {
        num_predict: this.defaultNumPredict,
        temperature: this.temperature,
        ...this.extraOptions,
      },
      ...this.extraBody,
    };
  }

  private createModelDescriptor(id: string): ModelDescriptor {
    const lower = id.toLowerCase();
    return {
      id,
      name: id,
      providerProfileId: this.profileId,
      contextWindow: inferOllamaContextWindow(lower),
      supportsStreaming: true,
      // Ollama tools depend on the underlying model + Ollama version;
      // be conservative and disable for the small models we'd typically
      // run locally.
      supportsTools: !/mini|tiny|small|phi/i.test(lower),
      inputModalities: /llava|vision|moondream/.test(lower) ? ["text", "image"] : ["text"],
      tags: ["ollama", "local"],
    };
  }
}

/**
 * Maps the protocol-side message shape to Ollama's chat format. system
 * messages stay inline in the messages array (unlike Anthropic's
 * top-level system field). tool-role messages are dropped — Ollama
 * supports them on tool-capable models but v1 of this adapter does not
 * propagate tool turns.
 */
export function createOllamaMessages(input: ProviderCompletionMessage[]): Array<{
  role: "system" | "user" | "assistant";
  content: string;
}> {
  const out: Array<{ role: "system" | "user" | "assistant"; content: string }> = [];
  for (const message of input) {
    const content = message.content;
    if (!content || !content.trim()) continue;
    if (message.role === "system" || message.role === "user" || message.role === "assistant") {
      out.push({ role: message.role, content });
    }
    // tool role: dropped in v1 (matches Anthropic / OpenAI-compatible v1 behavior)
  }
  return out;
}

function normalizeOllamaUsage(
  parsed: OllamaChatResponse,
): ProviderCompletionResponse["usage"] {
  const input = parsed.prompt_eval_count;
  const output = parsed.eval_count;
  if (typeof input !== "number" && typeof output !== "number") return undefined;
  const total =
    typeof input === "number" && typeof output === "number" ? input + output : undefined;
  const usage: NonNullable<ProviderCompletionResponse["usage"]> = {};
  if (typeof input === "number") usage.inputTokens = input;
  if (typeof output === "number") usage.outputTokens = output;
  if (typeof total === "number") usage.totalTokens = total;
  return usage;
}

function createHttpAdapterError(status: number, rawText: string, label: string) {
  const snippet = truncateForLog(redactSecretsForLog(rawText));
  // Ollama does not authenticate by default; a 401/403 here means a
  // reverse proxy rejected us, not the daemon itself.
  if (status === 401 || status === 403) {
    return new AdapterError("auth", `${label}: ${status} (reverse-proxy rejection)`, {
      status,
      providerRawSnippet: snippet,
    });
  }
  if (status === 404) {
    return new AdapterError("bad_request", `${label}: model not loaded or wrong path (404)`, {
      status,
      providerRawSnippet: snippet,
    });
  }
  if (status === 429) {
    return new AdapterError("rate_limit", `${label}: throttled`, {
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
  return new AdapterError("unknown", `${label}: unexpected status (${status})`, {
    status,
    providerRawSnippet: snippet,
  });
}

function normalizeOllamaError(error: unknown): AdapterError {
  if (error instanceof AdapterError) return error;
  if (error instanceof Error && error.name === "AbortError") {
    return new AdapterError("network", "ollama request timed out or was aborted", { cause: error });
  }
  return new AdapterError("network", error instanceof Error ? error.message : String(error), {
    cause: error,
  });
}

function reportAdapterError(ctx: AdapterRuntimeContext, error: unknown) {
  const adapterError = normalizeOllamaError(error);
  if (adapterError.providerRawSnippet) {
    ctx.onRawError?.(adapterError.status ?? 0, adapterError.providerRawSnippet);
  }
}

// createRequestSignal moved to ./signal.ts.

function inferOllamaContextWindow(modelIdLower: string): number {
  if (/qwen|deepseek|gpt-oss|grok|claude/.test(modelIdLower)) return 128_000;
  if (/llama3|llama-3|gemma2|gemma-2/.test(modelIdLower)) return 128_000;
  if (/mistral|mixtral|phi/.test(modelIdLower)) return 32_768;
  return 8_192;
}
