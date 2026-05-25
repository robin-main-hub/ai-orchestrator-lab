import { describe, expect, it } from "vitest";
import type { ProviderCompletionRequest } from "@ai-orchestrator/protocol";
import {
  AnthropicAdapter,
  applyCacheBreakpoints,
  extractAnthropicText,
  resolveBetaHeader,
  splitSystemAndMessages,
} from "./anthropicAdapter";
import type { AdapterFetchLike } from "./openAiCompatibleAdapter";
import { AdapterError } from "./errors";
import { createAdapterContext } from "./adapter";

function baseRequest(overrides: Partial<ProviderCompletionRequest> = {}): ProviderCompletionRequest {
  return {
    id: "req_anthropic_001",
    sessionId: "session_test",
    providerProfileId: "provider_apifun_claude",
    modelId: "claude-opus-4-6",
    messages: [{ role: "user", content: "Reply OK only" }],
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

function recordedFetch(impl: (call: FetchCall) => { ok: boolean; status: number; body: string; headers?: Record<string, string> }): {
  fetch: AdapterFetchLike;
  calls: FetchCall[];
} {
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
    expect(body!.model).toBe("claude-opus-4-6");
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
      modelIds: ["claude-opus-4-6", "claude-sonnet-reseller", "claude-haiku-reseller"],
    });
    const models = await adapter.discoverModels(createAdapterContext({ secret: "k" }));
    expect(models).toHaveLength(3);
    expect(models[0]!.id).toBe("claude-opus-4-6");
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
});

describe("resolveBetaHeader", () => {
  it("returns undefined when no headers and caching disabled", () => {
    expect(resolveBetaHeader([], false)).toBeUndefined();
  });

  it("joins explicit betaHeaders with commas, trims, and dedupes", () => {
    expect(
      resolveBetaHeader([" flag-a ", "flag-b", "flag-a", "", "flag-c"], false),
    ).toBe("flag-a,flag-b,flag-c");
  });

  it("appends prompt-caching flag when caching is enabled", () => {
    expect(resolveBetaHeader([], true)).toBe("prompt-caching-2024-07-31");
  });

  it("does not duplicate prompt-caching flag if already in betaHeaders", () => {
    const result = resolveBetaHeader(
      ["prompt-caching-2024-07-31", "context-1m-2025-08-07"],
      true,
    );
    expect(result).toBe("prompt-caching-2024-07-31,context-1m-2025-08-07");
    expect(result!.split(",").filter((f) => f === "prompt-caching-2024-07-31")).toHaveLength(1);
  });

  it("preserves caller order; appended flag goes last", () => {
    expect(resolveBetaHeader(["context-1m-2025-08-07"], true)).toBe(
      "context-1m-2025-08-07,prompt-caching-2024-07-31",
    );
  });
});

describe("applyCacheBreakpoints", () => {
  it("strategy=null returns inputs untouched (string system, string contents)", () => {
    const result = applyCacheBreakpoints(
      "you are claude",
      [
        { role: "user", content: "hi" },
        { role: "assistant", content: "hello" },
      ],
      null,
    );
    expect(result.system).toBe("you are claude");
    expect(result.messages[0]!.content).toBe("hi");
    expect(result.messages[1]!.content).toBe("hello");
  });

  it("strategy=system wraps the system field in a single cached text block", () => {
    const { system, messages } = applyCacheBreakpoints(
      "long system prompt",
      [{ role: "user", content: "ping" }],
      "system",
    );
    expect(system).toEqual([
      {
        type: "text",
        text: "long system prompt",
        cache_control: { type: "ephemeral" },
      },
    ]);
    // messages untouched in "system" strategy
    expect(messages[0]!.content).toBe("ping");
  });

  it("strategy=system with no system input → system is undefined, no error", () => {
    const { system, messages } = applyCacheBreakpoints(
      undefined,
      [{ role: "user", content: "ping" }],
      "system",
    );
    expect(system).toBeUndefined();
    expect(messages[0]!.content).toBe("ping");
  });

  it("strategy=system_and_last_user adds breakpoint on the last user turn only", () => {
    const { system, messages } = applyCacheBreakpoints(
      "sys",
      [
        { role: "user", content: "first user" },
        { role: "assistant", content: "first assistant" },
        { role: "user", content: "second user" }, // <- this one
      ],
      "system_and_last_user",
    );
    expect(system).toEqual([
      { type: "text", text: "sys", cache_control: { type: "ephemeral" } },
    ]);
    // first user untouched (string)
    expect(messages[0]!.content).toBe("first user");
    // assistant untouched (string)
    expect(messages[1]!.content).toBe("first assistant");
    // last user wrapped with cache_control
    expect(messages[2]!.content).toEqual([
      {
        type: "text",
        text: "second user",
        cache_control: { type: "ephemeral" },
      },
    ]);
  });

  it("strategy=system_and_last_user with no user turn falls back gracefully", () => {
    const { system, messages } = applyCacheBreakpoints(
      "sys",
      [{ role: "assistant", content: "weird, but defensive" }],
      "system_and_last_user",
    );
    expect(system).toEqual([
      { type: "text", text: "sys", cache_control: { type: "ephemeral" } },
    ]);
    expect(messages[0]!.content).toBe("weird, but defensive");
  });
});

