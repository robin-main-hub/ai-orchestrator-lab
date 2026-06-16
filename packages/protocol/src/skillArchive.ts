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
    });
  }

  return candidates;
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

// ─────────────────────────────────────────────────────────────────────────────
// L8 PR 3 — Skill Runtime Activation Contract
//
// curator 승인(보관 가치)과 runtime 활성화(다음 agent가 실제로 써도 됨)를 분리한다.
// trustStatus만으로는 절대 runtime load되지 않는다. pinned도 eval을 자동 우회하지 않는다.
//
// 축 분리:
//   - SkillTrustStatus       : suggested/curator_approved/rejected/pinned (curator 판단)
//   - SkillActivationStatus  : inactive/eval_pending/eval_passed/active/quarantined (runtime 계약)
//
// 주의: 이 축은 MemoryRecord.activationState(memory recall 쪽 상태)와 **다른 축**이며,
//       그 타입을 재사용하지 않는다. 이름이 비슷해도 의미가 다르다.
//
// 이 PR은 계약 + deterministic manifest builder까지만. 실제 runtime loader / SimpleMem /
// server route / UI / DB는 비범위(후속 실행 단계).
// ─────────────────────────────────────────────────────────────────────────────

export const skillActivationStatusSchema = z.enum([
  "inactive", // 활성화 안 됨(기본)
  "eval_pending", // eval 대기 중
  "eval_passed", // eval 통과 — 하지만 아직 runtime에 올리기로 결정 안 됨
  "active", // runtime에 올리기로 결정됨
  "quarantined", // 격리 — 어떤 경우에도 load 불가
]);
export type SkillActivationStatus = z.infer<typeof skillActivationStatusSchema>;

/**
 * skill의 runtime 활성화 계약 레코드. SkillArchiveCandidate와 **분리**해서 둔다
 * (candidate는 curator 도메인, 이건 runtime 도메인). candidateId로 연결.
 *
 * 정직성:
 *   - evalRunId는 실제 MemoryEval/SkillEval run을 가리킬 때만 채운다(가짜 금지).
 *   - evalWaiverReason은 eval을 면제할 명시적 사유 — pinned여도 자동 면제는 없다.
 *   - activatedAt/quarantinedReason은 상태 전이 흔적.
 */
