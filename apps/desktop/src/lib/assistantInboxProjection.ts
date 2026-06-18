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
import type {
  AssistantInboxProps,
  AssistantInboxSources,
  InboxSectionSource,
} from "../components/inbox/AssistantInbox";

/**
 * LINE C / H — Assistant Inbox projection / adapter.
 *
 * Turns GENERIC OS-core sources (evidenceBridge / learningLoop /
 * learningRuntimeManifest / runnerGateStatus) plus NEUTRAL fixtures into the
 * presentational props the AssistantInbox shell consumes. This is the only
 * wiring layer; the inbox itself stays dumb.
 *
 * LINE H adds an HONEST live-vs-example separation:
 *   - `buildAssistantInboxLiveProps` projects from REAL app state where it
 *     safely exists (real learning events, real ProjectRecords, real runner
 *     gate config). When a source has no live data it returns an HONEST EMPTY
 *     STATE (source "empty") instead of inventing fixtures.
 *   - `buildAssistantInboxProps` keeps the legacy fixture composition but every
 *     section is now explicitly labeled source "example" (예시/fixture) so it is
 *     never mistaken for live OS state.
 *
 * Invariants this module honors (mirrors the OS-core invariants):
 *   - generic only — no ERP/domain/customer terms. fixtures use example-system /
 *     entity-001 style neutral identifiers.
 *   - pure: no side effect, no callback fired, no provider/runtime/external call.
 *   - blocked/unsafe items carry NO enable/approve affordance (the cards enforce
 *     this; we never project one).
 *   - observed:false is projected honestly (no fake pass).
 *   - fixtures are labeled "example"; live is labeled "live"; empty is honest.
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

/**
 * Learning loop card items, projected from deriveLearningLoopState.
 *
 * LINE O — surfaces richer real fidelity from each loop record: the recorded
 * hypothesis count, verified/rejected splits, and a compact note that prefers
 * the investigation note but falls back to a derived stage summary. This stays
 * pure and honest: counts come straight off the derived record (no invention).
 */
