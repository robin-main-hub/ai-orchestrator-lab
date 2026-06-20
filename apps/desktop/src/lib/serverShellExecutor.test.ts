import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  DesktopTmuxCaptureResponse,
  DesktopTmuxDispatchResponse,
} from "../runtime/stage33TmuxServer";

// Characterization tests for createServerShellExecutor's honesty cascade (no
// behavior change). The executor pushes a preset command through dgx-02's
// dispatch gate and only reports observed:true when the command was actually
// "sent" AND its pane output was "captured" — every other branch returns
// observed:false with an honest blockedReason (no fake success). The two network
// calls are mocked at the ../runtime/stage33TmuxServer seam so nothing touches a
// socket. We pin: (a) pending_approval/recorded → "승인 대기" + no capture call,
// (b) any other non-"sent" status → "실행 불가 (status): reason", (c) sent +
// captured → observed:true/exitCode 0/stdout=outputPreview + onLog, (d) sent but
// capture not captured → "출력 캡처 실패", (e) dispatch throws → "서버 도달 불가".
// Injectable mock, no real network.

const requestTmuxDispatch = vi.fn();
const requestTmuxCapture = vi.fn();

vi.mock("../runtime/stage33TmuxServer", () => ({
  requestTmuxDispatch: (...args: unknown[]) => requestTmuxDispatch(...args),
  requestTmuxCapture: (...args: unknown[]) => requestTmuxCapture(...args),
}));

// Imported after vi.mock is registered (vitest hoists vi.mock, so order is safe).
import { createServerShellExecutor } from "./serverShellExecutor";

function dispatchResponse(status: string, reason = "r"): DesktopTmuxDispatchResponse {
  return { dispatch: { attempted: true, status, reason } } as unknown as DesktopTmuxDispatchResponse;
}

function captureResponse(over: Partial<DesktopTmuxCaptureResponse> = {}): DesktopTmuxCaptureResponse {
  return { status: "failed", reason: "r", ...over } as unknown as DesktopTmuxCaptureResponse;
}

const exec = { command: "pnpm test", cwd: "/tmp" } as never;
const onLog = vi.fn();

afterEach(() => {
  requestTmuxDispatch.mockReset();
  requestTmuxCapture.mockReset();
  onLog.mockReset();
});

describe("createServerShellExecutor honesty cascade", () => {
  it("reports 승인 대기 (and never captures) when dispatch is pending_approval or recorded", async () => {
    for (const status of ["pending_approval", "recorded"]) {
      requestTmuxDispatch.mockResolvedValueOnce(dispatchResponse(status));
      const run = createServerShellExecutor({ sessionId: "s1" });
      const out = await run(exec, onLog);
      expect(out.observed).toBe(false);
      expect(out.exitCode).toBe(-1);
      expect(out.blockedReason).toBe("승인 대기 — 관제판 큐에서 승인하면 실행됩니다.");
    }
    expect(requestTmuxCapture).not.toHaveBeenCalled();
  });

  it("reports 실행 불가 with the raw status and reason for any other non-sent status", async () => {
    requestTmuxDispatch.mockResolvedValueOnce(dispatchResponse("blocked", "gate off"));
    const run = createServerShellExecutor({ sessionId: "s1" });
    const out = await run(exec, onLog);
    expect(out.observed).toBe(false);
    expect(out.blockedReason).toBe("실행 불가 (blocked): gate off");
    expect(requestTmuxCapture).not.toHaveBeenCalled();
  });

  it("reports observed:true with captured output when sent and capture succeeds", async () => {
    requestTmuxDispatch.mockResolvedValueOnce(dispatchResponse("sent"));
    requestTmuxCapture.mockResolvedValueOnce(
      captureResponse({ status: "captured", payload: { outputPreview: "build ok" } as never }),
    );
    const run = createServerShellExecutor({ sessionId: "s1" });
    const out = await run(exec, onLog);
    expect(out).toMatchObject({ exitCode: 0, stdout: "build ok", observed: true });
    expect(onLog).toHaveBeenCalledWith("stdout", "build ok");
  });

  it("reports 출력 캡처 실패 when sent but the pane capture does not come back captured", async () => {
    requestTmuxDispatch.mockResolvedValueOnce(dispatchResponse("sent"));
    requestTmuxCapture.mockResolvedValueOnce(captureResponse({ status: "failed", reason: "no pane" }));
    const run = createServerShellExecutor({ sessionId: "s1" });
    const out = await run(exec, onLog);
    expect(out.observed).toBe(false);
    expect(out.blockedReason).toBe("출력 캡처 실패: no pane");
    expect(onLog).not.toHaveBeenCalled();
  });

  it("reports 서버 도달 불가 when the dispatch call itself throws", async () => {
    requestTmuxDispatch.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const run = createServerShellExecutor({ sessionId: "s1" });
    const out = await run(exec, onLog);
    expect(out.observed).toBe(false);
    expect(out.blockedReason).toBe("서버 도달 불가: ECONNREFUSED");
    expect(requestTmuxCapture).not.toHaveBeenCalled();
  });
});
