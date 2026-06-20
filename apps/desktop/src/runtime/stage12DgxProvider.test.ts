import { describe, expect, it } from "vitest";
import {
  CONVERSATION_MAX_OUTPUT_TOKENS,
  createDgxVllmRequestBody,
  createProviderCompletionProxyRequest,
  isDgxRoutedProvider,
  isDgxVllmProvider,
  ProviderCompletionPermissionRequiredError,
  requestDgxProviderCompletion,
  requestDgxVllmCompletion,
  resolveDirectProviderBaseUrl,
} from "./stage12DgxProvider";
import {
  DGX02_LAN_ORCHESTRATOR_BASE_URL,
} from "./stage30DgxEndpoints";
import type { ConversationMessage, ProviderProfile } from "@ai-orchestrator/protocol";

function expectHttpHmacHeaders(headers: Record<string, string>) {
  expect(headers.authorization).toBeUndefined();
  expect(headers["x-dgx-signature"]).toMatch(/^[a-f0-9]{64}$/);
  expect(headers["x-dgx-timestamp"]).toMatch(/^\d+$/);
  expect(headers["x-dgx-nonce"]).toBeTruthy();
}

const provider: ProviderProfile = {
  id: "provider_dgx02_vllm",
  name: "DGX-02 vLLM",
  kind: "openai",
  baseUrl: "http://dgx-02:8001/v1",
  defaultModel: "qwen36-domain-lora-v5-prisma",
  enabled: true,
  tags: ["dgx", "vllm", "no-auth"],
  trustLevel: "trusted",
};

const messages: ConversationMessage[] = [
  {
    id: "message_1",
    sessionId: "session_1",
    role: "user",
    content: "Can DGX answer now?",
    createdAt: "2026-05-24T00:00:00.000Z",
  },
];

