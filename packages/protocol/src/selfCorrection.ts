import { z } from "zod";

/**
 * Bounded self-correction — 검증 실패 → error card → directive → 재시도. 단,
 * **무한 loop 금지 / 실패를 자동 성공 처리 금지 / 같은 에러 반복 시 중단**.
 * 최대 시도 후에는 사람 검토를 요구한다.
 *
 * 순수 결정 함수 — 다음 행동만 계산한다(실행 부작용 없음). 단위 테스트된다.
 */

export type SelfCorrectionPolicy = {
  maxAttempts: number;
  requireHumanAfterMax: boolean;
  /** 수정 mission step을 만들 수 있는 역할 */
  allowedRoles: ReadonlyArray<string>;
  stopOnSameErrorTwice: boolean;
};

export const DEFAULT_SELF_CORRECTION_POLICY: SelfCorrectionPolicy = {
  maxAttempts: 3,
  requireHumanAfterMax: true,
  allowedRoles: ["builder", "verifier"],
  stopOnSameErrorTwice: true,
};

export type SelfCorrectionAction = "retry" | "stop_same_error" | "require_human" | "stop_resolved";

export type SelfCorrectionDecision = {
  action: SelfCorrectionAction;
  attempt: number;
  reason: string;
};

export function decideSelfCorrection(input: {
  policy?: SelfCorrectionPolicy;
  /** 지금까지 시도한 에러 서명들(시간순) */
  priorErrorSignatures: ReadonlyArray<string>;
  /** 이번 실패의 에러 서명. undefined면 더 이상 실패 없음(해결됨) */
  currentErrorSignature?: string;
  /** 수정을 맡을 워커 역할 */
  workerRole?: string;
}): SelfCorrectionDecision {
  const policy = input.policy ?? DEFAULT_SELF_CORRECTION_POLICY;
  const attempt = input.priorErrorSignatures.length + 1;

  if (!input.currentErrorSignature) {
    return { action: "stop_resolved", attempt: input.priorErrorSignatures.length, reason: "검증 통과 — 더 이상 수정 불필요" };
  }
  if (input.priorErrorSignatures.length >= policy.maxAttempts) {
    return { action: "require_human", attempt, reason: `최대 시도(${policy.maxAttempts}) 도달 — 사람 검토 필요` };
  }
  if (policy.stopOnSameErrorTwice && input.priorErrorSignatures.includes(input.currentErrorSignature)) {
    return { action: "stop_same_error", attempt, reason: "같은 에러가 반복됨 — 자동 수정 중단, 사람 검토 필요" };
  }
  if (input.workerRole && !policy.allowedRoles.includes(input.workerRole)) {
    return { action: "require_human", attempt, reason: `역할 '${input.workerRole}'은 자동 수정 권한이 없습니다` };
  }
  return { action: "retry", attempt, reason: `수정 시도 ${attempt}/${policy.maxAttempts}` };
}

/**
 * mission.self_correction.{suggested,stopped} 이벤트가 싣는 레코드. **제안만** 한다 —
 * 파일 변경은 절대 하지 않는다(L5). retry는 suggested로, 그 외(중단/사람검토)는 stopped로
 * append된다. EventStorage 단일 진실 — 미션 record에 materialize되어 trace에 표시된다.
 */
export const missionSelfCorrectionRecordSchema = z.object({
  id: z.string(),
  missionId: z.string(),
  workerId: z.string().optional(),
  errorCardId: z.string().optional(),
  attempt: z.number().int(),
  action: z.enum(["retry", "stop_same_error", "require_human", "stop_resolved"]),
  directive: z.string().optional(),
  reason: z.string(),
  createdAt: z.string(),
});
export type MissionSelfCorrectionRecord = z.infer<typeof missionSelfCorrectionRecordSchema>;
