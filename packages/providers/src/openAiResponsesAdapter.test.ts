import { describe, expect, it, vi } from "vitest";
import type { ProviderCompletionRequest } from "@ai-orchestrator/protocol";
import { createAdapterContext } from "./adapter";
import type { AdapterFetchLike } from "./openAiCompatibleAdapter";
import {
  OpenAiResponsesAdapter,
  createResponsesInput,
  createResponsesRequestBody,
  parseResponsesOutputText,
  parseResponsesUsage,
} from "./openAiResponsesAdapter";

function baseRequest(overrides: Partial<ProviderCompletionRequest> = {}): ProviderCompletionRequest {
  return {
    id: "req_resp_001",
    sessionId: "session_test",
    providerProfileId: "provider_codexopen",
    modelId: "anthropic/claude-sonnet-5",
    messages: [{ role: "user", content: "reply with exactly: pong" }],
    source: "desktop",
    routePreference: "server_proxy",
    createdAt: "2026-07-10T00:00:00.000Z",
    ...overrides,
  };
}

// Live-verified success body shape (codexopen :10200 /v1/responses).
function successBody(text = "pong") {
  return JSON.stringify({
    id: "resp_abc",
    object: "response",
    status: "completed",
    model: "claude-sonnet-5",
    output: [
      {
        type: "message",
        id: "msg_1",
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text, annotations: [] }],
      },
    ],
    usage: { input_tokens: 43, output_tokens: 4, total_tokens: 47, input_tokens_details: { cached_tokens: 0 } },
  });
}

describe("createResponsesInput", () => {
  it("routes system turns into instructions and other turns into input", () => {
    const { instructions, input } = createResponsesInput(
      [
        { role: "system", content: "Board context." },
        { role: "user", content: "one" },
        { role: "assistant", content: "two" },
        { role: "tool", content: "three" },
      ],
      "Default prompt.",
    );

    expect(instructions).toBe("Default prompt.\n\nBoard context.");
    expect(input).toEqual([
      { role: "user", content: "one" },
      { role: "assistant", content: "two" },
      { role: "tool", content: "three" },
    ]);
  });

  it("keeps only the most recent maxContextMessages input turns", () => {
    const { input } = createResponsesInput(
      [
        { role: "user", content: "one" },
        { role: "assistant", content: "two" },
        { role: "user", content: "three" },
      ],
      "Default prompt.",
      2,
    );
    expect(input).toEqual([
      { role: "assistant", content: "two" },
      { role: "user", content: "three" },
    ]);
  });

  it("drops empty/whitespace turns and yields empty instructions without a default prompt", () => {
    const { instructions, input } = createResponsesInput(
      [
        { role: "system", content: "   " },
        { role: "user", content: "hi" },
      ],
      "",
    );
    expect(instructions).toBe("");
    expect(input).toEqual([{ role: "user", content: "hi" }]);
  });
});

describe("createResponsesRequestBody", () => {
  it("maps messages → input, system → instructions, maxOutputTokens → max_output_tokens", () => {
    const body = createResponsesRequestBody(
      baseRequest({
        maxOutputTokens: 256,
        messages: [
          { role: "system", content: "Answer tersely." },
          { role: "user", content: "reply with exactly: pong" },
        ],
      }),
      { defaultSystemPrompt: "Default.", maxTokens: 4096 },
    );

    expect(body.model).toBe("anthropic/claude-sonnet-5");
    expect(body.max_output_tokens).toBe(256);
    expect(body.instructions).toBe("Default.\n\nAnswer tersely.");
    expect(body.input).toEqual([{ role: "user", content: "reply with exactly: pong" }]);
    // temperature is omitted by default (many upstreams reject it)
    expect(body).not.toHaveProperty("temperature");
  });

  it("falls back to the adapter maxTokens and includes temperature when configured", () => {
    const body = createResponsesRequestBody(baseRequest(), { maxTokens: 1234, temperature: 0.2 });
    expect(body.max_output_tokens).toBe(1234);
    expect(body.temperature).toBe(0.2);
  });

  it("omits instructions entirely when there is no system content or default prompt", () => {
    const body = createResponsesRequestBody(baseRequest(), { defaultSystemPrompt: "" });
    expect(body).not.toHaveProperty("instructions");
  });
});

describe("parseResponsesOutputText", () => {
  it("concatenates output_text parts across message items", () => {
    const text = parseResponsesOutputText({
      output: [
        {
          type: "message",
          content: [
            { type: "output_text", text: "Hi! " },
            { type: "reasoning", text: "IGNORED" },
            { type: "output_text", text: "there" },
          ],
        },
      ],
    });
    expect(text).toBe("Hi! there");
  });

  it("ignores non-message output items and falls back to top-level output_text", () => {
    expect(
      parseResponsesOutputText({
        output: [{ type: "reasoning", content: [{ type: "output_text", text: "no" }] }],
        output_text: "fallback",
      }),
    ).toBe("fallback");
  });
});