describe("stage12 DGX provider completion", () => {
  it("detects DGX vLLM providers", () => {
    expect(isDgxVllmProvider(provider)).toBe(true);
    expect(isDgxVllmProvider({ ...provider, tags: ["mock"] })).toBe(false);
    expect(isDgxRoutedProvider({ ...provider, id: "provider_deepseek_dgx", tags: ["server-proxy", "deepseek"] })).toBe(true);
  });

  it("builds a vLLM request with thinking disabled", () => {
    const body = createDgxVllmRequestBody("qwen36-domain-lora-v5-prisma", messages);

    expect(body.model).toBe("qwen36-domain-lora-v5-prisma");
    expect(body.chat_template_kwargs.enable_thinking).toBe(false);
    expect(body.messages[0]?.role).toBe("system");
    expect(body.messages[1]?.content).toBe("Can DGX answer now?");
  });

  it("keeps desktop pipeline system prompts inside the leading vLLM system message", () => {
    const body = createDgxVllmRequestBody("qwen36-domain-lora-v5-prisma", [
      { ...messages[0]!, role: "system", content: "Desktop pipeline context." },
      ...messages,
    ]);

    expect(body.messages.filter((message) => message.role === "system")).toHaveLength(1);
    expect(body.messages[0]?.content).toContain("Desktop pipeline context.");
    expect(body.messages[1]?.role).toBe("user");
  });

  it("builds a server proxy request without raw provider endpoints", () => {
    const request = createProviderCompletionProxyRequest(provider, "qwen36-domain-lora-v5-prisma", messages);

    expect(request.providerProfileId).toBe("provider_dgx02_vllm");
    expect(request.routePreference).toBe("server_proxy");
    expect(JSON.stringify(request)).not.toContain("http://dgx-02:8001");
  });

  it("preserves the leading desktop system prompt when proxy requests are compacted", () => {
    const longMessages: ConversationMessage[] = [
      {
        id: "message_system",
        sessionId: "session_1",
        role: "system",
        content: "SOUL.md: 마키마. AGENTS.md: 지휘자. 기억 여권: recall_agent_orchestrator_session_1.",
        createdAt: "2026-05-24T00:00:00.000Z",
      },
      ...Array.from({ length: 10 }, (_, index): ConversationMessage => ({
        id: `message_${index + 1}`,
        sessionId: "session_1",
        role: index % 2 === 0 ? "user" : "assistant",
        content: `turn ${index + 1}`,
        createdAt: `2026-05-24T00:00:${String(index + 1).padStart(2, "0")}.000Z`,
      })),
    ];

    const request = createProviderCompletionProxyRequest(provider, "qwen36-domain-lora-v5-prisma", longMessages);

    expect(request.messages).toHaveLength(8);
    expect(request.messages[0]).toEqual({
      role: "system",
      content: "SOUL.md: 마키마. AGENTS.md: 지휘자. 기억 여권: recall_agent_orchestrator_session_1.",
    });
    expect(request.messages.at(-1)).toEqual({ role: "assistant", content: "turn 10" });
  });

  it("forwards approved permission state to the DGX server proxy request", () => {
    const request = createProviderCompletionProxyRequest(provider, "qwen36-domain-lora-v5-prisma", messages, {
      approvalState: "approved",
      permissionDecision: "allow",
    });

    expect(request.approvalState).toBe("approved");
    expect(request.permissionDecision).toBe("allow");
  });

  it("uses the DGX server proxy before direct provider calls", async () => {
    const fetchImpl = async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe(`${DGX02_LAN_ORCHESTRATOR_BASE_URL}/provider-completions`);
      expectHttpHmacHeaders(init?.headers as Record<string, string>);
      expect(String(init?.body)).not.toContain("sk-");
      expect(String(init?.body)).not.toContain("http://dgx-02:8001");
      return new Response(
        JSON.stringify({
          id: "provider_completion_response_1",
          requestId: "provider_completion_request_1",
          providerProfileId: "provider_dgx02_vllm",
          modelId: "qwen36-domain-lora-v5-prisma",
          route: "server_proxy",
          status: "succeeded",
          content: "DGX is ready.",
          endpoint: "http://dgx-02:8001/v1/chat/completions",
          usage: { inputTokens: 12, outputTokens: 8, totalTokens: 20 },
          createdAt: "2026-05-24T00:00:00.000Z",
        }),
        { status: 200 },
      );
    };

    const result = await requestDgxVllmCompletion({
      provider,
      modelId: "qwen36-domain-lora-v5-prisma",
      messages,
      fetchImpl,
    });

    expect(result.content).toBe("DGX is ready.");
    expect(result.route).toBe("server_proxy");
    expect(result.usage?.totalTokens).toBe(20);
  });

  it("does not direct-fallback by default when the DGX server proxy is unavailable", async () => {
    const calls: string[] = [];
    const fetchImpl = async (url: RequestInfo | URL) => {
      calls.push(String(url));
      return new Response(JSON.stringify({ error: "proxy offline" }), { status: 502 });
    };

    await expect(
      requestDgxVllmCompletion({
        provider,
        modelId: "qwen36-domain-lora-v5-prisma",
        messages,
        fetchImpl,
      }),
    ).rejects.toThrow("DGX-02 server proxy failed");

    expect(calls).toEqual([`${DGX02_LAN_ORCHESTRATOR_BASE_URL}/provider-completions`]);
  });

  it("falls back to the direct DGX provider only when explicitly allowed", async () => {
    const calls: string[] = [];
    const fetchImpl = async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push(String(url));
      if (String(url).includes("/provider-completions")) {
        return new Response(JSON.stringify({ error: "proxy offline" }), { status: 502 });
      }

      expect(String(init?.body)).not.toContain("sk-");
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "Direct DGX fallback ready." } }],
          usage: { prompt_tokens: 10, completion_tokens: 6, total_tokens: 16 },
        }),
        { status: 200 },
      );
    };

    const result = await requestDgxVllmCompletion({
      provider,
      modelId: "qwen36-domain-lora-v5-prisma",
      messages,
      fetchImpl,
      allowDirectFallback: true,
    });

    expect(calls).toEqual([`${DGX02_LAN_ORCHESTRATOR_BASE_URL}/provider-completions`, "http://dgx-02:8001/v1/chat/completions"]);
    expect(result.route).toBe("direct_provider");
    expect(result.fallbackReason).toContain("DGX-02 server proxy failed");
  });

  it("does not direct-fallback for server-proxy API key providers", async () => {
    const deepseekProvider: ProviderProfile = {
      id: "provider_deepseek_dgx",
      name: "DeepSeek DGX-02 Key",
      kind: "openai",
      baseUrl: "https://api.deepseek.com/v1",
      defaultModel: "deepseek-chat",
      enabled: true,
      tags: ["server-proxy", "deepseek"],
      trustLevel: "limited",
    };
    const calls: string[] = [];
    const fetchImpl = async (url: RequestInfo | URL) => {
      calls.push(String(url));
      return new Response(JSON.stringify({ error: "proxy offline" }), { status: 502 });
    };

    await expect(
      requestDgxProviderCompletion({
        provider: deepseekProvider,
        modelId: "deepseek-chat",
        messages,
        fetchImpl,
      }),
    ).rejects.toThrow("DGX-02 server proxy failed");

    expect(calls).toEqual([`${DGX02_LAN_ORCHESTRATOR_BASE_URL}/provider-completions`]);
  });

  it("can direct-fallback server-proxy OpenAI-compatible providers only with an explicit session secret", async () => {
    const mimoProvider: ProviderProfile = {
      id: "provider_mimo_token_openai",
      name: "MiMo Token Plan OpenAI",
      kind: "openai",
      baseUrl: "https://token-plan-sgp.xiaomimimo.com/v1",
      defaultModel: "mimo-v2.5-pro",
      enabled: true,
      tags: ["server-proxy", "mimo", "token-plan", "openai-compatible"],
      trustLevel: "limited",
    };
    const calls: string[] = [];
    const fetchImpl = async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push(String(url));
      if (String(url).includes("/provider-completions")) {
        expect(String(init?.body)).not.toContain("tp-session-secret");
        return new Response(JSON.stringify({ error: "proxy offline" }), { status: 502 });
      }

      expect(String(url)).toBe("https://token-plan-sgp.xiaomimimo.com/v1/chat/completions");
      expect((init?.headers as Record<string, string>).authorization).toBe("Bearer tp-session-secret");
      expect(String(init?.body)).toContain("mimo-v2.5-pro");
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "마키마 세션 폴백 응답." } }],
          usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 },
        }),
        { status: 200 },
      );
    };

    const result = await requestDgxProviderCompletion({
      provider: mimoProvider,
      modelId: "mimo-v2.5-pro",
      messages,
      fetchImpl,
      localSecretResolver: async (providerProfile) =>
        providerProfile.id === "provider_mimo_token_openai" ? "tp-session-secret" : undefined,
    });

    expect(calls).toEqual([
      `${DGX02_LAN_ORCHESTRATOR_BASE_URL}/provider-completions`,
      "https://token-plan-sgp.xiaomimimo.com/v1/chat/completions",
    ]);
    expect(result).toMatchObject({
      content: "마키마 세션 폴백 응답.",
      endpoint: "https://token-plan-sgp.xiaomimimo.com/v1/chat/completions",
      route: "direct_provider",
      fallbackReason: expect.stringContaining("DGX-02 server proxy failed"),
      usage: { inputTokens: 11, outputTokens: 7, totalTokens: 18 },
    });
  });

  it("routes MiMo browser direct fallback through the same-origin Vite proxy", () => {
    expect(
      resolveDirectProviderBaseUrl(
        {
          id: "provider_mimo_token_openai",
          name: "MiMo Token Plan OpenAI",
          kind: "openai",
          baseUrl: "https://token-plan-sgp.xiaomimimo.com/v1",
          defaultModel: "mimo-v2.5-pro",
          enabled: true,
          tags: ["server-proxy", "mimo", "openai-compatible"],
          trustLevel: "limited",
        },
        "http://127.0.0.1:5173",
      ),
    ).toBe("http://127.0.0.1:5173/mimo-token-openai");
    expect(
      resolveDirectProviderBaseUrl(
        {
          id: "provider_mimo_token_anthropic",
          name: "MiMo Token Plan Anthropic",
          kind: "anthropic",
          baseUrl: "https://token-plan-sgp.xiaomimimo.com/anthropic",
          defaultModel: "mimo-v2.5-pro",
          enabled: true,
          tags: ["server-proxy", "mimo", "anthropic-compatible"],
          trustLevel: "limited",
        },
        "http://127.0.0.1:5173",
      ),
    ).toBe("http://127.0.0.1:5173/mimo-token-anthropic");
  });

  it("can direct-fallback server-proxy Anthropic-compatible providers with an explicit session secret", async () => {
    const claudeProvider: ProviderProfile = {
      id: "provider_apifun_claude_b",
      name: "APIKey.fun Claude B",
      kind: "anthropic",
      baseUrl: "https://token-plan-sgp.xiaomimimo.com/anthropic",
      defaultModel: "claude-opus-4-8",
      enabled: true,
      tags: ["server-proxy", "apikeyfun", "anthropic-compatible"],
      trustLevel: "limited",
    };
    const calls: string[] = [];
    const fetchImpl = async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push(String(url));
      if (String(url).includes("/provider-completions")) {
        expect(String(init?.body)).not.toContain("sk-ant-session-secret");
        return new Response(JSON.stringify({ error: "proxy offline" }), { status: 502 });
      }

      expect(String(url)).toBe("https://token-plan-sgp.xiaomimimo.com/anthropic/v1/messages");
      expect((init?.headers as Record<string, string>)["x-api-key"]).toBe("sk-ant-session-secret");
      expect(String(init?.body)).toContain("claude-opus-4-8");
      return new Response(
        JSON.stringify({
          type: "message",
          content: [{ type: "text", text: "마키마 Claude 세션 폴백 응답." }],
          stop_reason: "end_turn",
          usage: { input_tokens: 13, output_tokens: 9 },
        }),
        { status: 200 },
      );
    };

    const result = await requestDgxProviderCompletion({
      provider: claudeProvider,
      modelId: "claude-opus-4-8",
      messages,
      fetchImpl,
      localSecretResolver: async (providerProfile) =>
        providerProfile.id === "provider_apifun_claude_b" ? "sk-ant-session-secret" : undefined,
    });

    expect(calls).toEqual([
      `${DGX02_LAN_ORCHESTRATOR_BASE_URL}/provider-completions`,
      "https://token-plan-sgp.xiaomimimo.com/anthropic/v1/messages",
    ]);
    expect(result).toMatchObject({
      content: "마키마 Claude 세션 폴백 응답.",
      endpoint: "https://token-plan-sgp.xiaomimimo.com/anthropic/v1/messages",
      route: "direct_provider",
      fallbackReason: expect.stringContaining("DGX-02 server proxy failed"),
      usage: { inputTokens: 13, outputTokens: 9, totalTokens: 22 },
    });
  });

  it("stops fallback routing when the server requests explicit provider approval", async () => {
    const limitedProvider: ProviderProfile = {
      id: "provider_mimo_token_openai",
      name: "MiMo Token Plan OpenAI",
      kind: "openai",
      baseUrl: "https://token-plan-sgp.xiaomimimo.com/v1",
      defaultModel: "mimo-v2.5-pro",
      enabled: true,
      tags: ["server-proxy", "mimo", "token-plan"],
      trustLevel: "limited",
    };
    const calls: string[] = [];
    const fetchImpl = async (url: RequestInfo | URL) => {
      calls.push(String(url));
      return new Response(
        JSON.stringify({
          error: "permission_required",
          approval: {
            id: "approval_provider_completion_1",
            sourceItemId: "permission_provider_provider_mimo_token_openai",
          },
          permission: {
            approvalState: "required",
            decision: "approval_required",
            reason: "limited provider completion requires explicit approval",
          },
        }),
        { status: 403 },
      );
    };

    await expect(
      requestDgxProviderCompletion({
        provider: limitedProvider,
        modelId: "mimo-v2.5-pro",
        messages,
        fetchImpl,
        proxyBaseUrl: ["http://127.0.0.1:4317", "http://dgx-02:4317"],
      }),
    ).rejects.toBeInstanceOf(ProviderCompletionPermissionRequiredError);

    expect(calls).toEqual(["http://127.0.0.1:4317/provider-completions"]);
  });
});

