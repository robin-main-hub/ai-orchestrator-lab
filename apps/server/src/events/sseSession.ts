import type { IncomingMessage, ServerResponse } from "node:http";

export type SsePayloadFactory = () => unknown;

export type SseSessionOptions = {
  id: string;
  request: IncomingMessage;
  response: ServerResponse;
  headers: Record<string, string>;
  heartbeatMs?: number;
  heartbeatPayload: SsePayloadFactory;
  onClose?: (id: string, reason: string) => void;
};

export class SseSession {
  private readonly heartbeatMs: number;
  private heartbeatTimer: NodeJS.Timeout | undefined;
  private closed = false;

  constructor(private readonly options: SseSessionOptions) {
    this.heartbeatMs = options.heartbeatMs ?? 15_000;
  }

  get id() {
    return this.options.id;
  }

  start() {
    this.options.response.writeHead(200, {
      "cache-control": "no-cache",
      "content-type": "text/event-stream; charset=utf-8",
      connection: "keep-alive",
      ...this.options.headers,
    });

    this.writeEvent("heartbeat", this.options.heartbeatPayload());
    this.heartbeatTimer = globalThis.setInterval(() => {
      this.writeEvent("heartbeat", this.options.heartbeatPayload());
    }, this.heartbeatMs);

    this.options.request.once("close", () => this.close("request_close"));
    this.options.request.once("aborted", () => this.close("request_aborted"));
    this.options.response.once("close", () => this.close("response_close"));
    this.options.response.once("error", () => this.close("response_error"));
  }

  writeEvent(event: string, payload: unknown) {
    if (this.closed || this.options.response.writableEnded) {
      return;
    }
    this.options.response.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
  }

  close(reason = "closed") {
    if (this.closed) return;
    this.closed = true;
    if (this.heartbeatTimer) {
      globalThis.clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
    if (!this.options.response.writableEnded) {
      this.options.response.end();
    }
    this.options.onClose?.(this.id, reason);
  }
}

export class SseSessionRegistry {
  private readonly sessions = new Map<string, SseSession>();
  private nextId = 0;

  createSession(options: Omit<SseSessionOptions, "id" | "onClose">): SseSession {
    const id = `sse_${Date.now()}_${++this.nextId}`;
    const session = new SseSession({
      ...options,
      id,
      onClose: (closedId, reason) => {
        this.sessions.delete(closedId);
        console.info(`[orchestrator-server] SSE session ${closedId} closed: ${reason}`);
      },
    });
    this.sessions.set(id, session);
    return session;
  }

  broadcast(event: string, payload: unknown) {
    for (const session of this.sessions.values()) {
      session.writeEvent(event, payload);
    }
  }

  closeAll(reason = "registry_shutdown") {
    for (const session of [...this.sessions.values()]) {
      session.close(reason);
    }
    this.sessions.clear();
  }

  get size() {
    return this.sessions.size;
  }
}

export const sseSessionRegistry = new SseSessionRegistry();
