import { describe, it } from "vitest";
import type { ProviderCompletionRequest } from "@ai-orchestrator/protocol";
import { AnthropicAdapter } from "./anthropicAdapter";
import type { AdapterFetchLike } from "./openAiCompatibleAdapter";
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

describe("AnthropicAdapter — contract", () => {
  it("happy path", async () => {
    const fetch: AdapterFetchLike = async () =>
      jsonResponse(200, {
        type: "message",
        content: [{ type: "text", text: "ok" }],
        stop_reason: "end_turn",
        usage: { input_tokens: 5, output_tokens: 1 },
      });
    const response = await makeAdapter(fetch).complete(
      baseRequest(),
      createAdapterContext({ secret: "sk-ant-test" }),
    );
    assertContract(response, CONTRACT_HAPPY_PATH);
  });

  it("401 unauthorized → credential_expired", async () => {
    const fetch: AdapterFetchLike = async () =>
      jsonResponse(401, {
        type: "error",
        error: { type: "authentication_error", message: "invalid x-api-key" },
      });
    const response = await makeAdapter(fetch).complete(
      baseRequest(),
      createAdapterContext({ secret: "sk-ant-bad" }),
    );
    assertContract(response, CONTRACT_UNAUTHORIZED);
  });

  it("429 → rate_limit", async () => {
    const fetch: AdapterFetchLike = async () =>
      jsonResponse(429, {
        type: "error",
        error: { type: "rate_limit_error", message: "too many" },
      });
    const response = await makeAdapter(fetch).complete(
      baseRequest(),
      createAdapterContext({ secret: "sk-ant" }),
    );
    assertContract(response, CONTRACT_RATE_LIMITED);
  });

  it("500 → provider", async () => {
    const fetch: AdapterFetchLike = async () => jsonResponse(500, "upstream timeout");
    const response = await makeAdapter(fetch).complete(
      baseRequest(),
      createAdapterContext({ secret: "sk-ant" }),
    );
    assertContract(response, CONTRACT_PROVIDER_ERROR);
  });

  it("transport failure → network", async () => {
    const fetch: AdapterFetchLike = async () => {
      throw new TypeError("fetch failed");
    };
    const response = await makeAdapter(fetch).complete(
      baseRequest(),
      createAdapterContext({ secret: "sk-ant" }),
    );
    assertContract(response, CONTRACT_NETWORK_FAILURE);
  });

  it("empty content → provider/empty", async () => {
    const fetch: AdapterFetchLike = async () =>
      jsonResponse(200, {
        type: "message",
        content: [],
        stop_reason: "end_turn",
      });
    const response = await makeAdapter(fetch).complete(
      baseRequest(),
      createAdapterContext({ secret: "sk-ant" }),
    );
    assertContract(response, CONTRACT_EMPTY_CONTENT);
  });
});
