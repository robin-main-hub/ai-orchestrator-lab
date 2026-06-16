import { z } from "zod";
import type { ServerMissionRecord } from "./productKernel.js";

/**
 * Skill Archive / Curator loop — Hermes 실전 팁: 작업이 끝날 때마다 잘 먹힌 패턴을
 * skill candidate로 남기고, curator가 승격한다.
 *
 *   mission merged → skill candidate(suggested) → curator approve/reject → pinned
 *   → Obsidian export
 *
 * 불변식:
 *   - **merged 미션만** candidate를 만든다. 실패 미션은 trusted skill을 자동 생성하지
 *     않는다(suggested조차 안 만든다).
 *   - 자동으로 trusted/pinned로 들어가지 않는다 — 반드시 curator 승인을 거친다.
 *   - Obsidian은 source of truth가 아니라 export view. export는 idempotent.
 */

export const skillArchiveSourceSchema = z.enum([
  "verification_fix",
  "successful_prompt",
  "workflow_template",
  "error_resolution",
  "merge_pattern",
]);
export type SkillArchiveSource = z.infer<typeof skillArchiveSourceSchema>;

export const skillTrustStatusSchema = z.enum(["suggested", "curator_approved", "rejected", "pinned"]);
export type SkillTrustStatus = z.infer<typeof skillTrustStatusSchema>;

export const skillActivationStatusSchema = z.enum([
  "inactive",
  "eval_pending",
  "eval_passed",
  "active",
  "quarantined",
]);
export type SkillActivationStatus = z.infer<typeof skillActivationStatusSchema>;

export const skillArchiveCandidateSchema = z.object({
  id: z.string(),
  missionId: z.string(),
  source: skillArchiveSourceSchema,
  title: z.string(),
  summary: z.string(),
  triggerPatterns: z.array(z.string()).default([]),
  reusablePrompt: z.string().optional(),
  relatedFiles: z.array(z.string()).default([]),
  confidence: z.enum(["low", "medium", "high"]),
  trustStatus: skillTrustStatusSchema,
  createdAt: z.string(),
  // New activation properties
  activationStatus: skillActivationStatusSchema.default("inactive"),
  evalRunId: z.string().optional(),
  evalWaiverReason: z.string().optional(),
  activationScope: z.string().optional(),
  quarantineReason: z.string().optional(),
});
export type SkillArchiveCandidate = z.infer<typeof skillArchiveCandidateSchema>;

function isMissionMerged(record: ServerMissionRecord): boolean {
  return record.status === "merged" || record.mergeQueueItems.some((item) => item.status === "merged");
}

/**
 * merged 미션 → skill candidate(들). 모두 trustStatus "suggested"로만 생성(자동 trust
 * 금지). 실패/미머지 미션은 빈 배열.
 */
export function deriveSkillCandidatesFromMission(record: ServerMissionRecord, now: () => string): SkillArchiveCandidate[] {
  if (!isMissionMerged(record)) return [];
  const missionId = record.mission.missionId;
  const candidates: SkillArchiveCandidate[] = [];

  const mergedItem = record.mergeQueueItems.find((item) => item.status === "merged");
  candidates.push({
    id: `skill_${missionId}_merge`,
    missionId,
    source: "merge_pattern",
    title: `머지 패턴 — ${record.mission.title}`,
    summary: mergedItem?.mergeCommitSha
      ? `${mergedItem.sourceBranch ?? mergedItem.branchName} → ${mergedItem.mergeCommitSha.slice(0, 10)}`
      : "검증 통과 후 순차 머지",
    triggerPatterns: [record.mission.goal.slice(0, 60)],
    relatedFiles: [],
    confidence: "medium",
    trustStatus: "suggested",
    createdAt: now(),
    activationStatus: "inactive",
  });

  // 실패했다가 통과한 검증이 있으면 — "이렇게 고쳤다"가 재사용 가치 높은 fix
  const failed = record.verificationReports.some((r) => r.status === "failed");
  const passed = record.verificationReports.some((r) => r.observed && r.status === "passed");
  if (failed && passed) {
    const directive = record.verificationReports.find((r) => r.globalRevisionDirective)?.globalRevisionDirective;
    candidates.push({
      id: `skill_${missionId}_fix`,
      missionId,
      source: "verification_fix",
      title: `검증 실패→통과 수정 — ${record.mission.title}`,
      summary: directive ? `수정 지시: ${directive.slice(0, 120)}` : "실패한 검증을 통과로 되돌린 수정 패턴",
      triggerPatterns: [],
      reusablePrompt: directive,
      relatedFiles: [],
      confidence: "high",
      trustStatus: "suggested",
      createdAt: now(),
      activationStatus: "inactive",
    });
  }

  return candidates;
}

export function isSkillEvalEligible(candidate: SkillArchiveCandidate): boolean {
  return (
    (candidate.trustStatus === "curator_approved" || candidate.trustStatus === "pinned") &&
    candidate.activationStatus === "inactive"
  );
}

export function markSkillEvalPassed(
  candidate: SkillArchiveCandidate,
  evalRunId: string,
): SkillArchiveCandidate {
  return {
    ...candidate,
    activationStatus: "eval_passed",
    evalRunId,
  };
}

export function activateSkill(
  candidate: SkillArchiveCandidate,
  activationScope?: string,
): SkillArchiveCandidate {
  if (!candidate.evalRunId && !candidate.evalWaiverReason) {
    throw new Error("Cannot activate skill without evalRunId or evalWaiverReason");
  }
  if (candidate.evalWaiverReason !== undefined && candidate.evalWaiverReason.trim() === "") {
    throw new Error("Activation waiver requires a non-empty reason");
  }
  return {
    ...candidate,
    activationStatus: "active",
    activationScope: activationScope ?? candidate.activationScope,
  };
}

