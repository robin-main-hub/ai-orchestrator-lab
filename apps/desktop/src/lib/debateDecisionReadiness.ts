import type { Stage3DebateSession } from "../runtime/stage3Runtime";

export type DebateDecisionReadinessState = "ready" | "needs_review" | "blocked";

export type DebateDecisionReadiness = {
  blockers: string[];
  codingImpactCount: number;
  decisionCount: number;
  evidenceCount: number;
  headline: string;
  nextActionLabel: string;
  objectionCount: number;
  riskCount: number;
  state: DebateDecisionReadinessState;
};

export function deriveDebateDecisionReadiness(session: Stage3DebateSession): DebateDecisionReadiness {
  let codingImpactCount = 0;
  let decisionCount = 0;
  let evidenceCount = 0;
  let objectionCount = 0;
  let riskCount = 0;
  const blockers: string[] = [];

  for (const round of session.rounds) {
    if (round.status === "blocked") {
      blockers.push(`${round.title} 라운드가 차단됨`);
    }
    if (round.status === "running") {
      blockers.push(`${round.title} 라운드가 아직 진행 중`);
    }

    for (const utterance of round.utterances) {
      if (utterance.decisionId) decisionCount += 1;
      if (utterance.tags.includes("coding_impact")) codingImpactCount += 1;
      if (utterance.tags.includes("evidence")) evidenceCount += 1;
      if (utterance.tags.includes("objection")) objectionCount += 1;
      if (utterance.tags.includes("risk")) riskCount += 1;
    }
  }

  if (decisionCount === 0) {
    blockers.push("결정 노드 없음");
  }
  if (codingImpactCount === 0) {
    blockers.push("코딩 영향 발언 없음");
  }
  if (riskCount > evidenceCount) {
    blockers.push("리스크가 근거보다 많음");
  }

  const hardBlocked = blockers.some((blocker) => blocker.includes("차단됨") || blocker.includes("결정 노드 없음"));
  const state: DebateDecisionReadinessState =
    hardBlocked ? "blocked" : blockers.length > 0 || objectionCount > decisionCount ? "needs_review" : "ready";

  if (state === "ready") {
    return {
      blockers,
      codingImpactCount,
      decisionCount,
      evidenceCount,
      headline: "패킷 반영 가능",
      nextActionLabel: "결정과 코딩 영향이 충분합니다.",
      objectionCount,
      riskCount,
      state,
    };
  }

  if (state === "blocked") {
    return {
      blockers,
      codingImpactCount,
      decisionCount,
      evidenceCount,
      headline: "패킷 반영 차단",
      nextActionLabel: blockers[0] ?? "토론 결정 경계를 확인하세요.",
      objectionCount,
      riskCount,
      state,
    };
  }

  return {
    blockers,
    codingImpactCount,
    decisionCount,
    evidenceCount,
    headline: "추가 검토 필요",
    nextActionLabel: blockers[0] ?? "반대 의견 또는 미해결 리스크를 확인하세요.",
    objectionCount,
    riskCount,
    state,
  };
}
