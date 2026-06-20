import { describe, expect, it, vi } from "vitest";
import type { ProviderCompletionRequest } from "@ai-orchestrator/protocol";
import { requestCompletion, streamCompletion } from "./codingAgentClient";

// Characterization tests for the coding workbench's LLM transport client (no
// behavior change). Both calls take an injectable fetchImpl + explicit
// serverBaseUrl, so nothing touches a real socket. requestCompletion POSTs to
// /provider-completions and on a non-ok response throws either "error" /
// "error: message" / "HTTP <status>". streamCompletion reads an SSE body of
// "data: {…}\n\n" frames: delta chunks accumulate content and fire onDelta with
// the cumulative string, a done chunk pins finalContent + usage, and it returns
// finalContent ?? content. An error chunk is only thrown when no content and no
// finalContent were produced — partial output is kept honestly. A non-ok
// stream response surfaces the JSON error detail. No real network.

const request = { model: "m", messages: [] } as unknown as ProviderCompletionRequest;
const base = "http://test.local";

function jsonResponse(ok: boolean, status: number, payload: unknown): Response {
  return { ok, status, json: async () => payload } as unknown as Response;
}

function streamResponse(...frames: unknown[]): Response {
  const enc = new TextEncoder();
  const text = frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join("");
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(enc.encode(text));
      controller.close();
    },
  });
  return { ok: true, status: 200, body } as unknown as Response;
}

describe("requestCompletion", () => {
  it("POSTs to /provider-completions and returns the parsed payload on ok", async () => {
    const payload = { content: "hi", requestId: "r1" };
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(true, 200, payload));
    const out = await requestCompletion(request, { serverBaseUrl: base, fetchImpl });
    expect(out).toBe(payload);
    expect(fetchImpl).toHaveBeenCalledWith(
      `${base}/provider-completions`,
      expect.objectContaining({ method: "POST", body: JSON.stringify(request) }),
    );
  });

  it("throws 'error: message' on a non-ok response that carries both", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(false, 400, { error: "bad", message: "why" }));
    await expect(requestCompletion(request, { serverBaseUrl: base, fetchImpl })).rejects.toThrow("bad: why");
  });

  it("throws just the error when no message, and falls back to HTTP <status> when no error field", async () => {
    const onlyError = vi.fn().mockResolvedValue(jsonResponse(false, 400, { error: "denied" }));
    await expect(requestCompletion(request, { serverBaseUrl: base, fetchImpl: onlyError })).rejects.toThrow(
      "denied",
    );
    const noError = vi.fn().mockResolvedValue(jsonResponse(false, 503, {}));
    await expect(requestCompletion(request, { serverBaseUrl: base, fetchImpl: noError })).rejects.toThrow(
      "HTTP 503",
    );
  });
});

describe("streamCompletion", () => {
  it("accumulates deltas (cumulative onDelta) and returns finalContent + usage from done", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        streamResponse(
          { type: "delta", sequence: 0, delta: "Hel" },
          { type: "delta", sequence: 1, delta: "lo" },
          { type: "done", finalContent: "Hello!", usage: { inputTokens: 3, outputTokens: 5 } },
        ),
      );
    const onDelta = vi.fn();
    const out = await streamCompletion(request, { serverBaseUrl: base, fetchImpl, onDelta });
    expect(out).toEqual({ content: "Hello!", usage: { inputTokens: 3, outputTokens: 5 } });
    expect(onDelta.mock.calls.map((c) => c[0])).toEqual(["Hel", "Hello"]);
  });

  it("keeps partial content (does not throw) when an error chunk arrives after some delta", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        streamResponse(
          { type: "delta", sequence: 0, delta: "partial" },
          { type: "error", error: { message: "boom" } },
        ),
      );
    const out = await streamCompletion(request, { serverBaseUrl: base, fetchImpl });
    expect(out).toEqual({ content: "partial", usage: undefined });
  });

  it("throws the error message only when no content and no finalContent were produced", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(streamResponse({ type: "error", error: { message: "boom" } }));
    await expect(streamCompletion(request, { serverBaseUrl: base, fetchImpl })).rejects.toThrow("boom");
  });

  it("surfaces the JSON error detail when the stream response is not ok", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      body: null,
      json: async () => ({ error: "권한 거부" }),
    } as unknown as Response);
    await expect(streamCompletion(request, { serverBaseUrl: base, fetchImpl })).rejects.toThrow("권한 거부");
  });
});
