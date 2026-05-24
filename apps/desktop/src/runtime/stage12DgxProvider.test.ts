import { describe, expect, it } from "vitest";
import {
  createDgxVllmRequestBody,
  createProviderCompletionProxyRequest,
  isDgxRoutedProvider,
  isDgxVllmProvider,
  requestDgxProviderCompletion,
  requestDgxVllmCompletion,
} from "./stage12DgxProvider";
import {
  DGX02_LAN_ORCHESTRATOR_BASE_URL,
  ENDRUIN_ORCHESTRATOR_BASE_URL,
} from "./stage30DgxEndpoints";
import type { ConversationMessage, ProviderProfile } from "@ai-orchestrator/protocol";

const provider: ProviderProfile = {
  id: "provider_dgx02_vllm",
  name: "DGX-02 vLLM",
  kind: "openai",
  baseUrl: "http://dgx-02:8001/v1",
  defaultModel: "qwen36-domain-wiki-rag-prisma",
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
    const body = createDgxVllmRequestBody("qwen36-domain-wiki-rag-prisma", messages);

    expect(body.model).toBe("qwen36-domain-wiki-rag-prisma");
    expect(body.chat_template_kwargs.enable_thinking).toBe(false);
    expect(body.messages[0]?.role).toBe("system");
    expect(body.messages[1]?.content).toBe("Can DGX answer now?");
  });

  it("keeps desktop pipeline system prompts inside the leading vLLM system message", () => {
    const body = createDgxVllmRequestBody("qwen36-domain-wiki-rag-prisma", [
      { ...messages[0]!, role: "system", content: "Desktop pipeline context." },
      ...messages,
    ]);

    expect(body.messages.filter((message) => message.role === "system")).toHaveLength(1);
    expect(body.messages[0]?.content).toContain("Desktop pipeline context.");
    expect(body.messages[1]?.role).toBe("user");
  });

  it("builds a server proxy request without raw provider endpoints", () => {
    const request = createProviderCompletionProxyRequest(provider, "qwen36-domain-wiki-rag-prisma", messages);

    expect(request.providerProfileId).toBe("provider_dgx02_vllm");
    expect(request.routePreference).toBe("server_proxy");
    expect(JSON.stringify(request)).not.toContain("http://dgx-02:8001");
  });

  it("uses the DGX server proxy before direct provider calls", async () => {
    const fetchImpl = async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe(`${DGX02_LAN_ORCHESTRATOR_BASE_URL}/provider-completions`);
      expect(String(init?.body)).not.toContain("sk-");
      expect(String(init?.body)).not.toContain("http://dgx-02:8001");
      return new Response(
        JSON.stringify({
          id: "provider_completion_response_1",
          requestId: "provider_completion_request_1",
          providerProfileId: "provider_dgx02_vllm",
          modelId: "qwen36-domain-wiki-rag-prisma",
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
      modelId: "qwen36-domain-wiki-rag-prisma",
      messages,
      fetchImpl,
    });

    expect(result.content).toBe("DGX is ready.");
    expect(result.route).toBe("server_proxy");
    expect(result.usage?.totalTokens).toBe(20);
  });

  it("falls back to the direct DGX provider when the server proxy is unavailable", async () => {
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
      modelId: "qwen36-domain-wiki-rag-prisma",
      messages,
      fetchImpl,
    });

    expect(calls).toEqual([
      `${DGX02_LAN_ORCHESTRATOR_BASE_URL}/provider-completions`,
      `${ENDRUIN_ORCHESTRATOR_BASE_URL}/provider-completions`,
      "http://dgx-02:8001/v1/chat/completions",
    ]);
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

    expect(calls).toEqual([
      `${DGX02_LAN_ORCHESTRATOR_BASE_URL}/provider-completions`,
      `${ENDRUIN_ORCHESTRATOR_BASE_URL}/provider-completions`,
    ]);
  });
});
