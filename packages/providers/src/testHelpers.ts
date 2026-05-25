import type { ProviderCompletionRequest } from "@ai-orchestrator/protocol";
import type { AdapterFetchLike } from "./openAiCompatibleAdapter";

/**
 * Internal test helpers shared by provider adapter test suites.
 *
 * ⚠️ NOT exported from package barrel (`index.ts`) on purpose. Test
 * fixtures must not leak into runtime bundles — PR #84 fixed a 흰화면
 * (white-screen) regression caused by vitest helpers being pulled into
 * the desktop runtime via the public surface. Keep these imports
 * test-file-local: `import { ... } from "./testHelpers"` (no `.js`
 * suffix needed because nothing imports this from outside src).
 */

/**
 * Default ProviderCompletionRequest used across adapter tests. Caller
 * passes per-test overrides via the partial parameter. All defaults
 * here are intentionally generic so any adapter can use them — adapters
 * with provider-specific defaults (e.g. anthropic prefers a Claude
 * model id) just override the relevant fields:
 *
 *   baseProviderRequest({ providerProfileId: "provider_apifun_claude", modelId: "claude-opus-4-6" })
 */
export function baseProviderRequest(
  overrides: Partial<ProviderCompletionRequest> = {},
): ProviderCompletionRequest {
  return {
    id: "req_test_001",
    sessionId: "session_test",
    providerProfileId: "provider_test",
    modelId: "test-model",
    messages: [{ role: "user", content: "Reply OK only" }],
    source: "desktop",
    routePreference: "direct_provider",
    createdAt: "2026-05-25T10:00:00.000Z",
    ...overrides,
  };
}

/**
 * One captured fetch invocation from a recordedFetch wrapper. Headers
 * are kept loose (`Record<string, string>`) because adapters set
 * different keys (x-api-key for Anthropic, Authorization for OpenAI,
 * none for Ollama).
 */
export type FetchCall = {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
};

/**
 * Shape an adapter test's stub response can return from its impl callback.
 * `headers` is optional because most adapters don't care about response
 * headers (only Anthropic peeks at retry-after on 429); ollama and
 * openAi tests don't need it.
 */
export type RecordedFetchResponse = {
  ok: boolean;
  status: number;
  body: string;
  headers?: Record<string, string>;
};

/**
 * Builds an {@link AdapterFetchLike} that records every call and lets
 * the test impl return a stubbed response. Returns `{ fetch, calls }`
 * so the test can assert on `calls[0].url`, `calls[0].body`, etc.
 *
 * Extracted from anthropicAdapter.test.ts + ollamaAdapter.test.ts which
 * had near-identical copies. Behavior is identical to both copies — the
 * only "widening" is that the impl callback's return type allows
 * `headers` (which ollama's tests never set, harmless).
 */
export function recordedFetch(impl: (call: FetchCall) => RecordedFetchResponse): {
  fetch: AdapterFetchLike;
  calls: FetchCall[];
} {
  const calls: FetchCall[] = [];
  const fetchImpl: AdapterFetchLike = async (input, init) => {
    const call: FetchCall = {
      url: input,
      method: init?.method,
      headers: init?.headers,
      body: typeof init?.body === "string" ? init.body : undefined,
    };
    calls.push(call);
    const out = impl(call);
    return {
      ok: out.ok,
      status: out.status,
      async text() {
        return out.body;
      },
    };
  };
  return { fetch: fetchImpl, calls };
}

/**
 * Builds a minimal stub Response that adapters can consume — used in
 * contract test suites where the per-case body changes but the wrapper
 * shape doesn't. Returns a structurally minimal Response-like object
 * (just the fields adapters read: `ok`, `status`, `text()`).
 *
 * Extracted from {anthropic,openAiCompatible}Adapter.contract.test.ts.
 */
export function jsonResponse(status: number, body: unknown): {
  ok: boolean;
  status: number;
  text(): Promise<string>;
} {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return typeof body === "string" ? body : JSON.stringify(body);
    },
  };
}
