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
      label: "에이전트 실행 브리핑",
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
  it("최근 작업 브리핑은 첫 화면이 아니라 세부 정보 장부로만 보낸다", () => {
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

    // 펼친 상태(L2+L3)에서 기억 카드가 렌더된다 — 기본 접힘은 별도 테스트에서 검증
    const html = renderToStaticMarkup(
      <OperatorCockpit
        defaultDetailsOpen
        readiness={{ diagnostics, maturity, smokePlan, workTraceItems: [workTraceItem] }}
        snapshot={snapshot}
      />,
    );

    expect(html).toContain("대화 기억 후보");
    expect(html).not.toContain("최근 완료 기록");
  });

  it("기본은 L1 건강 히어로만 — 본문/세부는 펼쳐야 보인다 (정보 과부하 해소)", () => {
    const collapsed = renderToStaticMarkup(
      <OperatorCockpit
        readiness={{
          diagnostics: createSettingsDiagnostics({
            agentCount: 1,
            enabledProviderCount: 1,
            memoryAdapterStatus: "ready",
            providerSmokeReadyCount: 1,
            runtimeStatus: "online",
            workerCount: 1,
          }),
          maturity: createOrchestrationMaturityReport({
            attachments: { acceptedTypeCount: 2, hasProcessingPipeline: true, pendingCount: 0 },
            controlQueue: { connectedLaneCount: 6, pendingApprovalCount: 1, workItemProjectionCount: 1 },
            debate: { codingImpactCount: 1, decisionCount: 1, hasCodingPacketProjection: true, readinessState: "ready" },
            e2e: { desktopTestCount: 1, hasProviderSmokeHarness: true, hasVisualSmokeChecklist: true },
            memory: { agentInstallCount: 1, curatorCandidateCount: 1, installedAgentCount: 1, promotedCount: 1 },
            onboarding: { blockingCheckCount: 0, passedCheckCount: 1, totalCheckCount: 1 },
            provider: { assignedAgentCount: 1, fallbackReadyCount: 1, profileCount: 1, smokeReadyCount: 1 },
            receipts: { receiptCount: 1, searchableCount: 1, unsafeReceiptCount: 0 },
            tmux: { hasRecoveryPlan: true, paneCount: 1, timelineBlockCount: 1 },
          }),
          nextActions: [
            { ctaLabel: "승인 대기열 보기", id: "a", label: "승인 필요: 터미널 실행 권한", priority: "high", source: "approval", targetSurface: "approvals" },
          ],
          smokePlan: createProductionSmokePlan({ includeLiveProvider: false, includeVisual: true }),
          workTraceItems: [workTraceItem],
        }}
        snapshot={snapshot}
      />,
    );
    // L1: 건강 요약 + 가장 긴급한 액션 CTA가 보인다
    expect(collapsed).toContain("운영 건강 요약");
    expect(collapsed).toContain("승인 대기열 보기");
    expect(collapsed).toContain("전체 현황 펼치기");
    // L2/L3 콘텐츠와 세부 더미는 접혀서 안 보인다 (첫 화면 정보 격리)
    expect(collapsed).not.toContain("브리핑 로그");
    expect(collapsed).not.toContain("대화 기억 후보");
    expect(collapsed).not.toContain("GitHub #251");
  });

  it("세부 정보가 열려도 브리핑 로그를 한 번만 렌더링한다", () => {
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

    expect(html.match(/aria-label="브리핑 로그"/g)?.length).toBe(1);
  });

  it("다음 행동을 첫 화면의 지금 할 일 CTA와 접힌 후보로 렌더링한다", () => {
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
        defaultDetailsOpen
        readiness={{
          diagnostics,
          maturity,
          nextActions: [
            {
              ctaLabel: "승인 대기열 보기",
              id: "approval_terminal_run",
              label: "승인 필요: 터미널 실행 권한",
              priority: "high",
              source: "approval",
              targetSurface: "approvals",
            },
            {
              ctaLabel: "진단 보기",
              id: "diagnostics_0",
              label: "공급자 상태 점검을 다시 실행",
              priority: "warning",
              source: "diagnostics",
              targetSurface: "diagnostics",
            },
          ],
          smokePlan,
          workTraceItems: [workTraceItem],
        }}
        snapshot={snapshot}
      />,
    );

    expect(html).toContain("<button");
    expect(html).toContain("지금 할 일");
    expect(html).toContain("승인 필요: 터미널 실행 권한");
    expect(html).toContain("승인 대기열 보기");
    expect(html).toContain("다른 후보 1건");
    expect(html).not.toContain("terminal_run");
  });

  it("작전 지휘판에서 작업 흐름과 성과 장부를 한눈에 보여준다", () => {
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
        defaultDetailsOpen
        readiness={{
          diagnostics,
          maturity,
          nextActions: [
            {
              ctaLabel: "승인 대기열 보기",
              id: "approval_terminal_run",
              label: "승인 필요: 터미널 실행 권한",
              priority: "high",
              source: "approval",
              targetSurface: "approvals",
            },
          ],
          smokePlan,
          workTraceItems: [workTraceItem],
        }}
        snapshot={{
          ...snapshot,
          approvals: [
            {
              blockReason: "테스트 실행 승인",
              commandPreview: "pnpm test",
              evidenceRefs: [],
              payloadBindingStatus: "bound",
              securityRisk: "medium",
            },
          ],
          dispatchHistory: [
            {
              approvalState: "approved",
              createdAt: "2026-06-06T00:03:00.000Z",
              dispatchId: "approval_1",
              replayPayloadDigest: "sha256:test",
              requesterAgentId: "agent_executor",
              tamperWarning: false,
            },
          ],
        }}
      />,
    );

    expect(html).toContain("작전 지휘판");
    expect(html).toContain("작업 흐름");
    expect(html).toContain("승인 1건 대기");
    expect(html).toContain("워커 1명 작업 중");
    expect(html).toContain("성과 장부 1건");
    expect(html).toContain("승인 대기 열기");
    expect(html).toContain("성과 장부 열기");
    expect(html).toContain("워커 함대 보기");
    // 병합 후: NextActionStrip이 작전 지휘판 안으로 흡수돼 "지금 할 일"이 지휘판 영역에 있다
    expect(html).toContain("지금 할 일");
    const deckIdx = html.indexOf("작전 지휘판");
    const actionIdx = html.indexOf("지금 할 일");
    expect(actionIdx).toBeGreaterThan(deckIdx);
  });

  it("다음 할 일을 한 군데서만 말한다 — 지휘판의 중복 nextAction 제목(h2)을 제거했다", () => {
    const html = renderToStaticMarkup(
      <OperatorCockpit
        defaultDetailsOpen
        readiness={{
          diagnostics: createSettingsDiagnostics({
            agentCount: 1,
            enabledProviderCount: 1,
            memoryAdapterStatus: "ready",
            providerSmokeReadyCount: 1,
            runtimeStatus: "online",
            workerCount: 1,
          }),
          maturity: createOrchestrationMaturityReport({
            attachments: { acceptedTypeCount: 2, hasProcessingPipeline: true, pendingCount: 0 },
            controlQueue: { connectedLaneCount: 6, pendingApprovalCount: 1, workItemProjectionCount: 1 },
            debate: { codingImpactCount: 1, decisionCount: 1, hasCodingPacketProjection: true, readinessState: "ready" },
            e2e: { desktopTestCount: 357, hasProviderSmokeHarness: true, hasVisualSmokeChecklist: true },
            memory: { agentInstallCount: 1, curatorCandidateCount: 1, installedAgentCount: 1, promotedCount: 1 },
            onboarding: { blockingCheckCount: 0, passedCheckCount: 1, totalCheckCount: 1 },
            provider: { assignedAgentCount: 1, fallbackReadyCount: 1, profileCount: 1, smokeReadyCount: 1 },
            receipts: { receiptCount: 1, searchableCount: 1, unsafeReceiptCount: 0 },
            tmux: { hasRecoveryPlan: true, paneCount: 1, timelineBlockCount: 1 },
          }),
          nextActions: [
            {
              ctaLabel: "승인 대기열 보기",
              id: "approval_unique_label",
              label: "유일라벨_다음할일_X",
              priority: "high",
              source: "approval",
              targetSurface: "approvals",
            },
          ],
          smokePlan: createProductionSmokePlan({ includeLiveProvider: false, includeVisual: true }),
          workTraceItems: [workTraceItem],
        }}
        snapshot={snapshot}
      />,
    );
    // 지금 할 일(NextActionStrip)은 살아있다
    expect(html).toContain("지금 할 일");
    expect(html).toContain("유일라벨_다음할일_X");
    // 병합 전 지휘판이 nextAction을 그대로 반복하던 h2(text-balance text-lg ...)는 사라졌다
    expect(html).not.toContain("text-balance text-lg font-semibold tracking-tight");
  });

  it("기본 세부 정보가 열린 상태에서는 다음 행동 목적지 안내를 표시하지 않는다", () => {
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
        readiness={{
          diagnostics,
          maturity,
          nextActions: [
            {
              ctaLabel: "브리핑 점검",
              id: "receipt_unsafe",
              label: "공개 브리핑 마스킹 점검: 1건",
              priority: "high",
              source: "receipt",
              targetSurface: "receipts",
            },
          ],
          smokePlan,
          workTraceItems: [workTraceItem],
        }}
        snapshot={snapshot}
      />,
    );

    expect(html).toContain("브리핑 로그");
    expect(html).not.toContain("브리핑 로그에서 공개 마스킹 상태를 먼저 확인합니다.");
  });

  it("워커 행에서 해당 에이전트 대화방을 여는 CTA를 렌더링한다", () => {
    const html = renderToStaticMarkup(
      <OperatorCockpit
        defaultDetailsOpen
        onOpenAgentConversation={() => {}}
        snapshot={snapshot}
      />,
    );

    expect(html).toContain("대화 열기");
    expect(html).toContain("마키마 대화 열기");
  });

  it("모델 경로 힌트에서 provider fallback 문구를 한국어로 렌더링한다", () => {
    const html = renderToStaticMarkup(<OperatorCockpit defaultDetailsOpen snapshot={snapshot} />);

    expect(html).toContain("공급자 대기");
    expect(html).not.toContain("provider 대기");
  });

  it("서버 스냅샷이 붙지 않았을 때도 세부 정보에서 로컬 투영 상태를 확인할 수 있다", () => {
    const html = renderToStaticMarkup(
      <OperatorCockpit
        defaultDetailsOpen
        snapshot={{
          ...snapshot,
          recovery: {
            ...snapshot.recovery,
            healthIndicators: ["서버 스냅샷 미연결 · 로컬 투영 표시 중"],
          },
        }}
      />,
    );

    expect(html).toContain("로컬 투영");
    expect(html).toContain("서버 스냅샷 미연결");
  });

  it("필요한 실행 슬롯 인계는 Cockpit에서 바로 승인할 수 있게 CTA를 렌더링한다", () => {
    const html = renderToStaticMarkup(
      <OperatorCockpit
        defaultDetailsOpen
        onApproveHandoff={() => {}}
        snapshot={{
          ...snapshot,
          handoffs: [
            {
              approvalState: "required",
              evidenceRefs: [],
              id: "handoff_packet_1",
              missingInfoSlots: [],
              nextAction: "코딩 패킷을 실행 슬롯으로 넘길 준비가 됐습니다.",
              ownerAgentId: "agent_executor",
              payloadRef: "coding_packet://session_desktop_001",
              targetSurface: "execution_slot",
            },
          ],
        }}
      />,
    );

    expect(html).toContain("실행 슬롯 인계 승인");
    expect(html).toContain("코딩 패킷");
  });
});
