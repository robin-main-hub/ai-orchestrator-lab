import { describe, expect, it } from "vitest";
import { projectWorkItemCandidates, type WorkItemCandidateInput } from "./workItemCandidate";
import { buildWorkItemCandidateOperations } from "./workItemCandidateOperations";
import {
  buildWorkItemCandidateSignalSummary,
  buildWorkItemCandidateSignalSummaryFromOperation,
} from "./workItemCandidateSignals";
import type { WorkItemEvidenceDraftLinks } from "./workItemEvidenceLinks";

const inputs: WorkItemCandidateInput[] = [
  {
    id: "wic-signal-patch",
    title: "patch signal",
    kind: "patch",
    lane: "now",
    status: "blocked",
    risk: "high",
    sourceRefs: ["mission-alpha"],
    evidenceRefs: ["ev-alpha", "ev-missing"],
    reason: "patch safety blocked",
  },
  {
    id: "wic-signal-memory",
    title: "memory signal",
    kind: "memory",
    lane: "watch",
    status: "candidate",
    risk: "low",
    reason: "memory hygiene",
  },
];

const links: WorkItemEvidenceDraftLinks = {
  candidateLinks: [
    {
      candidateId: "wic-signal-patch",
      matchedRefs: [{ refId: "ev-alpha", footnote: 1, label: "alpha evidence", claimIds: ["claim-alpha"] }],
    },
  ],
  byCandidateId: {
    "wic-signal-patch": {
      candidateId: "wic-signal-patch",
      matchedRefs: [{ refId: "ev-alpha", footnote: 1, label: "alpha evidence", claimIds: ["claim-alpha"] }],
    },
  },
  footnoteLinks: [],
  byFootnoteRef: {},
  relatedCandidateCount: 1,
  totalMatchedRefs: 1,
};

describe("E14 — WorkItem Candidate signal summaries", () => {
  it("summarizes origin, present refs, missing refs, draft links, and blockers from an operation row", () => {
    const operations = buildWorkItemCandidateOperations(projectWorkItemCandidates(inputs), links);
    const row = operations.rows.find((r) => r.id === "wic-signal-patch")!;
    const summary = buildWorkItemCandidateSignalSummaryFromOperation(row);

    expect(summary.originKind).toBe("patch");
    expect(summary.signalCount).toBe(5);
    expect(summary.missingSignalTypes).toEqual(["next-step"]);
    expect(summary.unresolvedRefs).toEqual(["mission-alpha", "ev-alpha", "ev-missing"]);
    expect(summary.chips.map((chip) => `${chip.id}:${chip.status}:${chip.count ?? "-"}`)).toEqual([
      "patch-linked:present:1",
      "source-linked:present:1",
      "evidence-linked:present:2",
      "draft-linked:present:1",
      "missing-evidence:missing:1",
      "blocked-risk:blocked:2",
      "readiness:blocked:-",
      "next-step:missing:1",
    ]);
    expect(JSON.stringify(summary).toLowerCase()).not.toMatch(
      /create work item|launch|eventstorage|server write|runner dispatch|patch apply/,
    );
  });

  it("degrades candidates with no refs into honest missing signal chips", () => {
    const candidate = projectWorkItemCandidates(inputs).find((row) => row.id === "wic-signal-memory")!;
    const summary = buildWorkItemCandidateSignalSummary({ candidate });

    expect(summary.originKind).toBe("memory");
    expect(summary.signalCount).toBe(1);
    expect(summary.missingSignalTypes).toEqual(["source", "evidence", "draft", "next-step"]);
    expect(summary.unresolvedRefs).toEqual([]);
    expect(summary.chips.map((chip) => `${chip.id}:${chip.status}`)).toEqual([
      "memory-linked:present",
      "source-linked:missing",
      "evidence-linked:missing",
      "draft-linked:missing",
      "missing-evidence:missing",
      "readiness:needs-evidence",
      "next-step:missing",
    ]);
  });
});
