import { describe, expect, it } from "vitest";
import type { ProviderCompletionRequest } from "@ai-orchestrator/protocol";
import {
  AnthropicAdapter,
  applyAnthropicImageAttachments,
  extractAnthropicText,
  splitSystemAndMessages,
} from "./anthropicAdapter";
import type { AdapterFetchLike } from "./openAiCompatibleAdapter";
import { AdapterError } from "./errors";
import { createAdapterContext } from "./adapter";
import { baseProviderRequest, recordedFetch } from "./testHelpers";

// Anthropic-specific defaults on top of the shared baseProviderRequest.
function baseRequest(overrides: Partial<ProviderCompletionRequest> = {}): ProviderCompletionRequest {
  return baseProviderRequest({
    id: "req_anthropic_001",
    providerProfileId: "provider_apifun_claude",
    modelId: "claude-opus-4-8",
    ...overrides,
  });
}

describe("splitSystemAndMessages", () => {
  it("collects system messages into top-level system field", () => {
    const { system, messages } = splitSystemAndMessages([
      { role: "system", content: "rule one" },
      { role: "system", content: "rule two" },
      { role: "user", content: "hello" },
    ]);
    expect(system).toBe("rule one\n\nrule two");
    expect(messages).toEqual([{ role: "user", content: "hello" }]);
  });

  it("returns undefined system when no system messages present", () => {
    const { system, messages } = splitSystemAndMessages([
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ]);
    expect(system).toBeUndefined();
    expect(messages).toHaveLength(2);
  });

  it("drops tool messages (v1 behavior) and skips empty content", () => {
    const { system, messages } = splitSystemAndMessages([
      { role: "system", content: "  " },
      { role: "user", content: "u1" },
      { role: "tool", content: "tool turn" },
      { role: "assistant", content: "a1" },
    ]);
    expect(system).toBeUndefined();
    expect(messages).toEqual([
      { role: "user", content: "u1" },
      { role: "assistant", content: "a1" },
    ]);
  });

  it("ignores malformed non-string content before Anthropic message validation", () => {
    const malformedMessages = [
      { role: "system", content: { text: "object system" } },
      { role: "user", content: { text: "object user" } },
      { role: "user", content: "valid user" },
    ] as unknown as Parameters<typeof splitSystemAndMessages>[0];

    const { system, messages } = splitSystemAndMessages(malformedMessages);

    expect(system).toBeUndefined();
    expect(messages).toEqual([{ role: "user", content: "valid user" }]);
  });
});

describe("extractAnthropicText", () => {
  it("concatenates text blocks and ignores unknown block types", () => {
    expect(
      extractAnthropicText([
        { type: "text", text: "Hello " },
        { type: "tool_use" } as { type: string },
        { type: "text", text: "world" },
      ]),
    ).toBe("Hello world");
  });

  it("returns empty string when no text blocks", () => {
    expect(extractAnthropicText([{ type: "tool_use" } as { type: string }])).toBe("");
  });
});

