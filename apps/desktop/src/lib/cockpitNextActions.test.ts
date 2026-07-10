import { describe, expect, it } from "vitest";
import type { OperatorCockpitSnapshot } from "@ai-orchestrator/protocol";
import type { OrchestrationMaturityReport } from "./orchestrationMaturity";
import type { SettingsDiagnostics } from "./settingsDiagnostics";
import { deriveCockpitNextActions, resolveCockpitDetailFocus } from "./cockpitNextActions";

const diagnostics = {
  nextActions: ["공급자 상태 점검을 다시 실행"],
} as SettingsDiagnostics;

const maturity = {
  nextActions: ["작업 대기열 흐름 결과를 확인"],
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
      "렘: 권한 확인 필요",
      "승인 필요: 터미널 실행 권한",
      "공급자 상태 점검을 다시 실행",
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
      ctaLabel: "브리핑 점검",
      label: "공개 브리핑 마스킹 점검: 1건",
      priority: "high",
      source: "receipt",
      targetSurface: "receipts",
    });
  });

  it("does not expose raw approval block reason strings in visible next actions", () => {
    const actions = deriveCockpitNextActions({
      diagnostics: { nextActions: [] } as unknown as SettingsDiagnostics,
      maturity: { nextActions: [], overallStatus: "ready" } as unknown as OrchestrationMaturityReport,
      snapshot: {
        ...snapshot,
        fleet: [],
        handoffs: [],
      } as unknown as OperatorCockpitSnapshot,
    });

    expect(actions[0]?.label).toBe("승인 필요: 터미널 실행 권한");
    expect(actions[0]?.label).not.toContain("terminal_run");
    expect(actions[0]?.label).not.toContain("from agent");
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
        ctaLabel: "워커 확인",
        id: "worker_active_agent_builder",
        label: "작업 중: 히라사와 유이 결과 확인",
        priority: "normal",
        source: "worker",
        targetSurface: "fleet",
      },
    ]);
  });

  it("surfaces control queue follow-up before generic maturity actions", () => {
    const actions = deriveCockpitNextActions({
      controlQueue: {
        hasItems: true,
        label: "큐 이어받기: 질문 1 · 초안 1 · 위임 1",
        latestTitle: "수정 초안: 실행 조건",
        tone: "loading",
      },
      diagnostics: { nextActions: [] } as unknown as SettingsDiagnostics,
      maturity: {
        nextActions: ["작업 대기열 흐름 결과를 확인"],
        overallStatus: "needs_work",
      } as unknown as OrchestrationMaturityReport,
      snapshot: { ...snapshot, approvals: [], fleet: [], handoffs: [] } as unknown as OperatorCockpitSnapshot,
    });

    expect(actions.map((action) => action.label)).toEqual([
      "큐 이어받기: 질문 1 · 초안 1 · 위임 1 — 수정 초안: 실행 조건",
      "작업 대기열 흐름 결과를 확인",
    ]);
    expect(actions[0]).toMatchObject({
      ctaLabel: "큐 이어받기",
      priority: "warning",
      source: "control_queue",
      targetSurface: "control_queue",
    });
  });

  it("막힌 것이 없을 때도 다음 큰 바위 점검 행동을 남긴다", () => {
    const actions = deriveCockpitNextActions({
      diagnostics: { nextActions: [] } as unknown as SettingsDiagnostics,
      maturity: { nextActions: [], overallStatus: "ready" } as unknown as OrchestrationMaturityReport,
      snapshot: { ...snapshot, approvals: [], fleet: [], handoffs: [] } as unknown as OperatorCockpitSnapshot,
      workTraceItems: [],
    });

    expect(actions).toEqual([
      {
        ctaLabel: "성숙도 보기",
        id: "default_next_big_rock",
        label: "다음 큰 바위 선정: 성숙도와 작업 브리핑을 확인",
        priority: "normal",
        source: "maturity",
        targetSurface: "maturity",
      },
    ]);
  });

  it("세부 정보로 들어가는 다음 행동은 구체적인 카드 초점을 함께 계산한다", () => {
    expect(
      resolveCockpitDetailFocus({
        ctaLabel: "브리핑 점검",
        id: "receipt_unsafe",
        label: "공개 브리핑 마스킹 점검: 1건",
        priority: "high",
        source: "receipt",
        targetSurface: "receipts",
      }),
    ).toEqual({
      helper: "브리핑 로그에서 공개 마스킹 상태를 먼저 확인합니다.",
      label: "작업 브리핑",
      surface: "receipts",
    });

    expect(
      resolveCockpitDetailFocus({
        ctaLabel: "성숙도 보기",
        id: "maturity_0",
        label: "작업 대기열 흐름 결과를 확인",
        priority: "normal",
        source: "maturity",
        targetSurface: "maturity",
      }),
    ).toMatchObject({
      label: "실사용 성숙도",
      surface: "maturity",
    });

    expect(
      resolveCockpitDetailFocus({
        ctaLabel: "워커 확인",
        id: "worker_active_agent_builder",
        label: "작업 중: 히라사와 유이 결과 확인",
        priority: "normal",
        source: "worker",
        targetSurface: "fleet",
      }),
    ).toBeUndefined();
  });
});
