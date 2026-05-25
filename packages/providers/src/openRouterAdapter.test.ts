import { describe, expect, it } from "vitest";
import type { ProviderCompletionRequest } from "@ai-orchestrator/protocol";

import { createAdapterContext } from "./adapter";
import type { AdapterFetchLike } from "./openAiCompatibleAdapter";
import {
  createOpenRouterAdapter,
  OPENROUTER_RECOMMENDED_FALLBACK_MODELS,
} from "./openRouterAdapter";

function baseRequest(overrides: Partial<ProviderCompletionRequest> = {}): ProviderCompletionRequest {
  return {
    id: "req_openrouter_001",
    sessionId: "session_test",
    providerProfileId: "provider_openrouter_test",
    modelId: "anthropic/claude-3.5-sonnet",
    messages: [{ role: "user", content: "ping" }],
    source: "desktop",
    routePreference: "direct_provider",
    createdAt: "2026-05-25T10:00:00.000Z",
    ...overrides,
  };
}

type FetchCall = {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
};

function recordedFetch(
  impl: (call: FetchCall) => { ok: boolean; status: number; body: string },
): { fetch: AdapterFetchLike; calls: FetchCall[] } {
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

const HAPPY_BODY = JSON.stringify({
  choices: [{ message: { content: "OK" } }],
  usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 },
});

describe("createOpenRouterAdapter — kind + base URL defaults", () => {
  it('reports kind === "openrouter" (so the registry / trust logic in providers/index.ts picks it up)', () => {
    const adapter = createOpenRouterAdapter({ profileId: "provider_openrouter" });
    expect(adapter.kind).toBe("openrouter");
  });

  it("defaults to https://openrouter.ai/api/v1 (verified by which URL fetch is hit)", async () => {
    const { fetch, calls } = recordedFetch(() => ({ ok: true, status: 200, body: HAPPY_BODY }));
    const adapter = createOpenRouterAdapter({
      profileId: "provider_openrouter",
      fetchImpl: fetch,
    });
    await adapter.complete(baseRequest(), createAdapterContext({ secret: "sk-or-..." }));
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://openrouter.ai/api/v1/chat/completions");
  });

  it("respects an overridden baseUrl (for proxy / test fixtures)", async () => {
    const { fetch, calls } = recordedFetch(() => ({ ok: true, status: 200, body: HAPPY_BODY }));
    const adapter = createOpenRouterAdapter({
      profileId: "provider_openrouter",
      baseUrl: "https://or-proxy.internal/v1",
      fetchImpl: fetch,
    });
    await adapter.complete(baseRequest(), createAdapterContext({ secret: "k" }));
    expect(calls[0]!.url).toBe("https://or-proxy.internal/v1/chat/completions");
  });
});