describe("AnthropicAdapter — request shape", () => {
  it("sends x-api-key and anthropic-version headers, not Authorization", async () => {
    const { fetch, calls } = recordedFetch(() => ({
      ok: true,
      status: 200,
      body: JSON.stringify({
        type: "message",
        content: [{ type: "text", text: "OK" }],
        stop_reason: "end_turn",
        usage: { input_tokens: 5, output_tokens: 1 },
      }),
    }));
    const adapter = new AnthropicAdapter({
      profileId: "provider_apifun_claude",
      baseUrl: "https://api.apikey.fun",
      fetchImpl: fetch,
    });
    await adapter.complete(baseRequest(), createAdapterContext({ secret: "sk-ant-secret" }));
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://api.apikey.fun/v1/messages");
    expect(calls[0]!.headers?.["x-api-key"]).toBe("sk-ant-secret");
    expect(calls[0]!.headers?.["anthropic-version"]).toBe("2023-06-01");
    expect(calls[0]!.headers?.authorization).toBeUndefined();
  });

  it("moves system messages out of messages into top-level system field", async () => {
    let captured: { system?: string; messages: Array<{ role: string; content: string }> } | null = null;
    const { fetch } = recordedFetch((call) => {
      captured = JSON.parse(call.body ?? "{}") as {
        system?: string;
        messages: Array<{ role: string; content: string }>;
      };
      return {
        ok: true,
        status: 200,
        body: JSON.stringify({
          type: "message",
          content: [{ type: "text", text: "OK" }],
          stop_reason: "end_turn",
        }),
      };
    });
    const adapter = new AnthropicAdapter({
      profileId: "p",
      baseUrl: "https://api.apikey.fun",
      fetchImpl: fetch,
    });
    await adapter.complete(
      baseRequest({
        messages: [
          { role: "system", content: "first system" },
          { role: "system", content: "second system" },
          { role: "user", content: "ping" },
        ],
      }),
      createAdapterContext({ secret: "k" }),
    );
    expect(captured!.system).toBe("first system\n\nsecond system");
    expect(captured!.messages).toHaveLength(1);
    expect(captured!.messages[0]).toEqual({ role: "user", content: "ping" });
  });

  it("drops blank text messages before building the Anthropic request body", async () => {
    let captured: { system?: string; messages: Array<{ role: string; content: string }> } | null = null;
    const { fetch } = recordedFetch((call) => {
      captured = JSON.parse(call.body ?? "{}") as {
        system?: string;
        messages: Array<{ role: string; content: string }>;
      };
      return {
        ok: true,
        status: 200,
        body: JSON.stringify({
          type: "message",
          content: [{ type: "text", text: "OK" }],
          stop_reason: "end_turn",
        }),
      };
    });
    const adapter = new AnthropicAdapter({
      profileId: "p",
      baseUrl: "https://api.apikey.fun",
      fetchImpl: fetch,
    });
    await adapter.complete(
      baseRequest({
        messages: [
          { role: "system", content: "   " },
          { role: "user", content: "" },
          { role: "user", content: "ping" },
        ],
      }),
      createAdapterContext({ secret: "k" }),
    );
    expect(captured!.system).toBeUndefined();
    expect(captured!.messages).toEqual([{ role: "user", content: "ping" }]);
  });

  it("includes max_tokens (Anthropic requires it)", async () => {
    let body: Record<string, unknown> | null = null;
    const { fetch } = recordedFetch((call) => {
      body = JSON.parse(call.body ?? "{}");
      return {
        ok: true,
        status: 200,
        body: JSON.stringify({
          type: "message",
          content: [{ type: "text", text: "x" }],
          stop_reason: "end_turn",
        }),
      };
    });
    const adapter = new AnthropicAdapter({
      profileId: "p",
      baseUrl: "https://api.apikey.fun",
      defaultMaxTokens: 8192,
      fetchImpl: fetch,
    });
    await adapter.complete(baseRequest(), createAdapterContext({ secret: "k" }));
    expect(body!.max_tokens).toBe(8192);
    expect(body!.model).toBe("claude-opus-4-8");
  });

  it("includes anthropic-beta header when configured", async () => {
    const { fetch, calls } = recordedFetch(() => ({
      ok: true,
      status: 200,
      body: JSON.stringify({
        type: "message",
        content: [{ type: "text", text: "x" }],
        stop_reason: "end_turn",
      }),
    }));
    const adapter = new AnthropicAdapter({
      profileId: "p",
      baseUrl: "https://api.anthropic.com",
      betaHeaders: ["prompt-caching-2024-07-31", "context-1m-2025-08-07"],
      fetchImpl: fetch,
    });
    await adapter.complete(baseRequest(), createAdapterContext({ secret: "k" }));
    expect(calls[0]!.headers?.["anthropic-beta"]).toBe(
      "prompt-caching-2024-07-31,context-1m-2025-08-07",
    );
  });
});

describe("AnthropicAdapter — message order invariants", () => {
  it("rejects when the first message is assistant", async () => {
    const { fetch, calls } = recordedFetch(() => ({ ok: true, status: 200, body: "{}" }));
    const adapter = new AnthropicAdapter({
      profileId: "p",
      baseUrl: "https://api.apikey.fun",
      fetchImpl: fetch,
    });
    const response = await adapter.complete(
      baseRequest({ messages: [{ role: "assistant", content: "I start" }] }),
      createAdapterContext({ secret: "k" }),
    );
    expect(response.status).toBe("failed");
    expect(response.error).toMatch(/bad_request/);
    expect(response.error).toMatch(/must start with user/);
    expect(calls).toHaveLength(0); // never hit the network
  });

  it("rejects consecutive same-role messages", async () => {
    const { fetch } = recordedFetch(() => ({ ok: true, status: 200, body: "{}" }));
    const adapter = new AnthropicAdapter({
      profileId: "p",
      baseUrl: "https://api.apikey.fun",
      fetchImpl: fetch,
    });
    const response = await adapter.complete(
      baseRequest({
        messages: [
          { role: "user", content: "first" },
          { role: "user", content: "second" },
        ],
      }),
      createAdapterContext({ secret: "k" }),
    );
    expect(response.status).toBe("failed");
    expect(response.error).toMatch(/alternate/);
  });
});