export function projectLearningLoopItems(
  events: ReadonlyArray<{ type: string; payload: unknown }> = LEARNING_EVENT_FIXTURE,
): LearningLoopItem[] {
  return deriveLearningLoopState(events).map((record) => {
    const hypothesisCount = record.hypotheses.length;
    const verifiedCount = record.verifiedHypothesisIds.length;
    const rejectedCount = record.rejectedHypothesisIds.length;
    const note =
      record.investigation?.notes ??
      (verifiedCount > 0
        ? `${verifiedCount} verified / ${hypothesisCount} hypotheses`
        : rejectedCount > 0
          ? `${rejectedCount} rejected / ${hypothesisCount} hypotheses`
          : undefined);
    return {
      id: record.loopId,
      title: record.failure?.summary ?? record.loopId,
      stage: (LOOP_STAGE_FALLBACK[record.stage] ?? record.stage) as LearningLoopStage,
      note,
      hypothesisCount,
      verifiedCount,
      rejectedCount,
    };
  });
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
 *
 * NOTE: this is the FIXTURE composition. Every section is labeled source
 * "example" (예시/fixture) so it is never mistaken for live OS state. For honest
 * live wiring use `buildAssistantInboxLiveProps`.
 */
export function buildAssistantInboxProps(): Required<Pick<AssistantInboxProps, "evidence" | "learningLoops" | "memoryCandidates" | "manifestEntries">> & {
  sources: Required<AssistantInboxSources>;
} {
  return {
    evidence: [projectRunnerGateEvidence(), ...projectEvidenceItems()],
    learningLoops: projectLearningLoopItems(),
    memoryCandidates: projectMemoryCandidateItems(),
    manifestEntries: projectManifestEntries(),
    sources: {
      evidence: "example",
      learning: "example",
      memory: "example",
      manifest: "example",
    },
  };
}

// ── LINE H — honest LIVE projection ──────────────────────────────────────────

/**
 * Real, observed app inputs. All optional — a missing/empty input yields an
 * HONEST EMPTY STATE for that section (never a fixture).
 */
export type AssistantInboxLiveInput = {
  /** Real runner gate config. dgx stays DISABLED by default; observed honest. */
  runnerGateMode?: RunnerGateMode;
  dgxExecutionEnabled?: boolean;
  executorPresent?: boolean;
  /**
   * LINE C — total real event-log size (all events, not just learning). Surfaced
   * as an honest "events N" signal in the command strip. Absent/0 → no-live-data.
   */
  eventLogCount?: number;
  /**
   * Batch 8 LINE B — real event-log entries for the time-bucketed Today/Recent
   * lanes. Read-only; only id/type/createdAt are used. Absent → honest empty.
   */
  recentEvents?: ReadonlyArray<{ id: string; type: string; createdAt: string; source?: string }>;
  /**
   * Batch 8 LINE B — injected "now" (ms) for deterministic time bucketing. The
   * App passes Date.now(); pure code never calls Date.now itself. Absent → no
   * bucketing (Today/Recent honest empty).
   */
  nowMs?: number;
  /**
   * Batch 14 LINE D — generic plugin source results (read-only). Absent → honest
   * empty (no plugin section). Never executes/loads a plugin.
   */
  pluginSources?: ReadonlyArray<
    import("./plugins/pluginWorkItemSource").WorkItemLiteProviderResult
  >;
  /** Batch 14 LINE D — generic plugin evidence (read-only ingress). */
  pluginEvidence?: ReadonlyArray<import("./plugins/pluginEvidenceSource").PluginEvidence>;
  /**
   * Batch 17 LINE A — generic read-only patch candidates for the Patch Candidate
   * Speed Lane. Absent → honest empty (no lane). Display/preview only — never
   * applied/committed/dispatched; the inbox holds no runner-execution coupling.
   */
  patchCandidates?: ReadonlyArray<import("./plugins/patchCandidateSource").PatchCandidateInput>;
  /**
   * Engine E2 — real runner/mission sessions (workbenchMissionStore snapshot) for
   * the read-only Runner Theater. Structural subset of WorkbenchMission. Absent →
   * honest empty (no runner sessions observed). Read-only; never starts/dispatches.
   */
  runnerSessions?: ReadonlyArray<import("./runnerTheater").RunnerSessionInput>;
  /**
   * Engine E4A — a real, generic evidence DRAFT input for the LIVE Evidence Draft
   * surface. Absent → no card (honest empty). Projected read-only via
   * projectEvidenceDraft; never sent / written / approved. No producer exists yet,
   * so this stays absent in the real app until a draft source is wired.
   */
  evidenceDraft?: import("./evidenceDraft").EvidenceDraftInput;
  /**
   * Engine E5 — explicitly-supplied read-only WorkItem CANDIDATE inputs, merged
   * with candidates DERIVED from the live surfaces. Candidate-only; nothing is
   * created/committed/appended/written. Absent → candidates derive purely from
   * live signals (honest empty when none).
   */
  workItemCandidates?: ReadonlyArray<import("./workItemCandidate").WorkItemCandidateInput>;
  /** Real learning-loop events (e.g. App eventLog). Filtered to learning types. */
  learningEvents?: ReadonlyArray<{ type: string; payload: unknown }>;
  /** Real persisted project records (H10 useProjectRecordController.records). */
  projectRecords?: ReadonlyArray<{
    missionId: string;
    title: string;
  }>;
  /**
   * Real runtime-manifest inputs (skill activation / eval state). Only projected
   * when candidates are present; otherwise honest empty.
   */
  manifest?: {
    candidates?: ReadonlyArray<SkillArchiveCandidate>;
    activations?: ReadonlyArray<SkillRuntimeActivationRecord>;
    evalReportsByRunId?: Record<string, MemoryEvalReport>;
  };
  /**
   * Optional clearly-labeled evidence EXAMPLE. When true the evidence section
   * shows the fixture rows explicitly labeled source "example". Default false →
   * honest empty (OS core has no real domain evidence). NEVER shown as live.
   */
  includeEvidenceExample?: boolean;
};

const LEARNING_EVENT_TYPE_SET: ReadonlySet<string> = new Set<string>(
  Object.values(LEARNING_EVENT_TYPES),
);

/** Keep only learning-loop relevant events from a generic app event log. */
export function filterLearningEvents(
  events: ReadonlyArray<{ type: string; payload: unknown }>,
): Array<{ type: string; payload: unknown }> {
  return events.filter((e) => LEARNING_EVENT_TYPE_SET.has(e.type));
}

/**
 * Project real project records into read-only memory candidate rows.
 * Honest: status stays "suggested" (resume store never auto-writes memory) and
 * observed:false (no memory writer is wired). origin reflects the resume store.
 */
export function projectMemoryCandidatesFromProjectRecords(
  records: ReadonlyArray<{ missionId: string; title: string }>,
): MemoryCandidateItem[] {
  return records.map((record) => ({
    id: `project-${record.missionId}`,
    title: record.title,
    status: "suggested",
    origin: "learning_loop",
    // resume store is a passive snapshot — nothing written to memory → honest false.
    observed: false,
    // LINE O — finer live note: make the suggested/observed split explicit so a
    // viewer sees this is a candidate, not a committed write. Honest, no fake.
    note: "suggested from resume snapshot · not written (observed:false)",
  }));
}

/**
 * LINE O — compact live-fidelity summary for the learning section. Pure: counts
 * loops by their terminal status off the real derived records. Returned for
 * callers/tests that want a one-line live signal without re-deriving.
 */
export function summarizeLearningLive(
  events: ReadonlyArray<{ type: string; payload: unknown }>,
): { total: number; verified: number; rejected: number; active: number } {
  const records = deriveLearningLoopState(filterLearningEvents(events));
  let verified = 0;
  let rejected = 0;
  let active = 0;
  for (const r of records) {
    if (r.stage === "rejected") rejected += 1;
    else if (r.stage === "verified" || r.stage === "distilled" || r.stage === "consulted")
      verified += 1;
    else active += 1;
  }
  return { total: records.length, verified, rejected, active };
}

/**
 * Honest live composition. Each section is projected from real inputs when they
 * exist; otherwise it returns an empty array with source "empty" (honest empty
 * state). The evidence section is empty by default (OS core has no real domain
 * evidence) unless `includeEvidenceExample` opts into a labeled "example".
 */
export function buildAssistantInboxLiveProps(
  input: AssistantInboxLiveInput = {},
): Required<Pick<AssistantInboxProps, "evidence" | "learningLoops" | "memoryCandidates" | "manifestEntries">> & {
  sources: Required<AssistantInboxSources>;
} {
  // Runner gate is ALWAYS real/live: it's a derived honest fact (dgx disabled
  // → observed:false). It anchors the evidence column.
  const gateEvidence = deriveRunnerGateStatus({
    mode: input.runnerGateMode ?? "dgx_disabled",
    dgxExecutionEnabled: input.dgxExecutionEnabled,
    executorPresent: input.executorPresent,
  });
  const runnerRow: EvidenceItem = {
    id: `runner-gate-${gateEvidence.mode}`,
    title: `runner gate · ${gateEvidence.mode}`,
    verdict: gateEvidence.observed ? "pass" : "blocked",
    summary: gateEvidence.reason,
    observed: gateEvidence.observed,
    refs: [],
  };

  // Evidence: runner gate (live) + optional labeled example. OS core has no real
  // domain evidence, so anything beyond the gate is an explicit example.
  const exampleEvidence = input.includeEvidenceExample
    ? projectEvidenceItems().map((e) => ({ ...e, id: `example-${e.id}` }))
    : [];
  const evidence: EvidenceItem[] = [runnerRow, ...exampleEvidence];
  const evidenceSource: InboxSectionSource = input.includeEvidenceExample ? "example" : "live";

  // Learning loops: real events only (server auto-emit is OFF → usually none).
  const learningEvents = filterLearningEvents(input.learningEvents ?? []);
  const learningLoops = learningEvents.length > 0 ? projectLearningLoopItems(learningEvents) : [];
  const learningSource: InboxSectionSource = learningLoops.length > 0 ? "live" : "empty";

  // Memory candidates: from real persisted project records (H10), else empty.
  const projectRecords = input.projectRecords ?? [];
  const memoryCandidates =
    projectRecords.length > 0 ? projectMemoryCandidatesFromProjectRecords(projectRecords) : [];
  const memorySource: InboxSectionSource = memoryCandidates.length > 0 ? "live" : "empty";

  // Runtime manifest: only when real candidates are present; else empty.
  const manifestCandidates = input.manifest?.candidates ?? [];
  const manifestEntries =
    manifestCandidates.length > 0
      ? projectManifestEntries({
          candidates: manifestCandidates,
          activations: input.manifest?.activations,
          evalReportsByRunId: input.manifest?.evalReportsByRunId,
        })
      : [];
  const manifestSource: InboxSectionSource = manifestEntries.length > 0 ? "live" : "empty";

  return {
    evidence,
    learningLoops,
    memoryCandidates,
    manifestEntries,
    sources: {
      evidence: evidenceSource,
      learning: learningSource,
      memory: memorySource,
      manifest: manifestSource,
    },
  };
}