export const skillRuntimeActivationRecordSchema = z.object({
  candidateId: z.string(),
  activationStatus: skillActivationStatusSchema,
  /** eval run 참조 — eval_passed/active 전이의 근거 */
  evalRunId: z.string().optional(),
  /** eval 면제 사유 — 있으면 evalRunId 없이도 loadable(단 pinned/active 전제) */
  evalWaiverReason: z.string().optional(),
  /** 활성화 범위(예: "global", "project:xyz"). manifest 빌드 시 필터에 쓴다 */
  activationScope: z.string().optional(),
  activatedAt: z.string().optional(),
  quarantinedReason: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type SkillRuntimeActivationRecord = z.infer<typeof skillRuntimeActivationRecordSchema>;

/** inactive 기본 활성화 레코드. */
export function initialSkillActivation(candidateId: string): SkillRuntimeActivationRecord {
  return { candidateId, activationStatus: "inactive" };
}

// ── 상태 전이 (순수) ──

/** eval 자격: curator_approved 또는 pinned이고, 아직 격리되지 않았을 때만. */
export function isSkillEvalEligible(
  candidate: Pick<SkillArchiveCandidate, "trustStatus">,
  activation: Pick<SkillRuntimeActivationRecord, "activationStatus">,
): boolean {
  const trusted = candidate.trustStatus === "curator_approved" || candidate.trustStatus === "pinned";
  return trusted && activation.activationStatus !== "quarantined";
}

export function markSkillEvalPending(activation: SkillRuntimeActivationRecord, now: () => string): SkillRuntimeActivationRecord {
  if (activation.activationStatus === "quarantined") return activation; // 격리는 전이 불가
  return { ...activation, activationStatus: "eval_pending", updatedAt: now() };
}

export function markSkillEvalPassed(
  activation: SkillRuntimeActivationRecord,
  evalRunId: string,
  now: () => string,
): SkillRuntimeActivationRecord {
  if (activation.activationStatus === "quarantined") return activation;
  return { ...activation, activationStatus: "eval_passed", evalRunId, updatedAt: now() };
}

/**
 * 활성화 — eval_passed 상태에서, evalRunId 또는 evalWaiverReason이 있어야만 active로 전이.
 * 그 외(자격 미달/격리)면 변경 없이 그대로 돌려준다(자동 승격 금지).
 */
export function activateSkill(
  activation: SkillRuntimeActivationRecord,
  input: { activationScope?: string; evalWaiverReason?: string; now: () => string },
): SkillRuntimeActivationRecord {
  if (activation.activationStatus === "quarantined") return activation;
  const hasEvalBasis = Boolean(activation.evalRunId || input.evalWaiverReason || activation.evalWaiverReason);
  if (!hasEvalBasis) return activation; // eval 근거 없으면 활성화 안 됨
  if (activation.activationStatus !== "eval_passed") return activation; // eval_passed에서만 active로
  return {
    ...activation,
    activationStatus: "active",
    activationScope: input.activationScope ?? activation.activationScope,
    evalWaiverReason: input.evalWaiverReason ?? activation.evalWaiverReason,
    activatedAt: input.now(),
    updatedAt: input.now(),
  };
}

export function quarantineSkill(
  activation: SkillRuntimeActivationRecord,
  reason: string,
  now: () => string,
): SkillRuntimeActivationRecord {
  return { ...activation, activationStatus: "quarantined", quarantinedReason: reason, updatedAt: now() };
}

// ── runtime loadability ──

export type SkillLoadBlockReason =
  | "not_trusted" // trustStatus가 curator_approved/pinned 아님
  | "not_active" // activationStatus가 active 아님
  | "quarantined" // 격리됨
  | "no_eval_basis"; // active인데 evalRunId도 evalWaiverReason도 없음

/**
 * runtime load 가능 판정(순수, 결정론적).
 *
 * 조건(모두 만족해야 loadable):
 *   1. trustStatus ∈ {curator_approved, pinned}
 *   2. activationStatus === "active"
 *   3. evalRunId 또는 evalWaiverReason 중 하나가 있음 (pinned도 자동 면제 없음)
 *   4. quarantined가 아님 (격리는 pinned여도 무조건 차단)
 *
 * loadable=false면 reasons에 막은 사유를 채운다(정직 표시).
 */
export function isSkillRuntimeLoadable(
  candidate: Pick<SkillArchiveCandidate, "trustStatus">,
  activation: SkillRuntimeActivationRecord,
): { loadable: boolean; reasons: SkillLoadBlockReason[]; waived: boolean } {
  const reasons: SkillLoadBlockReason[] = [];

  if (activation.activationStatus === "quarantined") {
    // 격리는 단독 하드 차단 — 다른 사유 평가 없이 즉시 막는다.
    return { loadable: false, reasons: ["quarantined"], waived: false };
  }

  const trusted = candidate.trustStatus === "curator_approved" || candidate.trustStatus === "pinned";
  if (!trusted) reasons.push("not_trusted");

  if (activation.activationStatus !== "active") reasons.push("not_active");

  const hasEvalBasis = Boolean(activation.evalRunId || activation.evalWaiverReason);
  if (!hasEvalBasis) reasons.push("no_eval_basis");

  const loadable = reasons.length === 0;
  const waived = loadable && !activation.evalRunId && Boolean(activation.evalWaiverReason);
  return { loadable, reasons, waived };
}

// ── runtime manifest ──

export type SkillRuntimeManifestEntry = {
  candidateId: string;
  title: string;
  source: SkillArchiveSource;
  trustStatus: SkillTrustStatus;
  activationStatus: SkillActivationStatus;
  evalRunId?: string;
  /** eval 면제로 들어온 항목 표식(정직) */
  waived: boolean;
  activationScope?: string;
};

export type SkillRuntimeManifestBlocked = {
  candidateId: string;
  reasons: SkillLoadBlockReason[];
};

export type SkillRuntimeManifest = {
  scope?: string;
  /** runtime에 올라가는 항목들 — candidateId asc로 정렬(결정론적) */
  loadable: SkillRuntimeManifestEntry[];
  /** 막힌 항목 + 사유 */
  blocked: SkillRuntimeManifestBlocked[];
};

export type SkillRuntimeManifestInput = {
  candidates: ReadonlyArray<SkillArchiveCandidate>;
  activations: ReadonlyArray<SkillRuntimeActivationRecord>;
  /** 주어지면 이 scope에 맞는 활성화만 loadable. activationScope 미지정 항목은 모든 scope에 허용 */
  scope?: string;
};

/**
 * 결정론적 runtime manifest 빌더.
 *   - Date.now/랜덤 없음 — 같은 입력 → 같은 출력.
 *   - candidateId asc 안정 정렬.
 *   - 중복 candidateId는 첫 등장만 유지(나머지 drop) — 결정론적 dedupe.
 *   - activation 레코드가 없는 candidate는 inactive로 간주 → blocked(not_active).
 *   - scope가 주어지면, activationScope가 있고 scope와 다른 항목은 loadable에서 제외(blocked: not_active 처리).
 */
export function buildSkillRuntimeManifest(input: SkillRuntimeManifestInput): SkillRuntimeManifest {
  const activationByCandidate = new Map<string, SkillRuntimeActivationRecord>();
  for (const a of input.activations) {
    if (!activationByCandidate.has(a.candidateId)) activationByCandidate.set(a.candidateId, a);
  }

  const seen = new Set<string>();
  const loadable: SkillRuntimeManifestEntry[] = [];
  const blocked: SkillRuntimeManifestBlocked[] = [];

  // 입력 순서와 무관하게 결정론적이도록 candidateId로 정렬 후 처리.
  const sortedCandidates = [...input.candidates].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  for (const candidate of sortedCandidates) {
    if (seen.has(candidate.id)) continue; // 중복 dedupe
    seen.add(candidate.id);

    const activation = activationByCandidate.get(candidate.id) ?? initialSkillActivation(candidate.id);
    const verdict = isSkillRuntimeLoadable(candidate, activation);

    // scope 필터: activationScope가 있고 요청 scope와 다르면 loadable에서 빼고 not_active로 막는다.
    const scopeMismatch =
      input.scope !== undefined &&
      activation.activationScope !== undefined &&
      activation.activationScope !== input.scope;

    if (verdict.loadable && !scopeMismatch) {
      loadable.push({
        candidateId: candidate.id,
        title: candidate.title,
        source: candidate.source,
        trustStatus: candidate.trustStatus,
        activationStatus: activation.activationStatus,
        evalRunId: activation.evalRunId,
        waived: verdict.waived,
        activationScope: activation.activationScope,
      });
    } else {
      const reasons = scopeMismatch && verdict.loadable ? (["not_active"] as SkillLoadBlockReason[]) : verdict.reasons;
      blocked.push({ candidateId: candidate.id, reasons });
    }
  }

  // loadable/blocked 모두 candidateId asc로 안정 정렬(이미 정렬 순회지만 명시적 보장).
  loadable.sort((a, b) => (a.candidateId < b.candidateId ? -1 : a.candidateId > b.candidateId ? 1 : 0));
  blocked.sort((a, b) => (a.candidateId < b.candidateId ? -1 : a.candidateId > b.candidateId ? 1 : 0));

  return { scope: input.scope, loadable, blocked };
}
