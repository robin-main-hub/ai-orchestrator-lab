import { describe, expect, it } from "vitest";
import { projectWorkItemCandidates, type WorkItemCandidateInput } from "./workItemCandidate";
import { buildWorkItemCandidateOperations } from "./workItemCandidateOperations";
import {
  buildWorkItemCandidateOperatorReview,
  type WorkItemCandidateOperatorReviewFilter,
} from "./workItemCandidateOperatorReview";

const inputs: WorkItemCandidateInput[] = [
  {
    id: "wic-review-ready",
    title: "ready candidate",
    kind: "evidence",
    lane: "watch",
    status: "observed",
    risk: "low",
    sourceRefs: ["source-ready"],
    evidenceRefs: ["ev-ready"],
    observed: true,
    createdAt: "2026-06-18T12:00:00.000Z",
    reason: "evidence present",
  },
  {
    id: "wic-review-missing",
    title: "missing evidence candidate",
    kind: "source",
    lane: "soon",
    status: "candidate",
    risk: "medium",
    sourceRefs: ["source-missing"],
    reason: "source stale",
  },
  {
    id: "wic-review-blocked",
    title: "blocked candidate",
    kind: "patch",
    lane: "now",
    status: "blocked",
    risk: "high",
    sourceRefs: ["mission-alpha"],
    evidenceRefs: ["ev-risk"],
    reason: "patch safety blocked",
  },
];

function review(filter: WorkItemCandidateOperatorReviewFilter = "all") {
  return buildWorkItemCandidateOperatorReview(
    buildWorkItemCandidateOperations(projectWorkItemCandidates(inputs)),
    filter,
  );
}

describe("E15 — WorkItem Candidate operator review projection", () => {
  it("summarizes candidate quality counts without lifecycle language", () => {
    const projection = review();

    expect(projection.counts).toMatchObject({
      total: 3,
      ready: 1,
      needsEvidence: 1,
      blocked: 1,
      needsReview: 0,
      confidenceHigh: 1,
      confidenceMedium: 0,
      confidenceLow: 2,
      missingRefs: 1,
      staleOrUnknownTrace: 2,
    });
    expect(JSON.stringify(projection).toLowerCase()).not.toMatch(
      /create work item|launch|eventstorage|server write|runner dispatch|patch apply/,
    );
  });

  it("filters rows locally by review state", () => {
    expect(review("ready").rows.map((row) => row.id)).toEqual(["wic-review-ready"]);
    expect(review("needs-evidence").rows.map((row) => row.id)).toEqual(["wic-review-missing"]);
    expect(review("blocked").rows.map((row) => row.id)).toEqual(["wic-review-blocked"]);
    expect(review("missing-refs").rows.map((row) => row.id)).toEqual(["wic-review-missing"]);
    expect(review("stale-unknown-trace").rows.map((row) => row.id)).toEqual([
      "wic-review-blocked",
      "wic-review-missing",
    ]);
    expect(review("high-confidence").rows.map((row) => row.id)).toEqual(["wic-review-ready"]);
    expect(review("low-confidence").rows.map((row) => row.id)).toEqual([
      "wic-review-blocked",
      "wic-review-missing",
    ]);
  });
});
