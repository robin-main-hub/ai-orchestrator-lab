import type { RmasTraceEvent } from "@ai-orchestrator/protocol";
import { resolveConfiguredDgxServerBaseUrls, resolveDgxServerBaseUrls } from "./stage30DgxEndpoints";
import { createDgxOrchestratorAuthHeaders } from "./stage31DgxAuth";

/**
 * Stage 48 — RMAS live trace stream reader (SSE over fetch+ReadableStream).
 *
 * `GET /rmas/runs/:id/trace/stream` emits three named SSE events:
 *   - `heartbeat`            {type,runId,at}         (on connect + every 15s)
 *   - `rmas.trace.snapshot`  RmasTraceEvent[]        (once, on connect — reattach)
 *   - `rmas.trace`           one RmasTraceEvent       (per live commit)
 *
 * We use fetch + a ReadableStream reader (NOT EventSource, which cannot send the
 * Bearer/HMAC auth header the server requires) — the same house pattern as
 * `codingAgentClient.streamCompletion`. Wire frames are `event: <name>\ndata:
 * <json>\n\n`; the connect phase gets a short guard and the body a stall guard.
 */

export type RmasStreamCallbacks = {
  onSnapshot?: (events: RmasTraceEvent[]) => void;
  onEvent?: (event: RmasTraceEvent) => void;
  onHeartbeat?: (payload: { type?: string; runId?: string; at?: string }) => void;
  onError?: (error: Error) => void;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  serverBaseUrl?: string | string[];
};

/** stream 무활동 한도 — 이 시간 동안 프레임이 없으면 죽은 연결로 보고 끊는다 (heartbeat 15s의 여유배수) */
const STREAM_STALL_TIMEOUT_MS = 60_000;
/** 연결(헤더 수신) 단계 가드 */
const CONNECT_TIMEOUT_MS = 15_000;

function firstBaseUrl(serverBaseUrl?: string | string[]): string {
  const explicit = resolveDgxServerBaseUrls(serverBaseUrl);
  if (explicit[0]) return explicit[0];
  const configured = resolveConfiguredDgxServerBaseUrls();
  return configured[0] ?? "http://127.0.0.1:8787";
}

export type ParsedSseFrame = { event: string; data: string };

/**
 * Parse one SSE frame body (already split on the `\n\n` boundary) into its
 * event name + data payload. `data:` lines are concatenated with `\n` per the
 * SSE spec; a frame with no `event:` line defaults to "message". Returns null
 * for empty/comment-only frames.
 */
export function parseSseFrame(frame: string): ParsedSseFrame | null {
  let event = "message";
  const dataLines: string[] = [];
  for (const rawLine of frame.split("\n")) {
    const line = rawLine.replace(/\r$/, "");
    if (!line || line.startsWith(":")) continue; // blank or comment
    if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).replace(/^ /, ""));
    }
  }
  if (dataLines.length === 0) return null;
  return { event, data: dataLines.join("\n") };
}

/**
 * Dispatch a parsed frame to the right callback. Exported for unit testing the
 * pure routing without a live socket. Swallows JSON parse errors on a single
 * frame (a malformed frame should not tear down the whole stream).
 */
export function dispatchRmasFrame(frame: ParsedSseFrame, callbacks: RmasStreamCallbacks): void {
  let payload: unknown;
  try {
    payload = JSON.parse(frame.data);
  } catch {
    return;
  }
  switch (frame.event) {
    case "rmas.trace.snapshot":
      if (Array.isArray(payload)) callbacks.onSnapshot?.(payload as RmasTraceEvent[]);
      break;
    case "rmas.trace":
      callbacks.onEvent?.(payload as RmasTraceEvent);
      break;
    case "heartbeat":
      callbacks.onHeartbeat?.(payload as { type?: string; runId?: string; at?: string });
      break;
    default:
      break;
  }
}

async function readWithStallGuard<T>(
  reader: ReadableStreamDefaultReader<T>,
  stallMs: number,
): Promise<ReadableStreamReadResult<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`stream stalled: ${Math.round(stallMs / 1000)}초간 응답 없음`)),
          stallMs,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Open the RMAS trace stream and pump frames into callbacks until the stream
 * ends, the caller aborts, or an error occurs. Resolves when the stream closes
 * cleanly; on error it invokes `onError` and returns (never throws to the
 * caller — the hook decides whether to retry/reattach).
 */
export async function openRmasTraceStream(runId: string, callbacks: RmasStreamCallbacks): Promise<void> {
  const fetchImpl = callbacks.fetchImpl ?? fetch;
  const baseUrl = firstBaseUrl(callbacks.serverBaseUrl);
  const path = `/rmas/runs/${encodeURIComponent(runId)}/trace/stream`;

  const connectController = new AbortController();
  const connectTimer = setTimeout(() => connectController.abort(), CONNECT_TIMEOUT_MS);
  if (callbacks.signal) {
    if (callbacks.signal.aborted) connectController.abort();
    else callbacks.signal.addEventListener("abort", () => connectController.abort(), { once: true });
  }

  let response: Response;
  try {
    const headers = await createDgxOrchestratorAuthHeaders("GET", path, baseUrl);
    response = await fetchImpl(`${baseUrl}${path}`, {
      method: "GET",
      headers: { accept: "text/event-stream", ...headers },
      signal: connectController.signal,
    });
  } catch (error) {
    clearTimeout(connectTimer);
    if (callbacks.signal?.aborted) return; // intentional teardown
    callbacks.onError?.(error instanceof Error ? error : new Error(String(error)));
    return;
  } finally {
    clearTimeout(connectTimer);
  }

  if (!response.ok || !response.body) {
    let detail = `HTTP ${response.status}`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) detail = body.error;
    } catch {
      // not JSON — keep status text
    }
    callbacks.onError?.(new Error(detail));
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      if (callbacks.signal?.aborted) break;
      const { done, value } = await readWithStallGuard(reader, STREAM_STALL_TIMEOUT_MS);
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let separator = buffer.indexOf("\n\n");
      while (separator >= 0) {
        const frame = buffer.slice(0, separator);
        buffer = buffer.slice(separator + 2);
        separator = buffer.indexOf("\n\n");
        const parsed = parseSseFrame(frame);
        if (parsed) dispatchRmasFrame(parsed, callbacks);
      }
    }
  } catch (error) {
    void reader.cancel().catch(() => {});
    if (!callbacks.signal?.aborted) {
      callbacks.onError?.(error instanceof Error ? error : new Error(String(error)));
    }
    return;
  } finally {
    reader.releaseLock();
  }
}