describe("stage12 streaming + attachment riders", () => {
  const sseFrames = [
    'data: {"type":"delta","requestId":"req_1","sequence":0,"delta":"안녕"}',
    "",
    'data: {"type":"delta","requestId":"req_1","sequence":1,"delta":"하세요"}',
    "",
    'data: {"type":"usage","requestId":"req_1","usage":{"inputTokens":5,"outputTokens":2,"totalTokens":7}}',
    "",
    'data: {"type":"done","requestId":"req_1","finalContent":"안녕하세요","endpoint":"http://dgx-02:8001/v1/chat/completions","createdAt":"2026-06-11T00:00:00.000Z","completedAt":"2026-06-11T00:00:01.000Z"}',
    "",
    "",
  ].join("\n");

  it("streams via the SSE proxy endpoint when onDelta is provided", async () => {
    const calls: string[] = [];
    const deltas: string[] = [];
    const fetchImpl = async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push(String(url));
      expectHttpHmacHeaders(init?.headers as Record<string, string>);
      return new Response(sseFrames, { status: 200 });
    };

    const result = await requestDgxProviderCompletion({
      provider,
      modelId: "qwen36-domain-lora-v5-prisma",
      messages,
      fetchImpl,
      proxyBaseUrl: "http://127.0.0.1:4317",
      onDelta: (textSoFar) => deltas.push(textSoFar),
    });

    expect(calls).toEqual(["http://127.0.0.1:4317/provider-completions/stream"]);
    expect(deltas).toEqual(["안녕", "안녕하세요"]);
    expect(result.content).toBe("안녕하세요");
    expect(result.route).toBe("server_proxy");
    expect(result.usage?.totalTokens).toBe(7);
  });

  it("falls back to the non-stream POST when the SSE endpoint fails", async () => {
    const calls: string[] = [];
    const fetchImpl = async (url: RequestInfo | URL) => {
      calls.push(String(url));
      if (String(url).endsWith("/stream")) {
        return new Response("not found", { status: 404 });
      }
      return new Response(
        JSON.stringify({
          id: "provider_completion_response_2",
          requestId: "provider_completion_request_2",
          providerProfileId: provider.id,
          modelId: "qwen36-domain-lora-v5-prisma",
          route: "server_proxy",
          status: "succeeded",
          content: "비스트림 폴백 응답",
          endpoint: "http://dgx-02:8001/v1/chat/completions",
          createdAt: "2026-06-11T00:00:00.000Z",
        }),
        { status: 200 },
      );
    };

    const result = await requestDgxProviderCompletion({
      provider,
      modelId: "qwen36-domain-lora-v5-prisma",
      messages,
      fetchImpl,
      proxyBaseUrl: "http://127.0.0.1:4317",
      onDelta: () => {},
    });

    expect(calls).toEqual([
      "http://127.0.0.1:4317/provider-completions/stream",
      "http://127.0.0.1:4317/provider-completions",
    ]);
    expect(result.content).toBe("비스트림 폴백 응답");
  });

  it("adds attachment riders from the latest user message metadata", () => {
    const attachedMessages: ConversationMessage[] = [
      {
        ...messages[0]!,
        metadata: {
          attachments: [
            {
              id: "attachment_1",
              name: "shot.png",
              kind: "image",
              mimeType: "image/png",
              size: 4,
              storage: "local_cache",
              dataUrl: "data:image/png;base64,AAAA",
            },
            {
              id: "attachment_2",
              name: "meta-only.pdf",
              kind: "document",
              mimeType: "application/pdf",
              size: 9,
              storage: "metadata_only",
            },
          ],
        },
      },
    ];

    const request = createProviderCompletionProxyRequest(provider, "qwen36-domain-lora-v5-prisma", attachedMessages);
    expect(request.attachments).toHaveLength(1);
    expect(request.attachments?.[0]).toMatchObject({
      name: "shot.png",
      kind: "image",
      dataUrl: "data:image/png;base64,AAAA",
    });

    const body = createDgxVllmRequestBody("qwen36-domain-lora-v5-prisma", attachedMessages);
    const lastMessage = body.messages[body.messages.length - 1] as { role: string; content: unknown };
    expect(lastMessage.role).toBe("user");
    expect(lastMessage.content).toEqual([
      { type: "text", text: "Can DGX answer now?" },
      { type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } },
    ]);
  });

  it("keeps plain requests without attachment riders", () => {
    const request = createProviderCompletionProxyRequest(provider, "qwen36-domain-lora-v5-prisma", messages);
    expect(request.attachments).toBeUndefined();
  });
});

