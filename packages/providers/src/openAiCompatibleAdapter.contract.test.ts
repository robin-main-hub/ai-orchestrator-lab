import { describe, it } from "vitest";
import { OpenAICompatibleAdapter, type AdapterFetchLike } from "./openAiCompatibleAdapter";
import { createAdapterContext } from "./adapter";
import { assertContract, STANDARD_CONTRACT_CASES } from "./contractTestFixtures";
import { baseProviderRequest, jsonResponse } from "./testHelpers";

function baseRequest() {
  return baseProviderRequest({
    id: "contract_oai_001",
    sessionId: "session_contract",
    providerProfileId: "provider_test_openai",
    modelId: "gpt-test",
    messages: [{ role: "user", content: "ping" }],
    createdAt: "2026-05-25T14:00:00.000Z",
  });
}

function makeAdapter(fetchImpl: AdapterFetchLike) {
  return new OpenAICompatibleAdapter({
    profileId: "provider_test_openai",
    baseUrl: "https://example.test",
    modelIds: ["gpt-test"],
    supportsModelList: false,
    fetchImpl,
  });
}

/**
 * Per-case fetch fixture. Body shape is OpenAI-chat-completions specific
 * and not portable across adapters, so we keep it local — see the
 * matching comment in anthropicAdapter.contract.test.ts.
 */
const fetchByCaseName: Record<string, AdapterFetchLike> = {
  "happy path": async () =>
    jsonResponse(200, {
      choices: [{ message: { content: "ok" } }],
      usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 },
    }),
  "401 unauthorized": async () =>
    jsonResponse(401, { error: { message: "invalid api key" } }),
  "429 rate limited": async () =>
    jsonResponse(429, { error: { message: "rate limited" } }),
  "500 server error": async () => jsonResponse(500, "upstream blew up"),
  "transport failure": async () => {
    throw new TypeError("fetch failed");
  },
  "empty body": async () =>
    jsonResponse(200, {
      choices: [{ message: { content: "   " } }],
      usage: { prompt_tokens: 1, completion_tokens: 0 },
    }),
};

for (const { name } of STANDARD_CONTRACT_CASES) {
  if (!fetchByCaseName[name]) {
    throw new Error(
      `OpenAICompatibleAdapter contract: missing fetch fixture for case "${name}"`,
    );
  }
}

describe("OpenAICompatibleAdapter — contract", () => {
  it.each(STANDARD_CONTRACT_CASES)("$name", async ({ name, expectation }) => {
    const fetchImpl = fetchByCaseName[name]!;
    const response = await makeAdapter(fetchImpl).complete(
      baseRequest(),
      createAdapterContext({ secret: "sk-test" }),
    );
    assertContract(response, expectation);
  });
});
