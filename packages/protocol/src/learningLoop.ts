import { z } from "zod";
import { truthStatusSchema } from "./truthStatus.js";

/**
 * Orchestration OS L8 — Learning Loop Closure (PR 1).
 *
 * 검증 실패를 *제도적으로* 학습으로 바꾸는 상태머신:
 *
 *   Fail → Investigate → Verify → Distill → Consult
 *
 * 기존 seam(SandboxErrorCard / VerificationReport / SelfCorrection / SkillArchive)
 * 뒤에 붙는 **순수 protocol 레이어**다. 새 DB 없음 — EventStorage 단일 진실 위에서
 * 이벤트로만 산다(skillArchive의 deriveSkillArchiveQueue와 같은 패턴).
 *
 * 불변식 (이 모듈이 타입/리듀서로 강제):
 *   1. 실패 기록은 sandboxErrorCardId 또는 verificationReportId 없이는 만들 수 없다.
 *   2. 조사(investigation)는 read-only 역할로만 표현된다(고치지 않는다).
 *   3. 증류 후보(distillation candidate)는 **검증된 가설** 없이는 나올 수 없다.
 *   4. 거절된 가설은 증류 후보가 되지 못한다.
 *   5. consult skipped에는 반드시 사유가 있어야 한다.
 *   6. observed를 주장하는 이벤트는 evidenceRefs 없이는 관측으로 인정되지 않는다.
 *
 * 안전: distillation candidate는 절대 자동으로 trusted/active가 되지 않는다 —
 * trustStatus 리터럴은 "suggested"로 고정된다(curator/eval은 후속 PR).
 */

// ── stage ──

/**
 * 루프가 도달한 가장 앞선 단계.
 *   failed              — 실패 기록됨
 *   investigating       — 조사 시작됨(read-only)
 *   hypothesis_recorded — 가설 1개 이상 기록됨(아직 검증 전)
 *   verified            — 가설이 검증됨 → 증류 가능
 *   rejected            — 가설이 모두 거절됨(검증된 가설 0) → 증류 불가
 *   distilled           — 증류 후보 생성됨(suggested)
 *   consulted           — 다음 미션에서 consult 완료/스킵으로 루프가 닫힘
 */
export const learningLoopStageSchema = z.enum([
  "failed",
  "investigating",
  "hypothesis_recorded",
  "verified",
  "rejected",
  "distilled",
  "consulted",
]);
export type LearningLoopStage = z.infer<typeof learningLoopStageSchema>;

// ── 조사자 역할(read-only) ──

/**
 * 조사는 관측만 한다 — builder처럼 파일을 고치지 않는다. 그래서 역할을 비-변경 역할로
 * 제한한다(불변식 2). builder/coder 류는 여기 들어올 수 없다.
 */
export const investigatorRoleSchema = z.enum(["investigator", "verifier", "reviewer"]);
export type InvestigatorRole = z.infer<typeof investigatorRoleSchema>;

// ── 실패 ──

export const learningFailureSchema = z
  .object({
    id: z.string(),
    loopId: z.string(),
    missionId: z.string(),
    /** 둘 중 적어도 하나는 있어야 한다(불변식 1). 추측 실패는 루프를 못 연다. */
    sandboxErrorCardId: z.string().optional(),
    verificationReportId: z.string().optional(),
    summary: z.string(),
    createdAt: z.string(),
  })
  .refine((f) => Boolean(f.sandboxErrorCardId || f.verificationReportId), {
    message: "failure는 sandboxErrorCardId 또는 verificationReportId가 있어야 한다",
  });
export type LearningFailure = z.infer<typeof learningFailureSchema>;

// ── 조사 ──

export const failureInvestigationSchema = z.object({
  id: z.string(),
  loopId: z.string(),
  /** read-only 역할만(불변식 2) */
  investigatorRole: investigatorRoleSchema,
  notes: z.string(),
  /** 무엇을 본 근거 — read-only 관측 흔적 */
  evidenceRefs: z.array(z.string()).default([]),
  startedAt: z.string(),
});
export type FailureInvestigation = z.infer<typeof failureInvestigationSchema>;

// ── 가설 ──

export const failureHypothesisSchema = z.object({
  id: z.string(),
  loopId: z.string(),
  statement: z.string(),
  /** 가설은 반드시 근거(evidenceRef/artifactId)를 참조한다 — 빈 추측 금지 */
  evidenceRefs: z.array(z.string()).min(1),
  createdAt: z.string(),
});
export type FailureHypothesis = z.infer<typeof failureHypothesisSchema>;