// Characterization tests for previously-uncovered stage12 DGX-provider branches
// (no behavior change, no network, no secret). These pin the authority-adjacent
// remote-execution seam: resolveDirectProviderBaseUrl's two passthrough paths
// (no browser origin, and a non-MiMo provider that keeps its own baseUrl), the
// isDgxRoutedProvider falsey/vllm-routed decisions, createDgxChatMessages'
// empty-content skip + multi system-part join + latest-8 chat-window cap (via
// createDgxVllmRequestBody), and the permission-error constructor's approval
// metadata extraction (present, absent, and empty-payload default).
describe("stage12 DGX provider — routing & request-shaping characterization", () => {
  const directProvider: ProviderProfile = {
    id: "provider_direct_openai",
    name: "Direct OpenAI",
    kind: "openai",
    baseUrl: "https://api.direct.example/v1",
    defaultModel: "gpt-x",
    enabled: true,
    tags: ["openai-compatible"],
    trustLevel: "trusted",
  };

  it("passes a provider's own baseUrl through when there is no browser origin", () => {
    expect(resolveDirectProviderBaseUrl(directProvider, undefined)).toBe("https://api.direct.example/v1");
    // even a MiMo provider falls back to baseUrl with no origin to anchor the same-origin proxy
    expect(
      resolveDirectProviderBaseUrl(
        { ...directProvider, id: "provider_mimo_token_openai" },
        undefined,
      ),
    ).toBe("https://api.direct.example/v1");
  });

  it("keeps a non-MiMo provider's baseUrl even when a browser origin is present", () => {
    expect(resolveDirectProviderBaseUrl(directProvider, "http://127.0.0.1:5173")).toBe(
      "https://api.direct.example/v1",
    );
  });

  it("treats undefined and tag-less providers as not DGX-routed, but vLLM providers as routed", () => {
    expect(isDgxRoutedProvider(undefined)).toBe(false);
    expect(isDgxRoutedProvider({ ...directProvider, tags: ["openai-compatible"] })).toBe(false);
    // dgx+vllm tags make the base `provider` DGX-routed via isDgxVllmProvider
    expect(isDgxRoutedProvider(provider)).toBe(true);
  });

  it("skips empty/whitespace messages and joins multiple system parts into one leading message", () => {
    const body = createDgxVllmRequestBody("qwen36-domain-lora-v5-prisma", [
      { ...messages[0]!, id: "m_sys_a", role: "system", content: "First system note." },
      { ...messages[0]!, id: "m_blank", role: "user", content: "   " },
      { ...messages[0]!, id: "m_sys_b", role: "system", content: "Second system note." },
      { ...messages[0]!, id: "m_real", role: "user", content: "Real question?" },
    ]);

    const systemMessages = body.messages.filter((message) => message.role === "system");
    expect(systemMessages).toHaveLength(1);
    expect(systemMessages[0]?.content).toContain("First system note.");
    expect(systemMessages[0]?.content).toContain("Second system note.");
    // the whitespace-only user turn is dropped, leaving exactly the system + one real user message
    expect(body.messages).toHaveLength(2);
    expect(body.messages[1]).toMatchObject({ role: "user", content: "Real question?" });
  });

  it("caps the chat window to the latest 8 turns after the system message", () => {
    const manyTurns: ConversationMessage[] = Array.from({ length: 10 }, (_, index) => ({
      ...messages[0]!,
      id: `turn_${index}`,
      role: index % 2 === 0 ? "user" : "assistant",
      content: `turn ${index}`,
    }));
    const body = createDgxVllmRequestBody("qwen36-domain-lora-v5-prisma", manyTurns);

    // 1 system message + the latest 8 of 10 conversation turns
    expect(body.messages).toHaveLength(9);
    expect(body.messages[1]).toMatchObject({ content: "turn 2" });
    expect(body.messages[body.messages.length - 1]).toMatchObject({ content: "turn 9" });
  });

  it("extracts approval metadata from the permission-required error payload", () => {
    const withApproval = new ProviderCompletionPermissionRequiredError("needs approval", {
      approval: { id: "approval_x1", sourceItemId: "permission_x1" },
    });
    expect(withApproval.name).toBe("ProviderCompletionPermissionRequiredError");
    expect(withApproval.message).toBe("needs approval");
    expect(withApproval.approvalId).toBe("approval_x1");
    expect(withApproval.sourceItemId).toBe("permission_x1");

    const withoutApproval = new ProviderCompletionPermissionRequiredError("no approval block", {});
    expect(withoutApproval.approvalId).toBeUndefined();
    expect(withoutApproval.sourceItemId).toBeUndefined();

    // default empty-payload constructor leaves both undefined
    const defaulted = new ProviderCompletionPermissionRequiredError("default payload");
    expect(defaulted.approvalId).toBeUndefined();
    expect(defaulted.sourceItemId).toBeUndefined();
  });
});

