import { describe, expect, it } from "vitest";
import type { ProviderCompletionRequest } from "@ai-orchestrator/protocol";
import { MockLlmAdapter } from "./mockLlmAdapter";
import { createAdapterContext } from "./adapter";

function baseRequest(overrides: Partial<ProviderCompletionRequest> = {}): ProviderCompletionRequest {
  return {
    id: "req_001",
    sessionId: "session_test",
    providerProfileId: "provider_mock_llm",
    modelId: "mock-orchestrator",
    messages: [{ role: "user", content: "ping" }],
    source: "desktop",
    routePreference: "direct_provider",
    createdAt: "2026-05-25T06:00:00.000Z",
    ...overrides,
  };
}

describe("MockLlmAdapter", () => {
  it("exposes profileId and kind from the LlmAdapter contract", () => {
    const adapter = new MockLlmAdapter();
    expect(adapter.profileId).toBe("provider_mock_llm");
    expect(adapter.kind).toBe("custom");
  });

  it("accepts a custom profileId", () => {
    const adapter = new MockLlmAdapter({ profileId: "provider_test_alt" });
    expect(adapter.profileId).toBe("provider_test_alt");
  });

  it("returns two discovered models tagged to its profile", async () => {
    const adapter = new MockLlmAdapter();
    const models = await adapter.discoverModels(createAdapterContext());
    expect(models).toHaveLength(2);
    expect(models[0]!.providerProfileId).toBe("provider_mock_llm");
    expect(models[0]!.id).toBe("mock-orchestrator");
    expect(models[1]!.id).toBe("mock-reviewer");
  });

  it("echoes the last user message with a mock prefix", async () => {
    const adapter = new MockLlmAdapter();
    const response = await adapter.complete(
      baseRequest({
        messages: [
          { role: "system", content: "system context" },
          { role: "user", content: "first user" },
          { role: "assistant", content: "first reply" },
          { role: "user", content: "second user" },
        ],
      }),
      createAdapterContext(),
    );
    expect(response.status).toBe("succeeded");
    expect(response.content).toBe("mock:second user");
  });

  it("returns fixed fixture usage (NOT content-length-derived)", async () => {
    const adapter = new MockLlmAdapter();
    const shortResp = await adapter.complete(baseRequest({ messages: [{ role: "user", content: "hi" }] }), createAdapterContext());
    const longResp = await adapter.complete(
      baseRequest({
        id: "req_002",
        messages: [{ role: "user", content: "x".repeat(500) }],
      }),
      createAdapterContext(),
    );
    expect(shortResp.usage?.inputTokens).toBe(12);
    expect(longResp.usage?.inputTokens).toBe(12);
    expect(shortResp.usage?.totalTokens).toBe(16);
  });

  it("respects a custom fixtureUsage override", async () => {
    const adapter = new MockLlmAdapter({ fixtureUsage: { inputTokens: 100, outputTokens: 50 } });
    const response = await adapter.complete(baseRequest(), createAdapterContext());
    expect(response.usage).toEqual({ inputTokens: 100, outputTokens: 50, totalTokens: 150 });
  });

  it("propagates routePreference and modelId into the response", async () => {
    const adapter = new MockLlmAdapter();
    const response = await adapter.complete(
      baseRequest({ routePreference: "server_proxy", modelId: "mock-reviewer" }),
      createAdapterContext(),
    );
    expect(response.route).toBe("server_proxy");
    expect(response.modelId).toBe("mock-reviewer");
    expect(response.requestId).toBe("req_001");
  });

  it("falls back to 'empty' when no user message exists", async () => {
    const adapter = new MockLlmAdapter();
    const response = await adapter.complete(
      baseRequest({ messages: [{ role: "system", content: "only system" }] }),
      createAdapterContext(),
    );
    expect(response.content).toBe("mock:empty");
  });

  it("streams the completion chunks correctly", async () => {
    const adapter = new MockLlmAdapter();
    const chunks = [];
    const stream = adapter.completeStreaming(
      baseRequest({ messages: [{ role: "user", content: "hello stream" }] }),
      createAdapterContext(),
    );
    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(4);
    expect(chunks[0]).toEqual({
      type: "usage",
      requestId: "req_001",
      usage: {
        inputTokens: 12,
        outputTokens: 4,
        totalTokens: 16,
      },
    });
    expect(chunks[1]).toEqual({
      type: "delta",
      requestId: "req_001",
      sequence: 0,
      delta: "mock:",
    });
    expect(chunks[2]).toEqual({
      type: "delta",
      requestId: "req_001",
      sequence: 1,
      delta: "hello stream",
    });
    expect(chunks[3]).toMatchObject({
      type: "done",
      requestId: "req_001",
      finalContent: "mock:hello stream",
      stopReason: "end_turn",
      usage: {
        inputTokens: 12,
        outputTokens: 4,
        totalTokens: 16,
      },
      endpoint: "mock",
    });
  });
});
