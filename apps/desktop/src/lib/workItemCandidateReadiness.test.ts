import { describe, expect, it } from "vitest";
import { projectWorkItemCandidates, type WorkItemCandidateInput } from "./workItemCandidate";
import { buildWorkItemCandidateNextStepPreview } from "./workItemCandidateNextStepPreview";
import {
  buildWorkItemCandidateReadiness,
  type WorkItemCandidateReadiness,
} from "./workItemCandidateReadiness";
import type { CandidateDraftEvidenceLink } from "./workItemEvidenceLinks";

const linkedDraft: CandidateDraftEvidenceLink = {
  candidateId: "wic-ready",
  matchedRefs: [
    { refId: "ev-ready", footnote: 1, label: "ready evidence", claimIds: ["claim-ready"] },
  ],
};

function readiness(
  input: WorkItemCandidateInput,
  link?: CandidateDraftEvidenceLink,
): WorkItemCandidateReadiness {
  const candidate = projectWorkItemCandidates([input])[0]!;
  const preview = buildWorkItemCandidateNextStepPreview(candidate, link);
  return buildWorkItemCandidateReadiness(candidate, preview, link);
}

describe("E10 — WorkItem Candidate readiness/confidence", () => {
  it("computes a ready candidate with high confidence", () => {
    const r = readiness(
      {
        id: "wic-ready",
        title: "ready candidate",
        kind: "evidence",
        lane: "soon",
        status: "observed",
        risk: "low",
        sourceRefs: ["source-ready"],
        evidenceRefs: ["ev-ready"],
        observed: true,
        reason: "evidence present",
      },
      linkedDraft,
    );

    expect(r).toMatchObject({
      candidateId: "wic-ready",
      readiness: "ready",
      confidence: "high",
      label: "readiness · read-only",
    });
    expect(r.reasons).toContain("source refs present");
    expect(r.reasons).toContain("evidence refs present");
    expect(r.reasons).toContain("linked draft evidence present");
    expect(r.missingSourceRefs).toEqual([]);
    expect(r.missingEvidenceRefs).toEqual([]);
    expect(r.riskBlockers).toEqual([]);
    expect(r.suggestedNextInspectionTarget).toContain("linked draft evidence");
  });

  it("computes needs-evidence when evidence refs are missing", () => {
    const r = readiness({
      id: "wic-needs-evidence",
      title: "needs evidence candidate",
      kind: "source",
      lane: "watch",
      status: "candidate",
      risk: "low",
      sourceRefs: ["source-present"],
      reason: "source stale",
    });

    expect(r.readiness).toBe("needs-evidence");
    expect(r.confidence).toBe("low");
    expect(r.missingSourceRefs).toEqual([]);
    expect(r.missingEvidenceRefs).toEqual(["evidence refs unknown"]);
    expect(r.reasons).toContain("evidence refs missing");
    expect(r.suggestedNextInspectionTarget).toContain("evidence refs");
  });

  it("computes blocked readiness for blocked or high-risk candidates", () => {
    const r = readiness({
      id: "wic-blocked",
      title: "blocked candidate",
      kind: "patch",
      lane: "now",
      status: "blocked",
      risk: "high",
      sourceRefs: ["mission-alpha"],
      evidenceRefs: ["ev-risk"],
      reason: "patch safety blocked",
    });

    expect(r.readiness).toBe("blocked");
    expect(r.confidence).toBe("low");
    expect(r.riskBlockers).toContain("high risk candidate");
    expect(r.riskBlockers).toContain("blocked candidate");
    expect(r.reasons).toContain("risk review required");
    expect(r.suggestedNextInspectionTarget).toContain("risk blockers");
  });

  it("degrades missing source/evidence refs honestly", () => {
    const r = readiness({
      id: "wic-unknown",
      title: "unknown context candidate",
      kind: "memory",
      lane: "watch",
      status: "candidate",
      risk: "medium",
      reason: "memory hygiene",
    });

    expect(r.readiness).toBe("needs-evidence");
    expect(r.confidence).toBe("unknown");
    expect(r.missingSourceRefs).toEqual(["source refs unknown"]);
    expect(r.missingEvidenceRefs).toEqual(["evidence refs unknown"]);
    expect(r.reasons).toContain("source refs missing");
    expect(r.reasons).toContain("evidence refs missing");
  });

  it("does not claim lifecycle or side-effect actions", () => {
    const r = readiness({
      id: "wic-safe",
      title: "safe readiness candidate",
      kind: "runner",
      lane: "soon",
      status: "candidate",
      risk: "medium",
      sourceRefs: ["branch-alpha"],
      evidenceRefs: ["ev-runner"],
      reason: "runner heartbeat stale",
    });

    const blob = JSON.stringify(r).toLowerCase();
    expect(blob).toContain("readiness");
    expect(blob).not.toMatch(/create work item|launch|eventstorage|server write|runner dispatch|patch apply/);
  });
});
