import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  DesktopTmuxCaptureResponse,
  DesktopTmuxDispatchResponse,
} from "../runtime/stage33TmuxServer";
import type { OpenCodeEvent } from "./openCodeRunner";

// Characterization tests for createServerOpenCodeExecutor's honesty cascade (no
// behavior change). It is the OpenCode sibling of serverShellExecutor: same
// dispatch→capture gate, but it (1) builds the command preview via shellQuote
// over exec.argv and (2) on a real capture parses --format json output through
// parseOpenCodeJsonStream and replays each event via onEvent, returning
// events + observed:true. Every non-sent/non-captured/throw branch returns
// observed:false with an honest blockedReason (no fake success). The two network
// calls are mocked at the ../runtime/stage33TmuxServer seam; parseOpenCodeJsonStream
// runs for real. No socket, no DB.

const requestTmuxDispatch = vi.fn();
const requestTmuxCapture = vi.fn();

vi.mock("../runtime/stage33TmuxServer", () => ({
  requestTmuxDispatch: (...args: unknown[]) => requestTmuxDispatch(...args),
  requestTmuxCapture: (...args: unknown[]) => requestTmuxCapture(...args),
}));

import { createServerOpenCodeExecutor } from "./serverOpenCodeExecutor";

function dispatchResponse(status: string, reason = "r"): DesktopTmuxDispatchResponse {
  return { dispatch: { attempted: true, status, reason } } as unknown as DesktopTmuxDispatchResponse;
}

function captureResponse(over: Partial<DesktopTmuxCaptureResponse> = {}): DesktopTmuxCaptureResponse {
  return { status: "failed", reason: "r", ...over } as unknown as DesktopTmuxCaptureResponse;
}

const exec = { argv: ["run", "--format", "json", "fix the bug"], repoRoot: "/repo" } as never;

afterEach(() => {
  requestTmuxDispatch.mockReset();
  requestTmuxCapture.mockReset();
});

describe("createServerOpenCodeExecutor honesty cascade", () => {
  it("reports the opencode 승인 대기 reason (and never captures) for pending_approval/recorded", async () => {
    const onEvent = vi.fn<(e: OpenCodeEvent) => void>();
    for (const status of ["pending_approval", "recorded"]) {
      requestTmuxDispatch.mockResolvedValueOnce(dispatchResponse(status));
      const run = createServerOpenCodeExecutor({ sessionId: "s1" });
      const out = await run(exec, onEvent);
      expect(out.observed).toBe(false);
      expect(out.events).toEqual([]);
      expect(out.blockedReason).toBe("승인 대기 — 관제판 큐에서 승인하면 opencode가 실행됩니다.");
    }
    expect(requestTmuxCapture).not.toHaveBeenCalled();
    expect(onEvent).not.toHaveBeenCalled();
  });

  it("reports 실행 불가 with the raw status and reason for any other non-sent status", async () => {
    requestTmuxDispatch.mockResolvedValueOnce(dispatchResponse("blocked", "gate off"));
    const out = await createServerOpenCodeExecutor({ sessionId: "s1" })(exec, vi.fn());
    expect(out.observed).toBe(false);
    expect(out.blockedReason).toBe("실행 불가 (blocked): gate off");
    expect(requestTmuxCapture).not.toHaveBeenCalled();
  });

  it("quotes argv with spaces into the dispatched opencode command preview", async () => {
    requestTmuxDispatch.mockResolvedValueOnce(dispatchResponse("blocked"));
    await createServerOpenCodeExecutor({ sessionId: "s1" })(exec, vi.fn());
    const sent = requestTmuxDispatch.mock.calls[0]![0] as { request: { commandPreview: string } };
    expect(sent.request.commandPreview).toBe("opencode run --format json 'fix the bug'");
  });

  it("parses the captured json stream into events and replays each via onEvent when sent", async () => {
    requestTmuxDispatch.mockResolvedValueOnce(dispatchResponse("sent"));
    requestTmuxCapture.mockResolvedValueOnce(
      captureResponse({
        status: "captured",
        payload: {
          outputPreview: 'plain prose line\n{"type":"message","text":"hello"}\n{"type":"done","ok":true}',
        } as never,
      }),
    );
    const onEvent = vi.fn<(e: OpenCodeEvent) => void>();
    const out = await createServerOpenCodeExecutor({ sessionId: "s1" })(exec, onEvent);
    expect(out.observed).toBe(true);
    expect(out.events).toEqual([
      { type: "message", text: "hello" },
      { type: "done", ok: true },
    ]);
    expect(onEvent).toHaveBeenCalledTimes(2);
    expect(onEvent).toHaveBeenNthCalledWith(1, { type: "message", text: "hello" });
  });

  it("reports 출력 캡처 실패 when sent but capture does not come back captured", async () => {
    requestTmuxDispatch.mockResolvedValueOnce(dispatchResponse("sent"));
    requestTmuxCapture.mockResolvedValueOnce(captureResponse({ status: "failed", reason: "no pane" }));
    const onEvent = vi.fn<(e: OpenCodeEvent) => void>();
    const out = await createServerOpenCodeExecutor({ sessionId: "s1" })(exec, onEvent);
    expect(out.observed).toBe(false);
    expect(out.events).toEqual([]);
    expect(out.blockedReason).toBe("출력 캡처 실패: no pane");
    expect(onEvent).not.toHaveBeenCalled();
  });

  it("reports 서버 도달 불가 when the dispatch call itself throws", async () => {
    requestTmuxDispatch.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const out = await createServerOpenCodeExecutor({ sessionId: "s1" })(exec, vi.fn());
    expect(out.observed).toBe(false);
    expect(out.blockedReason).toBe("서버 도달 불가: ECONNREFUSED");
    expect(requestTmuxCapture).not.toHaveBeenCalled();
  });
});
