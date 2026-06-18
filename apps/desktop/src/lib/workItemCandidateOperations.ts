import {
  WORK_ITEM_LANES,
  type WorkItemCandidate,
  type WorkItemCandidateKind,
  type WorkItemCandidateLane,
  type WorkItemRisk,
} from "./workItemCandidate";
import {
  buildWorkItemCandidateReadiness,
  type WorkItemCandidateConfidenceBand,
  type WorkItemCandidateReadiness,
  type WorkItemCandidateReadinessState,
} from "./workItemCandidateReadiness";
import {
  buildWorkItemCandidateNextStepPreview,
  type WorkItemCandidateNextStepPreview,
} from "./workItemCandidateNextStepPreview";
import type {
  CandidateDraftEvidenceLink,
  WorkItemEvidenceDraftLinks,
} from "./workItemEvidenceLinks";

/**
 * Engine E11 — candidate operations projection.
 *
 * Pure read-only projection over existing WorkItemCandidate rows and their
 * ref-only companion surfaces. It creates no committed work and performs no I/O.
 */

export type WorkItemCandidateOperationRow = {
  id: string;
  candidate: WorkItemCandidate;
  link?: CandidateDraftEvidenceLink;
  nextStepPreview: WorkItemCandidateNextStepPreview;
  readiness: WorkItemCandidateReadiness;
  hasSourceRefs: boolean;
  hasEvidenceRefs: boolean;
  hasLinkedDraftClaims: boolean;
  hasNextStepBlockers: boolean;
};

export type WorkItemCandidateOperationsSummary = Record<WorkItemCandidateLane, number> &
  Record<WorkItemCandidateReadinessState, number> & {
    total: number;
    confidenceHigh: number;
    confidenceMedium: number;
    confidenceLow: number;
    confidenceUnknown: number;
    withSourceRefs: number;
    withEvidenceRefs: number;
    withLinkedDraftClaims: number;
    withNextStepBlockers: number;
  };

export type WorkItemCandidateOperationsGroups = {
  byLane: Record<WorkItemCandidateLane, WorkItemCandidateOperationRow[]>;
  byRisk: Record<WorkItemRisk, WorkItemCandidateOperationRow[]>;
  byReadiness: Record<WorkItemCandidateReadinessState, WorkItemCandidateOperationRow[]>;
  byKind: Record<WorkItemCandidateKind, WorkItemCandidateOperationRow[]>;
};

export type WorkItemCandidateOperations = {
  rows: WorkItemCandidateOperationRow[];
  summary: WorkItemCandidateOperationsSummary;
  groups: WorkItemCandidateOperationsGroups;
};

export type WorkItemCandidateBoardLaneFilter = "all" | WorkItemCandidateLane;
export type WorkItemCandidateBoardRiskFilter = "all" | WorkItemRisk;
export type WorkItemCandidateBoardKindFilter = "all" | WorkItemCandidateKind;
export type WorkItemCandidateBoardRefFilter = "all" | "present";
export type WorkItemCandidateBoardScopeFilter = "all" | "attention" | "ready" | "linked";
export type WorkItemCandidateBoardSortMode = "priority" | "title" | "createdAt";

export type WorkItemCandidateBoardFilters = {
  lane?: WorkItemCandidateBoardLaneFilter;
  risk?: WorkItemCandidateBoardRiskFilter;
  kind?: WorkItemCandidateBoardKindFilter;
  sourceRefs?: WorkItemCandidateBoardRefFilter;
  evidenceRefs?: WorkItemCandidateBoardRefFilter;
  scope?: WorkItemCandidateBoardScopeFilter;
  query?: string;
  sort?: WorkItemCandidateBoardSortMode;
};

export type WorkItemCandidateBoardCounts = {
  byLane: Record<WorkItemCandidateLane, number>;
  byRisk: Record<WorkItemRisk, number>;
  byKind: Record<WorkItemCandidateKind, number>;
  sourceRefCount: number;
  evidenceRefCount: number;
};

export type WorkItemCandidateBoardProjection = {
  counts: WorkItemCandidateBoardCounts;
  visibleRows: WorkItemCandidateOperationRow[];
  attentionRows: WorkItemCandidateOperationRow[];
};

