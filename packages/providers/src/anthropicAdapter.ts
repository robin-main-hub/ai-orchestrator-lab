import type {
  ModelDescriptor,
  ProviderCompletionMessage,
  ProviderCompletionRequest,
  ProviderCompletionResponse,
} from "@ai-orchestrator/protocol";
import type { AdapterRuntimeContext, LlmAdapter } from "./adapter.js";
import { AdapterError, redactSecretsForLog, truncateForLog } from "./errors.js";
import type { AdapterFetchLike } from "./openAiCompatibleAdapter.js";

/**
 * Anthropic `/v1/messages` adapter.
 *
 * Implements the LlmAdapter contract for any Anthropic-style endpoint:
 * api.anthropic.com directly, or an `anthropic_messages`-compatible reseller
 * (APIKey.fun Claude A/B, etc.) with the base URL swapped out. Aligns with
 * docs/25-anthropic-adapter-spec.md.
 *
 * Key shape differences from the OpenAI-compatible adapter:
 *   - auth header is `x-api-key`, not `Authorization: Bearer`
 *   - system messages are extracted out of `messages` into a top-level
 *     `system` field
 *   - response content is an array of typed blocks (`text` / `tool_use` /...);
 *     v1 of this adapter only handles `text`
 *   - usage carries `input_tokens` / `output_tokens` (+ optional cache
 *     counters), not `prompt_tokens` / `completion_tokens`
 */

/**
 * Where to place `cache_control: ephemeral` breakpoints when prompt caching
 * is enabled. Anthropic caches every block from the start of the request up
 * to (and including) the marked block, so each breakpoint extends the
 * cacheable prefix.
 *
 *   - "system": cache the system prefix only (1 breakpoint at the end of
 *     system). Useful when the agent persona / instructions are the only
 *     stable long prefix and turns differ.
 *   - "system_and_last_user": also cache through the last user turn
 *     (2 breakpoints — system + last user). Useful for repeated
 *     long-context queries where the same documents prefix every turn.
 *
 * Anthropic allows up to 4 breakpoints per request; v1 of this adapter only
 * exposes these two presets. Callers that need bespoke placement should
 * subclass or build the body manually.
 */
export type AnthropicCacheStrategy = "system" | "system_and_last_user";

export type AnthropicAdapterOptions = {
  profileId: string;
  /** Base URL of the Anthropic-compatible endpoint, e.g. https://api.anthropic.com or https://api.apikey.fun */
  baseUrl: string;
  /** Static model list. Anthropic has no /v1/models endpoint, so discoverModels always returns these. */
  modelIds?: string[];
  /** Whether to require a non-empty secret. Defaults to true. */
  requiresAuth?: boolean;
  /** Anthropic version header. Defaults to "2023-06-01" (the long-stable version). */
  anthropicVersion?: string;
  /** Optional beta header values (joined with commas). Reseller endpoints often ignore or reject these. */
  betaHeaders?: string[];
  /** Default cap on output tokens when the caller does not supply one. Defaults to 4096 (decision: docs/25 §2.3 + §11.1). */
  defaultMaxTokens?: number;
  /** Optional default temperature; if undefined the field is omitted from the body. */
  temperature?: number;
  /**
   * Enable Anthropic prompt caching. When `true`:
   *   - injects `prompt-caching-2024-07-31` into the `anthropic-beta` header
   *     (deduplicated against `betaHeaders` so it is never sent twice)
   *   - converts the top-level `system` field from a plain string to a
   *     content-block array carrying `cache_control: ephemeral` on the
   *     last block (cacheable prefix = the whole system prompt)
   *   - if `cacheStrategy === "system_and_last_user"`, also converts the
   *     last user message's `content` to a content-block array with
   *     `cache_control: ephemeral`, extending the cacheable prefix
   *     through that user turn
   *
   * Defaults to `false` (no caching, no header injection) so behavior is
   * backward-compatible. Resellers (APIKey.fun etc.) may not forward the
   * beta header or may strip `cache_control`; verify reseller support
   * before flipping this on for them. Direct `api.anthropic.com` always
   * works. See docs/25 §6 + §13.
   */
  enablePromptCaching?: boolean;
  /** Where to place cache breakpoints. Default `"system"` when caching is enabled, ignored otherwise. */
  cacheStrategy?: AnthropicCacheStrategy;
  /** Extra body fields merged at the top level. */
  extraBody?: Record<string, unknown>;
  /** Extra headers merged onto every request. */
  headers?: Record<string, string>;
  /** Inject fetch for tests; defaults to the global. */
  fetchImpl?: AdapterFetchLike;
};