describe("createOpenRouterAdapter — headers", () => {
  it("always sends Bearer auth (OpenAI-compat path)", async () => {
    const { fetch, calls } = recordedFetch(() => ({ ok: true, status: 200, body: HAPPY_BODY }));
    const adapter = createOpenRouterAdapter({
      profileId: "provider_openrouter",
      fetchImpl: fetch,
    });
    await adapter.complete(baseRequest(), createAdapterContext({ secret: "sk-or-secret-token" }));
    expect(calls[0]!.headers?.authorization).toBe("Bearer sk-or-secret-token");
  });

  it("always sends X-Title (defaults to 'AI Orchestrator Lab')", async () => {
    const { fetch, calls } = recordedFetch(() => ({ ok: true, status: 200, body: HAPPY_BODY }));
    const adapter = createOpenRouterAdapter({
      profileId: "provider_openrouter",
      fetchImpl: fetch,
    });
    await adapter.complete(baseRequest(), createAdapterContext({ secret: "k" }));
    expect(calls[0]!.headers?.["X-Title"]).toBe("AI Orchestrator Lab");
  });

  it("respects custom appTitle override", async () => {
    const { fetch, calls } = recordedFetch(() => ({ ok: true, status: 200, body: HAPPY_BODY }));
    const adapter = createOpenRouterAdapter({
      profileId: "provider_openrouter",
      appTitle: "Endruin Orchestrator",
      fetchImpl: fetch,
    });
    await adapter.complete(baseRequest(), createAdapterContext({ secret: "k" }));
    expect(calls[0]!.headers?.["X-Title"]).toBe("Endruin Orchestrator");
  });

  it("only sends HTTP-Referer when appUrl is provided (no fake referrer fabricated)", async () => {
    const { fetch, calls } = recordedFetch(() => ({ ok: true, status: 200, body: HAPPY_BODY }));
    const adapter = createOpenRouterAdapter({
      profileId: "provider_openrouter",
      fetchImpl: fetch,
    });
    await adapter.complete(baseRequest(), createAdapterContext({ secret: "k" }));
    expect(calls[0]!.headers?.["HTTP-Referer"]).toBeUndefined();
  });

  it("sends HTTP-Referer when appUrl is provided", async () => {
    const { fetch, calls } = recordedFetch(() => ({ ok: true, status: 200, body: HAPPY_BODY }));
    const adapter = createOpenRouterAdapter({
      profileId: "provider_openrouter",
      appUrl: "https://orchestrator.endruin.com",
      fetchImpl: fetch,
    });
    await adapter.complete(baseRequest(), createAdapterContext({ secret: "k" }));
    expect(calls[0]!.headers?.["HTTP-Referer"]).toBe("https://orchestrator.endruin.com");
  });

  it("caller-supplied headers.X-Title is not overwritten by the default", async () => {
    const { fetch, calls } = recordedFetch(() => ({ ok: true, status: 200, body: HAPPY_BODY }));
    const adapter = createOpenRouterAdapter({
      profileId: "provider_openrouter",
      headers: { "X-Title": "Caller Override" },
      fetchImpl: fetch,
    });
    await adapter.complete(baseRequest(), createAdapterContext({ secret: "k" }));
    expect(calls[0]!.headers?.["X-Title"]).toBe("Caller Override");
  });
});

describe("createOpenRouterAdapter — body extras", () => {
  it("no transforms field when enableMiddleOutCompression is off (default)", async () => {
    let body: Record<string, unknown> | null = null;
    const { fetch } = recordedFetch((call) => {
      body = JSON.parse(call.body ?? "{}");
      return { ok: true, status: 200, body: HAPPY_BODY };
    });
    const adapter = createOpenRouterAdapter({
      profileId: "provider_openrouter",
      fetchImpl: fetch,
    });
    await adapter.complete(baseRequest(), createAdapterContext({ secret: "k" }));
    expect(body!).not.toHaveProperty("transforms");
    expect(body!).not.toHaveProperty("route");
  });

  it('adds transforms: ["middle-out"] when enableMiddleOutCompression is true', async () => {
    let body: Record<string, unknown> | null = null;
    const { fetch } = recordedFetch((call) => {
      body = JSON.parse(call.body ?? "{}");
      return { ok: true, status: 200, body: HAPPY_BODY };
    });
    const adapter = createOpenRouterAdapter({
      profileId: "provider_openrouter",
      enableMiddleOutCompression: true,
      fetchImpl: fetch,
    });
    await adapter.complete(baseRequest(), createAdapterContext({ secret: "k" }));
    expect(body!.transforms).toEqual(["middle-out"]);
  });

  it('adds route: "fallback" when routeStrategy is set', async () => {
    let body: Record<string, unknown> | null = null;
    const { fetch } = recordedFetch((call) => {
      body = JSON.parse(call.body ?? "{}");
      return { ok: true, status: 200, body: HAPPY_BODY };
    });
    const adapter = createOpenRouterAdapter({
      profileId: "provider_openrouter",
      routeStrategy: "fallback",
      fetchImpl: fetch,
    });
    await adapter.complete(baseRequest(), createAdapterContext({ secret: "k" }));
    expect(body!.route).toBe("fallback");
  });

  it("caller-supplied extraBody.transforms is not overwritten", async () => {
    let body: Record<string, unknown> | null = null;
    const { fetch } = recordedFetch((call) => {
      body = JSON.parse(call.body ?? "{}");
      return { ok: true, status: 200, body: HAPPY_BODY };
    });
    const adapter = createOpenRouterAdapter({
      profileId: "provider_openrouter",
      enableMiddleOutCompression: true,
      extraBody: { transforms: ["custom"] },
      fetchImpl: fetch,
    });
    await adapter.complete(baseRequest(), createAdapterContext({ secret: "k" }));
    expect(body!.transforms).toEqual(["custom"]);
  });
});

