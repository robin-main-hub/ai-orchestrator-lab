import { describe, it } from "vitest";
import type { ProviderCompletionRequest } from "@ai-orchestrator/protocol";
import { OpenAICompatibleAdapter, type AdapterFetchLike } from "./openAiCompatibleAdapter";
import { createAdapterContext } from "./adapter";
import {
  assertContract,
  CONTRACT_EMPTY_CONTENT,
  CONTRACT_HAPPY_PATH,
  CONTRACT_NETWORK_FAILURE,
  CONTRACT_PROVIDER_ERROR,
  CONTRACT_RATE_LIMITED,
  CONTRACT_UNAUTHORIZED,
} from "./contractTestFixtures";

function baseRequest(): ProviderCompletionRequest {
  return {
    id: "contract_oai_001",
    sessionId: "session_contract",
    providerProfileId: "provider_test_openai",
    modelId: "gpt-test",
    messages: [{ role: "user", content: "ping" }],
    source: "desktop",
    routePreference: "direct_provider",
    createdAt: "2026-05-25T14:00:00.000Z",
  };
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

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return typeof body === "string" ? body : JSON.stringify(body);
    },
  };
}

describe("OpenAICompatibleAdapter — contract", () => {
  it("happy path", async () => {
    const fetch: AdapterFetchLike = async () =>
      jsonResponse(200, {
        choices: [{ message: { content: "ok" } }],
        usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 },
      });
    const response = await makeAdapter(fetch).complete(
      baseRequest(),
      createAdapterContext({ secret: "sk-test" }),
    );
    assertContract(response, CONTRACT_HAPPY_PATH);
  });

  it("401 unauthorized → credential_expired", async () => {
    const fetch: AdapterFetchLike = async () =>
      jsonResponse(401, { error: { message: "invalid api key" } });
    const response = await makeAdapter(fetch).complete(
      baseRequest(),
      createAdapterContext({ secret: "sk-bad" }),
    );
    assertContract(response, CONTRACT_UNAUTHORIZED);
  });

  it("429 → rate_limit", async () => {
    const fetch: AdapterFetchLike = async () =>
      jsonResponse(429, { error: { message: "rate limited" } });
    const response = await makeAdapter(fetch).complete(
      baseRequest(),
      createAdapterContext({ secret: "sk" }),
    );
    assertContract(response, CONTRACT_RATE_LIMITED);
  });

  it("500 → provider", async () => {
    const fetch: AdapterFetchLike = async () => jsonResponse(500, "upstream blew up");
    const response = await makeAdapter(fetch).complete(
      baseRequest(),
      createAdapterContext({ secret: "sk" }),
    );
    assertContract(response, CONTRACT_PROVIDER_ERROR);
  });

  it("transport failure → network", async () => {
    const fetch: AdapterFetchLike = async () => {
      throw new TypeError("fetch failed");
    };
    const response = await makeAdapter(fetch).complete(
      baseRequest(),
      createAdapterContext({ secret: "sk" }),
    );
    assertContract(response, CONTRACT_NETWORK_FAILURE);
  });

  it("empty content → provider/empty", async () => {
    const fetch: AdapterFetchLike = async () =>
      jsonResponse(200, {
        choices: [{ message: { content: "   " } }],
        usage: { prompt_tokens: 1, completion_tokens: 0 },
      });
    const response = await makeAdapter(fetch).complete(
      baseRequest(),
      createAdapterContext({ secret: "sk" }),
    );
    assertContract(response, CONTRACT_EMPTY_CONTENT);
  });
});
