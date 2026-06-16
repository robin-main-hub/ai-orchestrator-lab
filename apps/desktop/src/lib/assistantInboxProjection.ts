import {
  buildBatchRememberCandidatesFromEvidence,
  type ApprovedEvidence,
} from "@ai-orchestrator/simplememo";
import {
  buildLearningRuntimeManifest,
  deriveLearningLoopState,
  LEARNING_EVENT_TYPES,
  type SkillArchiveCandidate,
  type SkillRuntimeActivationRecord,
  type MemoryEvalReport,
} from "@ai-orchestrator/protocol";
import {
  deriveRunnerGateStatus,
  type RunnerGateMode,
  type RunnerGateStatus,
} from "./runnerGateStatus";
import type { EvidenceItem, EvidenceVerdict } from "../components/inbox/EvidenceCard";
import type { LearningLoopItem, LearningLoopStage } from "../components/inbox/LearningLoopCard";
import type { MemoryCandidateItem } from "../components/inbox/MemoryCandidateCard";
import type { ManifestEntry, ManifestBlockReason } from "../components/inbox/RuntimeManifestPreviewCard";
import type { AssistantInboxProps } from "../components/inbox/AssistantInbox";

/**
 * LINE C — Assistant Inbox projection / adapter.
 *
 * Turns GENERIC OS-core sources (evidenceBridge / learningLoop /
 * learningRuntimeManifest / runnerGateStatus) plus NEUTRAL fixtures into the
 * presentational props the AssistantInbox shell consumes. This is the only
 * wiring layer; the inbox itself stays dumb.
 *
 * Invariants this module honors (mirrors the OS-core invariants):
 *   - generic only — no ERP/domain/customer terms. fixtures use example-system /
 *     entity-001 style neutral identifiers.
 *   - pure: no side effect, no callback fired, no provider/runtime/external call.
 *   - blocked/unsafe items carry NO enable/approve affordance (the cards enforce
 *     this; we never project one).
 *   - observed:false is projected honestly (no fake pass).
 */

// ── neutral fixtures (generic only) ───────────────────────────────────────────

/** Approved-evidence fixture — feeds the evidence bridge projection. */
export const EVIDENCE_FIXTURE: ReadonlyArray<ApprovedEvidence> = [
  {
    id: "evidence-001",
    status: "approved",
    title: "example-system build passed",
    summary: "exit 0 on example pipeline",
    aiReason: "build output observed clean; safe to remember as a pattern",
    sourceEventIds: ["event-001"],
    evidenceRefs: ["ref-ci-log"],
  },
  {
    id: "evidence-002",
    status: "published",
    title: "entity-001 lint drift recorded",
    summary: "lint reported style drift in example module",
    evidenceRefs: ["ref-lint-report"],
  },
  {
    // draft — bridge drops this (not committed); kept to prove honest filtering.
    id: "evidence-003",
    status: "draft",
    title: "example-system unverified note",
    summary: "not yet approved",
  },
];

/** Verdict heuristic for the evidence CARD (presentational only). */
function evidenceVerdict(item: ApprovedEvidence): EvidenceVerdict {
  if (item.status === "published") return "warning";
  return "pass";
}

/**
 * Learning-loop event fixture. Drives deriveLearningLoopState — one loop reaches
 * `verified`, another is `rejected` (terminal). Neutral ids only.
 */