const RISK_ORDER: Record<WorkItemRisk, number> = { high: 0, medium: 1, low: 2 };
const READINESS_ORDER: Record<WorkItemCandidateReadinessState, number> = {
  blocked: 0,
  "needs-evidence": 1,
  "needs-review": 2,
  ready: 3,
  unknown: 4,
};
const CONFIDENCE_KEYS: Record<WorkItemCandidateConfidenceBand, keyof WorkItemCandidateOperationsSummary> = {
  high: "confidenceHigh",
  medium: "confidenceMedium",
  low: "confidenceLow",
  unknown: "confidenceUnknown",
};

function createdAtMs(candidate: WorkItemCandidate): number {
  if (!candidate.createdAt) return Number.NEGATIVE_INFINITY;
  const ms = Date.parse(candidate.createdAt);
  return Number.isFinite(ms) ? ms : Number.NEGATIVE_INFINITY;
}

function hasLinkedDraftClaims(link?: CandidateDraftEvidenceLink): boolean {
  return (link?.matchedRefs ?? []).some((ref) => ref.claimIds.length > 0);
}

function hasNextStepBlockers(row: {
  readiness: WorkItemCandidateReadiness;
  nextStepPreview: WorkItemCandidateNextStepPreview;
}): boolean {
  return (
    row.readiness.riskBlockers.length > 0 ||
    row.nextStepPreview.missingSourceRefs.length > 0 ||
    row.nextStepPreview.missingEvidenceRefs.length > 0
  );
}

function makeSummary(): WorkItemCandidateOperationsSummary {
  return {
    total: 0,
    now: 0,
    soon: 0,
    watch: 0,
    ready: 0,
    "needs-evidence": 0,
    blocked: 0,
    "needs-review": 0,
    unknown: 0,
    confidenceHigh: 0,
    confidenceMedium: 0,
    confidenceLow: 0,
    confidenceUnknown: 0,
    withSourceRefs: 0,
    withEvidenceRefs: 0,
    withLinkedDraftClaims: 0,
    withNextStepBlockers: 0,
  };
}

function makeGroups(): WorkItemCandidateOperationsGroups {
  return {
    byLane: { now: [], soon: [], watch: [] },
    byRisk: { high: [], medium: [], low: [] },
    byReadiness: {
      ready: [],
      "needs-evidence": [],
      blocked: [],
      "needs-review": [],
      unknown: [],
    },
    byKind: { patch: [], runner: [], evidence: [], memory: [], source: [] },
  };
}

function sortRows(rows: WorkItemCandidateOperationRow[]): WorkItemCandidateOperationRow[] {
  return [...rows].sort((a, b) => {
    const laneDiff = WORK_ITEM_LANES.indexOf(a.candidate.lane) - WORK_ITEM_LANES.indexOf(b.candidate.lane);
    if (laneDiff !== 0) return laneDiff;
    const riskDiff = RISK_ORDER[a.candidate.risk] - RISK_ORDER[b.candidate.risk];
    if (riskDiff !== 0) return riskDiff;
    const readinessDiff = READINESS_ORDER[a.readiness.readiness] - READINESS_ORDER[b.readiness.readiness];
    if (readinessDiff !== 0) return readinessDiff;
    const createdDiff = createdAtMs(b.candidate) - createdAtMs(a.candidate);
    if (createdDiff !== 0) return createdDiff;
    return a.id.localeCompare(b.id);
  });
}

function matchesBoardScope(
  row: WorkItemCandidateOperationRow,
  scope: WorkItemCandidateBoardScopeFilter = "all",
): boolean {
  if (scope === "all") return true;
  if (scope === "attention") {
    return row.readiness.readiness === "blocked" || row.readiness.readiness === "needs-evidence";
  }
  if (scope === "ready") return row.readiness.readiness === "ready";
  return row.hasLinkedDraftClaims;
}

function matchesBoardQuery(row: WorkItemCandidate, rawQuery = ""): boolean {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return true;
  return [
    row.id,
    row.title,
    row.kind,
    row.lane,
    row.status,
    row.risk,
    row.reason,
    ...row.sourceRefs,
    ...row.evidenceRefs,
  ]
    .join(" ")
    .toLowerCase()
    .includes(q);
}

function sortBoardRows(
  rows: ReadonlyArray<WorkItemCandidateOperationRow>,
  sortMode: WorkItemCandidateBoardSortMode = "priority",
): WorkItemCandidateOperationRow[] {
  if (sortMode === "priority") return [...rows];
  return [...rows].sort((a, b) => {
    if (sortMode === "title") {
      const titleDiff = a.candidate.title.localeCompare(b.candidate.title);
      if (titleDiff !== 0) return titleDiff;
      return a.id.localeCompare(b.id);
    }
    const createdDiff = createdAtMs(b.candidate) - createdAtMs(a.candidate);
    if (createdDiff !== 0) return createdDiff;
    return a.id.localeCompare(b.id);
  });
}