// ── 가설 검증 ──

export const hypothesisVerificationSchema = z
  .object({
    hypothesisId: z.string(),
    loopId: z.string(),
    outcome: z.enum(["verified", "rejected", "inconclusive"]),
    /** 검증 근거 */
    evidenceRefs: z.array(z.string()).default([]),
    /** observed면 실제 관측(런너/검증 출력)을 봤다는 뜻 */
    truthStatus: truthStatusSchema,
    reason: z.string(),
    verifiedAt: z.string(),
  })
  // 불변식 6: observed를 주장하면 evidenceRefs가 비어 있으면 안 된다.
  .refine((v) => v.truthStatus !== "observed" || v.evidenceRefs.length > 0, {
    message: "observed 검증은 evidenceRefs가 있어야 한다",
  });
export type HypothesisVerification = z.infer<typeof hypothesisVerificationSchema>;

// ── 증류 후보 ──

export const distilledLearningCandidateSchema = z.object({
  id: z.string(),
  loopId: z.string(),
  /** 반드시 검증된 가설을 가리킨다(리듀서가 검증 여부를 강제) */
  hypothesisId: z.string(),
  title: z.string(),
  lesson: z.string(),
  evidenceRefs: z.array(z.string()).min(1),
  /** 자동 trusted/active 금지 — 항상 suggested로만 태어난다 */
  trustStatus: z.literal("suggested"),
  createdAt: z.string(),
});
export type DistilledLearningCandidate = z.infer<typeof distilledLearningCandidateSchema>;

// ── consult ──

export const memoryConsultRecordSchema = z
  .object({
    id: z.string(),
    loopId: z.string(),
    /** consult를 수행한(또는 스킵한) 미션 */
    missionId: z.string(),
    outcome: z.enum(["completed", "skipped"]),
    consultedMemoryIds: z.array(z.string()).default([]),
    skipReason: z.string().optional(),
    createdAt: z.string(),
  })
  // 불변식 5: skipped에는 사유가 필수.
  .refine((c) => c.outcome !== "skipped" || Boolean(c.skipReason && c.skipReason.trim().length > 0), {
    message: "consult skipped에는 skipReason이 필요하다",
  });
export type MemoryConsultRecord = z.infer<typeof memoryConsultRecordSchema>;

// ── 집계 레코드 ──

export const learningLoopRecordSchema = z.object({
  loopId: z.string(),
  missionId: z.string(),
  stage: learningLoopStageSchema,
  failure: learningFailureSchema.optional(),
  investigation: failureInvestigationSchema.optional(),
  hypotheses: z.array(failureHypothesisSchema),
  verifications: z.array(hypothesisVerificationSchema),
  verifiedHypothesisIds: z.array(z.string()),
  rejectedHypothesisIds: z.array(z.string()),
  distillation: distilledLearningCandidateSchema.optional(),
  consult: memoryConsultRecordSchema.optional(),
  updatedAt: z.string().optional(),
});
export type LearningLoopRecord = z.infer<typeof learningLoopRecordSchema>;

// ── 이벤트 타입 + payload schema ──

export const LEARNING_EVENT_TYPES = {
  failureRecorded: "learning.failure.recorded",
  investigationStarted: "learning.investigation.started",
  hypothesisRecorded: "learning.hypothesis.recorded",
  hypothesisVerified: "learning.hypothesis.verified",
  hypothesisRejected: "learning.hypothesis.rejected",
  distillationCandidateCreated: "learning.distillation.candidate_created",
  consultCompleted: "learning.consult.completed",
  consultSkipped: "learning.consult.skipped",
} as const;

export const learningFailureRecordedPayloadSchema = z.object({ failure: learningFailureSchema });
export type LearningFailureRecordedPayload = z.infer<typeof learningFailureRecordedPayloadSchema>;

export const learningInvestigationStartedPayloadSchema = z.object({ investigation: failureInvestigationSchema });
export type LearningInvestigationStartedPayload = z.infer<typeof learningInvestigationStartedPayloadSchema>;

export const learningHypothesisRecordedPayloadSchema = z.object({ hypothesis: failureHypothesisSchema });
export type LearningHypothesisRecordedPayload = z.infer<typeof learningHypothesisRecordedPayloadSchema>;

