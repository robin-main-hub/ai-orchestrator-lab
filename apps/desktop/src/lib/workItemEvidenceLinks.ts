import type { EvidenceDraft } from "./evidenceDraft";
import type { WorkItemCandidate } from "./workItemCandidate";

/**
 * Engine E8 — read-only ref cross-links between WorkItemCandidate and Evidence
 * Draft. This resolves nothing beyond existing string refs: a candidate's
 * `evidenceRefs` either matches a draft footnote `refId`, or it remains
 * unmatched. Pure projection only; no lifecycle, no writes, no dispatch.
 */

export type WorkItemCandidateDraftRef = {
  refId: string;
  footnote: number;
  label: string;
  claimIds: string[];
};

export type CandidateDraftEvidenceLink = {
  candidateId: string;
  matchedRefs: WorkItemCandidateDraftRef[];
};

export type DraftFootnoteCandidateLink = {
  refId: string;
  footnote: number;
  candidateIds: string[];
  claimIds: string[];
};

export type WorkItemEvidenceDraftLinks = {
  candidateLinks: CandidateDraftEvidenceLink[];
  byCandidateId: Record<string, CandidateDraftEvidenceLink>;
  footnoteLinks: DraftFootnoteCandidateLink[];
  byFootnoteRef: Record<string, DraftFootnoteCandidateLink>;
  relatedCandidateCount: number;
  totalMatchedRefs: number;
};

function unique(xs: ReadonlyArray<string>): string[] {
  return Array.from(new Set(xs.filter((x) => x.trim().length > 0)));
}

export function linkWorkItemCandidatesToEvidenceDraft(
  candidates: ReadonlyArray<WorkItemCandidate> = [],
  evidenceDraft?: EvidenceDraft,
): WorkItemEvidenceDraftLinks {
  const footnoteByRef = new Map((evidenceDraft?.footnotes ?? []).map((f) => [f.refId, f]));
  const claimIdsByFootnote = new Map<number, string[]>();
  for (const claim of evidenceDraft?.claims ?? []) {
    for (const n of claim.footnotes) {
      const prev = claimIdsByFootnote.get(n) ?? [];
      claimIdsByFootnote.set(n, [...prev, claim.id]);
    }
  }

  const candidateLinks: CandidateDraftEvidenceLink[] = candidates.map((candidate) => ({
    candidateId: candidate.id,
    matchedRefs: unique(candidate.evidenceRefs)
      .map((refId) => {
        const footnote = footnoteByRef.get(refId);
        if (!footnote) return null;
        return {
          refId,
          footnote: footnote.n,
          label: footnote.label,
          claimIds: claimIdsByFootnote.get(footnote.n) ?? [],
        };
      })
      .filter((ref): ref is WorkItemCandidateDraftRef => ref != null),
  }));

  const byCandidateId = Object.fromEntries(candidateLinks.map((link) => [link.candidateId, link]));
  const byFootnoteRef: Record<string, DraftFootnoteCandidateLink> = {};
  for (const link of candidateLinks) {
    for (const ref of link.matchedRefs) {
      const prev = byFootnoteRef[ref.refId] ?? {
        refId: ref.refId,
        footnote: ref.footnote,
        candidateIds: [],
        claimIds: ref.claimIds,
      };
      byFootnoteRef[ref.refId] = {
        ...prev,
        candidateIds: unique([...prev.candidateIds, link.candidateId]),
      };
    }
  }

  return {
    candidateLinks,
    byCandidateId,
    footnoteLinks: Object.values(byFootnoteRef),
    byFootnoteRef,
    relatedCandidateCount: candidateLinks.filter((link) => link.matchedRefs.length > 0).length,
    totalMatchedRefs: candidateLinks.reduce((sum, link) => sum + link.matchedRefs.length, 0),
  };
}
