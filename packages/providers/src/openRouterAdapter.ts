import {
  OpenAICompatibleAdapter,
  type OpenAICompatibleAdapterOptions,
} from "./openAiCompatibleAdapter.js";

/**
 * OpenRouter adapter.
 *
 * OpenRouter (https://openrouter.ai) exposes 200+ models from many
 * upstream providers (Anthropic, OpenAI, Google, Mistral, Meta, etc.)
 * behind a single OpenAI-compatible `/v1/chat/completions` endpoint.
 * Because the wire shape matches OpenAI, this adapter is a thin factory
 * over `OpenAICompatibleAdapter` (Codex's file — not modified here) that
 * adds OpenRouter-specific concerns:
 *
 *   - default `baseUrl` of `https://openrouter.ai/api/v1`
 *   - `kind: "openrouter"` so the rest of the system can detect / log
 *     this provider distinctly (model-discovery seeds, trust-level
 *     defaults, and registry entries in `packages/providers/src/index.ts`
 *     already special-case `kind === "openrouter"`)
 *   - `HTTP-Referer` header (optional `appUrl`) — used by OpenRouter's
 *     rankings; without it the request still works but the app does not
 *     accrue stats
 *   - `X-Title` header — display name shown in the OpenRouter dashboard
 *     when reviewing usage; defaults to "AI Orchestrator Lab"
 *   - optional `transforms: ["middle-out"]` body param to enable
 *     OpenRouter's middle-out long-context compression
 *   - optional `route: "fallback"` body param so OpenRouter retries
 *     alternate upstream providers when one fails
 *   - a small static "recommended models" fallback list used when
 *     `/v1/models` discovery fails (network outage, key not entitled,
 *     etc.). Real model list is fetched live from OpenRouter's
 *     well-documented `GET /v1/models` endpoint via the inherited
 *     `OpenAICompatibleAdapter.discoverModels`
 *
 * Wire shape compatibility with OpenAI is exact for the buffered
 * request/response path used here. Streaming (SSE) is identical too but
 * out of scope for v1 (matches docs/31 spec — all 4 network adapters
 * stay buffered until the streaming layer lands).
 *
 * Known v1 limitations (deliberate, documented for follow-up):
 *   - HTTP 402 (Payment Required — OpenRouter returns this when account
 *     credits are exhausted) maps to `AdapterError.bad_request` via the
 *     inherited OpenAI-compatible error mapper, instead of a more
 *     specific `credential_expired`. Fixable in a follow-up by wrapping
 *     `fetchImpl` to pre-detect 402 and throw a typed error. Not done
 *     in v1 to keep this PR a pure factory wrap with zero behavioral
 *     drift from the OpenAI-compatible adapter.
 *   - OpenRouter's optional `usage.cost` field (a USD cost estimate
 *     returned when the request opts in via `usage: { include: true }`)
 *     is not surfaced. `ProviderCompletionUsage` does not have a cost
 *     field today; adding one would touch protocol which is currently
 *     in Codex's permission-edit window.
 *   - Tool / function call (deferred for every buffered adapter, per
 *     docs/24 decision).
 */

const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_APP_TITLE = "AI Orchestrator Lab";

/**
 * Small curated fallback list. Real model list comes from
 * `GET /v1/models` at runtime (OpenRouter has 200+ models with prices
 * and context lengths in the response). This list is only used when
 * the live discovery fails so the UI can still render *something*
 * sensible. Choose models that are stable, widely-used, and span the
 * three "default workloads" the orchestrator typically wants:
 * reasoning (claude-3.5-sonnet, gpt-4o), fast/cheap chat
 * (claude-3.5-haiku, gpt-4o-mini), and OSS fallback (llama-3.3,
 * deepseek, qwen).
 *
 * Exported so callers can opt out and pass their own list.
 */
export const OPENROUTER_RECOMMENDED_FALLBACK_MODELS = [
  "openrouter/auto", // OpenRouter's automatic routing meta-model
  "anthropic/claude-3.5-sonnet",
  "anthropic/claude-3.5-haiku",
  "openai/gpt-4o",
  "openai/gpt-4o-mini",
  "google/gemini-pro-1.5",
  "meta-llama/llama-3.3-70b-instruct",
  "deepseek/deepseek-chat",
  "qwen/qwen-2.5-72b-instruct",
] as const;