// verified/rejected 둘 다 HypothesisVerification을 싣되, outcome으로 구분한다.
export const learningHypothesisVerifiedPayloadSchema = z.object({ verification: hypothesisVerificationSchema });
export type LearningHypothesisVerifiedPayload = z.infer<typeof learningHypothesisVerifiedPayloadSchema>;

export const learningHypothesisRejectedPayloadSchema = z.object({ verification: hypothesisVerificationSchema });
export type LearningHypothesisRejectedPayload = z.infer<typeof learningHypothesisRejectedPayloadSchema>;

export const learningDistillationCandidateCreatedPayloadSchema = z.object({
  candidate: distilledLearningCandidateSchema,
});
export type LearningDistillationCandidateCreatedPayload = z.infer<
  typeof learningDistillationCandidateCreatedPayloadSchema
>;

export const learningConsultCompletedPayloadSchema = z.object({ consult: memoryConsultRecordSchema });
export type LearningConsultCompletedPayload = z.infer<typeof learningConsultCompletedPayloadSchema>;

export const learningConsultSkippedPayloadSchema = z.object({ consult: memoryConsultRecordSchema });
export type LearningConsultSkippedPayload = z.infer<typeof learningConsultSkippedPayloadSchema>;

// ── 순수 헬퍼 ──

/** 검증된(verified) 가설이 1개 이상 있고, 그 가설이 거절되지 않았으면 증류 가능. */
export function canDistill(record: Pick<LearningLoopRecord, "verifiedHypothesisIds" | "rejectedHypothesisIds">): boolean {
  return record.verifiedHypothesisIds.some((id) => !record.rejectedHypothesisIds.includes(id));
}

/** observed 주장은 evidenceRefs가 있어야 유효(불변식 6). */
export function isObservedClaimValid(truthStatus: string, evidenceRefs: ReadonlyArray<string>): boolean {
  return truthStatus !== "observed" || evidenceRefs.length > 0;
}

// ── 리듀서 ──

type LoopEvent = { type: string; payload: unknown };

function blankRecord(loopId: string, missionId: string): LearningLoopRecord {
  return {
    loopId,
    missionId,
    stage: "failed",
    hypotheses: [],
    verifications: [],
    verifiedHypothesisIds: [],
    rejectedHypothesisIds: [],
  };
}

/**
 * 이벤트 스트림 → loopId별 LearningLoopRecord[]. append 순서(시간순)로 적용.
 *
 * 잘못된 payload(불변식 위반: 근거 없는 failure / 빈 가설 / observed인데 근거 없음 /
 * 사유 없는 skip)는 safeParse가 거른다 → 루프 상태를 전진시키지 않는다.
 *
 * 증류 후보는 candidate.hypothesisId가 검증된(rejected 아님) 가설일 때만 적용된다
 * (불변식 3·4). 그렇지 않으면 무시 — 검증 안 된 추측이 지식으로 승격되지 않는다.
 */
