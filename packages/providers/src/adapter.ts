import type {
  ModelDescriptor,
  ProviderCompletionRequest,
  ProviderCompletionResponse,
  ProviderKind,
  ProviderCompletionChunkEvent,
} from "@ai-orchestrator/protocol";

/**
 * Runtime context passed to every adapter call. Lets the adapter resolve
 * its credential lazily (so the secret can come from the server's secret
 * vault, desktop keychain, or an OAuth session manager without changing
 * the adapter shape) and observe abort/timeout signals.
 *
 * Adapters MUST NOT hold raw secrets in closure — always resolve through
 * the context so credential rotation and OAuth refresh stay outside the
 * adapter boundary (docs/24 decision #2, #5).
 */
export type AdapterRuntimeContext = {
  resolveSecret(): Promise<string | undefined>;
  abortSignal?: AbortSignal;
  timeoutMs?: number;
  /**
   * Optional sink for raw upstream error bodies. The adapter must
   * already have run redactSecretsForLog on the snippet before calling.
   */
  onRawError?: (status: number, redactedSnippet: string) => void;
};

/**
 * The provider-facing adapter contract. Every concrete adapter (OpenAI-
 * compatible base, Anthropic, Ollama, OpenRouter, DGX vLLM) implements
 * this single interface so the server's completion proxy and the
 * desktop's direct-call path can route through one boundary.
 *
 * Naming note: this is the v2 contract. The existing `ProviderAdapter`
 * and `MockProviderAdapter` exports from index.ts are kept as deprecated
 * aliases until every call site migrates onto LlmAdapter, per docs/24
 * decision #6.
 */
export interface LlmAdapter {
  readonly profileId: string;
  readonly kind: ProviderKind;
  discoverModels(ctx: AdapterRuntimeContext): Promise<ModelDescriptor[]>;
  complete(
    request: ProviderCompletionRequest,
    ctx: AdapterRuntimeContext,
  ): Promise<ProviderCompletionResponse>;
  completeStreaming?(
    request: ProviderCompletionRequest,
    ctx: AdapterRuntimeContext,
  ): AsyncIterable<ProviderCompletionChunkEvent>;
}

export type CreateAdapterContextParams = {
  /**
   * Either a literal secret or a resolver. Resolver form is preferred so
   * the credential never lives in adapter closure state.
   */
  secret?: string | (() => Promise<string | undefined>);
  abortSignal?: AbortSignal;
  timeoutMs?: number;
  onRawError?: (status: number, redactedSnippet: string) => void;
};

/**
 * Convenience builder for AdapterRuntimeContext. Most call sites can
 * pass a literal secret string; long-lived clients (server, desktop)
 * should pass a resolver that consults their vault each call.
 */
export function createAdapterContext(params: CreateAdapterContextParams = {}): AdapterRuntimeContext {
  const secret = params.secret;
  const resolveSecret: () => Promise<string | undefined> =
    typeof secret === "function"
      ? secret
      : async () => secret;

  return {
    resolveSecret,
    abortSignal: params.abortSignal,
    timeoutMs: params.timeoutMs,
    onRawError: params.onRawError,
  };
}