describe("AnthropicAdapter — response parsing", () => {
  it("extracts text from content array and reports usage", async () => {
    const { fetch } = recordedFetch(() => ({
      ok: true,
      status: 200,
      body: JSON.stringify({
        type: "message",
        content: [
          { type: "text", text: "Hello " },
          { type: "text", text: "Claude" },
        ],
        stop_reason: "end_turn",
        usage: {
          input_tokens: 12,
          output_tokens: 7,
          cache_creation_input_tokens: 100,
          cache_read_input_tokens: 50,
        },
      }),
    }));
    const adapter = new AnthropicAdapter({
      profileId: "p",
      baseUrl: "https://api.apikey.fun",
      fetchImpl: fetch,
    });
    const response = await adapter.complete(baseRequest(), createAdapterContext({ secret: "k" }));
    expect(response.status).toBe("succeeded");
    expect(response.content).toBe("Hello Claude");
    expect(response.usage).toEqual({
      inputTokens: 12,
      outputTokens: 7,
      totalTokens: 19,
      cacheCreationInputTokens: 100,
      cacheReadInputTokens: 50,
    });
  });

  it("treats stop_reason=max_tokens as succeeded (response is truncated, not an error)", async () => {
    const { fetch } = recordedFetch(() => ({
      ok: true,
      status: 200,
      body: JSON.stringify({
        type: "message",
        content: [{ type: "text", text: "partial response" }],
        stop_reason: "max_tokens",
        usage: { input_tokens: 5, output_tokens: 4096 },
      }),
    }));
    const adapter = new AnthropicAdapter({
      profileId: "p",
      baseUrl: "https://api.apikey.fun",
      fetchImpl: fetch,
    });
    const response = await adapter.complete(baseRequest(), createAdapterContext({ secret: "k" }));
    expect(response.status).toBe("succeeded");
    expect(response.content).toBe("partial response");
  });

  it("returns failed when stop_reason=tool_use (tool support not yet wired)", async () => {
    const { fetch } = recordedFetch(() => ({
      ok: true,
      status: 200,
      body: JSON.stringify({
        type: "message",
        content: [{ type: "tool_use" }],
        stop_reason: "tool_use",
      }),
    }));
    const adapter = new AnthropicAdapter({
      profileId: "p",
      baseUrl: "https://api.apikey.fun",
      fetchImpl: fetch,
    });
    const response = await adapter.complete(baseRequest(), createAdapterContext({ secret: "k" }));
    expect(response.status).toBe("failed");
    expect(response.error).toBe("tool_use_returned_but_not_supported");
  });

  it("returns failed when content is empty", async () => {
    const { fetch } = recordedFetch(() => ({
      ok: true,
      status: 200,
      body: JSON.stringify({
        type: "message",
        content: [],
        stop_reason: "end_turn",
      }),
    }));
    const adapter = new AnthropicAdapter({
      profileId: "p",
      baseUrl: "https://api.apikey.fun",
      fetchImpl: fetch,
    });
    const response = await adapter.complete(baseRequest(), createAdapterContext({ secret: "k" }));
    expect(response.status).toBe("failed");
    expect(response.error).toMatch(/empty/);
  });
});

