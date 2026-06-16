import type { LearningFailureEvent } from "@ai-orchestrator/protocol";

/**
 * LINE D — learning.failure append용 순수 idempotency 헬퍼 (부수효과 0).
 *
 * 목적: "동일한 관측 실패"가 EventStorage에 두 번 append 되지 않도록, 실패의
 * evidence anchor(verificationReportId 또는 sandboxErrorCardId)와 missionId에서
 * 결정론적 idempotency key를 만든다.
 *
 * 불변선:
 *   - Date.now / 랜덤 / 외부 I/O 0 — 같은 입력은 항상 같은 key.
 *   - anchor 우선순위는 deriveLearningFailureEvent와 동일(verification 우선).
 *   - 이 모듈은 append 하지 않는다. key 계산과 "본 적 있는지" 판정만 한다.
 */

/** idempotency key 계산용 최소 입력 — failure에서 뽑은 anchor 식별자들. */
export type LearningFailureIdentity = {
  missionId: string;
  verificationReportId?: string;
  sandboxErrorCardId?: string;
};

/**
 * evidence anchor + missionId → 결정론적 idempotency key.
 *
 * verification anchor가 있으면 그것을, 없으면 sandboxErrorCard anchor를 쓴다
 * (deriveLearningFailureEvent의 우선순위와 일치 — 같은 관측 실패는 같은 key).
 * 둘 다 없으면 null(근거 없는 실패는 애초에 append 대상이 아니다 — gate가 거른다).
 */
export function learningFailureIdempotencyKey(identity: LearningFailureIdentity): string | null {
  const anchor = identity.verificationReportId
    ? `verification:${identity.verificationReportId}`
    : identity.sandboxErrorCardId
      ? `sandbox:${identity.sandboxErrorCardId}`
      : null;
  if (!anchor) return null;
  return `lf:${identity.missionId}:${anchor}`;
}

/** LearningFailureEvent에서 직접 idempotency key를 뽑는 편의 헬퍼. */
export function learningFailureIdempotencyKeyFromEvent(event: LearningFailureEvent): string | null {
  const failure = event.payload.failure;
  return learningFailureIdempotencyKey({
    missionId: failure.missionId,
    verificationReportId: failure.verificationReportId,
    sandboxErrorCardId: failure.sandboxErrorCardId,
  });
}

/**
 * 이미 본 idempotency key 집합 — 순수 read 인터페이스.
 *
 * 구현은 호출자(server route / 테스트)가 제공한다. 헬퍼는 "has"만 물어보고
 * "어떻게 저장하는지"는 모른다(메모리 Set, EventStorage 스캔 등 무엇이든 OK).
 */
export type SeenIdempotencyKeys = {
  has: (key: string) => boolean;
};

/** Set 기반 SeenIdempotencyKeys 어댑터 — 테스트/인메모리 dedup용. */
export function seenKeysFromSet(set: ReadonlySet<string>): SeenIdempotencyKeys {
  return { has: (key) => set.has(key) };
}
