import type { WorkItemCandidate } from "./workItemCandidate";
import type { WorkItemCandidateNextStepPreview } from "./workItemCandidateNextStepPreview";
import type { CandidateDraftEvidenceLink } from "./workItemEvidenceLinks";

/**
 * Engine E10 — read-only readiness/confidence projection.
 *
 * Candidate-only and local-view/local-detail only. This describes whether the
 * current refs/risk are enough to inspect a candidate; it does not create work,
 * transition lifecycle state, persist anything, or call a runner.
 */

export type WorkItemCandidateReadinessState =
  | "ready"
  | "needs-evidence"
  | "blocked"
  | "needs-review"
  | "unknown";

export type WorkItemCandidateConfidenceBand = "high" | "medium" | "low" | "unknown";

export type WorkItemCandidateReadiness = {
  candidateId: string;
  readiness: WorkItemCandidateReadinessState;
  confidence: WorkItemCandidateConfidenceBand;
  label: "readiness · read-only";
  reasons: string[];
  missingSourceRefs: string[];
  missingEvidenceRefs: string[];
  riskBlockers: string[];
  suggestedNextInspectionTarget: string;
};

const READINESS_LABEL = "readiness · read-only" as const;

function cleanRefs(refs: ReadonlyArray<string> = []): string[] {
  return Array.from(new Set(refs.map((ref) => ref.trim()).filter(Boolean)));
}

function fallbackMissing(refs: ReadonlyArray<string>, unknownLabel: string): string[] {
  return refs.length > 0 ? [] : [unknownLabel];
}

function buildReasons(args: {
  sourceRefs: ReadonlyArray<string>;
  evidenceRefs: ReadonlyArray<string>;
  linkedDraftEvidence: boolean;
  riskBlockers: ReadonlyArray<string>;
}): string[] {
  const reasons = [
    args.sourceRefs.length > 0 ? "source refs present" : "source refs missing",
    args.evidenceRefs.length > 0 ? "evidence refs present" : "evidence refs missing",
  ];
  if (args.linkedDraftEvidence) reasons.push("linked draft evidence present");
  if (args.riskBlockers.length > 0) reasons.push("risk review required");
  return reasons;
}

function buildTarget(args: {
  readiness: WorkItemCandidateReadinessState;
  linkedDraftEvidence: boolean;
  firstLinkedRef?: string;
  missingSourceRefs: ReadonlyArray<string>;
  missingEvidenceRefs: ReadonlyArray<string>;
}): string {
  if (args.readiness === "blocked") return "Inspect risk blockers before deeper review";
  if (args.missingEvidenceRefs.length > 0) return "Inspect evidence refs and related draft claims";
  if (args.missingSourceRefs.length > 0) return "Inspect source refs and provenance";
  if (args.linkedDraftEvidence) {
    return args.firstLinkedRef
      ? `Inspect linked draft evidence ${args.firstLinkedRef}`
      : "Inspect linked draft evidence";
  }
  if (args.readiness === "needs-review") return "Inspect candidate reason and refs";
  return "Inspect candidate detail";
}

export function buildWorkItemCandidateReadiness(
  candidate: WorkItemCandidate,
  nextStepPreview?: WorkItemCandidateNextStepPreview,
  crossLink?: CandidateDraftEvidenceLink,
): WorkItemCandidateReadiness {
  const sourceRefs = cleanRefs(nextStepPreview?.availableSourceRefs ?? candidate.sourceRefs);
  const evidenceRefs = cleanRefs(nextStepPreview?.availableEvidenceRefs ?? candidate.evidenceRefs);
  const missingSourceRefs =
    nextStepPreview?.missingSourceRefs ?? fallbackMissing(sourceRefs, "source refs unknown");
  const missingEvidenceRefs =
    nextStepPreview?.missingEvidenceRefs ?? fallbackMissing(evidenceRefs, "evidence refs unknown");
  const linkedDraftEvidence =
    (crossLink?.matchedRefs.length ?? 0) > 0 || (nextStepPreview?.relatedDraftFootnotes.length ?? 0) > 0;
  const firstLinkedRef = crossLink?.matchedRefs[0]?.refId ?? nextStepPreview?.relatedDraftFootnotes[0]?.refId;
  const riskBlockers: string[] = [];
  if (candidate.risk === "high") riskBlockers.push("high risk candidate");
  if (candidate.status === "blocked") riskBlockers.push("blocked candidate");

  let readiness: WorkItemCandidateReadinessState;
  let confidence: WorkItemCandidateConfidenceBand;
  if (riskBlockers.length > 0) {
    readiness = "blocked";
    confidence = "low";
  } else if (missingEvidenceRefs.length > 0) {
    readiness = "needs-evidence";
    confidence = missingSourceRefs.length > 0 ? "unknown" : "low";
  } else if (missingSourceRefs.length > 0 || candidate.risk === "medium") {
    readiness = "needs-review";
    confidence = missingSourceRefs.length > 0 ? "low" : "medium";
  } else if (sourceRefs.length > 0 && evidenceRefs.length > 0) {
    readiness = "ready";
    confidence = linkedDraftEvidence || candidate.observed ? "high" : "medium";
  } else {
    readiness = "unknown";
    confidence = "unknown";
  }

  return {
    candidateId: candidate.id,
    readiness,
    confidence,
    label: READINESS_LABEL,
    reasons: buildReasons({
      sourceRefs,
      evidenceRefs,
      linkedDraftEvidence,
      riskBlockers,
    }),
    missingSourceRefs,
    missingEvidenceRefs,
    riskBlockers,
    suggestedNextInspectionTarget: buildTarget({
      readiness,
      linkedDraftEvidence,
      firstLinkedRef,
      missingSourceRefs,
      missingEvidenceRefs,
    }),
  };
}
