import { describe, expect, it } from "vitest";
import type { ProviderCompletionRequest } from "@ai-orchestrator/protocol";
import { createOllamaMessages, OllamaAdapter } from "./ollamaAdapter";
import type { AdapterFetchLike } from "./openAiCompatibleAdapter";
import { createAdapterContext } from "./adapter";

function baseRequest(overrides: Partial<ProviderCompletionRequest> = {}): ProviderCompletionRequest {
  return {
    id: "req_ollama_001",
    sessionId: "session_test",
    providerProfileId: "provider_local_ollama",
    modelId: "llama3.1:8b",
    messages: [{ role: "user", content: "Reply OK only" }],
    source: "desktop",
    routePreference: "direct_provider",
    createdAt: "2026-05-25T13:00:00.000Z",
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

describe("createOllamaMessages", () => {
  it("keeps system / user / assistant messages in order", () => {
    const out = createOllamaMessages([
      { role: "system", content: "rule one" },
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ]);
    expect(out).toEqual([
      { role: "system", content: "rule one" },
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ]);
  });

  it("drops tool messages and skips empty content", () => {
    const out = createOllamaMessages([
      { role: "tool", content: "tool turn" },
      { role: "user", content: "  " },
      { role: "user", content: "actual" },
    ]);
    expect(out).toEqual([{ role: "user", content: "actual" }]);
  });
});

describe("OllamaAdapter — request shape", () => {
  it("posts to /api/chat with stream=false and num_predict in options", async () => {
    let body: { stream?: boolean; options?: Record<string, unknown>; model?: string } | null = null;
    const { fetch, calls } = recordedFetch((call) => {
      body = JSON.parse(call.body ?? "{}");
      return {
        ok: true,
        status: 200,
        body: JSON.stringify({
          message: { role: "assistant", content: "OK" },
          done: true,
          done_reason: "stop",
          prompt_eval_count: 5,
          eval_count: 1,
        }),
      };
    });
    const adapter = new OllamaAdapter({
      profileId: "provider_local_ollama",
      defaultNumPredict: 256,
      temperature: 0.1,
      fetchImpl: fetch,
    });
    await adapter.complete(baseRequest(), createAdapterContext());
    expect(calls[0]!.url).toBe("http://127.0.0.1:11434/api/chat");
    expect(body!.stream).toBe(false);
    expect(body!.model).toBe("llama3.1:8b");
    expect(body!.options?.num_predict).toBe(256);
    expect(body!.options?.temperature).toBe(0.1);
  });

  it("omits Authorization header when no secret is provided (Ollama is local, no auth)", async () => {
    const { fetch, calls } = recordedFetch(() => ({
      ok: true,
      status: 200,
      body: JSON.stringify({
        message: { role: "assistant", content: "OK" },
        done: true,
      }),
    }));
    const adapter = new OllamaAdapter({
      profileId: "p",
      fetchImpl: fetch,
    });
    await adapter.complete(baseRequest(), createAdapterContext());
    expect(calls[0]!.headers?.authorization).toBeUndefined();
  });

  it("attaches Bearer when a secret is supplied (reverse-proxy front)", async () => {
    const { fetch, calls } = recordedFetch(() => ({
      ok: true,
      status: 200,
      body: JSON.stringify({
        message: { role: "assistant", content: "OK" },
        done: true,
      }),
    }));
    const adapter = new OllamaAdapter({
      profileId: "p",
      requiresAuth: true,
      fetchImpl: fetch,
    });
    await adapter.complete(baseRequest(), createAdapterContext({ secret: "proxy-token" }));
    expect(calls[0]!.headers?.authorization).toBe("Bearer proxy-token");
  });

  it("uses a custom baseUrl when provided", async () => {
    const { fetch, calls } = recordedFetch(() => ({
      ok: true,
      status: 200,
      body: JSON.stringify({
        message: { role: "assistant", content: "OK" },
        done: true,
      }),
    }));
    const adapter = new OllamaAdapter({
      profileId: "p",
      baseUrl: "http://dgx-02:11434",
      fetchImpl: fetch,
    });
    await adapter.complete(baseRequest(), createAdapterContext());
    expect(calls[0]!.url).toBe("http://dgx-02:11434/api/chat");
  });

  it("merges extraOptions into the options block", async () => {
    let body: { options?: Record<string, unknown> } | null = null;
    const { fetch } = recordedFetch((call) => {
      body = JSON.parse(call.body ?? "{}");
      return {
        ok: true,
        status: 200,
        body: JSON.stringify({ message: { content: "OK" }, done: true }),
      };
    });
    const adapter = new OllamaAdapter({
      profileId: "p",
      extraOptions: { top_p: 0.9, repeat_penalty: 1.1 },
      fetchImpl: fetch,
    });
    await adapter.complete(baseRequest(), createAdapterContext());
    expect(body!.options?.top_p).toBe(0.9);
    expect(body!.options?.repeat_penalty).toBe(1.1);
    expect(body!.options?.num_predict).toBe(512);
  });
});

describe("OllamaAdapter — response parsing", () => {
  it("extracts message.content and reports usage from prompt_eval_count + eval_count", async () => {
    const { fetch } = recordedFetch(() => ({
      ok: true,
      status: 200,
      body: JSON.stringify({
        model: "llama3.1:8b",
        message: { role: "assistant", content: "Hello world" },
        done: true,
        done_reason: "stop",
        prompt_eval_count: 12,
        eval_count: 7,
        total_duration: 1234567890,
      }),
    }));
    const adapter = new OllamaAdapter({ profileId: "p", fetchImpl: fetch });
    const response = await adapter.complete(baseRequest(), createAdapterContext());
    expect(response.status).toBe("succeeded");
    expect(response.content).toBe("Hello world");
    expect(response.usage).toEqual({
      inputTokens: 12,
      outputTokens: 7,
      totalTokens: 19,
    });
  });

  it("returns failed when 200 OK but body carries an error field (model not loaded)", async () => {
    const { fetch } = recordedFetch(() => ({
      ok: true,
      status: 200,
      body: JSON.stringify({ error: "model 'unknown' not found" }),
    }));
    const adapter = new OllamaAdapter({ profileId: "p", fetchImpl: fetch });
    const response = await adapter.complete(baseRequest(), createAdapterContext());
    expect(response.status).toBe("failed");
    expect(response.error).toMatch(/provider/);
    expect(response.error).toMatch(/model.*not found/);
  });

  it("returns failed when content is empty", async () => {
    const { fetch } = recordedFetch(() => ({
      ok: true,
      status: 200,
      body: JSON.stringify({ message: { content: "" }, done: true }),
    }));
    const adapter = new OllamaAdapter({ profileId: "p", fetchImpl: fetch });
    const response = await adapter.complete(baseRequest(), createAdapterContext());
    expect(response.status).toBe("failed");
    expect(response.error).toMatch(/empty/);
  });

  it("returns failed gracefully when JSON is malformed", async () => {
    const { fetch } = recordedFetch(() => ({ ok: true, status: 200, body: "not json" }));
    const adapter = new OllamaAdapter({ profileId: "p", fetchImpl: fetch });
    const response = await adapter.complete(baseRequest(), createAdapterContext());
    expect(response.status).toBe("failed");
    expect(response.error).toMatch(/network|unknown/);
  });
});

describe("OllamaAdapter — error mapping", () => {
  it("maps 404 to bad_request (model not loaded / wrong path)", async () => {
    const { fetch } = recordedFetch(() => ({
      ok: false,
      status: 404,
      body: JSON.stringify({ error: "model 'unknown' not found, pull it first" }),
    }));
    const adapter = new OllamaAdapter({ profileId: "p", fetchImpl: fetch });
    const response = await adapter.complete(baseRequest(), createAdapterContext());
    expect(response.status).toBe("failed");
    expect(response.error).toMatch(/bad_request/);
    expect(response.error).toMatch(/model not loaded/);
  });

  it("maps 401 to auth (reverse-proxy front, not Ollama itself)", async () => {
    const { fetch } = recordedFetch(() => ({
      ok: false,
      status: 401,
      body: "Unauthorized",
    }));
    const adapter = new OllamaAdapter({ profileId: "p", fetchImpl: fetch });
    const response = await adapter.complete(baseRequest(), createAdapterContext());
    expect(response.status).toBe("failed");
    expect(response.error).toMatch(/auth/);
  });

  it("maps 500 to provider", async () => {
    const { fetch } = recordedFetch(() => ({ ok: false, status: 500, body: "boom" }));
    const adapter = new OllamaAdapter({ profileId: "p", fetchImpl: fetch });
    const response = await adapter.complete(baseRequest(), createAdapterContext());
    expect(response.status).toBe("failed");
    expect(response.error).toMatch(/provider/);
  });

  it("transport-level failures surface as network", async () => {
    const fetch: AdapterFetchLike = async () => {
      throw new TypeError("fetch failed");
    };
    const adapter = new OllamaAdapter({ profileId: "p", fetchImpl: fetch });
    const response = await adapter.complete(baseRequest(), createAdapterContext());
    expect(response.status).toBe("failed");
    expect(response.error).toMatch(/network/);
  });

  it("requiresAuth=true + missing secret short-circuits with auth before hitting network", async () => {
    const { fetch, calls } = recordedFetch(() => ({ ok: true, status: 200, body: "{}" }));
    const adapter = new OllamaAdapter({
      profileId: "p",
      requiresAuth: true,
      fetchImpl: fetch,
    });
    const response = await adapter.complete(baseRequest(), createAdapterContext({ secret: undefined }));
    expect(response.status).toBe("failed");
    expect(response.error).toMatch(/auth/);
    expect(calls).toHaveLength(0);
  });
});

describe("OllamaAdapter — discoverModels", () => {
  it("hits /api/tags and maps name → ModelDescriptor", async () => {
    const { fetch, calls } = recordedFetch(() => ({
      ok: true,
      status: 200,
      body: JSON.stringify({
        models: [
          { name: "llama3.1:8b", size: 4_700_000_000 },
          { name: "qwen2.5-coder:14b", size: 8_200_000_000 },
          { name: "deepseek-r1:14b", size: 8_400_000_000 },
        ],
      }),
    }));
    const adapter = new OllamaAdapter({ profileId: "provider_local_ollama", fetchImpl: fetch });
    const models = await adapter.discoverModels(createAdapterContext());
    expect(calls[0]!.url).toBe("http://127.0.0.1:11434/api/tags");
    expect(models).toHaveLength(3);
    expect(models[0]!.id).toBe("llama3.1:8b");
    expect(models[0]!.providerProfileId).toBe("provider_local_ollama");
    expect(models[0]!.tags).toContain("ollama");
    expect(models[0]!.tags).toContain("local");
    // qwen2.5 / deepseek context window inference
    expect(models[1]!.contextWindow).toBe(128_000);
    expect(models[2]!.contextWindow).toBe(128_000);
  });

  it("falls back to static modelIds when /api/tags fails", async () => {
    const fetch: AdapterFetchLike = async () => {
      throw new TypeError("fetch failed");
    };
    const adapter = new OllamaAdapter({
      profileId: "p",
      modelIds: ["llama3.1:8b", "phi3.5:mini"],
      fetchImpl: fetch,
    });
    const models = await adapter.discoverModels(createAdapterContext());
    expect(models.map((m) => m.id)).toEqual(["llama3.1:8b", "phi3.5:mini"]);
  });

  it("falls back to static modelIds when /api/tags returns empty models", async () => {
    const { fetch } = recordedFetch(() => ({
      ok: true,
      status: 200,
      body: JSON.stringify({ models: [] }),
    }));
    const adapter = new OllamaAdapter({
      profileId: "p",
      modelIds: ["llama3.1:8b"],
      fetchImpl: fetch,
    });
    const models = await adapter.discoverModels(createAdapterContext());
    expect(models).toHaveLength(1);
    expect(models[0]!.id).toBe("llama3.1:8b");
  });

  it("marks vision models with image modality", async () => {
    const { fetch } = recordedFetch(() => ({
      ok: true,
      status: 200,
      body: JSON.stringify({
        models: [
          { name: "llava:7b" },
          { name: "llama3.1:8b" },
        ],
      }),
    }));
    const adapter = new OllamaAdapter({ profileId: "p", fetchImpl: fetch });
    const models = await adapter.discoverModels(createAdapterContext());
    expect(models[0]!.inputModalities).toEqual(["text", "image"]);
    expect(models[1]!.inputModalities).toEqual(["text"]);
  });
});

describe("OllamaAdapter — log redaction", () => {
  it("redacts secret-like patterns in the snippet passed to onRawError", async () => {
    const rawErrorCalls: Array<{ status: number; snippet: string }> = [];
    const onRawError = (status: number, snippet: string) => {
      rawErrorCalls.push({ status, snippet });
    };
    const { fetch } = recordedFetch(() => ({
      ok: false,
      status: 500,
      body: "proxy log dump: Authorization: Bearer eyJabc.def.ghi-very-long-jwt-value-here",
    }));
    const adapter = new OllamaAdapter({
      profileId: "p",
      requiresAuth: true,
      fetchImpl: fetch,
    });
    await adapter.complete(
      baseRequest(),
      createAdapterContext({ secret: "k", onRawError }),
    );
    expect(rawErrorCalls.length).toBeGreaterThan(0);
    const snippet = rawErrorCalls[rawErrorCalls.length - 1]!.snippet;
    expect(snippet).not.toContain("eyJabc.def.ghi-very-long-jwt-value-here");
    expect(snippet).toContain("<redacted>");
  });
});
