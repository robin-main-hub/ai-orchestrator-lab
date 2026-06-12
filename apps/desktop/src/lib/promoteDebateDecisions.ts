import type { DebateRound } from "@ai-orchestrator/protocol";

/**
 * 라이브 토론 결과에 결정 노드/코딩 영향 메타를 승격한다.
 *
 * 엔진은 자유 발언만 만들고 decisionId를 달지 않아서, 이대로 두면 결정
 * 준비도 게이트가 모든 실토론을 "결정 노드 없음"으로 차단한다(박힌 데모
 * 템플릿만 게이트를 통과하는 역설). 또 에이전트가 `[[tag:...]]`로 전원
 * agreement를 선언하면 코딩 패킷 라운드조차 coding_impact가 0이 된다.
 *
 * - 완료된 최종 결정 라운드의 발언 → decisionId 부여 (기존 값 보존)
 * - 완료된 코딩 패킷 라운드의 발언 → coding_impact 태그 보강
 */
export function promoteDebateDecisions(rounds: DebateRound[]): DebateRound[] {
  return rounds.map((round) => {
    if (round.status !== "completed") {
      return round;
    }

    if (round.kind === "final_decision") {
      return {
        ...round,
        utterances: round.utterances.map((utterance, index) => ({
          ...utterance,
          decisionId: utterance.decisionId ?? `${round.id}_decision_${index + 1}`,
        })),
      };
    }

    if (round.kind === "coding_packet") {
      return {
        ...round,
        utterances: round.utterances.map((utterance) =>
          utterance.tags.includes("coding_impact")
            ? utterance
            : { ...utterance, tags: [...utterance.tags, "coding_impact"] },
        ),
      };
    }

    return round;
  });
}
