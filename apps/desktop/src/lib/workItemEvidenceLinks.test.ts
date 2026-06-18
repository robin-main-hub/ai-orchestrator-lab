import { describe, expect, it } from "vitest";
import { projectEvidenceDraft, type EvidenceDraftInput } from "./evidenceDraft";
import { projectWorkItemCandidates, type WorkItemCandidateInput } from "./workItemCandidate";
import { linkWorkItemCandidatesToEvidenceDraft } from "./workItemEvidenceLinks";

const NOW = Date.parse("2026-06-18T12:00:00.000Z");

const draftInput: EvidenceDraftInput = {
  id: "draft-link-test",
  title: "link test draft",
  sources: [
    { id: "ev-1", label: "first observed ref", observedAt: "2026-06-18T11:00:00.000Z" },
    { id: "ev-2", label: "second observed ref", observedAt: "2026-06-18T10:00:00.000Z" },
  ],
  claims: [
    { id: "claim-a", text: "first claim", refs: ["ev-1"] },
    { id: "claim-b", text: "second claim", refs: ["ev-2"] },
    { id: "claim-c", text: "unbacked claim", refs: [] },
  ],
};

const candidatesInput: WorkItemCandidateInput[] = [
  {
    id: "wic-linked-a",
    title: "linked candidate a",
    kind: "patch",
    lane: "now",
    status: "blocked",
    risk: "high",
    evidenceRefs: ["ev-1", "unknown-ref"],
  },
  {
    id: "wic-linked-b",
    title: "linked candidate b",
    kind: "runner",
    lane: "soon",
    status: "candidate",
    risk: "medium",
    evidenceRefs: ["ev-2"],
  },
  {
    id: "wic-unmatched",
    title: "unmatched candidate",
    kind: "source",
    lane: "watch",
    status: "candidate",
    risk: "low",
    evidenceRefs: ["missing-ref"],
  },
];

describe("E8 — WorkItem Candidate / Evidence Draft cross-links", () => {
  it("links candidates to draft footnotes through ref-only evidenceRefs", () => {
    const draft = projectEvidenceDraft(draftInput, NOW);
    const candidates = projectWorkItemCandidates(candidatesInput);

    const links = linkWorkItemCandidatesToEvidenceDraft(candidates, draft);

    expect(links.relatedCandidateCount).toBe(2);
    expect(links.totalMatchedRefs).toBe(2);
    expect(links.byCandidateId["wic-linked-a"]?.matchedRefs).toEqual([
      { refId: "ev-1", footnote: 1, label: "first observed ref", claimIds: ["claim-a"] },
    ]);
    expect(links.byCandidateId["wic-linked-b"]?.matchedRefs).toEqual([
      { refId: "ev-2", footnote: 2, label: "second observed ref", claimIds: ["claim-b"] },
    ]);
    expect(links.byCandidateId["wic-unmatched"]?.matchedRefs).toEqual([]);
    expect(links.byFootnoteRef["ev-1"]?.candidateIds).toEqual(["wic-linked-a"]);
    expect(links.byFootnoteRef["ev-2"]?.candidateIds).toEqual(["wic-linked-b"]);
    expect(links.byFootnoteRef["unknown-ref"]).toBeUndefined();
  });

  it("returns honest empty links when the draft is absent", () => {
    const candidates = projectWorkItemCandidates(candidatesInput);

    const links = linkWorkItemCandidatesToEvidenceDraft(candidates, undefined);

    expect(links.relatedCandidateCount).toBe(0);
    expect(links.totalMatchedRefs).toBe(0);
    expect(links.byCandidateId["wic-linked-a"]?.matchedRefs).toEqual([]);
    expect(links.byFootnoteRef).toEqual({});
  });
});
