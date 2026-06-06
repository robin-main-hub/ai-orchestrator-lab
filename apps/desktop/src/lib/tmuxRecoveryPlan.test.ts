import { describe, expect, it } from "vitest";
import type { TerminalTimelineBlock } from "@ai-orchestrator/protocol";
import { deriveTmuxRecoveryPlan } from "./tmuxRecoveryPlan";

function block(patch: Partial<TerminalTimelineBlock> & Pick<TerminalTimelineBlock, "id" | "kind" | "status">): TerminalTimelineBlock {
  return {
    id: patch.id,
    paneId: "role:code",
    role: "code",
    host: "dgx_02",
    sessionId: "session_main",
    terminalSessionId: "terminal_session_ai_swarm",
    kind: patch.kind,
    status: patch.status,
    title: patch.title ?? "테스트 블록",
    summary: patch.summary ?? "요약 없음",
    outputPreview: patch.outputPreview ?? "",
    redactionApplied: patch.redactionApplied ?? true,
    relatedEventIds: [],
    createdAt: patch.createdAt ?? "2026-06-06T12:00:00.000Z",
  };
}

describe("tmuxRecoveryPlan", () => {
  it("승인 대기 상태는 실행보다 승인 확인을 우선한다", () => {
    const plan = deriveTmuxRecoveryPlan({
      lastCaptureAt: "2026-06-06T12:00:00.000Z",
      now: "2026-06-06T12:00:30.000Z",
      paneState: "dispatch gated",
      timelineBlocks: [block({ id: "b1", kind: "approval", status: "pending_approval" })],
    });

    expect(plan.state).toBe("needs_approval");
    expect(plan.primaryAction).toBe("승인 대기열 확인");
    expect(plan.canRetry).toBe(false);
  });

  it("오래된 캡처는 재캡처 계획을 만든다", () => {
    const plan = deriveTmuxRecoveryPlan({
      lastCaptureAt: "2026-06-06T11:50:00.000Z",
      now: "2026-06-06T12:00:00.000Z",
      paneState: "ready",
      staleAfterMs: 5 * 60 * 1000,
      timelineBlocks: [block({ id: "b1", kind: "dispatch", status: "completed" })],
    });

    expect(plan.state).toBe("needs_capture");
    expect(plan.primaryAction).toBe("pane 출력 재캡처");
    expect(plan.canRetry).toBe(false);
  });

  it("실패 block은 재실행 가능 복구 계획을 만든다", () => {
    const plan = deriveTmuxRecoveryPlan({
      lastCaptureAt: "2026-06-06T12:00:00.000Z",
      now: "2026-06-06T12:00:30.000Z",
      paneState: "failed",
      timelineBlocks: [block({ id: "b1", kind: "dispatch", status: "failed", summary: "스크립트 실패" })],
    });

    expect(plan.state).toBe("retryable");
    expect(plan.primaryAction).toBe("마지막 명령 재실행 준비");
    expect(plan.reason).toContain("스크립트 실패");
    expect(plan.canRetry).toBe(true);
  });
});
