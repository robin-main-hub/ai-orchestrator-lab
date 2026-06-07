import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createOrchestrationMaturityReport } from "../../lib/orchestrationMaturity";
import { createProductionSmokePlan } from "../../lib/productionSmokePlan";
import { createSettingsDiagnostics } from "../../lib/settingsDiagnostics";
import { MaturityReadinessCard } from "./MaturityReadinessCard";

describe("MaturityReadinessCard", () => {
  it("성숙도, 설정 진단, smoke plan을 운영자가 읽을 수 있게 렌더링한다", () => {
    const maturity = createOrchestrationMaturityReport({
      attachments: { acceptedTypeCount: 4, hasProcessingPipeline: true, pendingCount: 0 },
      controlQueue: { connectedLaneCount: 6, pendingApprovalCount: 1, workItemProjectionCount: 4 },
      debate: { codingImpactCount: 2, decisionCount: 1, hasCodingPacketProjection: true, readinessState: "ready" },
      e2e: { desktopTestCount: 326, hasProviderSmokeHarness: true, hasVisualSmokeChecklist: true },
      memory: { agentInstallCount: 18, curatorCandidateCount: 1, installedAgentCount: 18, promotedCount: 1 },
      onboarding: { blockingCheckCount: 0, passedCheckCount: 5, totalCheckCount: 5 },
      provider: { assignedAgentCount: 18, fallbackReadyCount: 2, profileCount: 6, smokeReadyCount: 3 },
      receipts: { receiptCount: 3, searchableCount: 3, unsafeReceiptCount: 0 },
      tmux: { hasRecoveryPlan: true, paneCount: 8, timelineBlockCount: 4 },
    });
    const diagnostics = createSettingsDiagnostics({
      agentCount: 18,
      enabledProviderCount: 6,
      memoryAdapterStatus: "ready",
      providerSmokeReadyCount: 3,
      runtimeStatus: "online",
      workerCount: 18,
    });
    const smoke = createProductionSmokePlan({ includeLiveProvider: false, includeVisual: true });

    const html = renderToStaticMarkup(
      <MaturityReadinessCard diagnostics={diagnostics} maturity={maturity} smokePlan={smoke} />,
    );

    expect(html).toContain("실사용 성숙도");
    expect(html).toContain("9 / 9");
    expect(html).toContain("설정 진단");
    expect(html).toContain("운영 스모크");
    expect(html).toContain("토론 결정에서 코딩 패킷 생성");
  });

  it("막힌 항목은 다음 액션을 직접 보여준다", () => {
    const maturity = createOrchestrationMaturityReport({
      attachments: { acceptedTypeCount: 0, hasProcessingPipeline: false, pendingCount: 0 },
      controlQueue: { connectedLaneCount: 4, pendingApprovalCount: 0, workItemProjectionCount: 2 },
      debate: { codingImpactCount: 0, decisionCount: 0, hasCodingPacketProjection: false, readinessState: "blocked" },
      e2e: { desktopTestCount: 0, hasProviderSmokeHarness: false, hasVisualSmokeChecklist: false },
      memory: { agentInstallCount: 18, curatorCandidateCount: 0, installedAgentCount: 12, promotedCount: 0 },
      onboarding: { blockingCheckCount: 1, passedCheckCount: 4, totalCheckCount: 5 },
      provider: { assignedAgentCount: 8, fallbackReadyCount: 0, profileCount: 6, smokeReadyCount: 1 },
      receipts: { receiptCount: 1, searchableCount: 1, unsafeReceiptCount: 1 },
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
    const smoke = createProductionSmokePlan({ includeLiveProvider: true, includeVisual: false });

    const html = renderToStaticMarkup(
      <MaturityReadinessCard diagnostics={diagnostics} maturity={maturity} smokePlan={smoke} />,
    );

    expect(html).toContain("차단");
    expect(html).toContain("활성 Provider를 1개 이상 설정");
    expect(html).toContain("Control Queue 6개 lane을 모두 WorkItem");
  });
});
