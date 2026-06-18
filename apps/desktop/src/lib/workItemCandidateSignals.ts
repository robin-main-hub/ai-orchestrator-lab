import type {
  WorkItemCandidate,
  WorkItemCandidateKind,
} from "./workItemCandidate";
import {
  buildWorkItemCandidateNextStepPreview,
  type WorkItemCandidateNextStepPreview,
} from "./workItemCandidateNextStepPreview";
import {
  buildWorkItemCandidateReadiness,
  type WorkItemCandidateReadiness,
  type WorkItemCandidateReadinessState,
} from "./workItemCandidateReadiness";
import type { WorkItemCandidateOperationRow } from "./workItemCandidateOperations";
import type { CandidateDraftEvidenceLink } from "./workItemEvidenceLinks";

/**
 * Engine E14 — read-only signal summary for WorkItemCandidate.
 *
 * Pure ref-only projection. It names which existing signals are present or
 * missing; it never resolves refs into objects, writes, dispatches, applies, or
 * creates committed work.
 */

export type WorkItemCandidateSignalType =
  | "source"
  | "evidence"
  | "draft"
  | "runner"
  | "patch"
  | "memory"
  | "readiness"
  | "next-step"
  | "trace";

export type WorkItemCandidateSignalChipStatus =
  | "present"
  | "missing"
  | "blocked"
  | WorkItemCandidateReadinessState;

export type WorkItemCandidateSignalChip = {
  id: string;
  type: WorkItemCandidateSignalType;
  label: string;
  status: WorkItemCandidateSignalChipStatus;
  count?: number;
  detail: string;
};

export type WorkItemCandidateSignalSummary = {
  candidateId: string;
  originKind: WorkItemCandidateKind;
  signalCount: number;
  missingSignalTypes: WorkItemCandidateSignalType[];
  unresolvedRefs: string[];
  chips: WorkItemCandidateSignalChip[];
  readinessContribution: string;
  confidenceContribution: string;
};

export type WorkItemCandidateSignalSummaryInput = {
  candidate: WorkItemCandidate;
  link?: CandidateDraftEvidenceLink;
  nextStepPreview?: WorkItemCandidateNextStepPreview;
  readiness?: WorkItemCandidateReadiness;
};

const ORIGIN_SIGNAL_TYPES = new Set<WorkItemCandidateKind>(["patch", "runner", "memory"]);

function cleanRefs(refs: ReadonlyArray<string> = []): string[] {
  return Array.from(new Set(refs.map((ref) => ref.trim()).filter(Boolean)));
}

function chip(args: WorkItemCandidateSignalChip): WorkItemCandidateSignalChip {
  return args;
}

function linkedDraftCount(link?: CandidateDraftEvidenceLink): number {
  return (link?.matchedRefs ?? []).filter((ref) => ref.claimIds.length > 0).length;
}

function missingSignals(args: {
  sourceCount: number;
  evidenceCount: number;
  draftCount: number;
  nextStepGapCount: number;
}): WorkItemCandidateSignalType[] {
  const out: WorkItemCandidateSignalType[] = [];
  if (args.sourceCount === 0) out.push("source");
  if (args.evidenceCount === 0) out.push("evidence");
  if (args.draftCount === 0) out.push("draft");
  if (args.nextStepGapCount > 0) out.push("next-step");
  return out;
}

