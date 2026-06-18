import type {
  PatchCandidate,
  PatchSafetyStatus,
  PatchVerificationStatus,
} from "./plugins/patchCandidateSource";
import type { WorkItemCandidate } from "./workItemCandidate";

/**
 * Engine E17 — read-only links between WorkItemCandidates and Patch Candidates.
 *
 * Pure ref matching only. The helper consumes already-projected candidates and
 * patch rows; it never applies a patch, writes, commits, opens a PR, dispatches,
 * or resolves string refs beyond the rows it was handed.
 */

export type WorkItemCandidatePatchSignalKind =
  | "patch-linked"
  | "patch-pass"
  | "patch-warning"
  | "patch-blocked"
  | "diff-preview-available";

export type WorkItemCandidatePatchSignal = {
  id: string;
  candidateId: string;
  patchCandidateId: string;
  runnerId: string;
  missionId: string;
  safetyStatus: PatchSafetyStatus;
  verificationStatus: PatchVerificationStatus;
  changedFileCount: number;
  signal: WorkItemCandidatePatchSignalKind;
  refStatus: "matched-row";
};

export type WorkItemCandidatePatchCandidateLink = {
  candidateId: string;
  signals: WorkItemCandidatePatchSignal[];
  unresolvedRefs: string[];
};

export type WorkItemCandidatePatchRowLink = {
  patchCandidateId: string;
  candidateIds: string[];
};

export type WorkItemCandidatePatchSignalLinks = {
  byCandidateId: Record<string, WorkItemCandidatePatchCandidateLink>;
  byPatchCandidateId: Record<string, WorkItemCandidatePatchRowLink>;
};

function cleanRefs(refs: ReadonlyArray<string>): string[] {
  return Array.from(new Set(refs.map((ref) => ref.trim()).filter(Boolean)));
}

function overlaps(a: ReadonlyArray<string>, b: ReadonlyArray<string>): boolean {
  const right = new Set(cleanRefs(b));
  return cleanRefs(a).some((ref) => right.has(ref));
}

function matchesPatch(candidate: WorkItemCandidate, patch: PatchCandidate): boolean {
  const sourceRefs = cleanRefs(candidate.sourceRefs);
  return (
    candidate.id === `wic-patch-${patch.candidateId}` ||
    sourceRefs.includes(patch.candidateId) ||
    sourceRefs.includes(patch.runnerId) ||
    sourceRefs.includes(patch.missionId) ||
    overlaps(candidate.evidenceRefs, patch.evidenceRefs)
  );
}

function safetySignal(status: PatchSafetyStatus): WorkItemCandidatePatchSignalKind {
  if (status === "blocked") return "patch-blocked";
  if (status === "warning") return "patch-warning";
  if (status === "pass") return "patch-pass";
  return "patch-linked";
}

function patchSignals(
  candidate: WorkItemCandidate,
  patch: PatchCandidate,
): WorkItemCandidatePatchSignal[] {
  const base = {
    candidateId: candidate.id,
    patchCandidateId: patch.candidateId,
    runnerId: patch.runnerId,
    missionId: patch.missionId,
    safetyStatus: patch.safetyStatus,
    verificationStatus: patch.verificationStatus,
    changedFileCount: patch.changedFileCount,
    refStatus: "matched-row" as const,
  };
  const kinds: WorkItemCandidatePatchSignalKind[] = [safetySignal(patch.safetyStatus)];
  if (patch.changedFileCount > 0 || patch.files.length > 0) kinds.push("diff-preview-available");
  return kinds.map((signal) => ({
    ...base,
    id: `${candidate.id}-${patch.candidateId}-${signal}`,
    signal,
  }));
}

function unresolvedPatchRefs(
  candidate: WorkItemCandidate,
  matched: ReadonlyArray<PatchCandidate>,
): string[] {
  if (matched.length > 0) return [];
  if (candidate.kind !== "patch") return [];
  return cleanRefs([...candidate.sourceRefs, ...candidate.evidenceRefs]);
}

export function linkCandidatesToPatchSignals(
  candidates: ReadonlyArray<WorkItemCandidate> = [],
  patchCandidates: ReadonlyArray<PatchCandidate> = [],
): WorkItemCandidatePatchSignalLinks {
  const byCandidateId: Record<string, WorkItemCandidatePatchCandidateLink> = {};
  const byPatchCandidateId: Record<string, WorkItemCandidatePatchRowLink> = {};

  for (const candidate of candidates) {
    const matched = patchCandidates.filter((row) => matchesPatch(candidate, row));
    const signals = matched.flatMap((row) => patchSignals(candidate, row));
    byCandidateId[candidate.id] = {
      candidateId: candidate.id,
      signals,
      unresolvedRefs: unresolvedPatchRefs(candidate, matched),
    };
    for (const signal of signals) {
      const rowLink =
        byPatchCandidateId[signal.patchCandidateId] ??
        (byPatchCandidateId[signal.patchCandidateId] = {
          patchCandidateId: signal.patchCandidateId,
          candidateIds: [],
        });
      rowLink.candidateIds.push(candidate.id);
    }
  }

  for (const link of Object.values(byPatchCandidateId)) {
    link.candidateIds = Array.from(new Set(link.candidateIds)).sort();
  }

  return { byCandidateId, byPatchCandidateId };
}
