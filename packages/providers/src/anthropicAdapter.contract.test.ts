import { describe, it } from "vitest";
import type { ProviderCompletionRequest } from "@ai-orchestrator/protocol";
import { AnthropicAdapter } from "./anthropicAdapter";
import type { AdapterFetchLike } from "./openAiCompatibleAdapter";
import { createAdapterContext } from "./adapter";
import {
  assertContract,
  STANDARD_CONTRACT_CASES,
} from "./contractTestFixtures";

function baseRequest(): ProviderCompletionRequest {
  return {
    id: "contract_anthropic_001",
    sessionId: "session_contract",
    providerProfileId: "provider_test_anthropic",
    modelId: "claude-test",
    messages: [{ role: "user", content: "ping" }],
    source: "desktop",
    routePreference: "direct_provider",
    createdAt: "2026-05-25T14:00:00.000Z",
  };
}

function makeAdapter(fetchImpl: AdapterFetchLike) {
  return new AnthropicAdapter({
    profileId: "provider_test_anthropic",
    baseUrl: "https://api.apikey.fun",
    modelIds: ["claude-test"],
    fetchImpl,
  });
}

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return typeof body === "string" ? body : JSON.stringify(body);
    },
  };
}

// One fetch mock per case in STANDARD_CONTRACT_CASES, keyed by the
// fixture's `name`. The wire shape is Anthropic-specific (content
// array of text blocks, error.type discriminator, etc.) so each
// case supplies the right body, but the assertion is universal.
//
// If STANDARD_CONTRACT_CASES grows a new fixture, TypeScript can't
// catch the missing key here — the runtime guard at the bottom
// throws a clear "missing fetch for case X" so the gap is loud.
const fetchByCase: Record<string, AdapterFetchLike> = {
  "happy path": async () =>
    jsonResponse(200, {
      type: "message",
      content: [{ type: "text", text: "ok" }],
      stop_reason: "end_turn",
      usage: { input_tokens: 5, output_tokens: 1 },
    }),
  "401 unauthorized": async () =>
    jsonResponse(401, {
      type: "error",
      error: { type: "authentication_error", message: "invalid x-api-key" },
    }),
  "429 rate limited": async () =>
    jsonResponse(429, {
      type: "error",
      error: { type: "rate_limit_error", message: "too many" },
    }),
  "500 server error": async () => jsonResponse(500, "upstream timeout"),
  "transport failure": async () => {
    throw new TypeError("fetch failed");
  },
  "empty body": async () =>
    jsonResponse(200, {
      type: "message",
      content: [],
      stop_reason: "end_turn",
    }),
};

describe("AnthropicAdapter — contract", () => {
  for (const { name, expectation } of STANDARD_CONTRACT_CASES) {
    it(name, async () => {
      const fetchImpl = fetchByCase[name];
      if (!fetchImpl) {
        throw new Error(`missing Anthropic fetch mock for contract case "${name}"`);
      }
      const response = await makeAdapter(fetchImpl).complete(
        baseRequest(),
        createAdapterContext({ secret: "sk-ant" }),
      );
      assertContract(response, expectation);
    });
  }
});
