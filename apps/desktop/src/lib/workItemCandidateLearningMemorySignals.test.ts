import { describe, expect, it } from "vitest";
import type { MemoryEvalReport } from "@ai-orchestrator/protocol";
import { buildLearningMemoryConsole } from "./learningMemoryConsole";
import {
  projectWorkItemCandidates,
  type WorkItemCandidateInput,
} from "./workItemCandidate";
import { linkCandidatesToLearningMemorySignals } from "./workItemCandidateLearningMemorySignals";

function report(
  verdict: MemoryEvalReport["verdict"],
  over: Partial<MemoryEvalReport> = {},
): MemoryEvalReport {
  return {
    evalCaseId: "eval-1",
    k: 1,
    verdict,
    recallAtK: verdict === "pass" ? 1 : 0,
    expectedHitIds: [],
    missingExpectedIds: [],
    forbiddenHitIds: [],
    forbiddenHitRate: 0,
    staleHitIds: [],
    staleHitRate: 0,
    contradictedHitIds: [],
    supersededHitIds: [],
    unknownRetrievedIds: [],
    blockers: verdict === "fail" ? ["blocked"] : [],
    warnings: [],
    ...over,
  } as MemoryEvalReport;
}

const candidates: WorkItemCandidateInput[] = [
  {
    id: "wic-memory-eval-fail",
    title: "memory eval failing",
    kind: "memory",
    lane: "now",
    status: "blocked",
    risk: "high",
    sourceRefs: ["memory-eval"],
    observed: true,
    reason: "memory eval verdict fail",
  },
  {
    id: "wic-memory-missing",
    title: "missing memory context",
    kind: "memory",
    lane: "watch",
    status: "candidate",
    risk: "medium",
    sourceRefs: ["memory-missing"],
    reason: "memory ref only",
  },
];

describe("E18 — WorkItem Candidate learning/memory signal links", () => {
  it("links memory candidates to aggregate learning and memory console signals", () => {
    const console = buildLearningMemoryConsole({
      learningLoops: [{ id: "loop-1", title: "investigate", stage: "investigating" }],
      memoryCandidates: [
        {
          id: "mem-1",
          title: "memory candidate",
          status: "suggested",
          origin: "learning_loop",
          observed: false,
        },
      ],
      evalReports: [
        report("fail", {
          forbiddenHitIds: ["forbidden-1"],
          staleHitIds: ["stale-1"],
          contradictedHitIds: ["contradicted-1"],
        }),
      ],
    });
    const projected = projectWorkItemCandidates(candidates);
    const links = linkCandidatesToLearningMemorySignals(projected, console);

    expect(links.byCandidateId["wic-memory-eval-fail"]?.signals.map((s) => s.signal)).toEqual([
      "memory-warning",
      "stale-memory",
      "contradicted-memory",
      "memory-linked",
      "learning-linked",
    ]);
    expect(links.byCandidateId["wic-memory-eval-fail"]?.signals[0]).toMatchObject({
      candidateId: "wic-memory-eval-fail",
      signal: "memory-warning",
      refStatus: "aggregate-console",
      evalReports: 1,
      memoryCandidates: 1,
      learningLoops: 1,
    });
    expect(links.console.candidateIds).toEqual(["wic-memory-eval-fail", "wic-memory-missing"]);
  });

  it("keeps absent learning/memory context honest without fabricating links", () => {
    const projected = projectWorkItemCandidates(candidates);
    const links = linkCandidatesToLearningMemorySignals(projected);

    expect(links.byCandidateId["wic-memory-missing"]?.signals.map((s) => s.signal)).toEqual([
      "missing-memory-context",
    ]);
    expect(links.byCandidateId["wic-memory-missing"]?.unresolvedRefs).toEqual(["memory-missing"]);
    expect(links.console.candidateIds).toEqual([]);
  });
});
