import type { PatchCandidate } from "./plugins/patchCandidateSource";
import type { RunnerTheaterRow } from "./runnerTheater";
import type { EvidenceDraft } from "./evidenceDraft";
import type { LearningMemoryConsole } from "./learningMemoryConsole";

/**
 * Engine E5 — WorkItem Canonical Seed (candidate-only).
 *
 * The first generic CENTRAL AXIS over the OS's read-only surfaces: it does NOT
 * create committed work. A `WorkItemCandidate` is a read-only object meaning
 * "the OS sees this signal as a possible work item" — nothing is persisted,
 * appended, sent, dispatched, or committed.
 *
 * Pure projection only — no EventStorage append, no server write, no DB
 * migration, no automatic WorkItem creation, no external send, no runner
 * dispatch, no Date.now, no I/O. Generic only (no domain/company/ERP fields).
 * The derive helpers turn EXISTING projected surfaces (patch candidates, runner
 * theater, evidence draft, learning/memory, source health) into candidates so
 * the operator can see "of all these signals, what looks like real work?".
 */

export type WorkItemCandidateKind = "patch" | "runner" | "evidence" | "memory" | "source";
/** Generic urgency lane (not a domain status). */
export type WorkItemCandidateLane = "now" | "soon" | "watch";
/** Honest candidate state — never "committed" (this seed has no lifecycle). */
export type WorkItemCandidateStatus = "candidate" | "observed" | "blocked";
export type WorkItemRisk = "low" | "medium" | "high";

/** Raw candidate ingress (pre-normalization). */
export type WorkItemCandidateInput = {
  id: string;
  title: string;
  kind: WorkItemCandidateKind;
  lane: WorkItemCandidateLane;
  status: WorkItemCandidateStatus;
  risk: WorkItemRisk;
  sourceRefs?: ReadonlyArray<string>;
  evidenceRefs?: ReadonlyArray<string>;
  createdAt?: string;
  observed?: boolean;
  /** Why the OS flagged this as a candidate (honest, generic). */
  reason?: string;
};

/** Projected, display-ready candidate row. */
export type WorkItemCandidate = {
  id: string;
  title: string;
  kind: WorkItemCandidateKind;
  lane: WorkItemCandidateLane;
  status: WorkItemCandidateStatus;
  risk: WorkItemRisk;
  sourceRefs: ReadonlyArray<string>;
  evidenceRefs: ReadonlyArray<string>;
  createdAt?: string;
  observed: boolean;
  reason: string;
  /** Fixed honest note — a candidate, never committed work. */
  note: string;
};

const KINDS = new Set<WorkItemCandidateKind>(["patch", "runner", "evidence", "memory", "source"]);
const LANES = new Set<WorkItemCandidateLane>(["now", "soon", "watch"]);
const STATUSES = new Set<WorkItemCandidateStatus>(["candidate", "observed", "blocked"]);
const RISKS = new Set<WorkItemRisk>(["low", "medium", "high"]);

const LANE_ORDER: Record<WorkItemCandidateLane, number> = { now: 0, soon: 1, watch: 2 };
const RISK_ORDER: Record<WorkItemRisk, number> = { high: 0, medium: 1, low: 2 };

export const WORK_ITEM_LANES: ReadonlyArray<WorkItemCandidateLane> = ["now", "soon", "watch"];

