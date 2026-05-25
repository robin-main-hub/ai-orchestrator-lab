import { describe, it } from "vitest";
import type { ProviderCompletionRequest } from "@ai-orchestrator/protocol";
import { OllamaAdapter } from "./ollamaAdapter";
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
    id: "contract_ollama_001",
    sessionId: "session_contract",
    providerProfileId: "provider_test_ollama",
    modelId: "llama3.1:8b",
    messages: [{ role: "user", content: "ping" }],
    source: "desktop",
    routePreference: "direct_provider",
    createdAt: "2026-05-25T15:00:00.000Z",
  };
}

function makeAdapter(fetchImpl: AdapterFetchLike) {
  // requiresAuth: true forces the auth code path so the 401 case can
  // exercise the reverse-proxy rejection branch (Ollama itself is local
  // and unauthenticated, but adapter contract checks need the auth
  // semantic to be testable).
  return new OllamaAdapter({
    profileId: "provider_test_ollama",
    baseUrl: "http://127.0.0.1:11434",
    modelIds: ["llama3.1:8b"],
    requiresAuth: true,
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

describe("OllamaAdapter — contract", () => {
  it("happy path", async () => {
    const fetch: AdapterFetchLike = async () =>
      jsonResponse(200, {
        message: { role: "assistant", content: "ok" },
        done: true,
        done_reason: "stop",
        prompt_eval_count: 5,
        eval_count: 1,
      });
    const response = await makeAdapter(fetch).complete(
      baseRequest(),
      createAdapterContext({ secret: "proxy-token" }),
    );
    assertContract(response, CONTRACT_HAPPY_PATH);
  });

  it("401 unauthorized → auth (reverse-proxy rejection)", async () => {
    const fetch: AdapterFetchLike = async () =>
      jsonResponse(401, "Unauthorized");
    const response = await makeAdapter(fetch).complete(
      baseRequest(),
      createAdapterContext({ secret: "bad-token" }),
    );
    assertContract(response, CONTRACT_UNAUTHORIZED);
  });

  it("429 → rate_limit", async () => {
    const fetch: AdapterFetchLike = async () =>
      jsonResponse(429, "Too many requests");
    const response = await makeAdapter(fetch).complete(
      baseRequest(),
      createAdapterContext({ secret: "t" }),
    );
    assertContract(response, CONTRACT_RATE_LIMITED);
  });

  it("500 → provider", async () => {
    const fetch: AdapterFetchLike = async () => jsonResponse(500, "boom");
    const response = await makeAdapter(fetch).complete(
      baseRequest(),
      createAdapterContext({ secret: "t" }),
    );
    assertContract(response, CONTRACT_PROVIDER_ERROR);
  });

  it("transport failure → network", async () => {
    const fetch: AdapterFetchLike = async () => {
      throw new TypeError("fetch failed");
    };
    const response = await makeAdapter(fetch).complete(
      baseRequest(),
      createAdapterContext({ secret: "t" }),
    );
    assertContract(response, CONTRACT_NETWORK_FAILURE);
  });

  it("empty content → provider/empty", async () => {
    const fetch: AdapterFetchLike = async () =>
      jsonResponse(200, {
        message: { role: "assistant", content: "" },
        done: true,
      });
    const response = await makeAdapter(fetch).complete(
      baseRequest(),
      createAdapterContext({ secret: "t" }),
    );
    assertContract(response, CONTRACT_EMPTY_CONTENT);
  });
});