export const LEARNING_EVENT_FIXTURE: ReadonlyArray<{ type: string; payload: unknown }> = [
  // loop-001: failed → investigating → hypothesis → verified
  {
    type: LEARNING_EVENT_TYPES.failureRecorded,
    payload: {
      failure: {
        id: "failure-001",
        loopId: "loop-001",
        missionId: "mission-001",
        verificationReportId: "vrep-001",
        summary: "example-system check failed",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    },
  },
  {
    type: LEARNING_EVENT_TYPES.investigationStarted,
    payload: {
      investigation: {
        id: "inv-001",
        loopId: "loop-001",
        investigatorRole: "investigator",
        notes: "read-only observation of example logs",
        evidenceRefs: ["ref-log-001"],
        startedAt: "2026-01-01T00:01:00.000Z",
      },
    },
  },
  {
    type: LEARNING_EVENT_TYPES.hypothesisRecorded,
    payload: {
      hypothesis: {
        id: "hyp-001",
        loopId: "loop-001",
        statement: "example race in entity-001 init",
        evidenceRefs: ["ref-log-001"],
        createdAt: "2026-01-01T00:02:00.000Z",
      },
    },
  },
  {
    type: LEARNING_EVENT_TYPES.hypothesisVerified,
    payload: {
      verification: {
        hypothesisId: "hyp-001",
        loopId: "loop-001",
        outcome: "verified",
        evidenceRefs: ["ref-rerun-001"],
        truthStatus: "observed",
        reason: "rerun observed green after example fix",
        verifiedAt: "2026-01-01T00:03:00.000Z",
      },
    },
  },
  // loop-002: failed → hypothesis → rejected (terminal, no verified hypothesis)
  {
    type: LEARNING_EVENT_TYPES.failureRecorded,
    payload: {
      failure: {
        id: "failure-002",
        loopId: "loop-002",
        missionId: "mission-001",
        sandboxErrorCardId: "sec-002",
        summary: "example-system secondary failure",
        createdAt: "2026-01-01T00:04:00.000Z",
      },
    },
  },
  {
    type: LEARNING_EVENT_TYPES.hypothesisRecorded,
    payload: {
      hypothesis: {
        id: "hyp-002",
        loopId: "loop-002",
        statement: "guessed cause for entity-001",
        evidenceRefs: ["ref-log-002"],
        createdAt: "2026-01-01T00:05:00.000Z",
      },
    },
  },
  {
    type: LEARNING_EVENT_TYPES.hypothesisRejected,
    payload: {
      verification: {
        hypothesisId: "hyp-002",
        loopId: "loop-002",
        outcome: "rejected",
        evidenceRefs: ["ref-rerun-002"],
        truthStatus: "observed",
        reason: "hypothesis did not hold under rerun",
        verifiedAt: "2026-01-01T00:06:00.000Z",
      },
    },
  },
];

/** Skill candidates for the runtime-manifest projection (neutral). */
export const SKILL_CANDIDATE_FIXTURE: ReadonlyArray<SkillArchiveCandidate> = [
  {
    id: "skill-001",
    missionId: "mission-001",
    source: "successful_prompt",
    title: "example-system.alpha",
    summary: "loadable example skill",
    triggerPatterns: [],
    relatedFiles: [],
    confidence: "high",
    trustStatus: "curator_approved",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "skill-002",
    missionId: "mission-001",
    source: "workflow_template",
    title: "example-system.beta",
    summary: "loadable but eval-warned",
    triggerPatterns: [],
    relatedFiles: [],
    confidence: "medium",
    trustStatus: "curator_approved",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "skill-003",
    missionId: "mission-001",
    source: "error_resolution",
    title: "example-system.gamma",
    summary: "eval failed → blocked",
    triggerPatterns: [],
    relatedFiles: [],
    confidence: "low",
    trustStatus: "curator_approved",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "skill-004",
    missionId: "mission-001",
    source: "merge_pattern",
    title: "example-system.delta",
    summary: "quarantined → never loadable",
    triggerPatterns: [],
    relatedFiles: [],
    confidence: "low",
    trustStatus: "curator_approved",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
];

export const SKILL_ACTIVATION_FIXTURE: ReadonlyArray<SkillRuntimeActivationRecord> = [
  { candidateId: "skill-001", activationStatus: "active", evalRunId: "eval-pass-001" },
  { candidateId: "skill-002", activationStatus: "active", evalRunId: "eval-warn-001" },
  { candidateId: "skill-003", activationStatus: "active", evalRunId: "eval-fail-001" },
  { candidateId: "skill-004", activationStatus: "quarantined", quarantinedReason: "example quarantine" },
];

function evalReport(verdict: MemoryEvalReport["verdict"], id: string): MemoryEvalReport {
  return {
    evalCaseId: id,
    k: 1,
    verdict,
    recallAtK: verdict === "pass" ? 1 : 0,
    expectedHitIds: [],
    missingExpectedIds: [],
    forbiddenHitIds: [],
    forbiddenHitRate: 0,
    staleHitIds: [],
    staleHitRate: 0,
    contradictedHitIds: [],
    supersededHitIds: [],
    unknownRetrievedIds: [],
    blockers: verdict === "fail" ? ["example blocker"] : [],
    warnings: verdict === "warning" ? ["example warning"] : [],
  } as MemoryEvalReport;
}

export const EVAL_REPORTS_FIXTURE: Record<string, MemoryEvalReport> = {
  "eval-pass-001": evalReport("pass", "eval-pass-001"),
  "eval-warn-001": evalReport("warning", "eval-warn-001"),
  "eval-fail-001": evalReport("fail", "eval-fail-001"),
};

// ── projections (pure) ─────────────────────────────────────────────────────────

/** Evidence card items, projected via the evidence bridge candidates. */
export function projectEvidenceItems(
  items: ReadonlyArray<ApprovedEvidence> = EVIDENCE_FIXTURE,
): EvidenceItem[] {
  const candidates = buildBatchRememberCandidatesFromEvidence(items);
  const byId = new Map(items.map((e) => [e.id, e]));
  return candidates.map((candidate, index) => {
    const id = candidate.clientRef ?? `evidence-${index}`;
    const source = byId.get(id);
    const refs = [
      ...(candidate.sourceEventIds ?? []).map((eid) => ({ id: `se-${eid}`, label: eid })),
      ...(candidate.evidenceRefs ?? []).map((eid) => ({ id: `er-${eid}`, label: eid })),
    ];
    return {
      id,
      title: candidate.input.title,
      verdict: source ? evidenceVerdict(source) : "pass",
      summary: candidate.input.content || undefined,
      // bridge only emits committed candidates with source refs → observed.
      observed: refs.length > 0,
      refs,
    };
  });
}

const LOOP_STAGE_FALLBACK: Record<string, LearningLoopStage> = {};

/** Learning loop card items, projected from deriveLearningLoopState. */
export function projectLearningLoopItems(
  events: ReadonlyArray<{ type: string; payload: unknown }> = LEARNING_EVENT_FIXTURE,
): LearningLoopItem[] {
  return deriveLearningLoopState(events).map((record) => ({
    id: record.loopId,
    title: record.failure?.summary ?? record.loopId,
    stage: (LOOP_STAGE_FALLBACK[record.stage] ?? record.stage) as LearningLoopStage,
    note: record.investigation?.notes,
  }));
}

/** Memory candidate items, projected from the evidence-bridge candidates. */
export function projectMemoryCandidateItems(
  items: ReadonlyArray<ApprovedEvidence> = EVIDENCE_FIXTURE,
): MemoryCandidateItem[] {
  return buildBatchRememberCandidatesFromEvidence(items).map((candidate, index) => ({
    id: candidate.clientRef ?? `memory-${index}`,
    title: candidate.input.title,
    // bridge fixes initialTrust "suggested" — never auto-written.
    status: "suggested",
    origin: "evidence_bridge",
    // not yet written to a store (no writer injected) → honest false.
    observed: false,
  }));
}

const KNOWN_BLOCK_REASONS: ReadonlySet<string> = new Set<ManifestBlockReason>([
  "eval_failed",
  "not_active",
  "quarantined",
  "no_eval_basis",
]);

/** Runtime manifest entries, projected from buildLearningRuntimeManifest. */
export function projectManifestEntries(input?: {
  candidates?: ReadonlyArray<SkillArchiveCandidate>;
  activations?: ReadonlyArray<SkillRuntimeActivationRecord>;
  evalReportsByRunId?: Record<string, MemoryEvalReport>;
}): ManifestEntry[] {
  const manifest = buildLearningRuntimeManifest({
    candidates: input?.candidates ?? SKILL_CANDIDATE_FIXTURE,
    activations: input?.activations ?? SKILL_ACTIVATION_FIXTURE,
    evalReportsByRunId: input?.evalReportsByRunId ?? EVAL_REPORTS_FIXTURE,
  });
  const titleById = new Map(
    (input?.candidates ?? SKILL_CANDIDATE_FIXTURE).map((c) => [c.id, c.title]),
  );
  const loadable: ManifestEntry[] = manifest.loadable.map((entry) => ({
    id: entry.candidateId,
    name: titleById.get(entry.candidateId) ?? entry.candidateId,
    loadable: true,
    evalWarned: entry.evalWarned,
  }));
  const blocked: ManifestEntry[] = manifest.blocked.map((entry) => {
    const raw = entry.reasons[0];
    const reason: ManifestBlockReason = KNOWN_BLOCK_REASONS.has(raw ?? "")
      ? (raw as ManifestBlockReason)
      : "eval_failed";
    return {
      id: entry.candidateId,
      name: titleById.get(entry.candidateId) ?? entry.candidateId,
      loadable: false,
      reason,
    };
  });
  return [...loadable, ...blocked];
}

/**
 * Runner gate status — dgx disabled DEFAULT. Surfaced as a single evidence-style
 * fact so the read surface reflects the honest gate state (observed:false when
 * the gate is off). No enable/approve affordance is ever projected.
 */
export function projectRunnerGateStatus(mode: RunnerGateMode = "dgx_disabled"): RunnerGateStatus {
  return deriveRunnerGateStatus({ mode });
}

/** Project the runner gate into a read-only evidence row (no action). */
export function projectRunnerGateEvidence(mode: RunnerGateMode = "dgx_disabled"): EvidenceItem {
  const status = projectRunnerGateStatus(mode);
  return {
    id: `runner-gate-${status.mode}`,
    title: `runner gate · ${status.mode}`,
    // gate off / unobserved → blocked-style read (never a fake pass / enable).
    verdict: status.observed ? "pass" : "blocked",
    summary: status.reason,
    observed: status.observed,
    refs: [],
  };
}

/**
 * Compose the full AssistantInbox props from generic sources + neutral fixtures.
 * Pure — no callback, no external call. The runner-gate fact is prepended to the
 * evidence column so the gate's honest (default-disabled) state is visible.
 */
export function buildAssistantInboxProps(): Required<AssistantInboxProps> {
  return {
    evidence: [projectRunnerGateEvidence(), ...projectEvidenceItems()],
    learningLoops: projectLearningLoopItems(),
    memoryCandidates: projectMemoryCandidateItems(),
    manifestEntries: projectManifestEntries(),
  };
}