export function deriveLearningLoopState(events: ReadonlyArray<LoopEvent>): LearningLoopRecord[] {
  const byLoop = new Map<string, LearningLoopRecord>();

  for (const event of events) {
    switch (event.type) {
      case LEARNING_EVENT_TYPES.failureRecorded: {
        const parsed = learningFailureRecordedPayloadSchema.safeParse(event.payload);
        if (!parsed.success) break;
        const { failure } = parsed.data;
        if (byLoop.has(failure.loopId)) break; // 멱등 — 같은 loop 재오픈 금지
        const record = blankRecord(failure.loopId, failure.missionId);
        record.failure = failure;
        record.stage = "failed";
        record.updatedAt = failure.createdAt;
        byLoop.set(failure.loopId, record);
        break;
      }
      case LEARNING_EVENT_TYPES.investigationStarted: {
        const parsed = learningInvestigationStartedPayloadSchema.safeParse(event.payload);
        if (!parsed.success) break;
        const { investigation } = parsed.data;
        const record = byLoop.get(investigation.loopId);
        if (!record) break;
        record.investigation = investigation;
        if (record.stage === "failed") record.stage = "investigating";
        record.updatedAt = investigation.startedAt;
        break;
      }
      case LEARNING_EVENT_TYPES.hypothesisRecorded: {
        const parsed = learningHypothesisRecordedPayloadSchema.safeParse(event.payload);
        if (!parsed.success) break;
        const { hypothesis } = parsed.data;
        const record = byLoop.get(hypothesis.loopId);
        if (!record) break;
        if (record.hypotheses.some((h) => h.id === hypothesis.id)) break; // 멱등
        record.hypotheses = [...record.hypotheses, hypothesis];
        if (record.stage === "failed" || record.stage === "investigating") {
          record.stage = "hypothesis_recorded";
        }
        record.updatedAt = hypothesis.createdAt;
        break;
      }
      case LEARNING_EVENT_TYPES.hypothesisVerified: {
        const parsed = learningHypothesisVerifiedPayloadSchema.safeParse(event.payload);
        if (!parsed.success) break;
        const { verification } = parsed.data;
        if (verification.outcome !== "verified") break; // 타입은 맞지만 outcome이 verified여야 함
        const record = byLoop.get(verification.loopId);
        if (!record) break;
        // 가설이 실재해야 함
        if (!record.hypotheses.some((h) => h.id === verification.hypothesisId)) break;
        record.verifications = [...record.verifications, verification];
        if (!record.verifiedHypothesisIds.includes(verification.hypothesisId)) {
          record.verifiedHypothesisIds = [...record.verifiedHypothesisIds, verification.hypothesisId];
        }
        // 증류/소비 이후로는 후퇴시키지 않음
        if (record.stage !== "distilled" && record.stage !== "consulted") record.stage = "verified";
        record.updatedAt = verification.verifiedAt;
        break;
      }
      case LEARNING_EVENT_TYPES.hypothesisRejected: {
        const parsed = learningHypothesisRejectedPayloadSchema.safeParse(event.payload);
        if (!parsed.success) break;
        const { verification } = parsed.data;
        if (verification.outcome !== "rejected") break;
        const record = byLoop.get(verification.loopId);
        if (!record) break;
        if (!record.hypotheses.some((h) => h.id === verification.hypothesisId)) break;
        record.verifications = [...record.verifications, verification];
        if (!record.rejectedHypothesisIds.includes(verification.hypothesisId)) {
          record.rejectedHypothesisIds = [...record.rejectedHypothesisIds, verification.hypothesisId];
        }
        // 검증된 가설이 하나도 없고 아직 증류 전이면 rejected 단계로 표시.
        if (record.stage === "hypothesis_recorded" || record.stage === "investigating" || record.stage === "failed") {
          if (!canDistill(record)) record.stage = "rejected";
        }
        record.updatedAt = verification.verifiedAt;
        break;
      }
      case LEARNING_EVENT_TYPES.distillationCandidateCreated: {
        const parsed = learningDistillationCandidateCreatedPayloadSchema.safeParse(event.payload);
        if (!parsed.success) break;
        const { candidate } = parsed.data;
        const record = byLoop.get(candidate.loopId);
        if (!record) break;
        // 불변식 3·4: 검증된(거절 안 된) 가설을 가리켜야만 증류 후보가 적용된다.
        const verified = record.verifiedHypothesisIds.includes(candidate.hypothesisId);
        const rejected = record.rejectedHypothesisIds.includes(candidate.hypothesisId);
        if (!verified || rejected) break;
        if (record.distillation) break; // 멱등 — 루프당 증류 후보 1개
        record.distillation = candidate;
        record.stage = "distilled";
        record.updatedAt = candidate.createdAt;
        break;
      }
      case LEARNING_EVENT_TYPES.consultCompleted: {
        const parsed = learningConsultCompletedPayloadSchema.safeParse(event.payload);
        if (!parsed.success) break;
        const { consult } = parsed.data;
        if (consult.outcome !== "completed") break;
        const record = byLoop.get(consult.loopId);
        if (!record) break;
        record.consult = consult;
        record.stage = "consulted";
        record.updatedAt = consult.createdAt;
        break;
      }
      case LEARNING_EVENT_TYPES.consultSkipped: {
        const parsed = learningConsultSkippedPayloadSchema.safeParse(event.payload);
        if (!parsed.success) break; // skipReason 없으면 여기서 걸러짐(불변식 5)
        const { consult } = parsed.data;
        if (consult.outcome !== "skipped") break;
        const record = byLoop.get(consult.loopId);
        if (!record) break;
        record.consult = consult;
        record.stage = "consulted";
        record.updatedAt = consult.createdAt;
        break;
      }
      default:
        break;
    }
  }

  return [...byLoop.values()];
}

/** 단일 loopId 상태만 뽑는 편의 함수. */
export function deriveLearningLoopById(
  events: ReadonlyArray<LoopEvent>,
  loopId: string,
): LearningLoopRecord | undefined {
  return deriveLearningLoopState(events).find((r) => r.loopId === loopId);
}
