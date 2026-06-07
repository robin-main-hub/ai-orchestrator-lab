import { describe, expect, it } from "vitest";
import type { OperatorCockpitSnapshot } from "@ai-orchestrator/protocol";
import type { OrchestrationMaturityReport } from "./orchestrationMaturity";
import type { SettingsDiagnostics } from "./settingsDiagnostics";
import { deriveCockpitNextActions } from "./cockpitNextActions";

const diagnostics = {
  nextActions: ["Provider smoke를 다시 실행"],
} as SettingsDiagnostics;

const maturity = {
  nextActions: ["Control Queue lane 결과를 확인"],
  overallStatus: "needs_work",
} as OrchestrationMaturityReport;

const snapshot = {
  approvals: [
    {
      blockReason: "terminal_run from agent",
      evidenceRefs: [],
      payloadBindingStatus: "bound",
      securityRisk: "high",
    },
  ],
  dispatchHistory: [],
  fleet: [
    {
      workerId: "agent_executor",
      blockedReason: "권한 확인 필요",
      role: "executor",
      statusRingColor: "red",
      status: "blocked",
    },
  ],
  handoffs: [
    {
      missingInfoSlots: [],
      nextAction: "카구야에게 리뷰 인계",
      ownerAgentId: "agent_reviewer",
    },
  ],
} as unknown as OperatorCockpitSnapshot;

describe("deriveCockpitNextActions", () => {
  it("prioritizes blocked workers and high-risk approvals before routine actions", () => {
    const actions = deriveCockpitNextActions({
      diagnostics,
      maturity,
      snapshot,
    });

    expect(actions.map((action) => action.label)).toEqual([
      "agent_executor: 권한 확인 필요",
      "승인 필요: terminal_run from agent",
      "Provider smoke를 다시 실행",
    ]);
  });

  it("deduplicates repeated labels and respects the visible limit", () => {
    const actions = deriveCockpitNextActions({
      diagnostics: { nextActions: ["같은 작업"] } as SettingsDiagnostics,
      maturity: { nextActions: ["같은 작업"], overallStatus: "needs_work" } as OrchestrationMaturityReport,
      snapshot: { ...snapshot, approvals: [], fleet: [] } as unknown as OperatorCockpitSnapshot,
      limit: 2,
    });

    expect(actions.map((action) => action.label)).toEqual(["같은 작업", "카구야에게 리뷰 인계"]);
  });
});