describe("createOpenRouterAdapter — model discovery + fallback list", () => {
  it("OPENROUTER_RECOMMENDED_FALLBACK_MODELS is non-empty and starts with openrouter/auto", () => {
    expect(OPENROUTER_RECOMMENDED_FALLBACK_MODELS.length).toBeGreaterThan(3);
    expect(OPENROUTER_RECOMMENDED_FALLBACK_MODELS[0]).toBe("openrouter/auto");
  });

  it("uses live /v1/models response when discovery succeeds", async () => {
    const { fetch } = recordedFetch((call) => {
      if (call.url.endsWith("/models")) {
        return {
          ok: true,
          status: 200,
          body: JSON.stringify({
            data: [
              { id: "anthropic/claude-3.5-sonnet", context_length: 200_000 },
              { id: "openai/gpt-4o", context_length: 128_000 },
              { id: "google/gemini-pro-1.5", context_length: 2_000_000 },
            ],
          }),
        };
      }
      return { ok: true, status: 200, body: HAPPY_BODY };
    });
    const adapter = createOpenRouterAdapter({
      profileId: "provider_openrouter",
      fetchImpl: fetch,
    });
    const models = await adapter.discoverModels(createAdapterContext({ secret: "k" }));
    expect(models.map((m) => m.id)).toEqual([
      "anthropic/claude-3.5-sonnet",
      "openai/gpt-4o",
      "google/gemini-pro-1.5",
    ]);
  });

  it("falls back to the recommended list when /v1/models fails (5xx, network down, etc.)", async () => {
    const { fetch } = recordedFetch(() => ({ ok: false, status: 503, body: "upstream temporarily unavailable" }));
    const adapter = createOpenRouterAdapter({
      profileId: "provider_openrouter",
      fetchImpl: fetch,
    });
    const models = await adapter.discoverModels(createAdapterContext({ secret: "k" }));
    expect(models.length).toBe(OPENROUTER_RECOMMENDED_FALLBACK_MODELS.length);
    expect(models[0]!.id).toBe("openrouter/auto");
    // every discovered model is tagged with the openrouter kind
    expect(models.every((m) => m.tags.includes("openrouter"))).toBe(true);
  });

  it("caller-supplied modelIds override the recommended fallback list", async () => {
    const { fetch } = recordedFetch(() => ({ ok: false, status: 503, body: "down" }));
    const adapter = createOpenRouterAdapter({
      profileId: "provider_openrouter",
      modelIds: ["myorg/private-finetune"],
      fetchImpl: fetch,
    });
    const models = await adapter.discoverModels(createAdapterContext({ secret: "k" }));
    expect(models.map((m) => m.id)).toEqual(["myorg/private-finetune"]);
  });
});

describe("createOpenRouterAdapter — interactions with OpenAI-compatible base", () => {
  it("requiresAuth defaults to true — missing secret returns auth-failed response without hitting network", async () => {
    const { fetch, calls } = recordedFetch(() => ({ ok: true, status: 200, body: HAPPY_BODY }));
    const adapter = createOpenRouterAdapter({
      profileId: "provider_openrouter",
      fetchImpl: fetch,
    });
    const response = await adapter.complete(
      baseRequest(),
      createAdapterContext({ secret: undefined }),
    );
    expect(response.status).toBe("failed");
    expect(response.error).toMatch(/auth/);
    expect(calls).toHaveLength(0);
  });

  it("uses the request modelId verbatim (OpenRouter namespacing is preserved)", async () => {
    let body: Record<string, unknown> | null = null;
    const { fetch } = recordedFetch((call) => {
      body = JSON.parse(call.body ?? "{}");
      return { ok: true, status: 200, body: HAPPY_BODY };
    });
    const adapter = createOpenRouterAdapter({
      profileId: "provider_openrouter",
      fetchImpl: fetch,
    });
    await adapter.complete(
      baseRequest({ modelId: "meta-llama/llama-3.3-70b-instruct" }),
      createAdapterContext({ secret: "k" }),
    );
    expect(body!.model).toBe("meta-llama/llama-3.3-70b-instruct");
  });
});
