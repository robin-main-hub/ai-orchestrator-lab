import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { SseSession, SseSessionRegistry } from "./sseSession";

/**
 * P3 — SSE / agent-crash boundary hardening.
 *
 * 한 구독자의 소켓이 깨졌다고(write가 throw) 다른 구독자 전파(broadcast)나
 * 커밋 경로가 멈추면 안 된다. 깨진 한 이벤트(직렬화 불가)도 스트림을 죽이면 안 된다.
 * 이 테스트들은 fan-out 격리와 local degrade를 고정한다.
 */

type FakeResponse = ServerResponse & {
  writes: string[];
  ended: boolean;
  __setWriteThrows: (on: boolean) => void;
};

function fakeRequest(): IncomingMessage {
  // close/aborted 등 once() 구독만 필요 — EventEmitter로 충분.
  return new EventEmitter() as unknown as IncomingMessage;
}

function fakeResponse(options?: { writeThrows?: boolean }): FakeResponse {
  let writeThrows = options?.writeThrows ?? false;
  // 소켓/fs 없이 SseSession이 만지는 표면(writeHead/write/end/writableEnded/once)만 흉내낸다.
  const res: any = new EventEmitter();
  res.writes = [];
  res.ended = false;
  Object.defineProperty(res, "writableEnded", {
    get: () => res.ended,
    configurable: true,
  });
  res.writeHead = vi.fn(() => res);
  res.write = (chunk: string) => {
    if (writeThrows) {
      throw new Error("ERR_STREAM_DESTROYED");
    }
    res.writes.push(String(chunk));
    return true;
  };
  res.end = () => {
    res.ended = true;
    res.emit("close");
    return res;
  };
  res.__setWriteThrows = (on: boolean) => {
    writeThrows = on;
  };
  return res as FakeResponse;
}

function makeSession(res: FakeResponse, onClose?: (id: string, reason: string) => void) {
  return new SseSession({
    id: "sse_test",
    request: fakeRequest(),
    response: res,
    headers: {},
    heartbeatMs: 60_000,
    heartbeatPayload: () => ({ type: "heartbeat" }),
    onClose,
  });
}

describe("SseSession.writeEvent failure isolation", () => {
  it("does not throw and closes the session when the socket write throws", () => {
    const res = fakeResponse({ writeThrows: true });
    const closed: string[] = [];
    const session = makeSession(res, (_id, reason) => closed.push(reason));
    session.start();

    // start()의 첫 heartbeat write가 throw → 세션이 스스로 닫힌다(예외 누출 없음).
    expect(() => session.writeEvent("mission.trace", { ok: true })).not.toThrow();
    expect(closed).toContain("write_error");
    expect(res.ended).toBe(true);
  });

  it("skips an unserializable payload without throwing or closing the connection", () => {
    const res = fakeResponse();
    const closed: string[] = [];
    const session = makeSession(res, (_id, reason) => closed.push(reason));
    session.start();
    res.writes.length = 0; // start()의 heartbeat 프레임 제외

    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(() => session.writeEvent("mission.trace", circular)).not.toThrow();
    expect(res.writes).toHaveLength(0); // 이 이벤트만 건너뜀
    expect(res.ended).toBe(false); // 연결 유지
    expect(closed).toHaveLength(0);

    // 정상 페이로드는 이후에도 전달된다 — 연결이 살아있음을 확인.
    session.writeEvent("mission.trace", { ok: true });
    expect(res.writes.join("")).toContain('"ok":true');
  });
});

describe("SseSessionRegistry.broadcast fan-out isolation", () => {
  it("delivers to healthy sessions even when one session's socket throws", () => {
    const registry = new SseSessionRegistry();

    const goodRes = fakeResponse();
    const badRes = fakeResponse();
    const good = registry.createSession({
      request: fakeRequest(),
      response: goodRes,
      headers: {},
      heartbeatMs: 60_000,
      heartbeatPayload: () => ({ type: "heartbeat" }),
    });
    const bad = registry.createSession({
      request: fakeRequest(),
      response: badRes,
      headers: {},
      heartbeatMs: 60_000,
      heartbeatPayload: () => ({ type: "heartbeat" }),
    });
    good.start();
    bad.start();
    goodRes.writes.length = 0;
    expect(registry.size).toBe(2);

    // 한 구독자의 소켓이 깨진다.
    badRes.__setWriteThrows(true);

    expect(() => registry.broadcast("mission.trace", { value: 42 })).not.toThrow();

    // 건강한 세션은 이벤트를 받는다 — 깨진 한 스트림이 다른 스트림을 막지 않는다.
    expect(goodRes.writes.join("")).toContain('"value":42');
    // 깨진 세션은 닫혀 레지스트리에서 제거된다(유령 구독 방지).
    expect(registry.size).toBe(1);
  });
});