type AnthropicTextBlock = { type: "text"; text: string };
type AnthropicContentBlock = AnthropicTextBlock | { type: string };

type AnthropicMessageResponse = {
  type?: "message" | "error";
  role?: "assistant";
  model?: string;
  content?: AnthropicContentBlock[];
  stop_reason?: "end_turn" | "max_tokens" | "stop_sequence" | "tool_use" | string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
  error?: {
    type?: string;
    message?: string;
  };
};

const DEFAULT_VERSION = "2023-06-01";
const DEFAULT_MAX_TOKENS = 4096;
const PROMPT_CACHING_BETA_FLAG = "prompt-caching-2024-07-31";
const EPHEMERAL_CACHE_CONTROL = { type: "ephemeral" as const };

type AnthropicTextBlockInput = {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral" };
};
type AnthropicMessageInput = {
  role: "user" | "assistant";
  content: string | AnthropicTextBlockInput[];
};
type AnthropicSystemInput = string | AnthropicTextBlockInput[];

export class AnthropicAdapter implements LlmAdapter {
  readonly profileId: string;
  readonly kind = "anthropic" as const;
  private readonly baseUrl: string;
  private readonly modelIds: string[];
  private readonly requiresAuth: boolean;
  private readonly anthropicVersion: string;
  private readonly betaHeaders: string[];
  private readonly defaultMaxTokens: number;
  private readonly temperature?: number;
  private readonly enablePromptCaching: boolean;
  private readonly cacheStrategy: AnthropicCacheStrategy;
  private readonly extraBody: Record<string, unknown>;
  private readonly headers: Record<string, string>;
  private readonly fetchImpl: AdapterFetchLike;