export type OpenRouterAdapterOptions = Omit<
  OpenAICompatibleAdapterOptions,
  "baseUrl" | "kind"
> & {
  /**
   * Override the OpenRouter base URL. Defaults to
   * `https://openrouter.ai/api/v1`. The only practical reason to override
   * is a test fixture or an on-prem proxy.
   */
  baseUrl?: string;
  /**
   * App URL sent as `HTTP-Referer`. OpenRouter uses this for ranking
   * apps on their dashboard. Optional — omit for personal/lab use.
   * Should be a full URL (e.g. `"https://orchestrator.endruin.com"`).
   */
  appUrl?: string;
  /**
   * Display name sent as `X-Title`. Shows up in the OpenRouter
   * dashboard's usage and ranking views. Defaults to
   * `"AI Orchestrator Lab"`.
   */
  appTitle?: string;
  /**
   * Enable OpenRouter's middle-out long-context compression by setting
   * `transforms: ["middle-out"]` on every request. Useful when models
   * have small context windows but conversations are long. Off by
   * default — opt in per profile.
   *
   * See: https://openrouter.ai/docs#transforms
   */
  enableMiddleOutCompression?: boolean;
  /**
   * Tell OpenRouter to automatically retry alternate upstream providers
   * when the primary fails. Setting this to `"fallback"` adds
   * `route: "fallback"` to the request body. Off by default — caller
   * may prefer to surface errors and pick the next provider in
   * application code (e.g. to honor permission gating per provider).
   *
   * See: https://openrouter.ai/docs#provider-routing
   */
  routeStrategy?: "fallback";
};

/**
 * Build an OpenRouter adapter as a configured `OpenAICompatibleAdapter`.
 *
 * Returns an `OpenAICompatibleAdapter` instance (not a new subclass) so
 * the full LlmAdapter contract — `discoverModels`, `complete`, error
 * mapping, abort handling, secret redaction — is inherited verbatim.
 * That means OpenRouter automatically picks up any improvement made to
 * the OpenAI-compatible adapter going forward (and conversely, any
 * regression there hits both).
 */
export function createOpenRouterAdapter(
  options: OpenRouterAdapterOptions,
): OpenAICompatibleAdapter {
  const headers: Record<string, string> = { ...(options.headers ?? {}) };

  // X-Title is always sent (cheap, helps with debugging on OpenRouter's
  // side, and gives a stable identity in their dashboard).
  if (!("X-Title" in headers) && !("x-title" in headers)) {
    headers["X-Title"] = options.appTitle ?? DEFAULT_APP_TITLE;
  }
  // HTTP-Referer is optional — only set when the caller provides one,
  // so we don't fabricate a fake referrer URL.
  if (options.appUrl && !("HTTP-Referer" in headers) && !("http-referer" in headers)) {
    headers["HTTP-Referer"] = options.appUrl;
  }

  const extraBody: Record<string, unknown> = { ...(options.extraBody ?? {}) };
  if (options.enableMiddleOutCompression && !("transforms" in extraBody)) {
    extraBody.transforms = ["middle-out"];
  }
  if (options.routeStrategy && !("route" in extraBody)) {
    extraBody.route = options.routeStrategy;
  }

  return new OpenAICompatibleAdapter({
    ...options,
    kind: "openrouter",
    baseUrl: options.baseUrl ?? DEFAULT_BASE_URL,
    modelIds:
      options.modelIds && options.modelIds.length > 0
        ? options.modelIds
        : [...OPENROUTER_RECOMMENDED_FALLBACK_MODELS],
    // OpenRouter ships a real /v1/models endpoint; let discovery use it
    // unless the caller explicitly opts out.
    supportsModelList: options.supportsModelList ?? true,
    // OpenRouter always requires Bearer auth — no anonymous tier.
    requiresAuth: options.requiresAuth ?? true,
    headers,
    extraBody,
  });
}
