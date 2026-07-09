import { describe, expect, it, vi } from "vitest";
import type { RmasTraceEvent } from "@ai-orchestrator/protocol";
import { dispatchRmasFrame, openRmasTraceStream, parseSseFrame } from "./stage48RmasStream";
import { __test as authTest, generateBrowserHmacSha256 } from "./stage31DgxAuth";

authTest.setTokenOverrideForTests("test-token");

const evt = (id: string): RmasTraceEvent => ({
  id,
  runId: "r1",
  type: "rmas.agent.message",
  severity: "info",
  title: id,
  summary: "",
  createdAt: "2026-07-09T00:00:00.000Z",
});

describe("parseSseFrame", () => {
  it("parses event + data lines", () => {
    expect(parseSseFrame("event: rmas.trace\ndata: {\"a\":1}")).toEqual({ event: "rmas.trace", data: '{"a":1}' });
  });

  it("defaults event to 'message' and joins multi-line data", () => {
    expect(parseSseFrame("data: line1\ndata: line2")).toEqual({ event: "message", data: "line1\nline2" });
  });

  it("ignores comments/blank and returns null when no data", () => {
    expect(parseSseFrame(": keep-alive\nevent: heartbeat")).toBeNull();
  });

  it("tolerates trailing CR", () => {
    expect(parseSseFrame("event: heartbeat\r\ndata: {}\r")).toEqual({ event: "heartbeat", data: "{}" });
  });
});

describe("dispatchRmasFrame", () => {
  it("routes snapshot (array), live event, and heartbeat to the right callbacks", () => {
    const onSnapshot = vi.fn();
    const onEvent = vi.fn();
    const onHeartbeat = vi.fn();
    const cbs = { onSnapshot, onEvent, onHeartbeat };
    dispatchRmasFrame({ event: "rmas.trace.snapshot", data: JSON.stringify([evt("a"), evt("b")]) }, cbs);
    dispatchRmasFrame({ event: "rmas.trace", data: JSON.stringify(evt("c")) }, cbs);
    dispatchRmasFrame({ event: "heartbeat", data: JSON.stringify({ type: "heartbeat", runId: "r1" }) }, cbs);
    expect(onSnapshot).toHaveBeenCalledWith([expect.objectContaining({ id: "a" }), expect.objectContaining({ id: "b" })]);
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ id: "c" }));
    expect(onHeartbeat).toHaveBeenCalledWith(expect.objectContaining({ type: "heartbeat" }));
  });

  it("swallows malformed JSON on a single frame (no throw)", () => {
    const onEvent = vi.fn();
    expect(() => dispatchRmasFrame({ event: "rmas.trace", data: "{bad" }, { onEvent })).not.toThrow();
    expect(onEvent).not.toHaveBeenCalled();
  });
});

/** Build a fetch that streams the given SSE text body in chunks. */
function streamingFetch(sseText: string, chunkSize = 16): typeof fetch {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(sseText);
  return vi.fn(async () => {
    let offset = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (offset >= bytes.length) {
          controller.close();
          return;
        }
        controller.enqueue(bytes.slice(offset, offset + chunkSize));
        offset += chunkSize;
      },
    });
    return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
  }) as unknown as typeof fetch;
}

describe("openRmasTraceStream", () => {
  it("reads chunked SSE frames end-to-end and dispatches snapshot then live event", async () => {
    const sse =
      `event: heartbeat\ndata: ${JSON.stringify({ type: "heartbeat", runId: "r1" })}\n\n` +
      `event: rmas.trace.snapshot\ndata: ${JSON.stringify([evt("a")])}\n\n` +
      `event: rmas.trace\ndata: ${JSON.stringify(evt("b"))}\n\n`;

    const snapshots: RmasTraceEvent[][] = [];
    const events: RmasTraceEvent[] = [];
    await openRmasTraceStream("r1", {
      serverBaseUrl: "http://127.0.0.1:9912",
      fetchImpl: streamingFetch(sse, 8),
      onSnapshot: (list) => snapshots.push(list),
      onEvent: (event) => events.push(event),
    });

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]!.map((event) => event.id)).toEqual(["a"]);
    expect(events.map((event) => event.id)).toEqual(["b"]);
  });

  it("signs the real stream path (not the bare root) for a http:// target", async () => {
    // Regression: the SSE reader must sign the actual request path. On a
    // plain-http target the HMAC branch signs `new URL(targetUrl).pathname`,
    // so passing a bare base URL signed "/" and the server 401'd every stream.
    const token = ["dev", "orchestrator", "token"].join("-"); // no credential literal
    authTest.setTokenOverrideForTests(token);
    let capturedHeaders: Record<string, string> | undefined;
    let capturedUrl: string | undefined;
    const encoder = new TextEncoder();
    const bytes = encoder.encode(
      `event: rmas.trace.snapshot\ndata: ${JSON.stringify([evt("a")])}\n\n`,
    );
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      capturedUrl = url;
      capturedHeaders = init.headers as Record<string, string>;
      let offset = 0;
      const body = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (offset >= bytes.length) {
            controller.close();
            return;
          }
          controller.enqueue(bytes.slice(offset, offset + 16));
          offset += 16;
        },
      });
      return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
    }) as unknown as typeof fetch;

    const base = "http://127.0.0.1:9912";
    await openRmasTraceStream("r1", { serverBaseUrl: base, fetchImpl });

    const expectedPath = "/rmas/runs/r1/trace/stream";
    expect(capturedUrl).toBe(`${base}${expectedPath}`);
    const headers = capturedHeaders!;
    const timestamp = headers["x-dgx-timestamp"]!;
    const nonce = headers["x-dgx-nonce"]!;
    const bodyHash = headers["x-dgx-body-sha256"]!;
    const expectedForRealPath = await generateBrowserHmacSha256(
      token,
      ["GET", expectedPath, bodyHash, timestamp, nonce].join("\n"),
    );
    const buggyForBareRoot = await generateBrowserHmacSha256(
      token,
      ["GET", "/", bodyHash, timestamp, nonce].join("\n"),
    );
    expect(headers["x-dgx-signature"]).toBe(expectedForRealPath);
    expect(headers["x-dgx-signature"]).not.toBe(buggyForBareRoot);
  });

  it("reports an error (does not throw) on a non-ok response", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ error: "rmas_run_not_found" }), { status: 404 }),
    ) as unknown as typeof fetch;
    const onError = vi.fn();
    await expect(
      openRmasTraceStream("missing", { serverBaseUrl: "http://127.0.0.1:9912", fetchImpl, onError }),
    ).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "rmas_run_not_found" }));
  });
});