describe("AnthropicAdapter — error mapping", () => {
  it("maps 401 to credential_expired", async () => {
    const { fetch } = recordedFetch(() => ({
      ok: false,
      status: 401,
      body: JSON.stringify({
        type: "error",
        error: { type: "authentication_error", message: "invalid x-api-key" },
      }),
    }));
    const adapter = new AnthropicAdapter({
      profileId: "p",
      baseUrl: "https://api.apikey.fun",
      fetchImpl: fetch,
    });
    const response = await adapter.complete(baseRequest(), createAdapterContext({ secret: "bad" }));
    expect(response.status).toBe("failed");
    expect(response.error).toMatch(/credential_expired/);
  });

  it("maps 429 to rate_limit", async () => {
    const { fetch } = recordedFetch(() => ({
      ok: false,
      status: 429,
      body: JSON.stringify({
        type: "error",
        error: { type: "rate_limit_error", message: "too many" },
      }),
    }));
    const adapter = new AnthropicAdapter({
      profileId: "p",
      baseUrl: "https://api.apikey.fun",
      fetchImpl: fetch,
    });
    const response = await adapter.complete(baseRequest(), createAdapterContext({ secret: "k" }));
    expect(response.status).toBe("failed");
    expect(response.error).toMatch(/rate_limit/);
  });

  it("maps 500 to provider", async () => {
    const { fetch } = recordedFetch(() => ({
      ok: false,
      status: 500,
      body: "upstream timeout",
    }));
    const adapter = new AnthropicAdapter({
      profileId: "p",
      baseUrl: "https://api.apikey.fun",
      fetchImpl: fetch,
    });
    const response = await adapter.complete(baseRequest(), createAdapterContext({ secret: "k" }));
    expect(response.status).toBe("failed");
    expect(response.error).toMatch(/provider/);
  });

  it("maps 529 (overloaded) to provider", async () => {
    const { fetch } = recordedFetch(() => ({ ok: false, status: 529, body: "overloaded" }));
    const adapter = new AnthropicAdapter({
      profileId: "p",
      baseUrl: "https://api.apikey.fun",
      fetchImpl: fetch,
    });
    const response = await adapter.complete(baseRequest(), createAdapterContext({ secret: "k" }));
    expect(response.status).toBe("failed");
    expect(response.error).toMatch(/provider/);
  });

  it("redacts secret-like patterns in error snippets and never echoes the raw key", async () => {
    const rawErrorCalls: Array<{ status: number; snippet: string }> = [];
    const onRawError = (status: number, snippet: string) => {
      rawErrorCalls.push({ status, snippet });
    };
    const { fetch } = recordedFetch(() => ({
      ok: false,
      status: 401,
      body: "rejected key: sk-ant-secretvalueshouldnotleak12345678",
    }));
    const adapter = new AnthropicAdapter({
      profileId: "p",
      baseUrl: "https://api.apikey.fun",
      fetchImpl: fetch,
    });
    await adapter.complete(
      baseRequest(),
      createAdapterContext({ secret: "sk-ant-secretvalueshouldnotleak12345678", onRawError }),
    );
    expect(rawErrorCalls.length).toBeGreaterThan(0);
    const lastSnippet = rawErrorCalls[rawErrorCalls.length - 1]!.snippet;
    expect(lastSnippet).not.toContain("sk-ant-secretvalueshouldnotleak12345678");
    expect(lastSnippet).toContain("<redacted>");
  });

  it("missing secret raises auth before hitting the network", async () => {
    const { fetch, calls } = recordedFetch(() => ({ ok: true, status: 200, body: "{}" }));
    const adapter = new AnthropicAdapter({
      profileId: "p",
      baseUrl: "https://api.apikey.fun",
      fetchImpl: fetch,
    });
    const response = await adapter.complete(baseRequest(), createAdapterContext({ secret: undefined }));
    expect(response.status).toBe("failed");
    expect(response.error).toMatch(/auth/);
    expect(calls).toHaveLength(0);
  });

  it("requiresAuth=false allows missing secret", async () => {
    const { fetch } = recordedFetch(() => ({
      ok: true,
      status: 200,
      body: JSON.stringify({
        type: "message",
        content: [{ type: "text", text: "OK" }],
        stop_reason: "end_turn",
      }),
    }));
    const adapter = new AnthropicAdapter({
      profileId: "p",
      baseUrl: "https://api.apikey.fun",
      requiresAuth: false,
      fetchImpl: fetch,
    });
    const response = await adapter.complete(baseRequest(), createAdapterContext({ secret: undefined }));
    expect(response.status).toBe("succeeded");
  });
});

describe("AnthropicAdapter — discoverModels", () => {
  it("returns a static list (Anthropic has no /v1/models endpoint)", async () => {
    const adapter = new AnthropicAdapter({
      profileId: "provider_apifun_claude",
      baseUrl: "https://api.apikey.fun",
      modelIds: ["claude-opus-4-8", "claude-sonnet-reseller", "claude-haiku-reseller"],
    });
    const models = await adapter.discoverModels(createAdapterContext({ secret: "k" }));
    expect(models).toHaveLength(3);
    expect(models[0]!.id).toBe("claude-opus-4-8");
    expect(models[0]!.providerProfileId).toBe("provider_apifun_claude");
    expect(models[0]!.tags).toContain("anthropic");
    // Opus supports tools; haiku doesn't (in our heuristic).
    expect(models[0]!.supportsTools).toBe(true);
    expect(models[2]!.supportsTools).toBe(false);
  });
});

