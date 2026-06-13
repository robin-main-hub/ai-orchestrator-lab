import { describe, expect, it } from "vitest";
import { buildConfidenceSignal, summarizeConfidence, truthStatusForConfidenceKind } from "./confidenceSignal.js";

const now = () => "2026-06-13T00:00:00.000Z";

describe("truthStatusForConfidenceKind", () => {
  it("treats logprobs/verifier as observed and self-reported/debate as configured, demo as simulated", () => {
    expect(truthStatusForConfidenceKind("provider_logprobs")).toBe("observed");
    expect(truthStatusForConfidenceKind("verifier_result")).toBe("observed");
    expect(truthStatusForConfidenceKind("debate_disagreement")).toBe("configured");
    expect(truthStatusForConfidenceKind("self_reported")).toBe("configured");
    expect(truthStatusForConfidenceKind("simulated")).toBe("simulated");
  });
});

describe("buildConfidenceSignal", () => {
  it("clamps the score and carries the source truthStatus (no fake observed)", () => {
    const s = buildConfidenceSignal({ id: "c1", missionId: "m1", kind: "self_reported", score: 1.5, now });
    expect(s.score).toBe(1);
    expect(s.truthStatus).toBe("configured");
    expect(s.label).toContain("자가 보고");
  });
});

describe("summarizeConfidence", () => {
  it("decomposes by source instead of one fake gauge, and only trusts observed for the headline", () => {
    const summary = summarizeConfidence([
      buildConfidenceSignal({ id: "1", missionId: "m", kind: "self_reported", score: 0.72, now }),
      buildConfidenceSignal({ id: "2", missionId: "m", kind: "verifier_result", score: 0.9, now }),
      buildConfidenceSignal({ id: "3", missionId: "m", kind: "simulated", score: 0.99, now }),
    ]);
    expect(summary.lines).toHaveLength(3);
    // observed headline ignores the self_reported 0.72 and the simulated 0.99
    expect(summary.observedHighest).toBe(0.9);
  });

  it("has no observed headline when only self-reported/simulated signals exist", () => {
    const summary = summarizeConfidence([buildConfidenceSignal({ id: "1", missionId: "m", kind: "self_reported", score: 0.8, now })]);
    expect(summary.observedHighest).toBeUndefined();
  });
});