export function buildWorkItemCandidateSignalSummary({
  candidate,
  link,
  nextStepPreview = buildWorkItemCandidateNextStepPreview(candidate, link),
  readiness = buildWorkItemCandidateReadiness(candidate, nextStepPreview, link),
}: WorkItemCandidateSignalSummaryInput): WorkItemCandidateSignalSummary {
  const sourceRefs = cleanRefs(candidate.sourceRefs);
  const evidenceRefs = cleanRefs(candidate.evidenceRefs);
  const draftCount = linkedDraftCount(link);
  const nextStepGapCount =
    nextStepPreview.missingSourceRefs.length + nextStepPreview.missingEvidenceRefs.length;
  const chips: WorkItemCandidateSignalChip[] = [];
  let signalCount = 0;

  if (ORIGIN_SIGNAL_TYPES.has(candidate.kind)) {
    chips.push(
      chip({
        id: `${candidate.kind}-linked`,
        type: candidate.kind,
        label: `${candidate.kind}-linked`,
        status: "present",
        count: 1,
        detail: `origin signal · ${candidate.kind}`,
      }),
    );
    signalCount += 1;
  }

  chips.push(
    chip({
      id: "source-linked",
      type: "source",
      label: sourceRefs.length > 0 ? "source-linked" : "source missing",
      status: sourceRefs.length > 0 ? "present" : "missing",
      count: sourceRefs.length > 0 ? sourceRefs.length : undefined,
      detail: sourceRefs.length > 0 ? "source refs present · ref only" : "source refs unknown",
    }),
  );
  if (sourceRefs.length > 0) signalCount += 1;

  chips.push(
    chip({
      id: "evidence-linked",
      type: "evidence",
      label: evidenceRefs.length > 0 ? "evidence-linked" : "evidence missing",
      status: evidenceRefs.length > 0 ? "present" : "missing",
      count: evidenceRefs.length > 0 ? evidenceRefs.length : undefined,
      detail: evidenceRefs.length > 0 ? "evidence refs present · ref only" : "evidence refs unknown",
    }),
  );
  if (evidenceRefs.length > 0) signalCount += 1;

  chips.push(
    chip({
      id: "draft-linked",
      type: "draft",
      label: draftCount > 0 ? "draft-linked" : "draft missing",
      status: draftCount > 0 ? "present" : "missing",
      count: draftCount > 0 ? draftCount : undefined,
      detail: draftCount > 0 ? "draft claim refs present" : "no matching draft evidence",
    }),
  );
  if (draftCount > 0) signalCount += 1;

  if (nextStepPreview.missingEvidenceRefs.length > 0) {
    chips.push(
      chip({
        id: "missing-evidence",
        type: "evidence",
        label: "missing-evidence",
        status: "missing",
        count: nextStepPreview.missingEvidenceRefs.length,
        detail: nextStepPreview.missingEvidenceRefs.join(", "),
      }),
    );
  }

  if (readiness.riskBlockers.length > 0) {
    chips.push(
      chip({
        id: "blocked-risk",
        type: "readiness",
        label: "blocked-risk",
        status: "blocked",
        count: readiness.riskBlockers.length,
        detail: readiness.riskBlockers.join(", "),
      }),
    );
    signalCount += 1;
  }

  chips.push(
    chip({
      id: "readiness",
      type: "readiness",
      label: `readiness · ${readiness.readiness}`,
      status: readiness.readiness,
      detail: `confidence · ${readiness.confidence}`,
    }),
  );

  chips.push(
    chip({
      id: "next-step",
      type: "next-step",
      label: nextStepGapCount > 0 ? "next-step gaps" : "next-step ready",
      status: nextStepGapCount > 0 ? "missing" : "present",
      count: nextStepGapCount > 0 ? nextStepGapCount : undefined,
      detail: nextStepPreview.label,
    }),
  );

  return {
    candidateId: candidate.id,
    originKind: candidate.kind,
    signalCount,
    missingSignalTypes: missingSignals({
      sourceCount: sourceRefs.length,
      evidenceCount: evidenceRefs.length,
      draftCount,
      nextStepGapCount,
    }),
    unresolvedRefs: [...sourceRefs, ...evidenceRefs],
    chips,
    readinessContribution: readiness.readiness,
    confidenceContribution: readiness.confidence,
  };
}

export function buildWorkItemCandidateSignalSummaryFromOperation(
  row: WorkItemCandidateOperationRow,
): WorkItemCandidateSignalSummary {
  return buildWorkItemCandidateSignalSummary({
    candidate: row.candidate,
    link: row.link,
    nextStepPreview: row.nextStepPreview,
    readiness: row.readiness,
  });
}
