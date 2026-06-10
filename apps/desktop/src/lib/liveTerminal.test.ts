import { describe, expect, it, vi } from "vitest";
import {
  applyCapture,
  createLiveTerminalState,
  setPolling,
  setRole,
  startLiveCaptureLoop,
} from "./liveTerminal";

const NOW = "2026-06-10T00:00:00.000Z";

describe("liveTerminal state", () => {
  it("capture 성공은 live로, 출력/pane/라인수를 반영", () => {
    let state = createLiveTerminalState({ role: "code", sessionName: "dgx-swarm" });
    state = setPolling(state);
    expect(state.status).toBe("polling");
    state = applyCapture(state, { status: "captured", output: "$ pnpm test\nok", paneId: "%3", lineCount: 2 }, NOW);
    expect(state.status).toBe("live");
    expect(state.output).toContain("pnpm test");
    expect(state.paneId).toBe("%3");
    expect(state.updatedAt).toBe(NOW);
  });

  it("disabled/failed 전이를 구분한다", () => {
    let state = createLiveTerminalState({});
    state = applyCapture(state, { status: "disabled", reason: "send-keys gate off" }, NOW);
    expect(state.status).toBe("disabled");
    state = applyCapture(state, { status: "failed", reason: "session not running" }, NOW);
    expect(state.status).toBe("error");
    expect(state.error).toContain("session");
  });

  it("역할 변경은 이전 pane 잔상을 비운다", () => {
    let state = applyCapture(createLiveTerminalState({}), { status: "captured", output: "old", paneId: "%1" }, NOW);
    state = setRole(state, "qa");
    expect(state.role).toBe("qa");
    expect(state.output).toBe("");
    expect(state.paneId).toBeUndefined();
    expect(state.status).toBe("idle");
  });
});

describe("startLiveCaptureLoop", () => {
  it("즉시 1회 실행 + 주기 반복, 겹침은 스킵", async () => {
    let handler: (() => void) | null = null;
    const timers = {
      setInterval: vi.fn((h: () => void) => {
        handler = h;
        return "h1";
      }),
      clearInterval: vi.fn(),
    };
    let resolve: (() => void) | null = null;
    let ticks = 0;
    const loop = startLiveCaptureLoop({
      intervalMs: 1000,
      timers,
      tick: () =>
        new Promise<void>((r) => {
          ticks += 1;
          resolve = r;
        }),
    });
    expect(ticks).toBe(1); // 즉시 1회
    handler!(); // 겹침 — 아직 안 끝남
    expect(ticks).toBe(1);
    resolve!();
    await Promise.resolve();
    await Promise.resolve();
    handler!();
    expect(ticks).toBe(2);
    loop.stop();
    expect(timers.clearInterval).toHaveBeenCalledWith("h1");
  });
});
