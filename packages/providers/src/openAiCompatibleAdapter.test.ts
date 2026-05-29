import { describe, expect, it, vi } from "vitest";
import type { ProviderCompletionRequest } from "@ai-orchestrator/protocol";
import { createAdapterContext } from "./adapter";
import { createOpenAIChatMessages, OpenAICompatibleAdapter, type AdapterFetchLike } from "./openAiCompatibleAdapter";

function baseRequest(overrides: Partial<ProviderCompletionRequest> = {}): ProviderCompletionRequest {
  return {
    id: "req_openai_001",
    sessionId: "session_test",
    providerProfileId: "provider_openai_compatible",
    modelId: "gpt-test",
    messages: [{ role: "user", content: "Reply OK only" }],
    source: "desktop",
    routePreference: "server_proxy",
    createdAt: "2026-05-25T08:30:00.000Z",
    ...overrides,
  };
}

describe("createOpenAIChatMessages", () => {
  it("merges system messages into one system prompt and keeps recent chat turns", () => {
    const messages = createOpenAIChatMessages(
      [
        { role: "system", content: "Desktop context." },
        { role: "user", content: "one" },
        { role: "assistant", content: "two" },
      ],
      "Default prompt.",
    );

    expect(messages[0]).toEqual({
      role: "system",
      content: "Default prompt.\n\nDesktop context.",
    });
    expect(messages[1]).toEqual({ role: "user", content: "one" });
    expect(messages[2]).toEqual({ role: "assistant", content: "two" });
  });
});

