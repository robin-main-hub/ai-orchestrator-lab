import { describe, expect, it } from "vitest";
import { projectWorkItemCandidates, type WorkItemCandidateInput } from "./workItemCandidate";
import {
  buildWorkItemCandidateBoardProjection,
  buildWorkItemCandidateOperations,
  type WorkItemCandidateOperations,
} from "./workItemCandidateOperations";
import type { WorkItemEvidenceDraftLinks } from "./workItemEvidenceLinks";

const inputs: WorkItemCandidateInput[] = [
  {
    id: "wic-watch-ready",
    title: "ready watch candidate",
    kind: "evidence",
    lane: "watch",
    status: "observed",
    risk: "low",
    sourceRefs: ["source-ready"],
    evidenceRefs: ["ev-ready"],
    createdAt: "2026-06-18T10:00:00.000Z",
    observed: true,
    reason: "evidence present",
  },
  {
    id: "wic-now-missing",
    title: "missing evidence candidate",
    kind: "source",
    lane: "now",
    status: "candidate",
    risk: "medium",
    sourceRefs: ["source-stale"],
    createdAt: "2026-06-18T12:00:00.000Z",
    reason: "source stale",
  },
  {
    id: "wic-soon-review",
    title: "review candidate",
    kind: "runner",
    lane: "soon",
    status: "candidate",
    risk: "medium",
    sourceRefs: ["runner-alpha"],
    evidenceRefs: ["ev-runner"],
    createdAt: "2026-06-18T11:00:00.000Z",
    reason: "runner stale",
  },
  {
    id: "wic-now-blocked",
    title: "blocked candidate",
    kind: "patch",
    lane: "now",
    status: "blocked",
    risk: "high",
    sourceRefs: ["mission-alpha"],
    evidenceRefs: ["ev-risk"],
    createdAt: "2026-06-18T09:00:00.000Z",
    reason: "patch safety blocked",
  },
];

const links: WorkItemEvidenceDraftLinks = {
  candidateLinks: [
    {
      candidateId: "wic-watch-ready",
      matchedRefs: [{ refId: "ev-ready", footnote: 1, label: "ready evidence", claimIds: ["claim-ready"] }],
    },
  ],
  byCandidateId: {
    "wic-watch-ready": {
      candidateId: "wic-watch-ready",
      matchedRefs: [{ refId: "ev-ready", footnote: 1, label: "ready evidence", claimIds: ["claim-ready"] }],
    },
  },
  footnoteLinks: [],
  byFootnoteRef: {},
  relatedCandidateCount: 1,
  totalMatchedRefs: 1,
};

function ops(): WorkItemCandidateOperations {
  return buildWorkItemCandidateOperations(projectWorkItemCandidates(inputs), links);
}

