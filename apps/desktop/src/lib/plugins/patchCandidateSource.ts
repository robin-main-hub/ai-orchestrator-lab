/**
 * Batch 17 LINE A — generic, READ-ONLY patch-candidate projection for the
 * Patch Candidate Speed Lane.
 *
 * This is a DISPLAY contract only. It deliberately defines FRESH generic
 * primitive-only types instead of importing the runner's RunnerPatchHandoff /
 * RunnerPatchSafetyReport / CodingRunResult — those modules pull in
 * runner-EXECUTION types, and the inbox surface must never couple to an apply /
 * dispatch / file-write path. The App maps real handoff data into
 * PatchCandidateInput outside the inbox; here we only project + summarize.
 *
 * Invariants: pure (no Date.now / I/O / fetch / fs / EventStorage), generic (no
 * domain terms), and exposes NO apply/commit/dispatch — a patch candidate is an
 * inspectable preview, never an action.
 */

export type PatchSafetyStatus = "pass" | "warning" | "blocked";
export type PatchVerificationStatus = "claimed" | "actual" | "not_run";
export type PatchCandidateSource = "runner" | "handoff";
export type PatchChangeType = "added" | "modified" | "deleted";
export type PatchRisk = "low" | "medium" | "high";

/** One file's compact diff-preview block (LINE C). hunkSummary is a pre-summarized,
 *  redacted one-liner — never raw diff text (no secret leakage). */
export type PatchFilePreview = {
  path: string;
  change: PatchChangeType;
  additions: number;
  deletions: number;
  hunkSummary?: string;
  risk?: PatchRisk;
};

/** Read-only ingress contract — the shape the LIVE app passes in (mapped from the
 *  runner patch handoff elsewhere, never here). */
export type PatchCandidateInput = {
  candidateId: string;
  runnerId: string;
  missionId: string;
  createdAt?: string;
  changedFileCount: number;
  additions: number;
  deletions: number;
  safetyStatus: PatchSafetyStatus;
  verificationStatus: PatchVerificationStatus;
  source: PatchCandidateSource;
  observed: boolean;
  files?: ReadonlyArray<PatchFilePreview>;
  safetyBlockers?: ReadonlyArray<string>;
  safetyWarnings?: ReadonlyArray<string>;
  secretFindingCount?: number;
  pathPolicyStatus?: PatchSafetyStatus;
  claimedTests?: { ran: boolean; passed: number; failed: number };
  actualTests?: { status: PatchVerificationStatus; summary?: string };
  evidenceRefs?: ReadonlyArray<string>;
};

/** Projected, display-ready patch candidate row. */
export type PatchCandidate = {
  id: string;
  candidateId: string;
  runnerId: string;
  missionId: string;
  createdAt?: string;
  changedFileCount: number;
  additions: number;
  deletions: number;
  safetyStatus: PatchSafetyStatus;
  verificationStatus: PatchVerificationStatus;
  source: PatchCandidateSource;
  observed: boolean;
  files: ReadonlyArray<PatchFilePreview>;
  safetyBlockers: ReadonlyArray<string>;
  safetyWarnings: ReadonlyArray<string>;
  secretFindingCount: number;
  pathPolicyStatus?: PatchSafetyStatus;
  claimedTests?: { ran: boolean; passed: number; failed: number };
  actualTests?: { status: PatchVerificationStatus; summary?: string };
  evidenceRefs: ReadonlyArray<string>;
  note: string;
};

const SAFETY: ReadonlyArray<PatchSafetyStatus> = ["pass", "warning", "blocked"];
const VERIFY: ReadonlyArray<PatchVerificationStatus> = ["claimed", "actual", "not_run"];
const SOURCES: ReadonlyArray<PatchCandidateSource> = ["runner", "handoff"];

