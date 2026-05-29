import { describe, expect, it } from "vitest";
import { requestDgxProviderCompletionStream } from "./stage12DgxProviderStream";
import type { ConversationMessage, ProviderProfile, ProviderCompletionChunkEvent } from "@ai-orchestrator/protocol";
import { DGX02_LAN_ORCHESTRATOR_BASE_URL } from "./stage30DgxEndpoints";

const provider: ProviderProfile = {
  id: "provider_dgx02_vllm",
  name: "DGX-02 vLLM",
  kind: "openai",
  baseUrl: "http://dgx-02:8001/v1",
  defaultModel: "qwen36-gio-lora-v5-prisma",
  enabled: true,
  tags: ["dgx", "vllm", "no-auth"],
  trustLevel: "trusted",
};

const messages: ConversationMessage[] = [
  {
    id: "message_1",
    sessionId: "session_1",
    role: "user",
    content: "Stream test query",
    createdAt: "2026-05-24T00:00:00.000Z",
  },
];

describe("stage12 DGX provider completion stream", () => {
  it("streams chunk events through proxy SSE parsing", async () => {
    const chunkEvents: ProviderCompletionChunkEvent[] = [];
    const encoder = new TextEncoder();

    const mockStream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            `event: chunk\ndata: {"type":"delta","requestId":"req_123","sequence":0,"delta":"Hel"}\n\n`
          )
        );
        controller.enqueue(
          encoder.encode(
            `event: chunk\ndata: {"type":"delta","requestId":"req_123","sequence":1,"delta":"lo"}\n\n`
          )
        );
        controller.enqueue(
          encoder.encode(
            `event: chunk\ndata: {"type":"done","requestId":"req_123","finalContent":"Hello","endpoint":"http://localhost","createdAt":"now","completedAt":"now"}\n\n`
          )
        );
        controller.close();
      },
    });

    const fetchImpl = async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe(`${DGX02_LAN_ORCHESTRATOR_BASE_URL}/provider-completions/stream`);
      return new Response(mockStream, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });
    };

    await requestDgxProviderCompletionStream({
      provider,
      modelId: "qwen36-gio-lora-v5-prisma",
      messages,
      fetchImpl: fetchImpl as any,
      onChunk: (evt) => {
        chunkEvents.push(evt);
      },
    });

    expect(chunkEvents).toHaveLength(3);
    expect(chunkEvents[0]).toEqual({
      type: "delta",
      requestId: "req_123",
      sequence: 0,
      delta: "Hel",
    });
    expect(chunkEvents[1]).toEqual({
      type: "delta",
      requestId: "req_123",
      sequence: 1,
      delta: "lo",
    });
    expect(chunkEvents[2]).toMatchObject({
      type: "done",
      requestId: "req_123",
      finalContent: "Hello",
    });
  });
});