// Characterization tests for CONVERSATION_MAX_OUTPUT_TOKENS (no behavior change,
// no network, pure request builders). The const was previously 0-ref in tests:
// the suite above calls createProviderCompletionProxyRequest 5× and
// createDgxVllmRequestBody 2× but never asserts the per-turn output-token cap, so
// nothing tied either request producer to the shared const. The const feeds THREE
// call-sites (server-proxy maxOutputTokens, vLLM max_tokens, and the non-exported
// direct-provider maxOutputTokens). We pin the value + its rationale (adapter
// default 512 truncates table/code answers) and that BOTH exported producers
// derive their cap from the const rather than a divergent hardcoded literal — a
// regression to any one call-site would silently re-cap one route's answers.
describe("stage12 DGX provider — conversation output-token cap", () => {
  it("pins the per-turn output cap at 4096 (above the truncating adapter default)", () => {
    expect(CONVERSATION_MAX_OUTPUT_TOKENS).toBe(4096);
    // the const exists precisely because the adapter default (512) cuts answers
    // mid-table/code, so the cap must stay well above that default.
    expect(CONVERSATION_MAX_OUTPUT_TOKENS).toBeGreaterThan(512);
  });

  it("derives the server-proxy request maxOutputTokens from the shared const", () => {
    const request = createProviderCompletionProxyRequest(
      provider,
      "qwen36-domain-lora-v5-prisma",
      messages,
    );
    expect(request.maxOutputTokens).toBe(CONVERSATION_MAX_OUTPUT_TOKENS);
  });

  it("derives the vLLM request max_tokens from the same shared const", () => {
    const body = createDgxVllmRequestBody("qwen36-domain-lora-v5-prisma", messages);
    expect(body.max_tokens).toBe(CONVERSATION_MAX_OUTPUT_TOKENS);
  });

  it("keeps both exported request producers in agreement on the cap", () => {
    const proxy = createProviderCompletionProxyRequest(
      provider,
      "qwen36-domain-lora-v5-prisma",
      messages,
    );
    const vllm = createDgxVllmRequestBody("qwen36-domain-lora-v5-prisma", messages);
    expect(proxy.maxOutputTokens).toBe(vllm.max_tokens);
  });
});
