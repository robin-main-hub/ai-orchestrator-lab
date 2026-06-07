import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { OperatorCockpitSnapshot } from "@ai-orchestrator/protocol";
import { createOrchestrationMaturityReport } from "../../lib/orchestrationMaturity";
import { createProductionSmokePlan } from "../../lib/productionSmokePlan";
import { createSettingsDiagnostics } from "../../lib/settingsDiagnostics";
import type { WorkTraceSearchItem } from "../../lib/workTraceSearch";
import { OperatorCockpit } from "./OperatorCockpit";

const snapshot: OperatorCockpitSnapshot = {
  approvals: [],
  dispatchHistory: [],
  fleet: [
    {
      role: "orchestrator",
      status: "working",
      statusRingColor: "green",
      workerId: "agent_orchestrator",
    },
  ],
  handoffs: [],
  id: "snapshot_test",
  memory: {
    contextReasons: ["대화 기억 후보"],
    contradictionWarnings: [],
    dgxMirrorHealth: "healthy",
    macBookAuthorityEnabled: true,
  },
  recovery: {
    healthIndicators: ["정상"],
    offlineResumeSupported: true,
    outboxSyncStatus: "synced",
  },
  routing: {
    costBadge: "medium",
    fallbackStatus: "available",
    selectedModelId: "mimo-v2.5-pro",
    speedBadge: "fast",
    trustBadge: "limited",
  },
  timestamp: "2026-06-06T00:00:00.000Z",
};

const workTraceItem: WorkTraceSearchItem = {
  id: "trace_1",
  kind: "conversation",
  receiptStatus: "checkpointed",
  safetyLabel: "마스킹 점검 통과",
  searchText: "마키마 대화 기억 후보",
  searchable: true,
  title: "마키마 대화 기억 후보",
  trace: {
    groups: [],
    receipt: {
      label: "에이전트 실행 영수증",
      status: "checkpointed",
      items: [
        { label: "범위", value: "대화" },
        { label: "기준점", value: "message_1" },
        { label: "마스킹", value: "적용됨" },
      ],
    },
  },
};

describe("OperatorCockpit", () => {
  it("세부 정보가 열려도 작업 영수증 장부를 한 번만 렌더링한다", () => {
    const diagnostics = createSettingsDiagnostics({
      agentCount: 1,
      enabledProviderCount: 1,
      memoryAdapterStatus: "ready",
      providerSmokeReadyCount: 1,
      runtimeStatus: "online",
      workerCount: 1,
    });
    const maturity = createOrchestrationMaturityReport({
      attachments: { acceptedTypeCount: 2, hasProcessingPipeline: true, pendingCount: 0 },
      controlQueue: { connectedLaneCount: 6, pendingApprovalCount: 0, workItemProjectionCount: 1 },
      debate: { codingImpactCount: 1, decisionCount: 1, hasCodingPacketProjection: true, readinessState: "ready" },
      e2e: { desktopTestCount: 357, hasProviderSmokeHarness: true, hasVisualSmokeChecklist: true },
      memory: { agentInstallCount: 1, curatorCandidateCount: 1, installedAgentCount: 1, promotedCount: 1 },
      onboarding: { blockingCheckCount: 0, passedCheckCount: 1, totalCheckCount: 1 },
      provider: { assignedAgentCount: 1, fallbackReadyCount: 1, profileCount: 1, smokeReadyCount: 1 },
      receipts: { receiptCount: 1, searchableCount: 1, unsafeReceiptCount: 0 },
      tmux: { hasRecoveryPlan: true, paneCount: 1, timelineBlockCount: 1 },
    });
    const smokePlan = createProductionSmokePlan({ includeLiveProvider: false, includeVisual: true });

    const html = renderToStaticMarkup(
      <OperatorCockpit
        defaultDetailsOpen
        readiness={{ diagnostics, maturity, smokePlan, workTraceItems: [workTraceItem] }}
        snapshot={snapshot}
      />,
    );

    expect(html.match(/작업 영수증/g)?.length).toBe(1);
  });

  it("다음 행동을 읽기 전용 배지가 아니라 명확한 CTA 버튼으로 렌더링한다", () => {
    const diagnostics = createSettingsDiagnostics({
      agentCount: 1,
      enabledProviderCount: 1,
      memoryAdapterStatus: "ready",
      providerSmokeReadyCount: 1,
      runtimeStatus: "online",
      workerCount: 1,
    });
    const maturity = createOrchestrationMaturityReport({
      attachments: { acceptedTypeCount: 2, hasProcessingPipeline: true, pendingCount: 0 },
      controlQueue: { connectedLaneCount: 6, pendingApprovalCount: 1, workItemProjectionCount: 1 },
      debate: { codingImpactCount: 1, decisionCount: 1, hasCodingPacketProjection: true, readinessState: "ready" },
      e2e: { desktopTestCount: 357, hasProviderSmokeHarness: true, hasVisualSmokeChecklist: true },
      memory: { agentInstallCount: 1, curatorCandidateCount: 1, installedAgentCount: 1, promotedCount: 1 },
      onboarding: { blockingCheckCount: 0, passedCheckCount: 1, totalCheckCount: 1 },
      provider: { assignedAgentCount: 1, fallbackReadyCount: 1, profileCount: 1, smokeReadyCount: 1 },
      receipts: { receiptCount: 1, searchableCount: 1, unsafeReceiptCount: 0 },
      tmux: { hasRecoveryPlan: true, paneCount: 1, timelineBlockCount: 1 },
    });
    const smokePlan = createProductionSmokePlan({ includeLiveProvider: false, includeVisual: true });

    const html = renderToStaticMarkup(
      <OperatorCockpit
        readiness={{
          diagnostics,
          maturity,
          nextActions: [
            {
              ctaLabel: "승인 대기열 보기",
              id: "approval_terminal_run",
              label: "승인 필요: terminal_run from agent",
              priority: "high",
              source: "approval",
              targetSurface: "approvals",
            },
          ],
          smokePlan,
          workTraceItems: [workTraceItem],
        }}
        snapshot={snapshot}
      />,
    );

    expect(html).toContain("<button");
    expect(html).toContain("다음 행동");
    expect(html).toContain("승인 필요: terminal_run from agent");
    expect(html).toContain("승인 대기열 보기");
  });

  it("워커 행에서 해당 에이전트 대화방을 여는 CTA를 렌더링한다", () => {
    const html = renderToStaticMarkup(
      <OperatorCockpit
        onOpenAgentConversation={() => {}}
        snapshot={snapshot}
      />,
    );

    expect(html).toContain("대화 열기");
    expect(html).toContain("마키마 대화 열기");
  });

  it("모델 경로 힌트에서 provider fallback 문구를 한국어로 렌더링한다", () => {
    const html = renderToStaticMarkup(<OperatorCockpit snapshot={snapshot} />);

    expect(html).toContain("공급자 대기");
    expect(html).not.toContain("provider 대기");
  });
});