describe("parseResponsesUsage", () => {
  it("maps input/output/total tokens to the meter usage shape", () => {
    expect(parseResponsesUsage({ input_tokens: 43, output_tokens: 4, total_tokens: 47 })).toEqual({
      inputTokens: 43,
      outputTokens: 4,
      totalTokens: 47,
    });
  });

  it("returns an all-undefined usage when the provider omits usage", () => {
    expect(parseResponsesUsage(undefined)).toEqual({
      inputTokens: undefined,
      outputTokens: undefined,
      totalTokens: undefined,
    });
  });
});

describe("OpenAiResponsesAdapter.complete", () => {
  it("POSTs to /responses with input/instructions and parses output_text + usage", async () => {
    const fetchImpl: AdapterFetchLike = async (url, init) => {
      expect(url).toBe("http://127.0.0.1:10200/v1/responses");
      expect(init?.method).toBe("POST");
      // loopback no-auth: no auth header
      expect(init?.headers?.authorization).toBeUndefined();
      expect(init?.headers?.["x-codexopen-api-key"]).toBeUndefined();
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(body.model).toBe("anthropic/claude-sonnet-5");
      expect(body.input).toEqual([{ role: "user", content: "reply with exactly: pong" }]);
      expect(body.instructions).toBe("Default board prompt.");
      expect(body.max_output_tokens).toBe(50);
      expect(body).not.toHaveProperty("messages");
      return { ok: true, status: 200, async text() { return successBody("pong"); } };
    };

    const adapter = new OpenAiResponsesAdapter({
      profileId: "provider_codexopen",
      baseUrl: "http://127.0.0.1:10200/v1/",
      requiresAuth: false,
      defaultSystemPrompt: "Default board prompt.",
      maxTokens: 4096,
      fetchImpl,
    });

    const response = await adapter.complete(baseRequest({ maxOutputTokens: 50 }), createAdapterContext());

    expect(response.status).toBe("succeeded");
    expect(response.content).toBe("pong");
    expect(response.endpoint).toBe("http://127.0.0.1:10200/v1/responses");
    expect(response.usage).toEqual({ inputTokens: 43, outputTokens: 4, totalTokens: 47 });
  });

  it("sends the resolved secret in a custom x-codexopen-api-key header (non-loopback)", async () => {
    const fetchImpl: AdapterFetchLike = async (_url, init) => {
      expect(init?.headers?.["x-codexopen-api-key"]).toBe("cox-secret");
      expect(init?.headers?.authorization).toBeUndefined();
      expect(String(init?.body)).not.toContain("cox-secret");
      return { ok: true, status: 200, async text() { return successBody("ok"); } };
    };
    const adapter = new OpenAiResponsesAdapter({
      profileId: "provider_codexopen",
      baseUrl: "http://remote.codexopen.test/v1",
      requiresAuth: true,
      authHeaderName: "x-codexopen-api-key",
      fetchImpl,
    });

    const response = await adapter.complete(baseRequest(), createAdapterContext({ secret: "cox-secret" }));
    expect(response.status).toBe("succeeded");
  });

  it("surfaces a proxied upstream error (401 JSON) as a failed completion, not a crash", async () => {
    const onRawError = vi.fn();
    const fetchImpl: AdapterFetchLike = async () => ({
      ok: false,
      status: 401,
      async text() {
        return JSON.stringify({ detail: "Unauthorized" });
      },
    });
    const adapter = new OpenAiResponsesAdapter({
      profileId: "provider_codexopen",
      baseUrl: "http://127.0.0.1:10200/v1",
      requiresAuth: false,
      fetchImpl,
    });

    const response = await adapter.complete(
      baseRequest({ modelId: "gpt-5.5" }),
      createAdapterContext({ onRawError }),
    );

    expect(response.status).toBe("failed");
    expect(response.error).toContain("[credential_expired]");
    expect(response.error).toContain("401");
    expect(onRawError).toHaveBeenCalled();
    // the raw snippet must not leak into logs unredacted beyond the reporter
    expect(onRawError.mock.calls[0]?.[0]).toBe(401);
  });

  it("surfaces a provider error carried inside a 200 body", async () => {
    const fetchImpl: AdapterFetchLike = async () => ({
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({
          id: "resp_err",
          object: "response",
          status: "failed",
          error: { message: "upstream credential rejected" },
          output: [],
        });
      },
    });
    const adapter = new OpenAiResponsesAdapter({
      profileId: "provider_codexopen",
      baseUrl: "http://127.0.0.1:10200/v1",
      requiresAuth: false,
      fetchImpl,
    });

    const response = await adapter.complete(baseRequest(), createAdapterContext());
    expect(response.status).toBe("failed");
    expect(response.error).toContain("upstream credential rejected");
  });

  it("fails when the response has no output_text content", async () => {
    const fetchImpl: AdapterFetchLike = async () => ({
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({ status: "completed", output: [{ type: "message", content: [] }] });
      },
    });
    const adapter = new OpenAiResponsesAdapter({
      profileId: "provider_codexopen",
      baseUrl: "http://127.0.0.1:10200/v1",
      requiresAuth: false,
      fetchImpl,
    });

    const response = await adapter.complete(baseRequest(), createAdapterContext());
    expect(response.status).toBe("failed");
    expect(response.error).toContain("empty response");
  });

  it("returns an auth failure without calling fetch when a required secret is missing", async () => {
    const fetchImpl = vi.fn<AdapterFetchLike>();
    const adapter = new OpenAiResponsesAdapter({
      profileId: "provider_codexopen",
      baseUrl: "http://remote.codexopen.test/v1",
      requiresAuth: true,
      fetchImpl,
    });

    const response = await adapter.complete(baseRequest(), createAdapterContext());
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(response.status).toBe("failed");
    expect(response.error).toContain("[auth]");
  });
});

