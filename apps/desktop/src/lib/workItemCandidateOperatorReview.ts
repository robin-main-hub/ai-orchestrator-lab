import type {
  WorkItemCandidateOperationRow,
  WorkItemCandidateOperations,
} from "./workItemCandidateOperations";

/**
 * Engine E15 — read-only operator review projection for WorkItemCandidate.
 *
 * Local-view only. This summarizes candidate quality and filters existing
 * operation rows; it never creates lifecycle state, writes, dispatches, applies,
 * sends, or resolves refs into objects.
 */

export type WorkItemCandidateOperatorReviewFilter =
  | "all"
  | "ready"
  | "needs-evidence"
  | "blocked"
  | "missing-refs"
  | "stale-unknown-trace"
  | "high-confidence"
  | "low-confidence";

export type WorkItemCandidateOperatorReviewCounts = {
  total: number;
  ready: number;
  needsEvidence: number;
  blocked: number;
  needsReview: number;
  confidenceHigh: number;
  confidenceMedium: number;
  confidenceLow: number;
  confidenceUnknown: number;
  missingRefs: number;
  staleOrUnknownTrace: number;
};

export type WorkItemCandidateOperatorReview = {
  activeFilter: WorkItemCandidateOperatorReviewFilter;
  counts: WorkItemCandidateOperatorReviewCounts;
  rows: WorkItemCandidateOperationRow[];
};

function hasMissingRefs(row: WorkItemCandidateOperationRow): boolean {
  return (
    !row.hasSourceRefs ||
    !row.hasEvidenceRefs ||
    row.nextStepPreview.missingSourceRefs.length > 0 ||
    row.nextStepPreview.missingEvidenceRefs.length > 0
  );
}

function hasStaleOrUnknownTrace(row: WorkItemCandidateOperationRow): boolean {
  const createdAt = row.candidate.createdAt;
  if (!createdAt) return true;
  return !Number.isFinite(Date.parse(createdAt));
}

function makeCounts(): WorkItemCandidateOperatorReviewCounts {
  return {
    total: 0,
    ready: 0,
    needsEvidence: 0,
    blocked: 0,
    needsReview: 0,
    confidenceHigh: 0,
    confidenceMedium: 0,
    confidenceLow: 0,
    confidenceUnknown: 0,
    missingRefs: 0,
    staleOrUnknownTrace: 0,
  };
}

function matchesFilter(
  row: WorkItemCandidateOperationRow,
  filter: WorkItemCandidateOperatorReviewFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "ready") return row.readiness.readiness === "ready";
  if (filter === "needs-evidence") return row.readiness.readiness === "needs-evidence";
  if (filter === "blocked") return row.readiness.readiness === "blocked";
  if (filter === "missing-refs") return hasMissingRefs(row);
  if (filter === "stale-unknown-trace") return hasStaleOrUnknownTrace(row);
  if (filter === "high-confidence") return row.readiness.confidence === "high";
  return row.readiness.confidence === "low";
}

export function buildWorkItemCandidateOperatorReview(
  operations: WorkItemCandidateOperations,
  filter: WorkItemCandidateOperatorReviewFilter = "all",
): WorkItemCandidateOperatorReview {
  const counts = makeCounts();
  counts.total = operations.rows.length;

  for (const row of operations.rows) {
    if (row.readiness.readiness === "ready") counts.ready += 1;
    else if (row.readiness.readiness === "needs-evidence") counts.needsEvidence += 1;
    else if (row.readiness.readiness === "blocked") counts.blocked += 1;
    else if (row.readiness.readiness === "needs-review") counts.needsReview += 1;

    if (row.readiness.confidence === "high") counts.confidenceHigh += 1;
    else if (row.readiness.confidence === "medium") counts.confidenceMedium += 1;
    else if (row.readiness.confidence === "low") counts.confidenceLow += 1;
    else counts.confidenceUnknown += 1;

    if (hasMissingRefs(row)) counts.missingRefs += 1;
    if (hasStaleOrUnknownTrace(row)) counts.staleOrUnknownTrace += 1;
  }

  return {
    activeFilter: filter,
    counts,
    rows: operations.rows.filter((row) => matchesFilter(row, filter)),
  };
}
