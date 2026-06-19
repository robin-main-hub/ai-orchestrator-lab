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

    // 타이머/리스너를 먼저 건다 — 초기 heartbeat write가 죽은 소켓에서 throw→close()
    // 되더라도 heartbeatTimer가 이미 등록돼 있어야 close()가 정리할 수 있다(타이머 누수 방지).
    this.heartbeatTimer = globalThis.setInterval(() => {
      this.writeEvent("heartbeat", this.options.heartbeatPayload());
    }, this.heartbeatMs);

    this.options.request.once("close", () => this.close("request_close"));
    this.options.request.once("aborted", () => this.close("request_aborted"));
    this.options.response.once("close", () => this.close("response_close"));
    this.options.response.once("error", () => this.close("response_error"));

    this.writeEvent("heartbeat", this.options.heartbeatPayload());
  }

  writeEvent(event: string, payload: unknown) {
    if (this.closed || this.options.response.writableEnded) {
      return;
    }
    let frame: string;
    try {
      frame = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
    } catch {
      // 직렬화 불가 페이로드(순환 참조 등) — 이 이벤트만 건너뛴다. 연결은 유지한다.
      // 깨진 한 이벤트가 스트림 전체를 죽이지 않게 한다.
      return;
    }
    try {
      this.options.response.write(frame);
    } catch {
      // 소켓이 이미 깨진 경우 response.write가 동기 throw를 낼 수 있다. 이 예외가
      // fan-out 루프(broadcast/publish)나 커밋 경로(onEventsCommitted)로 새어나가
      // 다른 구독자 전파를 막지 않도록, 이 세션만 닫고 예외를 삼킨다.
      this.close("write_error");
    }
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