describe("OpenAiResponsesAdapter.discoverModels", () => {
  it("discovers models from the standard /models endpoint", async () => {
    const adapter = new OpenAiResponsesAdapter({
      profileId: "provider_codexopen",
      baseUrl: "http://127.0.0.1:10200/v1",
      requiresAuth: false,
      fetchImpl: async (url) => {
        expect(url).toBe("http://127.0.0.1:10200/v1/models");
        return {
          ok: true,
          status: 200,
          async text() {
            return JSON.stringify({ data: [{ id: "gpt-5.5" }, { id: "anthropic/claude-sonnet-5" }] });
          },
        };
      },
    });

    const models = await adapter.discoverModels(createAdapterContext());
    expect(models.map((m) => m.id)).toEqual(["gpt-5.5", "anthropic/claude-sonnet-5"]);
    expect(models[0]?.tags).toContain("openai-responses");
  });
});

describe("OpenAiResponsesAdapter.completeStreaming", () => {
  it("parses SSE output_text.delta events and the terminal response.completed usage", async () => {
    const fetchImpl: AdapterFetchLike = async (url, init) => {
      expect(url).toBe("http://127.0.0.1:10200/v1/responses");
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(body.stream).toBe(true);
      return {
        ok: true,
        status: 200,
        async text() { return ""; },
        body: [
          'event: response.created\ndata: {"type":"response.created"}\n',
          'data: {"type":"response.output_text.delta","delta":"Hi! "}\n',
          'data: {"type":"response.output_text.delta","delta":"there"}\n',
          'data: {"type":"response.completed","response":{"status":"completed","output":[{"type":"message","content":[{"type":"output_text","text":"Hi! there"}]}],"usage":{"input_tokens":74,"output_tokens":21,"total_tokens":95}}}\n',
        ],
      };
    };

    const adapter = new OpenAiResponsesAdapter({
      profileId: "provider_codexopen",
      baseUrl: "http://127.0.0.1:10200/v1",
      requiresAuth: false,
      fetchImpl,
    });

    const chunks = [];
    for await (const chunk of adapter.completeStreaming(baseRequest(), createAdapterContext())) {
      chunks.push(chunk);
    }

    expect(chunks[0]).toEqual({ type: "delta", requestId: "req_resp_001", sequence: 0, delta: "Hi! " });
    expect(chunks[1]).toEqual({ type: "delta", requestId: "req_resp_001", sequence: 1, delta: "there" });
    expect(chunks.find((c) => c.type === "usage")).toEqual({
      type: "usage",
      requestId: "req_resp_001",
      usage: { inputTokens: 74, outputTokens: 21, totalTokens: 95 },
    });
    expect(chunks.at(-1)).toMatchObject({
      type: "done",
      finalContent: "Hi! there",
      stopReason: "end_turn",
      usage: { inputTokens: 74, outputTokens: 21, totalTokens: 95 },
    });
  });

  it("emits an error chunk when the stream POST fails", async () => {
    const adapter = new OpenAiResponsesAdapter({
      profileId: "provider_codexopen",
      baseUrl: "http://127.0.0.1:10200/v1",
      requiresAuth: false,
      fetchImpl: async () => ({ ok: false, status: 401, async text() { return JSON.stringify({ detail: "Unauthorized" }); } }),
    });

    const chunks = [];
    for await (const chunk of adapter.completeStreaming(baseRequest(), createAdapterContext())) {
      chunks.push(chunk);
    }
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ type: "error", error: { category: "credential_expired" } });
  });
});
