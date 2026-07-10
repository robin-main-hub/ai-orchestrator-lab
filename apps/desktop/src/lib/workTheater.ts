import type { WorkItem } from "@ai-orchestrator/protocol";
import type { WorkbenchAgent } from "../types";
import type { MakimaDelegationAssignmentView, MakimaDelegationCard } from "./makimaDelegation";

/**
 * 작업극장(Summon Theater) 1단계 — 순수 코어.
 *
 * 위임 카드(누가·무슨 작업) + assignment 상태(WorkItem.status) + 에이전트(초상화)를
 * 한 화면용 행으로 합치고, 각 행을 6단계 作戦ログ 파이프라인의 현재 위치로 매핑한다.
 * 네트워크/글로벌 글롭은 주입(resolvePortrait)하므로 이 모듈은 순수·테스트 가능.
 */

export type TheaterStage = {
  key: "classify" | "decide" | "dispatch" | "capture" | "approve" | "done";
  jp: string;
  ko: string;
};

export const THEATER_STAGES: ReadonlyArray<TheaterStage> = [
  { key: "classify", jp: "分類", ko: "분류" },
  { key: "decide", jp: "判断", ko: "판단" },
  { key: "dispatch", jp: "実行", ko: "실행" },
  { key: "capture", jp: "待機", ko: "대기" },
  { key: "approve", jp: "承認", ko: "승인" },
  { key: "done", jp: "完了", ko: "완료" },
];

/** WorkItem 상태 → 파이프라인 단계 인덱스(+ 막힘 여부) */
export function theaterStageForStatus(status?: WorkItem["status"]): { index: number; blocked: boolean } {
  switch (status) {
    case "planned":
      return { index: 1, blocked: false }; // 분류 끝, 판단 도달
    case "in_progress":
    case "running":
      return { index: 2, blocked: false }; // 실행 중
    case "ready_for_review":
    case "waiting_approval":
      return { index: 4, blocked: false }; // 승인 대기
    case "done":
      return { index: 5, blocked: false }; // 완료
    case "blocked":
      return { index: 2, blocked: true }; // 실행 중 막힘
    default:
      return { index: 0, blocked: false }; // 미배정 — 분류
  }
}

export type TheaterStageState = "done" | "active" | "pending" | "blocked";

/** 특정 단계가 현재 행에서 어떤 상태인지 */
export function stageStateAt(stageIndex: number, currentIndex: number, blocked: boolean): TheaterStageState {
  if (blocked && stageIndex === currentIndex) return "blocked";
  if (stageIndex < currentIndex) return "done";
  if (stageIndex === currentIndex) return currentIndex >= THEATER_STAGES.length - 1 ? "done" : "active";
  return "pending";
}

export type TheaterRow = {
  agentId: string;
  name: string;
  roleLabel: string;
  portraitUrl?: string;
  title: string;
  summary: string;
  stageIndex: number;
  blocked: boolean;
  assigned: boolean;
};

/**
 * 위임 카드들을 극장 행으로 변환. assignment가 없는 카드는 미배정(분류 단계)으로 둔다.
 * resolvePortrait는 (personaName, role) → url 주입.
 */
export function deriveTheaterRows(input: {
  cards: ReadonlyArray<MakimaDelegationCard>;
  assignmentsByAgentId?: Record<string, MakimaDelegationAssignmentView>;
  agents: ReadonlyArray<WorkbenchAgent>;
  resolvePortrait: (personaName?: string, role?: string) => string | undefined;
}): TheaterRow[] {
  const { cards, assignmentsByAgentId, agents, resolvePortrait } = input;
  return cards.map((card) => {
    const assignment = assignmentsByAgentId?.[card.targetAgentId];
    const stage = theaterStageForStatus(assignment?.status);
    const agent = agents.find((candidate) => candidate.id === card.targetAgentId);
    return {
      agentId: card.targetAgentId,
      name: card.targetAgentName,
      roleLabel: card.targetRoleLabel,
      portraitUrl: resolvePortrait(agent?.personaName, agent?.role ?? card.targetAgentId),
      title: card.title.replace(`${card.targetAgentName}에게 `, ""),
      summary: card.summary,
      stageIndex: stage.index,
      blocked: stage.blocked,
      assigned: Boolean(assignment),
    };
  });
}

/** 출격/승인대기/완료 집계 — 극장 헤더용 */
export function summarizeTheater(rows: ReadonlyArray<TheaterRow>): {
  deployed: number;
  awaitingApproval: number;
  done: number;
  blocked: number;
} {
  let deployed = 0;
  let awaitingApproval = 0;
  let done = 0;
  let blocked = 0;
  for (const row of rows) {
    // 승인 대기 행은 "출격(deployed)"에서 제외 — 승인대기 계상과의 이중카운트 방지(§2.7).
    const atApprove = THEATER_STAGES[row.stageIndex]?.key === "approve";
    if (row.blocked) blocked += 1;
    if (atApprove) awaitingApproval += 1;
    if (row.stageIndex >= THEATER_STAGES.length - 1) done += 1;
    else if (row.assigned && !atApprove) deployed += 1;
  }
  return { deployed, awaitingApproval, done, blocked };
}
