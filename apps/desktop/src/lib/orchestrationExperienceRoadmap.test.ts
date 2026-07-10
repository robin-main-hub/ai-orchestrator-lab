import { describe, expect, it } from "vitest";
import type { OperatorCockpitSnapshot } from "@ai-orchestrator/protocol";
import { createOrchestrationMaturityReport } from "./orchestrationMaturity";
import { createSettingsDiagnostics } from "./settingsDiagnostics";
import { createExperienceRoadmap } from "./orchestrationExperienceRoadmap";

const baseSnapshot: OperatorCockpitSnapshot = {
  id: "cockpit_test",
  approvals: [],
  dispatchHistory: [],
  fleet: [
    {
      blockedReason: undefined,
      branch: "main",
      role: "orchestrator",
      statusRingColor: "gray",
      status: "idle",
      workerId: "agent_orchestrator",
      worktree: "main",
    },
  ],
  handoffs: [],
  memory: {
    contextReasons: [],
    contradictionWarnings: [],
    dgxMirrorHealth: "healthy",
    macBookAuthorityEnabled: true,
  },
  recovery: {
    healthIndicators: [],
    offlineResumeSupported: true,
    outboxSyncStatus: "synced",
  },
  routing: {
    costBadge: "medium",
    fallbackStatus: "available",
    providerLabel: "MiMo",
    selectedModelId: "mimo-v2.5-pro",
    speedBadge: "fast",
    trustBadge: "trusted",
  },
  timestamp: "2026-06-07T00:00:00.000Z",
};

describe("orchestrationExperienceRoadmap", () => {
  it("성숙한 OS를 위한 20개 큰 바위 축을 고정한다", () => {
    const maturity = createOrchestrationMaturityReport({
      attachments: { acceptedTypeCount: 4, hasProcessingPipeline: true, pendingCount: 0 },
      controlQueue: { connectedLaneCount: 6, pendingApprovalCount: 0, workItemProjectionCount: 4 },
      debate: { codingImpactCount: 2, decisionCount: 1, hasCodingPacketProjection: true, readinessState: "ready" },
      e2e: { desktopTestCount: 506, hasProviderSmokeHarness: true, hasVisualSmokeChecklist: true },
      memory: { agentInstallCount: 18, curatorCandidateCount: 3, installedAgentCount: 18, promotedCount: 1 },
      onboarding: { blockingCheckCount: 0, passedCheckCount: 8, totalCheckCount: 8 },
      provider: { assignedAgentCount: 18, fallbackReadyCount: 2, profileCount: 6, smokeReadyCount: 3 },
      receipts: { receiptCount: 12, searchableCount: 12, unsafeReceiptCount: 0 },
      tmux: { hasRecoveryPlan: true, paneCount: 8, timelineBlockCount: 12 },
    });
    const diagnostics = createSettingsDiagnostics({
      agentCount: 18,
      enabledProviderCount: 6,
      memoryAdapterStatus: "ready",
      providerSmokeReadyCount: 3,
      runtimeStatus: "online",
      workerCount: 18,
    });

    const roadmap = createExperienceRoadmap({
      diagnostics,
      maturity,
      snapshot: baseSnapshot,
      workTraceItems: [{
        id: "trace_1",
        kind: "conversation",
        receiptStatus: "checkpointed",
        safetyLabel: "검색 가능",
        searchable: true,
        searchText: "ok",
        title: "브리핑",
        trace: { groups: [] },
      }],
    });

    expect(roadmap).toHaveLength(20);
    expect(roadmap.map((item) => item.label)).toContain("에이전트별 진짜 대화방");
    expect(roadmap.map((item) => item.label)).toContain("명령 팔레트 문법");
    expect(roadmap.map((item) => item.label)).toContain("Tmux block log");
    expect(roadmap.map((item) => item.label)).toContain("에이전트별 도구/스킬 카드");
    expect(roadmap.filter((item) => item.status === "blocked")).toHaveLength(0);
  });

  it("마스킹 실패와 설정 차단은 완료처럼 보이지 않게 막힌 축으로 올린다", () => {
    const maturity = createOrchestrationMaturityReport({
      attachments: { acceptedTypeCount: 0, hasProcessingPipeline: false, pendingCount: 0 },
      controlQueue: { connectedLaneCount: 4, pendingApprovalCount: 0, workItemProjectionCount: 2 },
      debate: { codingImpactCount: 0, decisionCount: 0, hasCodingPacketProjection: false, readinessState: "blocked" },
      e2e: { desktopTestCount: 0, hasProviderSmokeHarness: false, hasVisualSmokeChecklist: false },
      memory: { agentInstallCount: 18, curatorCandidateCount: 0, installedAgentCount: 10, promotedCount: 0 },
      onboarding: { blockingCheckCount: 1, passedCheckCount: 4, totalCheckCount: 5 },
      provider: { assignedAgentCount: 8, fallbackReadyCount: 0, profileCount: 6, smokeReadyCount: 1 },
      receipts: { receiptCount: 1, searchableCount: 0, unsafeReceiptCount: 1 },
      tmux: { hasRecoveryPlan: false, paneCount: 0, timelineBlockCount: 0 },
    });
    const diagnostics = createSettingsDiagnostics({
      agentCount: 18,
      enabledProviderCount: 0,
      memoryAdapterStatus: "error",
      providerSmokeReadyCount: 0,
      runtimeStatus: "offline",
      workerCount: 0,
    });

    const roadmap = createExperienceRoadmap({
      diagnostics,
      maturity,
      snapshot: baseSnapshot,
      workTraceItems: [{
        id: "trace_unsafe",
        kind: "conversation",
        receiptStatus: "blocked",
        safetyLabel: "검색 제외 필요",
        searchable: false,
        searchText: "unsafe",
        title: "위험",
        trace: { groups: [] },
      }],
    });

    expect(roadmap.find((item) => item.id === "security_masking")?.status).toBe("blocked");
    expect(roadmap.find((item) => item.id === "production_readiness")?.status).toBe("blocked");
  });
});