describe("AnthropicAdapter — prompt caching integration", () => {
  it("default (enablePromptCaching off) sends string system and no beta header", async () => {
    let body: Record<string, unknown> | null = null;
    const { fetch, calls } = recordedFetch((call) => {
      body = JSON.parse(call.body ?? "{}");
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
      baseUrl: "https://api.anthropic.com",
      fetchImpl: fetch,
    });
    await adapter.complete(
      baseRequest({
        messages: [
          { role: "system", content: "you are claude" },
          { role: "user", content: "hi" },
        ],
      }),
      createAdapterContext({ secret: "k" }),
    );
    expect(body!.system).toBe("you are claude");
    expect(calls[0]!.headers?.["anthropic-beta"]).toBeUndefined();
  });

  it("enablePromptCaching=true wraps system in cached block and adds beta header", async () => {
    let body: Record<string, unknown> | null = null;
    const { fetch, calls } = recordedFetch((call) => {
      body = JSON.parse(call.body ?? "{}");
      return {
        ok: true,
        status: 200,
        body: JSON.stringify({
          type: "message",
          content: [{ type: "text", text: "OK" }],
          stop_reason: "end_turn",
          usage: {
            input_tokens: 5,
            output_tokens: 1,
            cache_creation_input_tokens: 1000,
            cache_read_input_tokens: 0,
          },
        }),
      };
    });
    const adapter = new AnthropicAdapter({
      profileId: "p",
      baseUrl: "https://api.anthropic.com",
      enablePromptCaching: true,
      fetchImpl: fetch,
    });
    await adapter.complete(
      baseRequest({
        messages: [
          { role: "system", content: "long stable system prompt" },
          { role: "user", content: "hi" },
        ],
      }),
      createAdapterContext({ secret: "k" }),
    );
    expect(body!.system).toEqual([
      {
        type: "text",
        text: "long stable system prompt",
        cache_control: { type: "ephemeral" },
      },
    ]);
    expect(calls[0]!.headers?.["anthropic-beta"]).toBe("prompt-caching-2024-07-31");
  });

  it("cacheStrategy=system_and_last_user wraps both system and last user", async () => {
    let body: Record<string, unknown> | null = null;
    const { fetch } = recordedFetch((call) => {
      body = JSON.parse(call.body ?? "{}");
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
      baseUrl: "https://api.anthropic.com",
      enablePromptCaching: true,
      cacheStrategy: "system_and_last_user",
      fetchImpl: fetch,
    });
    await adapter.complete(
      baseRequest({
        messages: [
          { role: "system", content: "sys" },
          { role: "user", content: "first" },
          { role: "assistant", content: "a" },
          { role: "user", content: "second (long doc...)" },
        ],
      }),
      createAdapterContext({ secret: "k" }),
    );
    const messages = body!.messages as Array<{ role: string; content: unknown }>;
    expect(body!.system).toEqual([
      { type: "text", text: "sys", cache_control: { type: "ephemeral" } },
    ]);
    expect(messages[0]!.content).toBe("first"); // earlier user untouched
    expect(messages[1]!.content).toBe("a"); // assistant untouched
    expect(messages[2]!.content).toEqual([
      {
        type: "text",
        text: "second (long doc...)",
        cache_control: { type: "ephemeral" },
      },
    ]);
  });

  it("manual betaHeaders + enablePromptCaching does not duplicate the cache beta flag", async () => {
    const { fetch, calls } = recordedFetch(() => ({
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
      baseUrl: "https://api.anthropic.com",
      enablePromptCaching: true,
      betaHeaders: ["prompt-caching-2024-07-31", "context-1m-2025-08-07"],
      fetchImpl: fetch,
    });
    await adapter.complete(baseRequest(), createAdapterContext({ secret: "k" }));
    const header = calls[0]!.headers?.["anthropic-beta"];
    expect(header).toBe("prompt-caching-2024-07-31,context-1m-2025-08-07");
    // critical: appears exactly once
    expect(header!.split(",").filter((f) => f === "prompt-caching-2024-07-31")).toHaveLength(1);
  });

  it("response usage.cache_* fields flow through unchanged when caching is on", async () => {
    const { fetch } = recordedFetch(() => ({
      ok: true,
      status: 200,
      body: JSON.stringify({
        type: "message",
        content: [{ type: "text", text: "OK" }],
        stop_reason: "end_turn",
        usage: {
          input_tokens: 12,
          output_tokens: 4,
          cache_creation_input_tokens: 800,
          cache_read_input_tokens: 1200,
        },
      }),
    }));
    const adapter = new AnthropicAdapter({
      profileId: "p",
      baseUrl: "https://api.anthropic.com",
      enablePromptCaching: true,
      fetchImpl: fetch,
    });
    const response = await adapter.complete(
      baseRequest(),
      createAdapterContext({ secret: "k" }),
    );
    expect(response.status).toBe("succeeded");
    expect(response.usage).toEqual({
      inputTokens: 12,
      outputTokens: 4,
      totalTokens: 16,
      cacheCreationInputTokens: 800,
      cacheReadInputTokens: 1200,
    });
  });

  it("enablePromptCaching=true with no system message still injects beta header (caching is a no-op but header is harmless)", async () => {
    let body: Record<string, unknown> | null = null;
    const { fetch, calls } = recordedFetch((call) => {
      body = JSON.parse(call.body ?? "{}");
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
      baseUrl: "https://api.anthropic.com",
      enablePromptCaching: true,
      fetchImpl: fetch,
    });
    await adapter.complete(baseRequest(), createAdapterContext({ secret: "k" }));
    expect(body!.system).toBeUndefined();
    expect(calls[0]!.headers?.["anthropic-beta"]).toBe("prompt-caching-2024-07-31");
  });
});