function nonEmpty(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function isValidPatchCandidate(c: PatchCandidateInput): boolean {
  return (
    nonEmpty(c.candidateId) &&
    nonEmpty(c.runnerId) &&
    nonEmpty(c.missionId) &&
    SAFETY.includes(c.safetyStatus) &&
    VERIFY.includes(c.verificationStatus) &&
    SOURCES.includes(c.source)
  );
}

const num = (n: unknown): number => (typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : 0);

/**
 * Project read-only patch-candidate inputs into display rows. Invalid rows are
 * dropped (never crash). Pure — no side effect, no Date.now, never applies
 * anything. observed is honest (only true when the input asserts it).
 */
export function projectPatchCandidates(
  items: ReadonlyArray<PatchCandidateInput> = [],
): PatchCandidate[] {
  return items.filter(isValidPatchCandidate).map((c) => ({
    id: c.candidateId,
    candidateId: c.candidateId,
    runnerId: c.runnerId,
    missionId: c.missionId,
    createdAt: c.createdAt,
    changedFileCount: num(c.changedFileCount),
    additions: num(c.additions),
    deletions: num(c.deletions),
    safetyStatus: c.safetyStatus,
    verificationStatus: c.verificationStatus,
    source: c.source,
    observed: c.observed === true,
    files: Array.isArray(c.files) ? c.files : [],
    safetyBlockers: Array.isArray(c.safetyBlockers) ? c.safetyBlockers : [],
    safetyWarnings: Array.isArray(c.safetyWarnings) ? c.safetyWarnings : [],
    secretFindingCount: num(c.secretFindingCount),
    pathPolicyStatus: c.pathPolicyStatus,
    claimedTests: c.claimedTests,
    actualTests: c.actualTests,
    evidenceRefs: Array.isArray(c.evidenceRefs) ? c.evidenceRefs : [],
    note: "patch candidate · read-only · preview only (no apply/dispatch)",
  }));
}

const SAFETY_RANK: Record<PatchSafetyStatus, number> = { pass: 0, warning: 1, blocked: 2 };
const VERIFY_RANK: Record<PatchVerificationStatus, number> = { actual: 0, claimed: 1, not_run: 2 };

export type PatchCandidateSummary = {
  count: number;
  safest?: string;
  pass: number;
  blocked: number;
  warning: number;
  observed: number;
  notObserved: number;
  /** candidates whose verification is still not_run (actual not seen). */
  verificationNotRun: number;
  /** candidates where the runner claims tests ran. */
  claimedTestsPresent: number;
  filesTouched: ReadonlyArray<string>;
  overlapCount?: number;
};

/**
 * Batch 17 LINE E — pure local comparison over already-projected candidates. No
 * model/runner call, no hidden job. "safest" is a deterministic pick (lowest
 * safety severity, then best verification, then candidateId) among non-blocked
 * candidates; absent when all are blocked.
 */
export function summarizePatchCandidates(
  rows: ReadonlyArray<PatchCandidate> = [],
): PatchCandidateSummary {
  const blocked = rows.filter((r) => r.safetyStatus === "blocked").length;
  const warning = rows.filter((r) => r.safetyStatus === "warning").length;
  const candidates = rows.filter((r) => r.safetyStatus !== "blocked");
  const safest = [...candidates].sort(
    (a, b) =>
      SAFETY_RANK[a.safetyStatus] - SAFETY_RANK[b.safetyStatus] ||
      VERIFY_RANK[a.verificationStatus] - VERIFY_RANK[b.verificationStatus] ||
      a.candidateId.localeCompare(b.candidateId),
  )[0]?.candidateId;

  // files-touched overlap only when ≥2 candidates carry file lists.
  const withFiles = rows.filter((r) => r.files.length > 0);
  const allPaths = new Set<string>();
  let overlapCount: number | undefined;
  if (withFiles.length >= 2) {
    const counts = new Map<string, number>();
    for (const r of withFiles) {
      const paths = new Set(r.files.map((f) => f.path));
      for (const p of paths) {
        counts.set(p, (counts.get(p) ?? 0) + 1);
        allPaths.add(p);
      }
    }
    overlapCount = [...counts.values()].filter((n) => n >= 2).length;
  } else {
    for (const r of rows) for (const f of r.files) allPaths.add(f.path);
  }

  return {
    count: rows.length,
    safest,
    pass: rows.filter((r) => r.safetyStatus === "pass").length,
    blocked,
    warning,
    observed: rows.filter((r) => r.observed).length,
    notObserved: rows.filter((r) => !r.observed).length,
    verificationNotRun: rows.filter((r) => r.verificationStatus === "not_run").length,
    claimedTestsPresent: rows.filter((r) => r.claimedTests?.ran === true).length,
    filesTouched: [...allPaths],
    overlapCount,
  };
}
