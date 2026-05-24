import { describe, expect, it } from "vitest";
import { createDgxVllmRequestBody, isDgxVllmProvider, requestDgxVllmCompletion } from "./stage12DgxProvider";
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
  });

  it("builds a vLLM request with thinking disabled", () => {
    const body = createDgxVllmRequestBody("qwen36-domain-wiki-rag-prisma", messages);

    expect(body.model).toBe("qwen36-domain-wiki-rag-prisma");
    expect(body.chat_template_kwargs.enable_thinking).toBe(false);
    expect(body.messages[0]?.role).toBe("system");
    expect(body.messages[1]?.content).toBe("Can DGX answer now?");
  });

  it("extracts a completion response without storing secrets", async () => {
    const fetchImpl = async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe("http://dgx-02:8001/v1/chat/completions");
      expect(String(init?.body)).not.toContain("sk-");
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "DGX is ready." } }],
          usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 },
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
    expect(result.usage?.totalTokens).toBe(20);
  });
});