  constructor(options: AnthropicAdapterOptions) {
    this.profileId = options.profileId;
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.modelIds = options.modelIds ?? [];
    this.requiresAuth = options.requiresAuth ?? true;
    this.anthropicVersion = options.anthropicVersion ?? DEFAULT_VERSION;
    this.betaHeaders = options.betaHeaders ?? [];
    this.defaultMaxTokens = options.defaultMaxTokens ?? DEFAULT_MAX_TOKENS;
    this.temperature = options.temperature;
    this.enablePromptCaching = options.enablePromptCaching ?? false;
    this.cacheStrategy = options.cacheStrategy ?? "system";
    this.extraBody = options.extraBody ?? {};
    this.headers = options.headers ?? {};
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async discoverModels(_ctx: AdapterRuntimeContext): Promise<ModelDescriptor[]> {
    // Anthropic does not publish a /v1/models endpoint, so discovery is a
    // pure static-list operation backed by `modelIds` (typically populated
    // from ServerProviderProxyConfig.defaultModelIds upstream).
    return this.modelIds.map((id) => this.createModelDescriptor(id));
  }

  async complete(
    request: ProviderCompletionRequest,
    ctx: AdapterRuntimeContext,
  ): Promise<ProviderCompletionResponse> {
    const createdAt = new Date().toISOString();
    const endpoint = `${this.baseUrl}/v1/messages`;

    try {
      const secret = await this.resolveSecret(ctx);
      const body = this.createRequestBody(request);
      const response = await this.fetchImpl(endpoint, {
        method: "POST",
        headers: this.createHeaders(secret),
        body: JSON.stringify(body),
        signal: createRequestSignal(ctx),
      });
      const rawText = await response.text();

      if (!response.ok) {
        throw createHttpAdapterError(response, rawText);
      }

      const parsed = JSON.parse(rawText) as AnthropicMessageResponse;
      if (parsed.type === "error") {
        throw new AdapterError(
          "provider",
          `Anthropic returned an error: ${parsed.error?.type ?? "unknown"}`,
          { providerRawSnippet: truncateForLog(redactSecretsForLog(rawText)) },
        );
      }

      if (parsed.stop_reason === "tool_use") {
        // v1 adapter does not support tool use — surface as a failed response
        // so callers can decide to retry without tools or escalate.
        return {
          id: `provider_completion_response_${request.id}_anthropic_tool_use`,
          requestId: request.id,
          providerProfileId: this.profileId,
          modelId: request.modelId,
          route: request.routePreference,
          status: "failed",
          endpoint,
          error: "tool_use_returned_but_not_supported",
          createdAt,
        };
      }

      const content = extractAnthropicText(parsed.content ?? []);
      if (!content) {
        throw new AdapterError("provider", "Anthropic returned an empty text response", {
          providerRawSnippet: truncateForLog(redactSecretsForLog(rawText)),
        });
      }

      return {
        id: `provider_completion_response_${request.id}_anthropic`,
        requestId: request.id,
        providerProfileId: this.profileId,
        modelId: request.modelId,
        route: request.routePreference,
        status: "succeeded",
        content,
        endpoint,
        usage: normalizeAnthropicUsage(parsed.usage),
        createdAt,
      };
    } catch (error) {
      const adapterError = normalizeAnthropicError(error);
      reportAdapterError(ctx, adapterError);
      return {
        id: `provider_completion_response_${request.id}_anthropic_failed`,
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
      throw new AdapterError("auth", "Anthropic provider secret (x-api-key) is missing");
    }
    return secret;
  }

  private createHeaders(secret: string | undefined): Record<string, string> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "anthropic-version": this.anthropicVersion,
      ...this.headers,
    };
    const beta = resolveBetaHeader(this.betaHeaders, this.enablePromptCaching);
    if (beta) {
      headers["anthropic-beta"] = beta;
    }
    if (secret) {
      headers["x-api-key"] = secret;
    }
    return headers;
  }

  private createRequestBody(request: ProviderCompletionRequest) {
    const { system, messages } = splitSystemAndMessages(request.messages);
    assertAnthropicMessageOrder(messages);

    const { system: systemOut, messages: messagesOut } = applyCacheBreakpoints(
      system,
      messages,
      this.enablePromptCaching ? this.cacheStrategy : null,
    );

    const body: Record<string, unknown> = {
      model: request.modelId,
      messages: messagesOut,
      max_tokens: this.defaultMaxTokens,
      ...this.extraBody,
    };
    if (systemOut !== undefined) body.system = systemOut;
    if (typeof this.temperature === "number") body.temperature = this.temperature;
    return body;
  }

  private createModelDescriptor(id: string): ModelDescriptor {
    const lower = id.toLowerCase();
    const isHaiku = lower.includes("haiku");
    const isOpus = lower.includes("opus");
    return {
      id,
      name: id,
      providerProfileId: this.profileId,
      contextWindow: isOpus ? 200_000 : isHaiku ? 200_000 : 200_000,
      supportsStreaming: true,
      supportsTools: !isHaiku,
      inputModalities: lower.includes("haiku") ? ["text"] : ["text", "image", "document"],
      tags: ["anthropic", "messages"],
    };
  }
}

/**
 * Pulls out every system message and joins them with a blank line so the
 * Anthropic top-level `system` field carries the full system context.
 * `tool` messages are dropped with a warning since v1 of this adapter does
 * not propagate tool turns; `user` / `assistant` are kept in original order.
 */
export function splitSystemAndMessages(input: ProviderCompletionMessage[]): {
  system: string | undefined;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
} {
  const systems: string[] = [];
  const others: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const message of input) {
    const content = message.content;
    if (!content || !content.trim()) continue;
    if (message.role === "system") {
      systems.push(content);
    } else if (message.role === "user" || message.role === "assistant") {
      others.push({ role: message.role, content });
    }
    // tool role: silently dropped in v1 (docs/25 §2.1 decision 2)
  }
  return {
    system: systems.length === 0 ? undefined : systems.join("\n\n"),
    messages: others,
  };
}

