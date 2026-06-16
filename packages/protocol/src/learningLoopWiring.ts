import type { SandboxErrorCard } from "./sandboxErrorCard.js";
import type { VerificationReport } from "./productKernel.js";
import {
  LEARNING_EVENT_TYPES,
  learningFailureRecordedPayloadSchema,
  type LearningFailure,
} from "./learningLoop.js";

/**
 * C1 — Mission failure → learning.failure.recorded wiring (pure mapper).
 *
 * mission/app-builder의 실패 산출물(VerificationReport / SandboxErrorCard)을
 * learningLoop의 failure 이벤트로 변환한다. 실제 emit(EventStorage append)은 호출자가
 * 한다 — 이 모듈은 "무엇을 emit할지"만 결정론적으로 계산한다.
 *
 * 불변선 (GPT C1 지시 그대로):
 *   - real evidence가 있을 때만 — sandboxErrorCardId 또는 verificationReportId.
 *   - 평문 불만/추측에서 learning을 만들지 않는다.
 *   - 가짜 observed에서 학습을 만들지 않는다:
 *       · VerificationReport는 observed=true + status∈{failed,blocked}일 때만.
 *       · SandboxErrorCard는 truthStatus="observed"일 때만.
 *   - memory write 0, skill activation 0, batchRemember 호출 0 (그건 C2/C3).
 */

export type LearningFailureEvent = {
  type: typeof LEARNING_EVENT_TYPES.failureRecorded;
  payload: { failure: LearningFailure };
};

/** loopId는 mission + anchor에서 결정론적으로 파생(Date.now/랜덤 0). */
export function deriveLearningLoopId(missionId: string, anchorId: string): string {
  return `loop_${missionId}_${anchorId}`;
}

function makeFailureEvent(failure: LearningFailure): LearningFailureEvent | null {
  // 스키마(refine 포함)를 통과할 때만 이벤트로 인정 — 근거 없는 failure는 여기서 걸러진다.
  const parsed = learningFailureRecordedPayloadSchema.safeParse({ failure });
  if (!parsed.success) return null;
  return { type: LEARNING_EVENT_TYPES.failureRecorded, payload: { failure } };
}

/**
 * VerificationReport → learning failure event.
 *   - status가 failed/blocked가 아니면 null (passed/pending은 학습 대상 아님).
 *   - observed=false면 null (시뮬레이션 결과로 학습 금지 — 가짜 observed 방지).
 */
export function deriveLearningFailureFromVerification(
  report: Pick<VerificationReport, "id" | "missionId" | "status" | "observed" | "globalRevisionDirective">,
  now: () => string,
): LearningFailureEvent | null {
  if (report.status !== "failed" && report.status !== "blocked") return null;
  if (!report.observed) return null;
  const loopId = deriveLearningLoopId(report.missionId, report.id);
  const failure: LearningFailure = {
    id: `fail_${report.id}`,
    loopId,
    missionId: report.missionId,
    verificationReportId: report.id,
    summary: report.globalRevisionDirective?.slice(0, 240) || `verification ${report.status}`,
    createdAt: now(),
  };
  return makeFailureEvent(failure);
}

/**
 * SandboxErrorCard → learning failure event.
 *   - truthStatus가 observed가 아니면 null (관측 기반 에러만).
 *   - status가 failed/timeout/blocked일 때만(에러 카드 자체가 실패 신호).
 */
export function deriveLearningFailureFromErrorCard(
  card: Pick<SandboxErrorCard, "id" | "missionId" | "status" | "rootCause" | "truthStatus">,
  now: () => string,
): LearningFailureEvent | null {
  if (card.truthStatus !== "observed") return null;
  if (card.status !== "failed" && card.status !== "timeout" && card.status !== "blocked") return null;
  const loopId = deriveLearningLoopId(card.missionId, card.id);
  const failure: LearningFailure = {
    id: `fail_${card.id}`,
    loopId,
    missionId: card.missionId,
    sandboxErrorCardId: card.id,
    summary: card.rootCause.slice(0, 240) || `sandbox ${card.status}`,
    createdAt: now(),
  };
  return makeFailureEvent(failure);
}

/**
 * 통합 진입점 — verification 우선(가장 권위 있는 실패 신호), 없으면 errorCard.
 * 둘 다 없거나 근거 미달이면 null(이벤트 emit 안 함).
 */
export function deriveLearningFailureEvent(input: {
  verification?: Pick<VerificationReport, "id" | "missionId" | "status" | "observed" | "globalRevisionDirective">;
  errorCard?: Pick<SandboxErrorCard, "id" | "missionId" | "status" | "rootCause" | "truthStatus">;
  now: () => string;
}): LearningFailureEvent | null {
  if (input.verification) {
    const fromVerification = deriveLearningFailureFromVerification(input.verification, input.now);
    if (fromVerification) return fromVerification;
  }
  if (input.errorCard) {
    const fromErrorCard = deriveLearningFailureFromErrorCard(input.errorCard, input.now);
    if (fromErrorCard) return fromErrorCard;
  }
  return null;
}
