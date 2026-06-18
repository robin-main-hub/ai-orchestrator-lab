import { describe, expect, it } from "vitest";
import { projectWorkItemCandidates, type WorkItemCandidateInput } from "./workItemCandidate";
import { buildWorkItemCandidateNextStepPreview } from "./workItemCandidateNextStepPreview";
import { buildWorkItemCandidateReadiness } from "./workItemCandidateReadiness";
import {
  buildWorkItemCandidateTrace,
  type WorkItemCandidateTrace,
} from "./workItemCandidateTrace";
import type { CandidateDraftEvidenceLink } from "./workItemEvidenceLinks";

const linkedDraft: CandidateDraftEvidenceLink = {
  candidateId: "wic-trace",
  matchedRefs: [
    { refId: "ev-trace", footnote: 1, label: "trace evidence", claimIds: ["claim-trace"] },
  ],
};

function trace(input: WorkItemCandidateInput, link?: CandidateDraftEvidenceLink): WorkItemCandidateTrace {
  const candidate = projectWorkItemCandidates([input])[0]!;
  const nextStepPreview = buildWorkItemCandidateNextStepPreview(candidate, link);
  const readiness = buildWorkItemCandidateReadiness(candidate, nextStepPreview, link);
  return buildWorkItemCandidateTrace(candidate, {
    draftLink: link,
    nextStepPreview,
    readiness,
  });
}

describe("E12 — WorkItem Candidate source trace timeline", () => {
  it("builds a deterministic trace from reason, source refs, and evidence refs", () => {
    const t = trace({
      id: "wic-trace",
      title: "trace candidate",
      kind: "patch",
      lane: "now",
      status: "blocked",
      risk: "high",
      reason: "patch safety blocked",
      sourceRefs: ["mission-alpha"],
      evidenceRefs: ["ev-trace"],
      createdAt: "2026-06-18T12:00:00.000Z",
    });

    expect(t).toMatchObject({
      candidateId: "wic-trace",
      title: "trace candidate",
      label: "trace timeline · read-only · ref only",
      empty: false,
    });
    expect(t.events.map((event) => event.kind)).toEqual([
      "patch",
      "source",
      "evidence",
      "readiness",
      "next-step",
    ]);
    expect(t.events[0]).toMatchObject({
      kind: "patch",
      label: "patch signal · patch safety blocked",
      timestamp: "2026-06-18T12:00:00.000Z",
      timeLabel: "2026-06-18T12:00:00.000Z",
    });
    expect(t.events.find((event) => event.kind === "source")).toMatchObject({
      ref: "mission-alpha",
      refStatus: "ref only · unresolved",
      timeLabel: "time unknown",
    });
    expect(t.events.find((event) => event.kind === "evidence")).toMatchObject({
      ref: "ev-trace",
      refStatus: "ref only · unresolved",
    });
  });

  it("adds linked draft claims plus readiness and next-step context when provided", () => {
    const t = trace(
      {
        id: "wic-trace",
        title: "trace candidate",
        kind: "patch",
        lane: "now",
        status: "blocked",
        risk: "high",
        reason: "patch safety blocked",
        sourceRefs: ["mission-alpha"],
        evidenceRefs: ["ev-trace"],
      },
      linkedDraft,
    );

    expect(t.events.find((event) => event.kind === "draft")).toMatchObject({
      label: "draft footnote [1] · trace evidence",
      ref: "ev-trace",
      refStatus: "ref only · unresolved",
      details: ["claim-trace"],
    });
    expect(t.events.find((event) => event.kind === "readiness")).toMatchObject({
      readiness: "blocked",
      confidence: "low",
    });
    expect(t.events.find((event) => event.kind === "next-step")?.label).toContain("preview gaps");
  });

  it("sorts missing timestamps by fallback order and labels them honestly", () => {
    const t = trace({
      id: "wic-trace-order",
      title: "trace order candidate",
      kind: "runner",
      lane: "soon",
      status: "candidate",
      risk: "medium",
      reason: "runner heartbeat stale",
      sourceRefs: ["runner-ref"],
      evidenceRefs: ["ev-runner"],
    });

    expect(t.events.map((event) => `${event.kind}:${event.ref ?? event.id}`)).toEqual([
      "runner:wic-trace-order",
      "source:runner-ref",
      "evidence:ev-runner",
      "readiness:wic-trace-order-readiness",
      "next-step:wic-trace-order",
    ]);
    expect(t.events.every((event) => event.timeLabel === "time unknown")).toBe(true);
  });

  it("shows honest missing state for candidates with no refs", () => {
    const t = trace({
      id: "wic-trace-empty",
      title: "empty trace candidate",
      kind: "memory",
      lane: "watch",
      status: "candidate",
      risk: "low",
      reason: "memory hygiene",
    });

    expect(t.empty).toBe(true);
    expect(t.missing).toEqual(["source refs unknown", "evidence refs unknown"]);
    expect(t.events.map((event) => event.kind)).toEqual(["memory", "readiness", "next-step"]);
  });

  it("does not claim lifecycle or side-effect actions", () => {
    const t = trace({
      id: "wic-trace-safe",
      title: "safe trace candidate",
      kind: "source",
      lane: "watch",
      status: "candidate",
      risk: "low",
      reason: "source health stale",
      sourceRefs: ["source-alpha"],
    });

    const blob = JSON.stringify(t).toLowerCase();
    expect(blob).toContain("read-only");
    expect(blob).toContain("ref only");
    expect(blob).not.toMatch(/create work item|launch|eventstorage|server write|runner dispatch|patch apply/);
  });
});