/**
 * Anthropic requires `messages` to start with user and to alternate user /
 * assistant. We reject violations here so the caller (debate engine, mobile
 * composer) gets a clear bad_request instead of an opaque upstream 400.
 */
function assertAnthropicMessageOrder(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
): void {
  if (messages.length === 0) {
    throw new AdapterError("bad_request", "anthropic: messages must contain at least one user turn");
  }
  if (messages[0]!.role !== "user") {
    throw new AdapterError("bad_request", "anthropic: messages must start with user");
  }
  for (let i = 1; i < messages.length; i += 1) {
    if (messages[i]!.role === messages[i - 1]!.role) {
      throw new AdapterError(
        "bad_request",
        `anthropic: messages must alternate user/assistant; index ${i} has the same role as ${i - 1}`,
      );
    }
  }
}

export function extractAnthropicText(content: AnthropicContentBlock[]): string {
  return content
    .filter((block): block is AnthropicTextBlock => block.type === "text" && typeof (block as AnthropicTextBlock).text === "string")
    .map((block) => block.text)
    .join("")
    .trim();
}

/**
 * Combine the constructor `betaHeaders` list with the prompt-caching beta
 * flag (when caching is enabled) into a single comma-joined
 * `anthropic-beta` header value. Returns `undefined` when there is
 * nothing to send so the caller can skip the header entirely.
 *
 * Deduplicates so a caller that manually added `prompt-caching-2024-07-31`
 * to `betaHeaders` AND set `enablePromptCaching: true` does not see the
 * flag twice (Anthropic ignores duplicates but reseller proxies have been
 * observed to reject them).
 */
export function resolveBetaHeader(
  betaHeaders: readonly string[],
  enablePromptCaching: boolean,
): string | undefined {
  const seen = new Set<string>();
  const flags: string[] = [];
  for (const value of betaHeaders) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    flags.push(trimmed);
  }
  if (enablePromptCaching && !seen.has(PROMPT_CACHING_BETA_FLAG)) {
    flags.push(PROMPT_CACHING_BETA_FLAG);
  }
  return flags.length === 0 ? undefined : flags.join(",");
}

/**
 * Apply `cache_control: ephemeral` breakpoints to the system field and
 * (depending on strategy) the last user message, converting them from
 * plain-string form to Anthropic's typed content-block form.
 *
 * Behavior:
 *   - `strategy === null` (caching disabled): pass through untouched
 *     (`system` stays a string, message contents stay strings) so the
 *     request matches v1 (no-caching) shape exactly.
 *   - `strategy === "system"`: convert system to `[{type:"text", text, cache_control}]`.
 *     If there is no system content, no breakpoint is placed (no error).
 *   - `strategy === "system_and_last_user"`: also rewrite the last user
 *     message's content to a single-block array with `cache_control`.
 *     If `messages` has no user turn (shouldn't happen — asserted earlier
 *     — but defensive), the user breakpoint is skipped silently.
 *
 * Only the LAST occurrence in each scope is marked. Anthropic caches every
 * block from the start up through the marked block, so marking later
 * blocks extends the prefix without needing breakpoints on earlier ones.
 */
export function applyCacheBreakpoints(
  system: string | undefined,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  strategy: AnthropicCacheStrategy | null,
): {
  system: AnthropicSystemInput | undefined;
  messages: AnthropicMessageInput[];
} {
  if (!strategy) {
    return { system, messages };
  }
  const systemOut: AnthropicSystemInput | undefined =
    system && system.length > 0
      ? [{ type: "text", text: system, cache_control: EPHEMERAL_CACHE_CONTROL }]
      : undefined;

  if (strategy === "system") {
    return { system: systemOut, messages };
  }

  // strategy === "system_and_last_user"
  let lastUserIndex = -1;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]!.role === "user") {
      lastUserIndex = i;
      break;
    }
  }
  if (lastUserIndex === -1) {
    return { system: systemOut, messages };
  }
  const messagesOut: AnthropicMessageInput[] = messages.map((m, i) => {
    if (i !== lastUserIndex) return m;
    return {
      role: m.role,
      content: [
        { type: "text", text: m.content, cache_control: EPHEMERAL_CACHE_CONTROL },
      ],
    };
  });
  return { system: systemOut, messages: messagesOut };
}