function buildBoardCounts(operations: WorkItemCandidateOperations): WorkItemCandidateBoardCounts {
  return {
    byLane: {
      now: operations.groups.byLane.now.length,
      soon: operations.groups.byLane.soon.length,
      watch: operations.groups.byLane.watch.length,
    },
    byRisk: {
      high: operations.groups.byRisk.high.length,
      medium: operations.groups.byRisk.medium.length,
      low: operations.groups.byRisk.low.length,
    },
    byKind: {
      patch: operations.groups.byKind.patch.length,
      runner: operations.groups.byKind.runner.length,
      evidence: operations.groups.byKind.evidence.length,
      memory: operations.groups.byKind.memory.length,
      source: operations.groups.byKind.source.length,
    },
    sourceRefCount: operations.summary.withSourceRefs,
    evidenceRefCount: operations.summary.withEvidenceRefs,
  };
}

export function buildWorkItemCandidateBoardProjection(
  operations: WorkItemCandidateOperations,
  filters: WorkItemCandidateBoardFilters = {},
): WorkItemCandidateBoardProjection {
  const visibleRows = sortBoardRows(
    operations.rows.filter((row) => {
      const candidate = row.candidate;
      return (
        (filters.lane == null || filters.lane === "all" || candidate.lane === filters.lane) &&
        (filters.risk == null || filters.risk === "all" || candidate.risk === filters.risk) &&
        (filters.kind == null || filters.kind === "all" || candidate.kind === filters.kind) &&
        (filters.sourceRefs == null || filters.sourceRefs === "all" || row.hasSourceRefs) &&
        (filters.evidenceRefs == null || filters.evidenceRefs === "all" || row.hasEvidenceRefs) &&
        matchesBoardScope(row, filters.scope) &&
        matchesBoardQuery(candidate, filters.query)
      );
    }),
    filters.sort,
  );
  return {
    counts: buildBoardCounts(operations),
    visibleRows,
    attentionRows: visibleRows.filter((row) => matchesBoardScope(row, "attention")),
  };
}

export function buildWorkItemCandidateOperations(
  candidates: ReadonlyArray<WorkItemCandidate> = [],
  links?: WorkItemEvidenceDraftLinks,
  nextStepPreviews: Readonly<Record<string, WorkItemCandidateNextStepPreview>> = {},
  readinessById: Readonly<Record<string, WorkItemCandidateReadiness>> = {},
): WorkItemCandidateOperations {
  const rows = sortRows(
    candidates.map((candidate) => {
      const link = links?.byCandidateId[candidate.id];
      const nextStepPreview =
        nextStepPreviews[candidate.id] ?? buildWorkItemCandidateNextStepPreview(candidate, link);
      const readiness =
        readinessById[candidate.id] ?? buildWorkItemCandidateReadiness(candidate, nextStepPreview, link);
      const row = {
        id: candidate.id,
        candidate,
        link,
        nextStepPreview,
        readiness,
        hasSourceRefs: candidate.sourceRefs.length > 0,
        hasEvidenceRefs: candidate.evidenceRefs.length > 0,
        hasLinkedDraftClaims: hasLinkedDraftClaims(link),
        hasNextStepBlockers: false,
      };
      return { ...row, hasNextStepBlockers: hasNextStepBlockers(row) };
    }),
  );

  const summary = makeSummary();
  const groups = makeGroups();
  summary.total = rows.length;
  for (const row of rows) {
    summary[row.candidate.lane] += 1;
    summary[row.readiness.readiness] += 1;
    summary[CONFIDENCE_KEYS[row.readiness.confidence]] += 1;
    if (row.hasSourceRefs) summary.withSourceRefs += 1;
    if (row.hasEvidenceRefs) summary.withEvidenceRefs += 1;
    if (row.hasLinkedDraftClaims) summary.withLinkedDraftClaims += 1;
    if (row.hasNextStepBlockers) summary.withNextStepBlockers += 1;
    groups.byLane[row.candidate.lane].push(row);
    groups.byRisk[row.candidate.risk].push(row);
    groups.byReadiness[row.readiness.readiness].push(row);
    groups.byKind[row.candidate.kind].push(row);
  }

  return { rows, summary, groups };
}