describe("E11 — WorkItem Candidate operations projection", () => {
  it("computes summary counts across lane, readiness, confidence, refs, links, and blockers", () => {
    const projection = ops();

    expect(projection.summary).toMatchObject({
      total: 4,
      now: 2,
      soon: 1,
      watch: 1,
      ready: 1,
      "needs-evidence": 1,
      blocked: 1,
      "needs-review": 1,
      unknown: 0,
      confidenceHigh: 1,
      confidenceMedium: 1,
      confidenceLow: 2,
      confidenceUnknown: 0,
      withSourceRefs: 4,
      withEvidenceRefs: 3,
      withLinkedDraftClaims: 1,
      withNextStepBlockers: 2,
    });
  });

  it("groups candidates by lane, risk, readiness, and kind", () => {
    const projection = ops();

    expect(projection.groups.byLane.now.map((row) => row.id)).toEqual([
      "wic-now-blocked",
      "wic-now-missing",
    ]);
    expect(projection.groups.byLane.soon.map((row) => row.id)).toEqual(["wic-soon-review"]);
    expect(projection.groups.byReadiness.blocked.map((row) => row.id)).toEqual(["wic-now-blocked"]);
    expect(projection.groups.byReadiness["needs-evidence"].map((row) => row.id)).toEqual([
      "wic-now-missing",
    ]);
    expect(projection.groups.byRisk.high.map((row) => row.id)).toEqual(["wic-now-blocked"]);
    expect(projection.groups.byKind.patch.map((row) => row.id)).toEqual(["wic-now-blocked"]);
  });

  it("sorts deterministically by lane, risk, readiness, createdAt, and id", () => {
    const projection = buildWorkItemCandidateOperations(
      projectWorkItemCandidates([
        {
          id: "wic-now-medium-b",
          title: "medium b",
          kind: "runner",
          lane: "now",
          status: "candidate",
          risk: "medium",
          sourceRefs: ["src"],
          evidenceRefs: ["ev"],
          createdAt: "2026-06-18T09:00:00.000Z",
          reason: "runner stale",
        },
        {
          id: "wic-now-medium-a",
          title: "medium a",
          kind: "runner",
          lane: "now",
          status: "candidate",
          risk: "medium",
          sourceRefs: ["src"],
          evidenceRefs: ["ev"],
          createdAt: "2026-06-18T09:00:00.000Z",
          reason: "runner stale",
        },
        {
          id: "wic-now-medium-new",
          title: "medium new",
          kind: "runner",
          lane: "now",
          status: "candidate",
          risk: "medium",
          sourceRefs: ["src"],
          evidenceRefs: ["ev"],
          createdAt: "2026-06-18T13:00:00.000Z",
          reason: "runner stale",
        },
      ]),
    );

    expect(projection.rows.map((row) => row.id)).toEqual([
      "wic-now-medium-new",
      "wic-now-medium-a",
      "wic-now-medium-b",
    ]);
  });

  it("degrades missing fields honestly without side-effect language", () => {
    const projection = buildWorkItemCandidateOperations(
      projectWorkItemCandidates([
        {
          id: "wic-empty",
          title: "empty candidate",
          kind: "memory",
          lane: "watch",
          status: "candidate",
          risk: "medium",
          reason: "memory hygiene",
        },
      ]),
    );
    const row = projection.rows[0]!;

    expect(row.hasSourceRefs).toBe(false);
    expect(row.hasEvidenceRefs).toBe(false);
    expect(row.readiness.readiness).toBe("needs-evidence");
    expect(row.readiness.confidence).toBe("unknown");
    expect(row.nextStepPreview.missingSourceRefs).toEqual(["source refs unknown"]);
    expect(row.nextStepPreview.missingEvidenceRefs).toEqual(["evidence refs unknown"]);
    expect(JSON.stringify(projection).toLowerCase()).not.toMatch(
      /create work item|launch|eventstorage|server write|runner dispatch|patch apply/,
    );
  });

  it("builds a board projection with shared counts, filters, search, and attention rows", () => {
    const projection = buildWorkItemCandidateBoardProjection(ops(), {
      lane: "now",
      sourceRefs: "present",
      query: "source",
    });

    expect(projection.counts.byLane).toMatchObject({ now: 2, soon: 1, watch: 1 });
    expect(projection.counts.byRisk).toMatchObject({ high: 1, medium: 2, low: 1 });
    expect(projection.counts.byKind).toMatchObject({
      patch: 1,
      runner: 1,
      evidence: 1,
      memory: 0,
      source: 1,
    });
    expect(projection.counts.sourceRefCount).toBe(4);
    expect(projection.counts.evidenceRefCount).toBe(3);
    expect(projection.visibleRows.map((row) => row.id)).toEqual(["wic-now-missing"]);
    expect(projection.attentionRows.map((row) => row.id)).toEqual(["wic-now-missing"]);
  });

  it("sorts board projection rows by title or newest without changing priority order by default", () => {
    const operationProjection = ops();

    expect(buildWorkItemCandidateBoardProjection(operationProjection).visibleRows.map((row) => row.id)).toEqual([
      "wic-now-blocked",
      "wic-now-missing",
      "wic-soon-review",
      "wic-watch-ready",
    ]);
    expect(
      buildWorkItemCandidateBoardProjection(operationProjection, { sort: "title" }).visibleRows.map((row) => row.id),
    ).toEqual(["wic-now-blocked", "wic-now-missing", "wic-watch-ready", "wic-soon-review"]);
    expect(
      buildWorkItemCandidateBoardProjection(operationProjection, { sort: "createdAt" }).visibleRows.map(
        (row) => row.id,
      ),
    ).toEqual(["wic-now-missing", "wic-soon-review", "wic-watch-ready", "wic-now-blocked"]);
  });
});