function nonEmpty(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function isValid(c: WorkItemCandidateInput): boolean {
  return (
    nonEmpty(c.id) &&
    nonEmpty(c.title) &&
    KINDS.has(c.kind) &&
    LANES.has(c.lane) &&
    STATUSES.has(c.status) &&
    RISKS.has(c.risk)
  );
}

/**
 * Normalize + validate + de-dupe + sort candidate inputs into display rows.
 * Invalid rows are dropped (never crash). Pure — no side effect, no Date.now.
 * Missing source/evidence refs degrade safely to empty arrays.
 */
export function projectWorkItemCandidates(
  inputs: ReadonlyArray<WorkItemCandidateInput> = [],
): WorkItemCandidate[] {
  const seen = new Set<string>();
  const rows: WorkItemCandidate[] = [];
  for (const c of inputs) {
    if (!isValid(c) || seen.has(c.id)) continue;
    seen.add(c.id);
    rows.push({
      id: c.id,
      title: c.title,
      kind: c.kind,
      lane: c.lane,
      status: c.status,
      risk: c.risk,
      sourceRefs: Array.isArray(c.sourceRefs) ? c.sourceRefs : [],
      evidenceRefs: Array.isArray(c.evidenceRefs) ? c.evidenceRefs : [],
      createdAt: c.createdAt,
      observed: c.observed === true,
      reason: nonEmpty(c.reason) ? (c.reason as string) : "flagged as a work candidate",
      note: "work item candidate · read-only · not committed work",
    });
  }
  rows.sort(
    (a, b) =>
      LANE_ORDER[a.lane] - LANE_ORDER[b.lane] ||
      RISK_ORDER[a.risk] - RISK_ORDER[b.risk] ||
      a.id.localeCompare(b.id),
  );
  return rows;
}

// ── derive helpers (pure) — existing surfaces → candidate inputs ───────────────

/** Patch candidates with a blocked/warning safety signal → work candidates. */
export function candidatesFromPatchCandidates(
  patches: ReadonlyArray<PatchCandidate> = [],
): WorkItemCandidateInput[] {
  return patches
    .filter((p) => p.safetyStatus === "blocked" || p.safetyStatus === "warning")
    .map((p) => ({
      id: `wic-patch-${p.candidateId}`,
      title: `patch ${p.candidateId} needs review`,
      kind: "patch" as const,
      lane: p.safetyStatus === "blocked" ? ("now" as const) : ("soon" as const),
      status: p.safetyStatus === "blocked" ? ("blocked" as const) : ("candidate" as const),
      risk: p.safetyStatus === "blocked" ? ("high" as const) : ("medium" as const),
      sourceRefs: [p.missionId].filter(nonEmpty),
      evidenceRefs: p.evidenceRefs ?? [],
      observed: p.observed,
      reason: `patch safety ${p.safetyStatus}`,
    }));
}

/** Runner rows needing attention (or stalled while active) → work candidates. */
export function candidatesFromRunnerTheater(
  rows: ReadonlyArray<RunnerTheaterRow> = [],
): WorkItemCandidateInput[] {
  return rows
    .filter((r) => r.lane === "attention" || (r.lane === "active" && r.liveness === "stale"))
    .map((r) => {
      const stalled = r.lane === "active" && r.liveness === "stale";
      return {
        id: `wic-runner-${r.id}`,
        title: r.title,
        kind: "runner" as const,
        lane: "now" as const,
        status: r.lane === "attention" ? ("blocked" as const) : ("observed" as const),
        risk: "high" as const,
        sourceRefs: r.branch ? [r.branch] : [],
        observed: true,
        reason: stalled ? `runner ${r.status} · heartbeat stale` : `runner ${r.status}`,
      };
    });
}

/** Evidence draft missing-info / ask slots → low-urgency work candidates. */
export function candidatesFromEvidenceDraft(
  draft: EvidenceDraft | undefined,
): WorkItemCandidateInput[] {
  if (!draft) return [];
  return draft.missing.map((m) => ({
    id: `wic-evidence-${draft.id}-${m.claimId}`,
    title: m.text,
    kind: "evidence" as const,
    lane: "watch" as const,
    status: "candidate" as const,
    risk: "low" as const,
    evidenceRefs: [],
    observed: false,
    reason: m.ask,
  }));
}

/** Learning/memory health signals → memory work candidates. */
export function candidatesFromLearningMemory(
  console: LearningMemoryConsole | undefined,
): WorkItemCandidateInput[] {
  if (!console) return [];
  const out: WorkItemCandidateInput[] = [];
  if (console.evalHealth.fail > 0) {
    out.push({
      id: "wic-memory-eval-fail",
      title: `${console.evalHealth.fail} memory eval failing`,
      kind: "memory",
      lane: "now",
      status: "blocked",
      risk: "high",
      observed: true,
      reason: "memory eval verdict fail",
    });
  }
  const hygiene = console.evalHealth.forbiddenHits + console.evalHealth.contradictedHits;
  if (hygiene > 0) {
    out.push({
      id: "wic-memory-hygiene",
      title: "memory hygiene: forbidden / contradicted hits",
      kind: "memory",
      lane: "soon",
      status: "candidate",
      risk: "medium",
      observed: true,
      reason: `${console.evalHealth.forbiddenHits} forbidden / ${console.evalHealth.contradictedHits} contradicted`,
    });
  }
  return out;
}

/** Source health (error/stale) → source work candidates. */
export function candidatesFromSourceHealth(
  sources: ReadonlyArray<{ pluginId: string; health: string }> = [],
): WorkItemCandidateInput[] {
  return sources
    .filter((s) => s.health === "error" || s.health === "stale")
    .map((s) => ({
      id: `wic-source-${s.pluginId}`,
      title: `source ${s.pluginId} ${s.health}`,
      kind: "source" as const,
      lane: s.health === "error" ? ("now" as const) : ("watch" as const),
      status: s.health === "error" ? ("blocked" as const) : ("candidate" as const),
      risk: s.health === "error" ? ("high" as const) : ("low" as const),
      sourceRefs: [s.pluginId],
      observed: true,
      reason: `source health ${s.health}`,
    }));
}

/**
 * The central axis: derive candidates from any combination of existing read-only
 * surfaces, plus any explicitly-supplied candidate inputs, and project them. All
 * inputs optional → honest empty when no signals. Pure; creates nothing.
 */
export function deriveWorkItemCandidates(signals: {
  patchCandidates?: ReadonlyArray<PatchCandidate>;
  runnerTheater?: ReadonlyArray<RunnerTheaterRow>;
  evidenceDraft?: EvidenceDraft;
  learningMemory?: LearningMemoryConsole;
  sourceHealth?: ReadonlyArray<{ pluginId: string; health: string }>;
  extra?: ReadonlyArray<WorkItemCandidateInput>;
}): WorkItemCandidate[] {
  return projectWorkItemCandidates([
    ...candidatesFromPatchCandidates(signals.patchCandidates),
    ...candidatesFromRunnerTheater(signals.runnerTheater),
    ...candidatesFromEvidenceDraft(signals.evidenceDraft),
    ...candidatesFromLearningMemory(signals.learningMemory),
    ...candidatesFromSourceHealth(signals.sourceHealth),
    ...(signals.extra ?? []),
  ]);
}

export type WorkItemCandidateSummary = Record<WorkItemCandidateLane, number> & {
  total: number;
  byKind: Record<WorkItemCandidateKind, number>;
};

/** Pure roll-up of candidates by lane + kind. */
export function summarizeWorkItemCandidates(
  rows: ReadonlyArray<WorkItemCandidate>,
): WorkItemCandidateSummary {
  const s: WorkItemCandidateSummary = {
    now: 0,
    soon: 0,
    watch: 0,
    total: rows.length,
    byKind: { patch: 0, runner: 0, evidence: 0, memory: 0, source: 0 },
  };
  for (const r of rows) {
    s[r.lane] += 1;
    s.byKind[r.kind] += 1;
  }
  return s;
}

/**
 * Generic example candidate inputs for PREVIEW — one per kind across the lanes.
 * Generic identifiers only; clearly candidate-only, never committed work.
 */
export const EXAMPLE_WORK_ITEM_CANDIDATE_INPUTS: ReadonlyArray<WorkItemCandidateInput> = [
  {
    id: "wic-patch-example-1",
    title: "patch example-001 needs review",
    kind: "patch",
    lane: "now",
    status: "blocked",
    risk: "high",
    sourceRefs: ["mission-001"],
    evidenceRefs: ["ref-ci-log"],
    observed: true,
    reason: "patch safety blocked",
  },
  {
    id: "wic-runner-example-1",
    title: "entity-001 verify gate",
    kind: "runner",
    lane: "now",
    status: "blocked",
    risk: "high",
    sourceRefs: ["agent/entity-001-verify"],
    observed: true,
    reason: "runner blocked",
  },
  {
    id: "wic-source-example-1",
    title: "source example-pack stale",
    kind: "source",
    lane: "watch",
    status: "candidate",
    risk: "low",
    sourceRefs: ["example-pack"],
    observed: true,
    reason: "source health stale",
  },
  {
    id: "wic-evidence-example-1",
    title: "downstream impact not yet assessed",
    kind: "evidence",
    lane: "watch",
    status: "candidate",
    risk: "low",
    observed: false,
    reason: "no source yet — ask the operator to attach evidence",
  },
];