export function quarantineSkill(
  candidate: SkillArchiveCandidate,
  reason: string,
): SkillArchiveCandidate {
  if (!reason || reason.trim() === "") {
    throw new Error("Quarantine requires a non-empty reason");
  }
  return {
    ...candidate,
    activationStatus: "quarantined",
    quarantineReason: reason,
  };
}

export function isRuntimeLoadableSkill(candidate: SkillArchiveCandidate): boolean {
  if (candidate.trustStatus !== "curator_approved" && candidate.trustStatus !== "pinned") {
    return false;
  }
  if (candidate.activationStatus !== "active") {
    return false;
  }
  const hasValidEval = !!candidate.evalRunId;
  const hasValidWaiver = !!candidate.evalWaiverReason && candidate.evalWaiverReason.trim() !== "";
  return hasValidEval || hasValidWaiver;
}

export function buildSkillRuntimeManifest(
  candidates: SkillArchiveCandidate[],
  scope?: string,
): SkillArchiveCandidate[] {
  return candidates.filter((candidate) => {
    if (!isRuntimeLoadableSkill(candidate)) {
      return false;
    }
    if (scope !== undefined && candidate.activationScope !== undefined) {
      return candidate.activationScope === scope;
    }
    return true;
  });
}

/** curator 결정 → trustStatus 전이. 승인/핀만 trusted, 거절은 rejected. */
export function applyCuratorDecision(
  candidate: SkillArchiveCandidate,
  decision: "approve" | "reject" | "pin",
): SkillArchiveCandidate {
  const trustStatus: SkillTrustStatus =
    decision === "approve" ? "curator_approved" : decision === "pin" ? "pinned" : "rejected";
  return { ...candidate, trustStatus };
}

/** curator 승인(approved/pinned)된 것만 Obsidian으로 내보낸다. */
export function isExportableSkill(candidate: SkillArchiveCandidate): boolean {
  return candidate.trustStatus === "curator_approved" || candidate.trustStatus === "pinned";
}

// ── Curator queue events (L6 live wiring) ───────────────────────────────────
// skill candidate는 mission이 아니라 memory 도메인 이벤트(memory.skill_candidate.*)로
// EventStorage에 산다. missionIndex(mission.* 필터)를 오염시키지 않으면서 같은 단일
// 진실(EventStorage)에 머문다.

export const curatorDecisionSchema = z.enum(["approve", "reject", "pin"]);
export type CuratorDecision = z.infer<typeof curatorDecisionSchema>;

export const memorySkillCandidateCreatedPayloadSchema = z.object({
  missionId: z.string(),
  candidate: skillArchiveCandidateSchema,
});
export type MemorySkillCandidateCreatedPayload = z.infer<typeof memorySkillCandidateCreatedPayloadSchema>;

export const memorySkillCandidateCuratedPayloadSchema = z.object({
  missionId: z.string(),
  candidateId: z.string(),
  decision: curatorDecisionSchema,
  trustStatus: skillTrustStatusSchema,
});
export type MemorySkillCandidateCuratedPayload = z.infer<typeof memorySkillCandidateCuratedPayloadSchema>;

/** POST /missions/:id/skills/:candidateId/curate 본문 */
export const skillCurateRequestSchema = z.object({ decision: curatorDecisionSchema });
export type SkillCurateRequest = z.infer<typeof skillCurateRequestSchema>;

/**
 * created + curated 이벤트에서 현재 curator queue를 파생(순수). created가 suggested로
 * 들어오고, curated가 trustStatus를 전이시킨다. **자동 trusted 승격 없음** — 오직
 * curated 결정으로만 approved/pinned가 된다. 이벤트는 append 순서(시간순)로 적용.
 */
export function deriveSkillArchiveQueue(
  events: ReadonlyArray<{ type: string; payload: unknown }>,
): SkillArchiveCandidate[] {
  const byId = new Map<string, SkillArchiveCandidate>();
  for (const event of events) {
    if (event.type === "memory.skill_candidate.created") {
      const parsed = memorySkillCandidateCreatedPayloadSchema.safeParse(event.payload);
      if (parsed.success && !byId.has(parsed.data.candidate.id)) {
        byId.set(parsed.data.candidate.id, parsed.data.candidate);
      }
    } else if (event.type === "memory.skill_candidate.curated") {
      const parsed = memorySkillCandidateCuratedPayloadSchema.safeParse(event.payload);
      const existing = parsed.success ? byId.get(parsed.data.candidateId) : undefined;
      if (parsed.success && existing) {
        byId.set(parsed.data.candidateId, applyCuratorDecision(existing, parsed.data.decision));
      }
    }
  }
  return [...byId.values()];
}

/**
 * Obsidian export note — id로 결정되는 경로/내용이라 **idempotent**(같은 candidate를
 * 여러 번 export해도 같은 파일을 덮어쓸 뿐 중복 생성 없음).
 */
export function buildObsidianSkillNote(candidate: SkillArchiveCandidate): { path: string; content: string } {
  const path = `skills/${candidate.id}.md`;
  const content = [
    `# ${candidate.title}`,
    "",
    `- source: ${candidate.source}`,
    `- mission: ${candidate.missionId}`,
    `- trust: ${candidate.trustStatus}`,
    `- confidence: ${candidate.confidence}`,
    "",
    candidate.summary,
    candidate.reusablePrompt ? `\n## reusable\n\n${candidate.reusablePrompt}` : "",
    candidate.triggerPatterns.length ? `\n## triggers\n\n${candidate.triggerPatterns.map((t) => `- ${t}`).join("\n")}` : "",
    "",
  ].join("\n");
  return { path, content };
}
