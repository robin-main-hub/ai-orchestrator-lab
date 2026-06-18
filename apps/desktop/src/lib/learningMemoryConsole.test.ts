import { describe, expect, it } from "vitest";
import { buildLearningMemoryConsole } from "./learningMemoryConsole";
import type { LearningLoopItem } from "../components/inbox/LearningLoopCard";
import type { MemoryCandidateItem } from "../components/inbox/MemoryCandidateCard";
import type { MemoryEvalReport } from "@ai-orchestrator/protocol";

const FORBIDDEN = ["example-domain", "erp", "customer", "sales", "quotation", "buyer", "factory"];

const loops: LearningLoopItem[] = [
  { id: "loop-1", title: "a", stage: "verified", hypothesisCount: 2, verifiedCount: 1, rejectedCount: 0 },
  { id: "loop-2", title: "b", stage: "rejected", hypothesisCount: 1, verifiedCount: 0, rejectedCount: 1 },
  { id: "loop-3", title: "c", stage: "investigating" },
];

const candidates: MemoryCandidateItem[] = [
  { id: "m-1", title: "x", status: "suggested", origin: "evidence_bridge", observed: false },
  { id: "m-2", title: "y", status: "suggested", origin: "learning_loop", observed: false },
];

function report(verdict: MemoryEvalReport["verdict"], over: Partial<MemoryEvalReport> = {}): MemoryEvalReport {
  return {
    evalCaseId: "c",
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
    blockers: verdict === "fail" ? ["b"] : [],
    warnings: [],
    ...over,
  } as MemoryEvalReport;
}

describe("E3 — learning & memory console", () => {
  it("rolls up learning loop stages (settled / active / rejected)", () => {
    const c = buildLearningMemoryConsole({ learningLoops: loops });
    expect(c.learning.total).toBe(3);
    expect(c.learning.settled).toBe(1); // verified
    expect(c.learning.rejected).toBe(1);
    expect(c.learning.active).toBe(1); // investigating
    expect(c.learning.byStage.verified).toBe(1);
    expect(c.learning.byStage.investigating).toBe(1);
    expect(c.learning.verifiedHypotheses).toBe(1);
    expect(c.learning.rejectedHypotheses).toBe(1);
  });

  it("splits memory candidates honestly (suggested vs written; observed)", () => {
    const c = buildLearningMemoryConsole({ memoryCandidates: candidates });
    expect(c.memory.total).toBe(2);
    expect(c.memory.suggested).toBe(2);
    expect(c.memory.written).toBe(0);
    expect(c.memory.observed).toBe(0); // honest — nothing written
  });

  it("aggregates eval health incl. forbidden / stale / contradicted hits", () => {
    const c = buildLearningMemoryConsole({
      evalReports: [
        report("pass"),
        report("warning", { staleHitIds: ["s1", "s2"], staleHitRate: 0.5 }),
        report("fail", { forbiddenHitIds: ["f1"], contradictedHitIds: ["c1"] }),
      ],
    });
    expect(c.evalHealth.reports).toBe(3);
    expect(c.evalHealth.pass).toBe(1);
    expect(c.evalHealth.warning).toBe(1);
    expect(c.evalHealth.fail).toBe(1);
    expect(c.evalHealth.staleHits).toBe(2);
    expect(c.evalHealth.forbiddenHits).toBe(1);
    expect(c.evalHealth.contradictedHits).toBe(1);
    expect(c.evalHealth.blocked).toBe(1); // fail report carries a blocker
  });

  it("derives honest attention flags (display-only, not acted on)", () => {
    const c = buildLearningMemoryConsole({
      learningLoops: loops,
      evalReports: [report("fail", { forbiddenHitIds: ["f1"], staleHitIds: ["s1"] })],
    });
    expect(c.flags).toContain("1 rejected loop");
    expect(c.flags.some((f) => f.includes("memory eval fail"))).toBe(true);
    expect(c.flags.some((f) => f.includes("forbidden hit"))).toBe(true);
    expect(c.flags.some((f) => f.includes("stale hit"))).toBe(true);
  });

  it("is honest-empty with no inputs", () => {
    const c = buildLearningMemoryConsole({});
    expect(c.hasData).toBe(false);
    expect(c.learning.total).toBe(0);
    expect(c.memory.total).toBe(0);
    expect(c.evalHealth.reports).toBe(0);
    expect(c.flags).toEqual([]);
  });

  it("is deterministic and carries no domain vocabulary", () => {
    const input = { learningLoops: loops, memoryCandidates: candidates, evalReports: [report("pass")] };
    const a = JSON.stringify(buildLearningMemoryConsole(input));
    const b = JSON.stringify(buildLearningMemoryConsole(input));
    expect(a).toBe(b);
    const blob = a.toLowerCase();
    for (const term of FORBIDDEN) expect(blob.includes(term)).toBe(false);
  });
});
