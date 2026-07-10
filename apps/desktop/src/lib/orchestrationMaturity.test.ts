import { describe, expect, it } from "vitest";
import {
  BIG_ROCK_COMPLETION_TARGETS,
  createOrchestrationMaturityReport,
} from "./orchestrationMaturity";

describe("orchestrationMaturity", () => {
  it("2번부터 10번까지 실사용 성숙도 축을 빠짐없이 고정한다", () => {
    const report = createOrchestrationMaturityReport({
      attachments: { acceptedTypeCount: 4, hasProcessingPipeline: true, pendingCount: 0 },
      controlQueue: { connectedLaneCount: 6, pendingApprovalCount: 2, workItemProjectionCount: 4 },
      debate: { codingImpactCount: 2, decisionCount: 1, hasCodingPacketProjection: true, readinessState: "ready" },
      e2e: { desktopTestCount: 306, hasProviderSmokeHarness: true, hasVisualSmokeChecklist: true },
      memory: { agentInstallCount: 18, curatorCandidateCount: 3, installedAgentCount: 18, promotedCount: 1 },
      onboarding: { blockingCheckCount: 0, passedCheckCount: 8, totalCheckCount: 8 },
      provider: { assignedAgentCount: 18, fallbackReadyCount: 2, profileCount: 6, smokeReadyCount: 3 },
      receipts: { receiptCount: 12, searchableCount: 12, unsafeReceiptCount: 0 },
      tmux: { hasRecoveryPlan: true, paneCount: 8, timelineBlockCount: 12 },
    });

    expect(report.items.map((item) => item.id)).toEqual(BIG_ROCK_COMPLETION_TARGETS.map((target) => target.id));
    expect(report.items).toHaveLength(9);
    expect(report.readyCount).toBe(9);
    expect(report.overallStatus).toBe("ready");
    expect(report.nextActions).toEqual([]);
  });

  it("부족한 축은 조용히 완료로 치지 않고 다음 액션을 만든다", () => {
    const report = createOrchestrationMaturityReport({
      attachments: { acceptedTypeCount: 0, hasProcessingPipeline: false, pendingCount: 0 },
      controlQueue: { connectedLaneCount: 4, pendingApprovalCount: 1, workItemProjectionCount: 2 },
      debate: { codingImpactCount: 0, decisionCount: 0, hasCodingPacketProjection: false, readinessState: "blocked" },
      e2e: { desktopTestCount: 0, hasProviderSmokeHarness: false, hasVisualSmokeChecklist: false },
      memory: { agentInstallCount: 18, curatorCandidateCount: 0, installedAgentCount: 12, promotedCount: 0 },
      onboarding: { blockingCheckCount: 2, passedCheckCount: 3, totalCheckCount: 8 },
      provider: { assignedAgentCount: 8, fallbackReadyCount: 0, profileCount: 6, smokeReadyCount: 1 },
      receipts: { receiptCount: 3, searchableCount: 3, unsafeReceiptCount: 1 },
      tmux: { hasRecoveryPlan: false, paneCount: 0, timelineBlockCount: 0 },
    });

    expect(report.overallStatus).toBe("blocked");
    expect(report.readyCount).toBe(0);
    const visibleCopy = report.items
      .flatMap((item) => [item.label, item.detail, item.nextAction])
      .concat(report.nextActions)
      .filter(Boolean)
      .join("\n");

    expect(report.nextActions).toContain("작업 대기열 6개 흐름을 모두 작업 항목/핸드오프/승인 결과로 연결");
    expect(report.nextActions).toContain("토론 결정 노드에서 코딩 패킷 후보와 작업 항목을 생성");
    expect(report.nextActions).toContain("공개 브리핑 마스킹 실패 1건 해결");
    expect(visibleCopy).not.toContain("Control Queue");
    expect(visibleCopy).not.toContain("WorkItem");
    expect(visibleCopy).not.toContain("Coding Packet");
    expect(visibleCopy).not.toContain("Provider");
    expect(visibleCopy).not.toContain("fallback");
    expect(visibleCopy).not.toContain("smoke");
    expect(visibleCopy).not.toContain("pane");
    expect(visibleCopy).not.toContain("timeline");
    expect(visibleCopy).not.toContain("desktop test");
    expect(visibleCopy).not.toContain("visual");
    expect(visibleCopy).not.toContain("blocked");
  });

  it("작성 중인 첨부가 있으면 다음 행동에 처리 계획 확인을 올린다", () => {
    const report = createOrchestrationMaturityReport({
      attachments: { acceptedTypeCount: 4, hasProcessingPipeline: true, pendingCount: 2 },
      controlQueue: { connectedLaneCount: 6, pendingApprovalCount: 0, workItemProjectionCount: 4 },
      debate: { codingImpactCount: 2, decisionCount: 1, hasCodingPacketProjection: true, readinessState: "ready" },
      e2e: { desktopTestCount: 306, hasProviderSmokeHarness: true, hasVisualSmokeChecklist: true },
      memory: { agentInstallCount: 18, curatorCandidateCount: 3, installedAgentCount: 18, promotedCount: 1 },
      onboarding: { blockingCheckCount: 0, passedCheckCount: 8, totalCheckCount: 8 },
      provider: { assignedAgentCount: 18, fallbackReadyCount: 2, profileCount: 6, smokeReadyCount: 3 },
      receipts: { receiptCount: 12, searchableCount: 12, unsafeReceiptCount: 0 },
      tmux: { hasRecoveryPlan: true, paneCount: 8, timelineBlockCount: 12 },
    });

    expect(report.overallStatus).toBe("needs_work");
    expect(report.nextActions).toEqual(["첨부 2개 처리 계획을 확인하고 대화에 전송"]);
  });
});
