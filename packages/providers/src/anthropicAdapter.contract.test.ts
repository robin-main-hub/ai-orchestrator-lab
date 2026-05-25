import { describe, it } from "vitest";
import { AnthropicAdapter } from "./anthropicAdapter";
import type { AdapterFetchLike } from "./openAiCompatibleAdapter";
import { createAdapterContext } from "./adapter";
import { assertContract, STANDARD_CONTRACT_CASES } from "./contractTestFixtures";
import { baseProviderRequest, jsonResponse } from "./testHelpers";

function baseRequest() {
  return baseProviderRequest({
    id: "contract_anthropic_001",
    sessionId: "session_contract",
    providerProfileId: "provider_test_anthropic",
    modelId: "claude-test",
    messages: [{ role: "user", content: "ping" }],
    createdAt: "2026-05-25T14:00:00.000Z",
  });
}

function makeAdapter(fetchImpl: AdapterFetchLike) {
  return new AnthropicAdapter({
    profileId: "provider_test_anthropic",
    baseUrl: "https://api.apikey.fun",
    modelIds: ["claude-test"],
    fetchImpl,
  });
}

/**
 * Per-case fetch fixture. The shape of a successful Anthropic message
 * body is provider-specific, so we cannot fold the body builder into
 * the shared contractTestFixtures — each adapter test owns its own
 * "this is what the upstream actually returns" mapping. The standard
 * iteration order matches STANDARD_CONTRACT_CASES so failures point
 * cleanly at the case name in vitest output.
 */
const fetchByCaseName: Record<string, AdapterFetchLike> = {
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

// Sanity check at module load — surfaces drift if STANDARD_CONTRACT_CASES
// ever grows a case that this adapter forgot to map. Cheaper to fail at
// import-time than to silently skip a contract case.
for (const { name } of STANDARD_CONTRACT_CASES) {
  if (!fetchByCaseName[name]) {
    throw new Error(`AnthropicAdapter contract: missing fetch fixture for case "${name}"`);
  }
}

describe("AnthropicAdapter — contract", () => {
  it.each(STANDARD_CONTRACT_CASES)("$name", async ({ name, expectation }) => {
    const fetchImpl = fetchByCaseName[name]!;
    const response = await makeAdapter(fetchImpl).complete(
      baseRequest(),
      createAdapterContext({ secret: "sk-ant-test" }),
    );
    assertContract(response, expectation);
  });
});
