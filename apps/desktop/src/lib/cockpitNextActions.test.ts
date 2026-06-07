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

  it("surfaces unsafe public receipts as an immediate cockpit action", () => {
    const actions = deriveCockpitNextActions({
      diagnostics: { nextActions: [] } as unknown as SettingsDiagnostics,
      maturity: { nextActions: [], overallStatus: "needs_work" } as unknown as OrchestrationMaturityReport,
      snapshot: { ...snapshot, approvals: [], fleet: [], handoffs: [] } as unknown as OperatorCockpitSnapshot,
      workTraceItems: [
        {
          id: "trace_unsafe",
          kind: "conversation",
          safetyLabel: "마스킹 확인 필요",
          searchText: "",
          searchable: false,
          title: "원문 도구 입력 노출",
          trace: { groups: [] },
        },
      ],
    });

    expect(actions[0]).toMatchObject({
      label: "공개 영수증 마스킹 점검: 1건",
      priority: "high",
      source: "receipt",
    });
  });

  it("when nothing is blocked, points the operator at active worker output", () => {
    const actions = deriveCockpitNextActions({
      diagnostics: { nextActions: [] } as unknown as SettingsDiagnostics,
      maturity: { nextActions: [], overallStatus: "ready" } as unknown as OrchestrationMaturityReport,
      snapshot: {
        ...snapshot,
        approvals: [],
        fleet: [
          {
            role: "builder",
            status: "working",
            statusRingColor: "green",
            workerId: "agent_builder",
          },
        ],
        handoffs: [],
      } as unknown as OperatorCockpitSnapshot,
    });

    expect(actions).toEqual([
      {
        id: "worker_active_agent_builder",
        label: "작업 중: agent_builder 결과 확인",
        priority: "normal",
        source: "worker",
      },
    ]);
  });
});
