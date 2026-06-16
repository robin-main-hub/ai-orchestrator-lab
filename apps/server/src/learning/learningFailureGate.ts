import {
  deriveLearningFailureEvent,
  type LearningFailureEvent,
  type SandboxErrorCard,
  type VerificationReport,
} from "@ai-orchestrator/protocol";
import {
  learningFailureIdempotencyKeyFromEvent,
  type SeenIdempotencyKeys,
} from "./learningFailureIdempotency.js";

/**
 * LINE D — learning.failure 자동 append를 켜기 전에 필요한 "결정 전용" 게이트.
 *
 * 매우 중요(불변선):
 *   - 기본값 enabled=false. 켜기는 owner의 명시적 결정(설정 주입)으로만 가능.
 *   - 이 게이트는 절대 append/emit/side-effect/background job을 하지 않는다.
 *     오직 "append 해도 되는가?"를 결정론적으로 판정해 반환할 뿐이다.
 *   - 근거 없는/unobserved 실패는 deriveLearningFailureEvent가 null → append:false.
 *   - 이미 본 idempotency key면 append:false(중복).
 *
 * 실제 append는 미래의 server route 책임이며, 그 route가 이 결정을 신뢰해
 * append 여부를 정한다(docs/SERVER_LEARNING_FAILURE_GATE.md의 seam 참고).
 */

export type LearningFailureGateConfig = {
  /**
   * 자동 append 허용 여부. 기본 false — owner가 명시적으로 true로 주입해야 켜진다.
   * false면 어떤 입력에도 append:false.
   */
  enabled: boolean;
};

/** owner 결정 전 기본 설정 — 비활성. */
export const DEFAULT_LEARNING_FAILURE_GATE_CONFIG: LearningFailureGateConfig = {
  enabled: false,
};

export type LearningFailureGateInput = {
  config?: LearningFailureGateConfig;
  /** 실패 산출물 — deriveLearningFailureEvent로 evidence-gated 변환된다. */
  verification?: Pick<VerificationReport, "id" | "missionId" | "status" | "observed" | "globalRevisionDirective">;
  errorCard?: Pick<SandboxErrorCard, "id" | "missionId" | "status" | "rootCause" | "truthStatus">;
  /** 이미 append된 idempotency key 집합(중복 판정용). 미제공이면 "본 적 없음"으로 간주. */
  seen?: SeenIdempotencyKeys;
  /** 결정론적 시각 주입(Date.now 금지). 파생 이벤트의 createdAt에만 쓰인다. */
  now: () => string;
};

export type LearningFailureGateReason =
  | "disabled"
  | "no-observed-evidence"
  | "no-idempotency-key"
  | "duplicate"
  | "append";

export type LearningFailureGateDecision = {
  /** true일 때만 호출자가 append를 진행해야 한다. */
  append: boolean;
  reason: LearningFailureGateReason;
  /** append=true일 때 호출자가 dedup 기록에 쓸 key. */
  idempotencyKey?: string;
  /** append=true일 때 호출자가 envelope로 포장해 넣을 이벤트. */
  event?: LearningFailureEvent;
};

/**
 * "이 실패를 append 해도 되는가?"를 결정한다. 순수 함수 — 부수효과 0.
 *
 * 순서:
 *   1) gate disabled → append:false ("disabled")
 *   2) 근거 없음/unobserved (deriveLearningFailureEvent null) → false ("no-observed-evidence")
 *   3) anchor에서 idempotency key 못 뽑음 → false ("no-idempotency-key", 방어적)
 *   4) 이미 본 key → false ("duplicate")
 *   5) 그 외 → append:true ("append") + key + event
 */
export function shouldAppendLearningFailure(
  input: LearningFailureGateInput,
): LearningFailureGateDecision {
  const config = input.config ?? DEFAULT_LEARNING_FAILURE_GATE_CONFIG;

  if (!config.enabled) {
    return { append: false, reason: "disabled" };
  }

  const event = deriveLearningFailureEvent({
    verification: input.verification,
    errorCard: input.errorCard,
    now: input.now,
  });
  if (!event) {
    return { append: false, reason: "no-observed-evidence" };
  }

  const idempotencyKey = learningFailureIdempotencyKeyFromEvent(event);
  if (!idempotencyKey) {
    return { append: false, reason: "no-idempotency-key" };
  }

  if (input.seen?.has(idempotencyKey)) {
    return { append: false, reason: "duplicate", idempotencyKey };
  }

  return { append: true, reason: "append", idempotencyKey, event };
}