describe("OpenAICompatibleAdapter", () => {
  it("posts an OpenAI-compatible chat completion with bearer auth and extra body", async () => {
    const fetchImpl: AdapterFetchLike = async (url, init) => {
      expect(url).toBe("https://api.example.test/v1/chat/completions");
      expect(init?.headers?.authorization).toBe("Bearer sk-test-secret");
      expect(init?.headers?.["x-test-header"]).toBe("adapter");
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(body.model).toBe("gpt-test");
      expect(body.max_tokens).toBe(777);
      expect(body.temperature).toBe(0.1);
      expect(body.chat_template_kwargs).toEqual({ enable_thinking: false });
      expect(JSON.stringify(body)).not.toContain("sk-test-secret");
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({
            choices: [{ message: { content: "OK" } }],
            usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 },
          });
        },
      };
    };

    const adapter = new OpenAICompatibleAdapter({
      profileId: "provider_openai_compatible",
      baseUrl: "https://api.example.test/v1/",
      maxTokens: 777,
      temperature: 0.1,
      extraBody: { chat_template_kwargs: { enable_thinking: false } },
      headers: { "x-test-header": "adapter" },
      fetchImpl,
    });

    const response = await adapter.complete(baseRequest(), createAdapterContext({ secret: "sk-test-secret" }));

    expect(response.status).toBe("succeeded");
    expect(response.content).toBe("OK");
    expect(response.endpoint).toBe("https://api.example.test/v1/chat/completions");
    expect(response.usage?.totalTokens).toBe(12);
  });

  it("supports no-auth vLLM style providers", async () => {
    const fetchImpl: AdapterFetchLike = async (_url, init) => {
      expect(init?.headers?.authorization).toBeUndefined();
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({ choices: [{ message: { content: "local OK" } }] });
        },
      };
    };
    const adapter = new OpenAICompatibleAdapter({
      profileId: "provider_dgx02_vllm",
      baseUrl: "http://127.0.0.1:8001/v1",
      requiresAuth: false,
      fetchImpl,
    });

    const response = await adapter.complete(
      baseRequest({ providerProfileId: "provider_dgx02_vllm", modelId: "qwen36" }),
      createAdapterContext(),
    );

    expect(response.status).toBe("succeeded");
    expect(response.content).toBe("local OK");
  });

  it("discovers models from /models when the endpoint is supported", async () => {
    const adapter = new OpenAICompatibleAdapter({
      profileId: "provider_deepseek_dgx",
      kind: "openai",
      baseUrl: "https://api.deepseek.com/v1",
      fetchImpl: async (url, init) => {
        expect(url).toBe("https://api.deepseek.com/v1/models");
        expect(init?.headers?.authorization).toBe("Bearer sk-discovery-secret");
        return {
          ok: true,
          status: 200,
          async text() {
            return JSON.stringify({ data: [{ id: "deepseek-chat" }, { id: "deepseek-reasoner" }] });
          },
        };
      },
    });

    const models = await adapter.discoverModels(createAdapterContext({ secret: "sk-discovery-secret" }));

    expect(models.map((model) => model.id)).toEqual(["deepseek-chat", "deepseek-reasoner"]);
    expect(models[0]?.providerProfileId).toBe("provider_deepseek_dgx");
  });

  it("falls back to the static model list when model discovery fails", async () => {
    const adapter = new OpenAICompatibleAdapter({
      profileId: "provider_openrouter",
      kind: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      modelIds: ["openrouter/auto", "x-ai/grok-4"],
      fetchImpl: async () => {
        throw new Error("network down");
      },
    });

    const models = await adapter.discoverModels(createAdapterContext({ secret: "sk-openrouter" }));

    expect(models.map((model) => model.id)).toEqual(["openrouter/auto", "x-ai/grok-4"]);
  });

  it("returns an auth failure without calling fetch when a required secret is missing", async () => {
    const fetchImpl = vi.fn<AdapterFetchLike>();
    const adapter = new OpenAICompatibleAdapter({
      profileId: "provider_openai_compatible",
      baseUrl: "https://api.example.test/v1",
      fetchImpl,
    });

    const response = await adapter.complete(baseRequest(), createAdapterContext());

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(response.status).toBe("failed");
    expect(response.error).toContain("[auth]");
  });

  it("redacts raw provider error snippets before reporting them", async () => {
    const onRawError = vi.fn();
    const adapter = new OpenAICompatibleAdapter({
      profileId: "provider_openai_compatible",
      baseUrl: "https://api.example.test/v1",
      fetchImpl: async () => ({
        ok: false,
        status: 401,
        async text() {
          return "bad key sk-abcdef0123456789abcdef0123456789";
        },
      }),
    });

    const response = await adapter.complete(
      baseRequest(),
      createAdapterContext({ secret: "sk-test-secret", onRawError }),
    );

    expect(response.status).toBe("failed");
    expect(response.error).toContain("[credential_expired]");
    expect(onRawError).toHaveBeenCalledWith(401, expect.stringContaining("<redacted>"));
    expect(onRawError.mock.calls[0]?.[1]).not.toContain("sk-abcdef0123456789abcdef0123456789");
  });

  it("streams the completion chunks correctly", async () => {
    const fetchImpl: AdapterFetchLike = async (url, init) => {
      expect(url).toBe("https://api.example.test/v1/chat/completions");
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(body.stream).toBe(true);
      expect(body.stream_options).toEqual({ include_usage: true });

      return {
        ok: true,
        status: 200,
        async text() {
          return "";
        },
        body: [
          'data: {"choices":[{"delta":{"content":"He"}}]}\n',
          'data: {"choices":[{"delta":{"content":"llo"}}]}\n',
          'data: {"usage":{"prompt_tokens":10,"completion_tokens":2,"total_tokens":12}}\n',
          'data: [DONE]\n'
        ]
      };
    };

    const adapter = new OpenAICompatibleAdapter({
      profileId: "provider_openai_compatible",
      baseUrl: "https://api.example.test/v1/",
      fetchImpl,
    });

    const stream = adapter.completeStreaming(
      baseRequest(),
      createAdapterContext({ secret: "sk-test-secret" })
    );

    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(4);
    expect(chunks[0]).toEqual({
      type: "delta",
      requestId: "req_openai_001",
      sequence: 0,
      delta: "He",
    });
    expect(chunks[1]).toEqual({
      type: "delta",
      requestId: "req_openai_001",
      sequence: 1,
      delta: "llo",
    });
    expect(chunks[2]).toEqual({
      type: "usage",
      requestId: "req_openai_001",
      usage: {
        inputTokens: 10,
        outputTokens: 2,
        totalTokens: 12,
      },
    });
    expect(chunks[3]).toMatchObject({
      type: "done",
      requestId: "req_openai_001",
      finalContent: "Hello",
      stopReason: "end_turn",
      usage: {
        inputTokens: 10,
        outputTokens: 2,
        totalTokens: 12,
      },
    });
  });
});
