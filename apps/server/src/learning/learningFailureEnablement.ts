import type { LearningFailureGateDecision } from "./learningFailureGate.js";

/**
 * LINE P — learning.failure 자동 append의 OWNER/ENABLEMENT CONTRACT.
 *
 * 매우 중요(불변선):
 *   - 기본 DISABLED. 이 모듈은 절대 append/emit/side-effect를 하지 않는다.
 *     오직 "owner 계약 + 게이트 결정 + 근거 + idempotency"가 모두 충족돼
 *     append가 '허용될 것인가'를 순수하게 판정하고, DESCRIBED audit record를 돌려준다.
 *   - requireObservedEvidence / requireIdempotency 는 항상 true이며 끌 수 없다.
 *   - 어떤 코드 경로도 이 계약을 자동으로 flip하지 않는다. owner가 명시적으로
 *     enabled=true를 주입(+ audit)해야만 켜진다. 코드 머지만으로는 켜지지 않는다.
 *
 * 이 헬퍼는 "게이트(shouldAppendLearningFailure)의 결정"을 입력으로 받아, 그 위에
 * owner 계약 레이어를 얹는다. 게이트가 append:true여도, 계약이 disabled면 allowed:false.
 */

/**
 * owner 활성화 계약. 기본은 비활성.
 * requireObservedEvidence / requireIdempotency / auditRequired 는 안전 불변선이며
 * 항상 true로 고정된다(생성 시 끌 수 없음 — 타입이 literal true).
 */
export type LearningFailureEnablementContract = {
  /** 활성화 결정 owner(예: "lab_maintainer"). */
  owner: string;
  /** 자동 append 허용 여부. 기본 false — owner의 명시적 주입으로만 true. */
  enabled: boolean;
  /** 누가 켰는지(감사용). enabled=true일 때 채워져야 함. */
  enabledBy?: string;
  /** 언제 켰는지(ISO, 감사용). */
  enabledAt?: string;
  /** 적용 범위(예: 특정 missionId/팀). 미지정이면 전역(여전히 disabled가 기본). */
  scope?: string;
  /** 관측 근거 필수 — 항상 true, 끌 수 없음. */
  requireObservedEvidence: true;
  /** idempotency key 필수 — 항상 true, 끌 수 없음. */
  requireIdempotency: true;
  /** 감사 기록 필수 — 항상 true. */
  auditRequired: true;
};

/** owner 결정 전 기본 계약 — 비활성. evaluateEnablement는 항상 allowed:false. */
export function defaultLearningFailureEnablement(
  owner = "lab_maintainer",
): LearningFailureEnablementContract {
  return {
    owner,
    enabled: false,
    requireObservedEvidence: true,
    requireIdempotency: true,
    auditRequired: true,
  };
}

export type LearningFailureEnablementReason =
  | "contract_disabled"
  | "gate_declined_append"
  | "no_observed_evidence"
  | "no_idempotency_key"
  | "allowed";

/**
 * DESCRIBED audit record — 절대 emit/저장되지 않는다. evaluateEnablement가
 * "이런 audit이 기록되어야 한다"를 묘사해 반환할 뿐, 실제 기록은 미래 route 책임.
 */
export type LearningFailureEnablementAuditEvent = {
  kind: "learning.failure.enablement.evaluated";
  owner: string;
  enabled: boolean;
  enabledBy?: string;
  scope?: string;
  /** 게이트가 append를 권했는가(계약 이전 결정). */
  gateAppend: boolean;
  gateReason: LearningFailureGateDecision["reason"];
  observedEvidence: boolean;
  idempotencyKey?: string;
  allowed: boolean;
  reason: LearningFailureEnablementReason;
  /** 이 audit은 묘사일 뿐 emit되지 않았음을 명시. */
  emitted: false;
};

export type LearningFailureEnablementResult = {
  /** true면 (미래 route가) append를 진행해도 된다는 계약상 허가. 이 모듈은 append 안 함. */
  allowed: boolean;
  reason: LearningFailureEnablementReason;
  /** 항상 묘사되어 반환되는 audit record(emit 아님). */
  auditEvent: LearningFailureEnablementAuditEvent;
};

export type EvaluateEnablementInput = {
  /** 게이트(shouldAppendLearningFailure)의 결정. */
  decision: Pick<LearningFailureGateDecision, "append" | "reason" | "idempotencyKey">;
  /**
   * 관측 근거가 실제로 확인됐는가. 게이트는 unobserved를 이미 거르지만,
   * 계약은 이를 독립적으로 한 번 더 요구한다(requireObservedEvidence). 미지정이면 false.
   */
  observedEvidence?: boolean;
};

/**
 * owner 계약 + 게이트 결정 + 근거 + idempotency 를 종합해 append가 '허용될지' 판정한다.
 * 순수 함수 — append/emit/side-effect 0. 항상 DESCRIBED audit record를 반환한다.
 *
 * allowed:true 는 다음이 모두 참일 때만:
 *   1) contract.enabled === true               (owner가 명시적으로 켬)
 *   2) decision.append === true                (게이트가 append를 권함)
 *   3) observedEvidence === true               (requireObservedEvidence, 항상 강제)
 *   4) decision.idempotencyKey 존재             (requireIdempotency, 항상 강제)
 * 하나라도 어기면 allowed:false + 해당 reason.
 */
export function evaluateEnablement(
  contract: LearningFailureEnablementContract,
  input: EvaluateEnablementInput,
): LearningFailureEnablementResult {
  const observedEvidence = input.observedEvidence === true;
  const idempotencyKey = input.decision.idempotencyKey;

  const reason: LearningFailureEnablementReason = !contract.enabled
    ? "contract_disabled"
    : !input.decision.append
      ? "gate_declined_append"
      : // requireObservedEvidence — 항상 강제, 끌 수 없음.
        !observedEvidence
        ? "no_observed_evidence"
        : // requireIdempotency — 항상 강제, 끌 수 없음.
          !idempotencyKey
          ? "no_idempotency_key"
          : "allowed";

  const allowed = reason === "allowed";

  const auditEvent: LearningFailureEnablementAuditEvent = {
    kind: "learning.failure.enablement.evaluated",
    owner: contract.owner,
    enabled: contract.enabled,
    ...(contract.enabledBy ? { enabledBy: contract.enabledBy } : {}),
    ...(contract.scope ? { scope: contract.scope } : {}),
    gateAppend: input.decision.append,
    gateReason: input.decision.reason,
    observedEvidence,
    ...(idempotencyKey ? { idempotencyKey } : {}),
    allowed,
    reason,
    emitted: false,
  };

  return { allowed, reason, auditEvent };
}
