import { z } from "zod";

export const learningLoopStageSchema = z.enum([
  "fail",
  "investigate",
  "verify",
  "distill",
  "consult",
  "closed",
]);
export type LearningLoopStage = z.infer<typeof learningLoopStageSchema>;

export const failureInvestigationSchema = z.object({
  id: z.string(),
  missionId: z.string(),
  sandboxErrorCardId: z.string().optional(),
  verificationReportId: z.string().optional(),
  rootFailureSummary: z.string(),
  artifactIds: z.array(z.string()).default([]),
  createdAt: z.string(),
}).refine(data => data.sandboxErrorCardId || data.verificationReportId, {
  message: "Failure investigation must have either sandboxErrorCardId or verificationReportId",
  path: ["sandboxErrorCardId"]
});
export type FailureInvestigation = z.infer<typeof failureInvestigationSchema>;

export const failureHypothesisSchema = z.object({
  id: z.string(),
  missionId: z.string(),
  investigationId: z.string(),
  claim: z.string(),
  evidenceRefs: z.array(z.string()).default([]),
  artifactIds: z.array(z.string()).default([]),
  probeCommands: z.array(z.string()).default([]),
  status: z.enum(["draft", "verified", "rejected", "inconclusive"]),
  confidence: z.enum(["low", "medium", "high"]),
  createdAt: z.string(),
}).refine(data => {
  if (data.status === "verified") {
    return data.evidenceRefs.length > 0 || data.artifactIds.length > 0;
  }
  return true;
}, {
  message: "Verified hypothesis must have evidenceRefs or artifactIds",
  path: ["status"]
});
export type FailureHypothesis = z.infer<typeof failureHypothesisSchema>;

export const distilledLearningCandidateSchema = z.object({
  id: z.string(),
  missionId: z.string(),
  hypothesisId: z.string(),
  title: z.string(),
  rule: z.string(),
  reusablePrompt: z.string().optional(),
  target: z.enum(["memory", "skill", "workflow_template"]),
  trustStatus: z.enum(["suggested", "curator_required"]),
  createdAt: z.string(),
});
export type DistilledLearningCandidate = z.infer<typeof distilledLearningCandidateSchema>;

export const memoryConsultRecordSchema = z.object({
  id: z.string(),
  missionId: z.string(),
  query: z.string(),
  memoryTraceId: z.string().optional(),
  skippedReason: z.string().optional(),
  consultedRecordIds: z.array(z.string()).default([]),
  createdAt: z.string(),
}).refine(data => {
  // If skippedReason is present, it must be a non-empty string.
  if (data.skippedReason !== undefined && data.skippedReason.trim() === "") {
    return false;
  }
  return true;
}, {
  message: "skippedReason must not be empty",
  path: ["skippedReason"]
});
export type MemoryConsultRecord = z.infer<typeof memoryConsultRecordSchema>;

// Event types
export const learningLoopEventTypeSchema = z.enum([
  "learning.failure.recorded",
  "learning.investigation.started",
  "learning.hypothesis.recorded",
  "learning.hypothesis.verified",
  "learning.hypothesis.rejected",
  "learning.distillation.candidate_created",
  "learning.consult.completed",
  "learning.consult.skipped",
]);
export type LearningLoopEventType = z.infer<typeof learningLoopEventTypeSchema>;

// Helper functions for validating transitions and invariant checks
export function createDistilledCandidate(
  hypothesis: FailureHypothesis,
  input: {
    id: string;
    title: string;
    rule: string;
    reusablePrompt?: string;
    target: DistilledLearningCandidate["target"];
    trustStatus: DistilledLearningCandidate["trustStatus"];
  },
  now: () => string,
): DistilledLearningCandidate {
  if (hypothesis.status === "rejected") {
    throw new Error("Rejected hypothesis cannot be used to distill a learning candidate");
  }
  if (hypothesis.status !== "verified") {
    throw new Error("Verified hypothesis is required to distill a learning candidate");
  }

  return distilledLearningCandidateSchema.parse({
    id: input.id,
    missionId: hypothesis.missionId,
    hypothesisId: hypothesis.id,
    title: input.title,
    rule: input.rule,
    reusablePrompt: input.reusablePrompt,
    target: input.target,
    trustStatus: input.trustStatus,
    createdAt: now(),
  });
}

export function recordMemoryConsult(
  input: {
    id: string;
    missionId: string;
    query: string;
    memoryTraceId?: string;
    skippedReason?: string;
    consultedRecordIds?: string[];
  },
  now: () => string,
): MemoryConsultRecord {
  if (input.skippedReason !== undefined && (!input.skippedReason || input.skippedReason.trim() === "")) {
    throw new Error("consult.skipped requires a non-empty skippedReason");
  }

  return memoryConsultRecordSchema.parse({
    id: input.id,
    missionId: input.missionId,
    query: input.query,
    memoryTraceId: input.memoryTraceId,
    skippedReason: input.skippedReason,
    consultedRecordIds: input.consultedRecordIds ?? [],
    createdAt: now(),
  });
}
