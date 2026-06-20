import { describe, expect, it } from "vitest";
import {
  buildConfidenceSignal,
  confidenceSignalKindSchema,
  confidenceSignalSchema,
  summarizeConfidence,
  truthStatusForConfidenceKind,
} from "./confidenceSignal.js";

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

// confidenceSignalKindSchema is the 0-ref vocabulary of the "split confidence
// by source" model, and truthStatusForConfidenceKind is the single honesty
// mapping under it — the anti-fake-observed rule lives here: ONLY logprobs and
// verifier results may be observed, everything else is configured/simulated.
// The existing per-kind test enumerates the five literals by hand; pin instead
// against the schema's own .options (self-consistency: total over every kind,
// exactly two observed, no fall-through) so a future kind cannot silently slip
// in as observed. Also cover buildConfidenceSignal's lower clamp + truthStatus
// derived straight from kind, and summarizeConfidence's max-of-many-observed.
describe("confidenceSignal — vocabulary + honesty totality", () => {
  it("pins the confidence-kind enum membership", () => {
    expect(confidenceSignalKindSchema.options).toEqual([
      "provider_logprobs",
      "verifier_result",
      "debate_disagreement",
      "self_reported",
      "simulated",
    ]);
  });

  it("truthStatusForConfidenceKind is total over every kind, and ONLY logprobs/verifier are observed", () => {
    const observed = confidenceSignalKindSchema.options.filter(
      (kind) => truthStatusForConfidenceKind(kind) === "observed",
    );
    expect(observed.sort()).toEqual(["provider_logprobs", "verifier_result"]);
    // simulated never collapses into observed (no fake gauge)
    expect(truthStatusForConfidenceKind("simulated")).toBe("simulated");
    // every kind yields a non-empty truthStatus (no unmapped fall-through)
    for (const kind of confidenceSignalKindSchema.options) {
      expect(truthStatusForConfidenceKind(kind).length).toBeGreaterThan(0);
    }
  });

  it("buildConfidenceSignal clamps the lower bound, rounds the label, and derives truthStatus from the kind", () => {
    for (const kind of confidenceSignalKindSchema.options) {
      const s = buildConfidenceSignal({ id: "c", missionId: "m", kind, score: -0.5, now, labelSuffix: "n=3" });
      expect(s.score).toBe(0); // lower clamp
      expect(s.label).toContain("0%");
      expect(s.label).toContain("· n=3"); // suffix appended
      expect(s.truthStatus).toBe(truthStatusForConfidenceKind(kind)); // self-consistent
      expect(() => confidenceSignalSchema.parse(s)).not.toThrow();
    }
    expect(buildConfidenceSignal({ id: "c", missionId: "m", kind: "verifier_result", score: 0.726, now }).label).toContain("73%");
  });

  it("observedHighest takes the max across MULTIPLE observed signals, and empty input yields no lines / no headline", () => {
    const summary = summarizeConfidence([
      buildConfidenceSignal({ id: "1", missionId: "m", kind: "verifier_result", score: 0.6, now }),
      buildConfidenceSignal({ id: "2", missionId: "m", kind: "provider_logprobs", score: 0.95, now }),
      buildConfidenceSignal({ id: "3", missionId: "m", kind: "self_reported", score: 0.99, now }),
    ]);
    expect(summary.observedHighest).toBe(0.95); // max of the two observed, ignoring the 0.99 self-reported
    const empty = summarizeConfidence([]);
    expect(empty.lines).toEqual([]);
    expect(empty.observedHighest).toBeUndefined();
  });

  it("confidenceSignalSchema rejects out-of-range scores", () => {
    const base = { id: "c", missionId: "m", kind: "verifier_result", label: "x", truthStatus: "observed", createdAt: now() };
    expect(confidenceSignalSchema.safeParse({ ...base, score: 1.2 }).success).toBe(false);
    expect(confidenceSignalSchema.safeParse({ ...base, score: -0.1 }).success).toBe(false);
    expect(confidenceSignalSchema.safeParse({ ...base, score: 0.5 }).success).toBe(true);
  });
});