describe("AnthropicAdapter — AdapterError instance check", () => {
  it("AdapterError is the actual instance for assertions that need the class", () => {
    expect(new AdapterError("auth", "x")).toBeInstanceOf(AdapterError);
  });

  it("streams the completion chunks correctly", async () => {
    const { fetch } = recordedFetch(() => ({
      ok: true,
      status: 200,
      body: [
        'event: message_start\n',
        'data: {"type":"message_start","message":{"id":"msg_123","usage":{"input_tokens":12,"output_tokens":0}}}\n\n',
        'event: content_block_start\n',
        'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
        'event: content_block_delta\n',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hel"}}\n\n',
        'event: content_block_delta\n',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"lo"}}\n\n',
        'event: content_block_stop\n',
        'data: {"type":"content_block_stop","index":0}\n\n',
        'event: message_delta\n',
        'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":2,"cache_creation_input_tokens":0,"cache_read_input_tokens":0}}\n\n',
        'event: message_stop\n',
        'data: {"type":"message_stop"}\n\n'
      ]
    }));

    const adapter = new AnthropicAdapter({
      profileId: "provider_apifun_claude",
      baseUrl: "https://api.apikey.fun",
      fetchImpl: fetch,
    });

    const stream = adapter.completeStreaming(
      baseRequest(),
      createAdapterContext({ secret: "sk-ant-secret" })
    );

    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(5);
    expect(chunks[0]).toEqual({
      type: "usage",
      requestId: "req_anthropic_001",
      usage: {
        inputTokens: 12,
        outputTokens: 0,
        totalTokens: 12,
      },
    });
    expect(chunks[1]).toEqual({
      type: "delta",
      requestId: "req_anthropic_001",
      sequence: 0,
      delta: "Hel",
    });
    expect(chunks[2]).toEqual({
      type: "delta",
      requestId: "req_anthropic_001",
      sequence: 1,
      delta: "lo",
    });
    expect(chunks[3]).toEqual({
      type: "usage",
      requestId: "req_anthropic_001",
      usage: {
        inputTokens: 12,
        outputTokens: 2,
        totalTokens: 14,
        cacheCreationInputTokens: 0,
        cacheReadInputTokens: 0,
      },
    });
    expect(chunks[4]).toMatchObject({
      type: "done",
      requestId: "req_anthropic_001",
      finalContent: "Hello",
      stopReason: "end_turn",
      usage: {
        inputTokens: 12,
        outputTokens: 2,
        totalTokens: 14,
        cacheCreationInputTokens: 0,
        cacheReadInputTokens: 0,
      },
    });
  });
});

describe("applyAnthropicImageAttachments", () => {
  it("converts the last user turn into text + base64 image blocks", () => {
    const result = applyAnthropicImageAttachments(
      [
        { role: "user", content: "first" },
        { role: "assistant", content: "reply" },
        { role: "user", content: "describe this" },
      ],
      [
        { name: "shot.png", kind: "image", mimeType: "image/png", dataUrl: "data:image/png;base64,AAAA" },
        { name: "broken.png", kind: "image", mimeType: "image/png", dataUrl: "not-a-data-url" },
      ],
    );

    expect(result[2]).toEqual({
      role: "user",
      content: [
        { type: "text", text: "describe this" },
        { type: "image", source: { type: "base64", media_type: "image/png", data: "AAAA" } },
      ],
    });
    expect(result[0]).toEqual({ role: "user", content: "first" });
  });

  it("returns the input unchanged when no attachment parses to a base64 image", () => {
    const input = [{ role: "user" as const, content: "hello" }];
    expect(applyAnthropicImageAttachments(input, undefined)).toBe(input);
    expect(
      applyAnthropicImageAttachments(input, [
        { name: "notes.txt", kind: "document", mimeType: "text/plain", textContent: "hi" },
      ]),
    ).toBe(input);
  });
});

describe("AnthropicAdapter — image attachments", () => {
  it("sends content blocks when the request carries image attachments", async () => {
    const { fetch: fetchImpl, calls } = recordedFetch(() => ({
      ok: true,
      status: 200,
      body: {
        type: "message",
        role: "assistant",
        content: [{ type: "text", text: "ok" }],
        stop_reason: "end_turn",
        usage: { input_tokens: 1, output_tokens: 1 },
      },
    }));
    const adapter = new AnthropicAdapter({
      profileId: "provider_apifun_claude",
      baseUrl: "https://api.test.local",
      fetchImpl,
    });

    const response = await adapter.complete(
      baseRequest({
        attachments: [
          { name: "shot.jpg", kind: "image", mimeType: "image/jpeg", dataUrl: "data:image/jpeg;base64,CCCC" },
        ],
      }),
      createAdapterContext({ secret: "sk-ant-secret" }),
    );

    expect(response.status).toBe("succeeded");
    const body = JSON.parse(calls[0]!.body!);
    const lastMessage = body.messages[body.messages.length - 1];
    expect(lastMessage.role).toBe("user");
    expect(lastMessage.content).toEqual([
      { type: "text", text: expect.any(String) },
      { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "CCCC" } },
    ]);
  });
});
