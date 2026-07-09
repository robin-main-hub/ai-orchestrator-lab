import { describe, expect, it, vi } from "vitest";
import { createClosedLoopEffects, pollForApprovalDecision, type ClosedLoopRuntimeDeps } from "./closedLoopRuntime";

function baseDeps(overrides: Partial<ClosedLoopRuntimeDeps> = {}): ClosedLoopRuntimeDeps {
  return {
    sessionId: "session_test",
    role: "qa",
    paneId: "%1",
    awaitApprovalDecision: async () => "approved",
    newId: (stepIndex) => `cmd_${stepIndex}`,
    now: () => "2026-06-10T00:00:00.000Z",
    ...overrides,
  };
}

const dispatchResponse = (status: string, sourceItemId = "cmd_0") =>
  ({
    intent: {},
    permission: { decision: "approval_required", requestedLevels: [], reason: "" },
    approval: { sourceItemId },
    dispatch: { attempted: false, status, reason: status },
  }) as any;

describe("createClosedLoopEffects.dispatch (mode A)", () => {
  it("waits for human approval then replays to execute", async () => {
    const replayClient = vi.fn().mockResolvedValue({ status: "replayed", approval: {}, replay: {}, result: {} });
    const dispatchClient = vi.fn().mockResolvedValue(dispatchResponse("pending_approval", "cmd_0"));
    const awaitApprovalDecision = vi.fn().mockResolvedValue("approved" as const);

    const effects = createClosedLoopEffects(baseDeps({ dispatchClient, replayClient, awaitApprovalDecision }));
    await effects.dispatch("run tests", { stepIndex: 0 });

    expect(dispatchClient).toHaveBeenCalledOnce();
    expect(awaitApprovalDecision).toHaveBeenCalledWith("cmd_0", { command: "run tests", stepIndex: 0 });
    expect(replayClient).toHaveBeenCalledOnce();
    expect(replayClient).toHaveBeenCalledWith(
      expect.objectContaining({ request: expect.objectContaining({ sourceItemId: "cmd_0" }) }),
    );
  });

  it("throws and does not replay when the human rejects", async () => {
    const replayClient = vi.fn();
    const dispatchClient = vi.fn().mockResolvedValue(dispatchResponse("pending_approval"));
    const effects = createClosedLoopEffects(
      baseDeps({ dispatchClient, replayClient, awaitApprovalDecision: async () => "rejected" }),
    );
    await expect(effects.dispatch("rm -rf x", { stepIndex: 0 })).rejects.toThrow(/approval rejected/);
    expect(replayClient).not.toHaveBeenCalled();
  });

  it("throws on a blocked dispatch without waiting for approval", async () => {
    const awaitApprovalDecision = vi.fn();
    const dispatchClient = vi.fn().mockResolvedValue(dispatchResponse("blocked"));
    const effects = createClosedLoopEffects(baseDeps({ dispatchClient, awaitApprovalDecision }));
    await expect(effects.dispatch("bad", { stepIndex: 0 })).rejects.toThrow(/dispatch blocked/);
    expect(awaitApprovalDecision).not.toHaveBeenCalled();
  });

  it("returns without replay when the gate already executed (sent/dry_run)", async () => {
    const replayClient = vi.fn();
    const dispatchClient = vi.fn().mockResolvedValue(dispatchResponse("dry_run"));
    const effects = createClosedLoopEffects(baseDeps({ dispatchClient, replayClient }));
    await effects.dispatch("echo ok", { stepIndex: 0 });
    expect(replayClient).not.toHaveBeenCalled();
  });

  it("full-auto: an auto-grant strategy resolves a pending DANGEROUS dispatch immediately (no human wait) then replays", async () => {
    const replayClient = vi.fn().mockResolvedValue({ status: "replayed", approval: {}, replay: {}, result: {} });
    const dispatchClient = vi.fn().mockResolvedValue(dispatchResponse("pending_approval", "cmd_0"));
    // 완전 자동 전략을 흉내낸 즉시-승인 콜백 — poll 없이 바로 "approved"를 돌려준다.
    const awaitApprovalDecision = vi.fn().mockResolvedValue("approved" as const);

    const effects = createClosedLoopEffects(baseDeps({ dispatchClient, replayClient, awaitApprovalDecision }));
    await effects.dispatch(["rm", "-rf", "build"].join(" "), { stepIndex: 0 });

    expect(awaitApprovalDecision).toHaveBeenCalledOnce();
    // 대기 없이 곧바로 replay 되어 실행된다 — 서버 게이트/기록은 그대로 round-trip.
    expect(replayClient).toHaveBeenCalledOnce();
  });
});

describe("createClosedLoopEffects.capture", () => {
  it("returns the captured output preview", async () => {
    const captureClient = vi.fn().mockResolvedValue({
      status: "captured",
      reason: "ok",
      payload: { outputPreview: "All tests passed", lineCount: 1 },
    } as any);
    const effects = createClosedLoopEffects(baseDeps({ captureClient }));
    expect(await effects.capture()).toBe("All tests passed");
  });

  it("returns empty string when capture is disabled / has no payload", async () => {
    const captureClient = vi.fn().mockResolvedValue({ status: "disabled", reason: "off" } as any);
    const effects = createClosedLoopEffects(baseDeps({ captureClient }));
    expect(await effects.capture()).toBe("");
  });
});

describe("pollForApprovalDecision", () => {
  it("resolves approved once the item is granted", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fetchQueue = vi
      .fn()
      .mockResolvedValueOnce({ approvals: [{ sourceItemId: "s1", state: "required" }], queue: [] } as any)
      .mockResolvedValueOnce({ approvals: [{ sourceItemId: "s1", state: "approved" }], queue: [] } as any);

    const outcome = await pollForApprovalDecision({
      sourceItemId: "s1",
      fetchQueue: fetchQueue as any,
      sleep,
      nowMs: () => 0,
    });
    expect(outcome).toBe("approved");
    expect(fetchQueue).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledOnce();
  });

  it("resolves rejected when the item is rejected", async () => {
    const fetchQueue = vi
      .fn()
      .mockResolvedValue({ approvals: [{ sourceItemId: "s1", state: "rejected" }], queue: [] } as any);
    const outcome = await pollForApprovalDecision({
      sourceItemId: "s1",
      fetchQueue: fetchQueue as any,
      sleep: async () => {},
      nowMs: () => 0,
    });
    expect(outcome).toBe("rejected");
  });

  it("resolves timeout (not rejected) when nobody decides within the window", async () => {
    // 사람이 거부한 적 없는데 "거부됨"으로 보이던 회귀 케이스 — 타임아웃은 별도 상태다
    const fetchQueue = vi.fn().mockResolvedValue({ approvals: [], queue: [] } as any);
    let t = 0;
    const outcome = await pollForApprovalDecision({
      sourceItemId: "missing",
      fetchQueue: fetchQueue as any,
      sleep: async () => {
        t += 1_000;
      },
      timeoutMs: 1_000,
      nowMs: () => t,
    });
    expect(outcome).toBe("timeout");
  });
});
