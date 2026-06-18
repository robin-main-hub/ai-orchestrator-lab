import type { WorkItemCandidate } from "./workItemCandidate";
import type {
  CandidateDraftEvidenceLink,
  WorkItemCandidateDraftRef,
} from "./workItemEvidenceLinks";

/**
 * Engine E9 — read-only next-step preview for WorkItemCandidate.
 *
 * This is a local-detail projection only: it describes what context is present
 * or missing before an operator decides anything. It does not create committed
 * work, transition lifecycle state, append events, write, dispatch, or apply.
 */

export type WorkItemCandidateNextStepPreview = {
  candidateId: string;
  title: string;
  lane: WorkItemCandidate["lane"];
  status: WorkItemCandidate["status"];
  risk: WorkItemCandidate["risk"];
  reason: string;
  label: "preview only · not committed · no lifecycle transition";
  availableSourceRefs: string[];
  availableEvidenceRefs: string[];
  relatedDraftClaims: string[];
  relatedDraftFootnotes: WorkItemCandidateDraftRef[];
  missingSourceRefs: string[];
  missingEvidenceRefs: string[];
  riskNotes: string[];
  suggestedOperatorNote: string;
};

const PREVIEW_LABEL = "preview only · not committed · no lifecycle transition" as const;

function unique(refs: ReadonlyArray<string> = []): string[] {
  return Array.from(new Set(refs.map((ref) => ref.trim()).filter((ref) => ref.length > 0)));
}

function riskNote(risk: WorkItemCandidate["risk"]): string {
  return `${risk} risk candidate`;
}

function buildOperatorNote(args: {
  candidate: WorkItemCandidate;
  sourceCount: number;
  evidenceCount: number;
  missingEvidenceCount: number;
}): string {
  const sourcePart =
    args.sourceCount > 0 ? `${args.sourceCount} source refs available` : "source refs unavailable";
  const evidencePart =
    args.evidenceCount > 0
      ? `${args.evidenceCount} evidence refs available`
      : "evidence refs unavailable";
  const missingPart =
    args.missingEvidenceCount > 0
      ? `${args.missingEvidenceCount} evidence refs missing`
      : "no evidence refs missing";
  return `Review candidate ${args.candidate.id}: ${sourcePart}; ${evidencePart}; ${missingPart}. Preview only; no lifecycle transition.`;
}

export function buildWorkItemCandidateNextStepPreview(
  candidate: WorkItemCandidate,
  crossLink?: CandidateDraftEvidenceLink,
): WorkItemCandidateNextStepPreview {
  const availableSourceRefs = unique(candidate.sourceRefs);
  const candidateEvidenceRefs = unique(candidate.evidenceRefs);
  const relatedDraftFootnotes = crossLink?.matchedRefs ?? [];
  const linkedEvidenceRefIds = new Set(relatedDraftFootnotes.map((ref) => ref.refId));
  const hasLinkedDraftEvidence = linkedEvidenceRefIds.size > 0;

  const availableEvidenceRefs = hasLinkedDraftEvidence
    ? candidateEvidenceRefs.filter((ref) => linkedEvidenceRefIds.has(ref))
    : candidateEvidenceRefs;
  const missingSourceRefs =
    availableSourceRefs.length > 0 ? [] : ["source refs unknown"];
  const missingEvidenceRefs =
    candidateEvidenceRefs.length === 0
      ? ["evidence refs unknown"]
      : hasLinkedDraftEvidence
        ? candidateEvidenceRefs.filter((ref) => !linkedEvidenceRefIds.has(ref))
        : [];
  const relatedDraftClaims = unique(relatedDraftFootnotes.flatMap((ref) => ref.claimIds));
  const riskNotes = [riskNote(candidate.risk)];
  if (candidate.status === "blocked") riskNotes.push("blocked candidate");

  return {
    candidateId: candidate.id,
    title: candidate.title,
    lane: candidate.lane,
    status: candidate.status,
    risk: candidate.risk,
    reason: candidate.reason,
    label: PREVIEW_LABEL,
    availableSourceRefs,
    availableEvidenceRefs,
    relatedDraftClaims,
    relatedDraftFootnotes,
    missingSourceRefs,
    missingEvidenceRefs,
    riskNotes,
    suggestedOperatorNote: buildOperatorNote({
      candidate,
      sourceCount: availableSourceRefs.length,
      evidenceCount: availableEvidenceRefs.length,
      missingEvidenceCount: missingEvidenceRefs.length,
    }),
  };
}
