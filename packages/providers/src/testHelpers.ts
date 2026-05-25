import type { ProviderCompletionRequest } from "@ai-orchestrator/protocol";

import type { AdapterFetchLike } from "./openAiCompatibleAdapter.js";

/**
 * Shared test helpers for the providers package's adapter test
 * suites. Extracted during the code-audit cleanup (B) — three
 * helpers (`baseProviderRequest`, `recordedFetch`, `jsonResponse`)
 * were duplicated nearly verbatim across 9 test files. Centralized
 * here so the shape of a "test request" / "recorded fetch" /
 * "json response stub" lives in one place and new adapters / test
 * cases get the helpers for free.
 *
 * What's NOT here, and why
 *   - `makeAdapter(fetchImpl)` — each adapter constructs a different
 *     class (`new AnthropicAdapter(...)`, `new OllamaAdapter(...)`,
 *     `createOpenRouterAdapter(...)`), so its factory stays
 *     adapter-local. Extracting would require generic class
 *     parameters that obscure rather than help.
 *   - per-adapter wire-shape response builders (the JSON body that
 *     each provider returns for "happy path", "401", etc.) — those
 *     stay in each adapter's contract test file because the shape
 *     is provider-specific (Anthropic content array vs OpenAI
 *     choices vs Ollama message etc.).
 */

/**
 * Default-everything `ProviderCompletionRequest` for tests. Callers
 * pass an `overrides` partial to customize the parts that matter for
 * the specific case (most often `id`, `providerProfileId`, `modelId`,
 * `messages`). The defaults are intentionally generic — no
 * provider-specific id prefixes — so a single import covers Anthropic,
 * Ollama, OpenAI-compatible, Codex CLI, Mock, OpenRouter, etc.
 */
export function baseProviderRequest(
  overrides: Partial<ProviderCompletionRequest> = {},
): ProviderCompletionRequest {
  return {
    id: "req_test_001",
    sessionId: "session_test",
    providerProfileId: "provider_test",
    modelId: "model_test",
    messages: [{ role: "user", content: "ping" }],
    source: "desktop",
    routePreference: "direct_provider",
    createdAt: "2026-05-25T10:00:00.000Z",
    ...overrides,
  };
}

/**
 * A single recorded fetch call's metadata — what the adapter sent
 * out the door. Tests assert on this to verify auth headers, body
 * shape, URL, etc.
 */
export type RecordedFetchCall = {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
};

/**
 * Test fetch wrapper that records every call and delegates the
 * response shape to a per-test `impl` function. Returns both the
 * `fetch` (to pass into the adapter's `fetchImpl` option) and the
 * `calls` array (to assert on after the test invokes the adapter).
 *
 * Wraps the response so `.text()` is async to match the
 * `AdapterFetchLike` contract that real adapters consume.
 */
export function recordedFetch(
  impl: (call: RecordedFetchCall) => {
    ok: boolean;
    status: number;
    body: string;
    headers?: Record<string, string>;
  },
): { fetch: AdapterFetchLike; calls: RecordedFetchCall[] } {
  const calls: RecordedFetchCall[] = [];
  const fetchImpl: AdapterFetchLike = async (input, init) => {
    const call: RecordedFetchCall = {
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
 * Build a fetch response stub. Used by adapter tests to stand up
 * specific status codes + body shapes without going through the
 * full `recordedFetch` machinery.
 *
 * `body` may be a string (passed through verbatim) or any JSON
 * value (stringified). `ok` is derived from `status` per the
 * standard 2xx convention.
 */
export function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return typeof body === "string" ? body : JSON.stringify(body);
    },
  };
}
