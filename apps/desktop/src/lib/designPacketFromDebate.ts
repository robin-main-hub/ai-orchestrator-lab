import type { BlueprintDebateReview, DebateDecisionPacket, DebateTag } from "@ai-orchestrator/protocol";
import { deriveBlueprintDebateReview } from "@ai-orchestrator/protocol";
import type { Stage3DebateSession } from "../runtime/stage3Runtime";

/**
 * 완료된 토론에서 DesignDebateDecisionPacket을 도출(순수). 코딩 패킷 추출
 * (codingPacketFromDebate)과 같은 태그 매핑을 쓰되 design 결정 필드로 버킷한다:
 *   - agreement → adoptedDecisions
 *   - objection → rejectedOptions
 *   - risk      → openQuestions
 * 완료/진행 라운드만, [[tag:...]] 마커 제거, 항목/길이 캡. 값은 전부 실제 발화에서 derive —
 * 합성하지 않는다.
 */

const TAG_MARKER_PATTERN = /\s*\[\[tag:(agreement|objection|evidence|risk|coding_impact)\]\]\s*$/i;
const MAX_PER_FIELD = 8;
const TRUNCATE = 240;

const FIELD_FOR_TAG: Partial<Record<DebateTag, "adoptedDecisions" | "rejectedOptions" | "openQuestions">> = {
  agreement: "adoptedDecisions",
  objection: "rejectedOptions",
  risk: "openQuestions",
};

export function extractDesignDecisionPacket(
  session: Pick<Stage3DebateSession, "id" | "problem" | "rounds">,
): DebateDecisionPacket {
  const buckets = {
    adoptedDecisions: [] as string[],
    rejectedOptions: [] as string[],
    openQuestions: [] as string[],
  };
  for (const round of session.rounds) {
    if (round.status !== "completed" && round.status !== "running") continue;
    for (const utterance of round.utterances) {
      for (const tag of utterance.tags) {
        const field = FIELD_FOR_TAG[tag];
        if (!field) continue;
        const cleaned = utterance.content.replace(TAG_MARKER_PATTERN, "").trim();
        if (!cleaned) continue;
        const line = cleaned.length > TRUNCATE ? `${cleaned.slice(0, TRUNCATE - 1)}…` : cleaned;
        const list = buckets[field];
        if (list.length < MAX_PER_FIELD && !list.includes(line)) list.push(line);
      }
    }
  }
  return {
    id: `decpkt_${session.id}`,
    debateId: session.id,
    kind: "design",
    summary: session.problem.slice(0, 2_000),
    adoptedDecisions: buckets.adoptedDecisions,
    rejectedOptions: buckets.rejectedOptions,
    openQuestions: buckets.openQuestions,
  };
}

/**
 * 토론 종료 후 초안 리뷰(point 5). 초안에서 승격된 토론(blueprintContext 보유)일 때만 생성하고,
 * 일반 대화 토론이면 undefined(일반 토론에는 review가 붙지 않는다). 자동 적용/미션 생성은 하지
 * 않는다 — 표시·trace용 구조만 만든다.
 */
export function computeBlueprintReviewForSession(session: Stage3DebateSession): BlueprintDebateReview | undefined {
  if (!session.blueprintContext) return undefined;
  const packet = extractDesignDecisionPacket(session);
  return deriveBlueprintDebateReview(session.blueprintContext, packet, { sourceSessionId: session.sourceSessionId });
}
