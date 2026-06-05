import { describe, expect, it } from "vitest";
import type { TerminalTimelineBlock } from "@ai-orchestrator/protocol";
import { deriveTmuxPaneLifecycleSummary } from "./tmuxPaneLifecycle";

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
    outputPreview: patch.outputPreview,
    redactionApplied: patch.redactionApplied ?? false,
    relatedEventIds: patch.relatedEventIds ?? [],
    createdAt: patch.createdAt ?? "2026-06-05T00:00:00.000Z",
  };
}

describe("deriveTmuxPaneLifecycleSummary", () => {
  it("pending approval block이 있으면 warn 상태를 만든다", () => {
    const summary = deriveTmuxPaneLifecycleSummary({
      paneState: "dispatch gated",
      timelineBlocks: [block({ id: "b1", kind: "approval", status: "pending_approval", summary: "승인 필요" })],
    });

    expect(summary.tone).toBe("warn");
    expect(summary.pendingApprovalCount).toBe(1);
    expect(summary.lastBlockLabel).toBe("승인 / 승인 대기");
  });

  it("blocked/failed block이 있으면 danger 상태를 우선한다", () => {
    const summary = deriveTmuxPaneLifecycleSummary({
      paneState: "active",
      timelineBlocks: [
        block({ id: "b1", kind: "approval", status: "pending_approval" }),
        block({ id: "b2", kind: "dispatch", status: "blocked", summary: "승인 거절" }),
      ],
    });

    expect(summary.tone).toBe("danger");
    expect(summary.failedCount).toBe(1);
    expect(summary.detail).toBe("승인 거절");
  });

  it("completed block은 ok 상태로 요약한다", () => {
    const summary = deriveTmuxPaneLifecycleSummary({
      paneState: "ready",
      timelineBlocks: [block({ id: "b1", kind: "capture", status: "completed", summary: "캡처 완료" })],
    });

    expect(summary.tone).toBe("ok");
    expect(summary.lastBlockLabel).toBe("캡처 / 완료");
  });
});