function normalizeAnthropicUsage(
  usage: AnthropicMessageResponse["usage"],
): ProviderCompletionResponse["usage"] {
  if (!usage) return undefined;
  const input = usage.input_tokens;
  const output = usage.output_tokens;
  const total =
    typeof input === "number" && typeof output === "number" ? input + output : undefined;
  const out: NonNullable<ProviderCompletionResponse["usage"]> = {};
  if (typeof input === "number") out.inputTokens = input;
  if (typeof output === "number") out.outputTokens = output;
  if (typeof total === "number") out.totalTokens = total;
  if (typeof usage.cache_creation_input_tokens === "number")
    out.cacheCreationInputTokens = usage.cache_creation_input_tokens;
  if (typeof usage.cache_read_input_tokens === "number")
    out.cacheReadInputTokens = usage.cache_read_input_tokens;
  return out;
}

function createHttpAdapterError(
  response: { status: number; headers?: { get?: (k: string) => string | null } },
  rawText: string,
) {
  const snippet = truncateForLog(redactSecretsForLog(rawText));
  const status = response.status;
  if (status === 401 || status === 403) {
    return new AdapterError("credential_expired", `anthropic: credentials rejected (${status})`, {
      status,
      providerRawSnippet: snippet,
    });
  }
  if (status === 429) {
    const retryAfter = readRetryAfter(response);
    return new AdapterError("rate_limit", `anthropic: rate limited`, {
      status,
      retryAfterSec: retryAfter,
      providerRawSnippet: snippet,
    });
  }
  if (status >= 400 && status < 500) {
    return new AdapterError("bad_request", `anthropic: upstream rejected the request (${status})`, {
      status,
      providerRawSnippet: snippet,
    });
  }
  if (status === 529) {
    // Anthropic-specific: server overloaded — retry suggested.
    return new AdapterError("provider", `anthropic: overloaded (529)`, {
      status,
      providerRawSnippet: snippet,
    });
  }
  if (status >= 500) {
    return new AdapterError("provider", `anthropic: upstream error (${status})`, {
      status,
      providerRawSnippet: snippet,
    });
  }
  return new AdapterError("unknown", `anthropic: unexpected status (${status})`, {
    status,
    providerRawSnippet: snippet,
  });
}

function readRetryAfter(response: { headers?: { get?: (k: string) => string | null } }): number | undefined {
  const raw = response.headers?.get?.("retry-after");
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeAnthropicError(error: unknown): AdapterError {
  if (error instanceof AdapterError) return error;
  if (error instanceof Error && error.name === "AbortError") {
    return new AdapterError("network", "anthropic request timed out or was aborted", { cause: error });
  }
  return new AdapterError("network", error instanceof Error ? error.message : String(error), {
    cause: error,
  });
}

function reportAdapterError(ctx: AdapterRuntimeContext, error: AdapterError) {
  if (error.providerRawSnippet) {
    ctx.onRawError?.(error.status ?? 0, error.providerRawSnippet);
  }
}

function createRequestSignal(ctx: AdapterRuntimeContext): AbortSignal | undefined {
  if (!ctx.timeoutMs) {
    return ctx.abortSignal;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ctx.timeoutMs);
  (timeout as unknown as { unref?: () => void }).unref?.();
  if (ctx.abortSignal) {
    if (ctx.abortSignal.aborted) {
      controller.abort();
    } else {
      ctx.abortSignal.addEventListener("abort", () => controller.abort(), { once: true });
    }
  }
  controller.signal.addEventListener("abort", () => clearTimeout(timeout), { once: true });
  return controller.signal;
}
