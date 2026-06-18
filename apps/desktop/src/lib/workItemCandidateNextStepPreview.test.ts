import { describe, expect, it } from "vitest";
import { projectWorkItemCandidates, type WorkItemCandidateInput } from "./workItemCandidate";
import {
  buildWorkItemCandidateNextStepPreview,
  type WorkItemCandidateNextStepPreview,
} from "./workItemCandidateNextStepPreview";
import type { CandidateDraftEvidenceLink } from "./workItemEvidenceLinks";

const linkedDraft: CandidateDraftEvidenceLink = {
  candidateId: "wic-next-1",
  matchedRefs: [
    { refId: "ev-1", footnote: 1, label: "first evidence", claimIds: ["claim-a"] },
    { refId: "ev-2", footnote: 2, label: "second evidence", claimIds: ["claim-b", "claim-c"] },
  ],
};

function preview(input: WorkItemCandidateInput, link?: CandidateDraftEvidenceLink): WorkItemCandidateNextStepPreview {
  return buildWorkItemCandidateNextStepPreview(projectWorkItemCandidates([input])[0]!, link);
}

describe("E9 — WorkItem Candidate next-step preview", () => {
  it("builds a preview from candidate refs and linked draft claims", () => {
    const p = preview(
      {
        id: "wic-next-1",
        title: "blocked patch candidate",
        kind: "patch",
        lane: "now",
        status: "blocked",
        risk: "high",
        reason: "patch safety blocked",
        sourceRefs: ["mission-alpha"],
        evidenceRefs: ["ev-1", "ev-2", "ev-missing"],
      },
      linkedDraft,
    );

    expect(p).toMatchObject({
      candidateId: "wic-next-1",
      title: "blocked patch candidate",
      lane: "now",
      status: "blocked",
      risk: "high",
      reason: "patch safety blocked",
      label: "preview only · not committed · no lifecycle transition",
    });
    expect(p.availableSourceRefs).toEqual(["mission-alpha"]);
    expect(p.availableEvidenceRefs).toEqual(["ev-1", "ev-2"]);
    expect(p.missingEvidenceRefs).toEqual(["ev-missing"]);
    expect(p.missingSourceRefs).toEqual([]);
    expect(p.relatedDraftClaims).toEqual(["claim-a", "claim-b", "claim-c"]);
    expect(p.relatedDraftFootnotes).toEqual([
      { refId: "ev-1", footnote: 1, label: "first evidence", claimIds: ["claim-a"] },
      { refId: "ev-2", footnote: 2, label: "second evidence", claimIds: ["claim-b", "claim-c"] },
    ]);
    expect(p.riskNotes).toContain("high risk candidate");
    expect(p.riskNotes).toContain("blocked candidate");
    expect(p.suggestedOperatorNote).toContain("Review candidate wic-next-1");
    expect(p.suggestedOperatorNote).toContain("2 evidence refs available");
    expect(p.suggestedOperatorNote).toContain("1 evidence refs missing");
  });

  it("shows missing refs honestly when candidate has no source/evidence refs", () => {
    const p = preview({
      id: "wic-next-empty",
      title: "candidate without refs",
      kind: "memory",
      lane: "watch",
      status: "candidate",
      risk: "low",
      reason: "memory hygiene",
    });

    expect(p.availableSourceRefs).toEqual([]);
    expect(p.availableEvidenceRefs).toEqual([]);
    expect(p.missingSourceRefs).toEqual(["source refs unknown"]);
    expect(p.missingEvidenceRefs).toEqual(["evidence refs unknown"]);
    expect(p.relatedDraftClaims).toEqual([]);
    expect(p.relatedDraftFootnotes).toEqual([]);
    expect(p.riskNotes).toEqual(["low risk candidate"]);
    expect(p.suggestedOperatorNote).toContain("source refs unavailable");
    expect(p.suggestedOperatorNote).toContain("evidence refs unavailable");
  });

  it("does not claim a lifecycle transition or side-effect action", () => {
    const p = preview({
      id: "wic-next-safe",
      title: "safe preview",
      kind: "source",
      lane: "soon",
      status: "candidate",
      risk: "medium",
      reason: "source stale",
      sourceRefs: ["source-alpha"],
      evidenceRefs: ["ev-1"],
    });

    const blob = JSON.stringify(p).toLowerCase();
    expect(blob).toContain("preview only");
    expect(blob).toContain("not committed");
    expect(blob).toContain("no lifecycle transition");
    expect(blob).not.toMatch(/create work item|launch|eventstorage|server write|runner dispatch|patch apply/);
  });
});
