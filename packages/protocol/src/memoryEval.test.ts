import { describe, expect, it } from "vitest";
import { evaluateMemoryRecall, evaluateMemoryRecallBatch } from "./memoryEval.js";
import type { MemoryRecord, MemoryRelation } from "./index.js";

function rec(id: string, over: Partial<MemoryRecord> = {}): MemoryRecord {
  return {
    id,
    layer: "fragment",
    title: `mem ${id}`,
    content: "…",
    sourceChannel: "desktop",
    trustLevel: "trusted",
    createdAt: "2026-06-01T00:00:00Z",
    pinned: false,
    ...over,
  };
}

function recordsById(...records: MemoryRecord[]): Record<string, MemoryRecord> {
  return Object.fromEntries(records.map((r) => [r.id, r]));
}

function rel(id: string, kind: MemoryRelation["kind"], from: string, to: string): MemoryRelation {
  return { id, fromRecordId: from, toRecordId: to, kind, confidence: 0.9, reason: "t", createdAt: "2026-06-01T00:00:00Z" };
}

describe("recall@k", () => {
  it("(M1) counts unique expected hits within top-k", () => {
    const report = evaluateMemoryRecall({
      evalCaseId: "c1",
      expectedMemoryIds: ["a", "b"],
      retrieved: [
        { memoryId: "a", rank: 1 },
        { memoryId: "x", rank: 2 },
        { memoryId: "b", rank: 3 },
      ],
      k: 5,
    });
    expect(report.recallAtK).toBe(1);
    expect(report.expectedHitIds.sort()).toEqual(["a", "b"]);
    expect(report.missingExpectedIds).toEqual([]);
    expect(report.verdict).toBe("pass");
  });

  it("(M2) expected outside top-k reduces recall@k + missing reported", () => {
    const report = evaluateMemoryRecall({
      evalCaseId: "c2",
      expectedMemoryIds: ["a", "b"],
      retrieved: [
        { memoryId: "a", rank: 1 },
        { memoryId: "x", rank: 2 },
        { memoryId: "b", rank: 3 },
      ],
      k: 1,
    });
    expect(report.recallAtK).toBe(0.5);
    expect(report.expectedHitIds).toEqual(["a"]);
    expect(report.missingExpectedIds).toEqual(["b"]);
  });

  it("(M3) duplicate retrieval does not inflate recall (dedupe by best rank)", () => {
    const report = evaluateMemoryRecall({
      evalCaseId: "c3",
      expectedMemoryIds: ["a"],
      retrieved: [
        { memoryId: "a", rank: 5 },
        { memoryId: "a", rank: 1 },
        { memoryId: "a", rank: 3 },
      ],
      k: 1,
    });
    // a deduped to best rank 1 → in top-1 once. recall = 1/1, not 3/1.
    expect(report.recallAtK).toBe(1);
    expect(report.expectedHitIds).toEqual(["a"]);
  });

  it("(M4) order/rank preserved for @k (top-1 takes lowest rank)", () => {
    const report = evaluateMemoryRecall({
      evalCaseId: "c4",
      expectedMemoryIds: ["b"],
      retrieved: [
        { memoryId: "b", rank: 2 },
        { memoryId: "a", rank: 1 },
      ],
      k: 1,
    });
    // top-1 = a (rank 1), so expected b is missing
    expect(report.recallAtK).toBe(0);
    expect(report.missingExpectedIds).toEqual(["b"]);
  });
});

describe("forbidden + unsafe → fail", () => {
  it("(M5) explicit forbidden hit produces fail + blocker", () => {
    const report = evaluateMemoryRecall({
      evalCaseId: "c5",
      expectedMemoryIds: ["a"],
      forbiddenMemoryIds: ["secret"],
      retrieved: [
        { memoryId: "a", rank: 1 },
        { memoryId: "secret", rank: 2 },
      ],
    });
    expect(report.forbiddenHitIds).toEqual(["secret"]);
    expect(report.forbiddenHitRate).toBeCloseTo(0.5);
    expect(report.verdict).toBe("fail");
    expect(report.blockers.length).toBeGreaterThan(0);
  });

  it("(M6) tombstoned memory is unsafe → forbidden hit → fail", () => {
    const report = evaluateMemoryRecall({
      evalCaseId: "c6",
      expectedMemoryIds: ["a"],
      retrieved: [
        { memoryId: "a", rank: 1 },
        { memoryId: "dead", rank: 2 },
      ],
      recordsById: recordsById(rec("a"), rec("dead", { tombstonedAt: "2026-06-10T00:00:00Z" })),
    });
    expect(report.forbiddenHitIds).toEqual(["dead"]);
    expect(report.verdict).toBe("fail");
  });

  it("(M7) quarantined memory is unsafe → forbidden hit → fail", () => {
    const report = evaluateMemoryRecall({
      evalCaseId: "c7",
      expectedMemoryIds: ["a"],
      retrieved: [
        { memoryId: "a", rank: 1 },
        { memoryId: "q", rank: 2 },
      ],
      recordsById: recordsById(rec("a"), rec("q", { activationState: "quarantined" })),
    });
    expect(report.forbiddenHitIds).toEqual(["q"]);
    expect(report.verdict).toBe("fail");
  });
});

describe("staleness → warning by default, fail when strict", () => {
  it("(M8) inactive memory → stale → warning by default", () => {
    const report = evaluateMemoryRecall({
      evalCaseId: "c8",
      expectedMemoryIds: ["a"],
      retrieved: [
        { memoryId: "a", rank: 1 },
        { memoryId: "old", rank: 2 },
      ],
      recordsById: recordsById(rec("a"), rec("old", { activationState: "inactive" })),
    });
    expect(report.staleHitIds).toEqual(["old"]);
    expect(report.verdict).toBe("warning");
    expect(report.blockers).toEqual([]);
  });

  it("(M9) freshness-stale by staleAfterDays → warning", () => {
    const report = evaluateMemoryRecall({
      evalCaseId: "c9",
      expectedMemoryIds: ["a"],
      retrieved: [
        { memoryId: "a", rank: 1 },
        { memoryId: "old", rank: 2 },
      ],
      recordsById: recordsById(
        rec("a", { updatedAt: "2026-06-15T00:00:00Z" }),
        rec("old", { updatedAt: "2026-01-01T00:00:00Z" }),
      ),
      now: "2026-06-16T00:00:00Z",
      staleAfterDays: 30,
    });
    expect(report.staleHitIds).toEqual(["old"]);
    expect(report.verdict).toBe("warning");
  });

  it("(M10) strictStaleness turns stale into fail", () => {
    const report = evaluateMemoryRecall({
      evalCaseId: "c10",
      expectedMemoryIds: ["a"],
      retrieved: [
        { memoryId: "a", rank: 1 },
        { memoryId: "old", rank: 2 },
      ],
      recordsById: recordsById(rec("a"), rec("old", { activationState: "inactive" })),
      strictStaleness: true,
    });
    expect(report.staleHitIds).toEqual(["old"]);
    expect(report.verdict).toBe("fail");
    expect(report.blockers.length).toBeGreaterThan(0);
  });

  it("(M11) fresh active memory within policy is not stale", () => {
    const report = evaluateMemoryRecall({
      evalCaseId: "c11",
      expectedMemoryIds: ["a"],
      retrieved: [{ memoryId: "a", rank: 1 }],
      recordsById: recordsById(rec("a", { activationState: "active", updatedAt: "2026-06-15T00:00:00Z" })),
      now: "2026-06-16T00:00:00Z",
      staleAfterDays: 30,
    });
    expect(report.staleHitIds).toEqual([]);
    expect(report.verdict).toBe("pass");
  });
});

describe("contradicts / supersedes surfaced separately (warning)", () => {
  it("(M12) contradicts relation touching a retrieved record is surfaced", () => {
    const report = evaluateMemoryRecall({
      evalCaseId: "c12",
      expectedMemoryIds: ["a"],
      retrieved: [
        { memoryId: "a", rank: 1 },
        { memoryId: "b", rank: 2 },
      ],
      recordsById: recordsById(rec("a"), rec("b")),
      relations: [rel("r1", "contradicts", "a", "b")],
    });
    expect(report.contradictedHitIds.sort()).toEqual(["a", "b"]);
    expect(report.verdict).toBe("warning");
  });

  it("(M13) supersedes — only the superseded (to) record is surfaced", () => {
    const report = evaluateMemoryRecall({
      evalCaseId: "c13",
      expectedMemoryIds: ["new"],
      retrieved: [
        { memoryId: "new", rank: 1 },
        { memoryId: "old", rank: 2 },
      ],
      recordsById: recordsById(rec("new"), rec("old")),
      // new supersedes old → old is outdated
      relations: [rel("r2", "supersedes", "new", "old")],
    });
    expect(report.supersededHitIds).toEqual(["old"]);
    expect(report.contradictedHitIds).toEqual([]);
    expect(report.verdict).toBe("warning");
  });
});

describe("unknown ids + empty expected + verdict priority", () => {
  it("(M14) unknown retrieved id (not in recordsById) is warning, not crash", () => {
    const report = evaluateMemoryRecall({
      evalCaseId: "c14",
      expectedMemoryIds: ["a"],
      retrieved: [
        { memoryId: "a", rank: 1 },
        { memoryId: "ghost", rank: 2 },
      ],
      recordsById: recordsById(rec("a")),
    });
    expect(report.unknownRetrievedIds).toEqual(["ghost"]);
    expect(report.verdict).toBe("warning");
  });

  it("(M15) without recordsById, no unknowns reported (cannot determine)", () => {
    const report = evaluateMemoryRecall({
      evalCaseId: "c15",
      expectedMemoryIds: ["a"],
      retrieved: [{ memoryId: "a", rank: 1 }],
    });
    expect(report.unknownRetrievedIds).toEqual([]);
    expect(report.verdict).toBe("pass");
  });

  it("(M16) empty expected set → recallAtK null, no divide-by-zero", () => {
    const report = evaluateMemoryRecall({
      evalCaseId: "c16",
      expectedMemoryIds: [],
      retrieved: [{ memoryId: "x", rank: 1 }],
    });
    expect(report.recallAtK).toBeNull();
    expect(report.expectedHitIds).toEqual([]);
    expect(report.missingExpectedIds).toEqual([]);
    expect(report.verdict).toBe("pass");
  });

  it("(M17) empty expected but a forbidden hit still fails", () => {
    const report = evaluateMemoryRecall({
      evalCaseId: "c17",
      expectedMemoryIds: [],
      forbiddenMemoryIds: ["x"],
      retrieved: [{ memoryId: "x", rank: 1 }],
    });
    expect(report.recallAtK).toBeNull();
    expect(report.verdict).toBe("fail");
  });

  it("(M18) answerable case with empty recall fails (expected present, none found)", () => {
    const report = evaluateMemoryRecall({
      evalCaseId: "c18",
      expectedMemoryIds: ["a"],
      retrieved: [],
    });
    expect(report.recallAtK).toBe(0);
    expect(report.verdict).toBe("fail");
  });

  it("(M19) verdict priority fail > warning > pass (forbidden + stale together → fail)", () => {
    const report = evaluateMemoryRecall({
      evalCaseId: "c19",
      expectedMemoryIds: ["a"],
      forbiddenMemoryIds: ["bad"],
      retrieved: [
        { memoryId: "a", rank: 1 },
        { memoryId: "bad", rank: 2 },
        { memoryId: "old", rank: 3 },
      ],
      recordsById: recordsById(rec("a"), rec("bad"), rec("old", { activationState: "inactive" })),
    });
    expect(report.forbiddenHitIds).toEqual(["bad"]);
    expect(report.staleHitIds).toEqual(["old"]);
    expect(report.verdict).toBe("fail"); // fail wins
  });

  it("(M20) forbidden + tombstoned do not double-count into stale", () => {
    const report = evaluateMemoryRecall({
      evalCaseId: "c20",
      expectedMemoryIds: ["a"],
      retrieved: [
        { memoryId: "a", rank: 1 },
        { memoryId: "dead", rank: 2 },
      ],
      // dead is both tombstoned AND inactive — must land in forbidden only, not stale
      recordsById: recordsById(rec("a"), rec("dead", { tombstonedAt: "2026-06-10T00:00:00Z", activationState: "inactive" })),
    });
    expect(report.forbiddenHitIds).toEqual(["dead"]);
    expect(report.staleHitIds).toEqual([]);
  });
});

describe("determinism + batch", () => {
  it("(M21) same input → same output (pure/deterministic)", () => {
    const input = {
      evalCaseId: "c21",
      expectedMemoryIds: ["a", "b"],
      retrieved: [
        { memoryId: "b", rank: 2 },
        { memoryId: "a", rank: 1 },
      ],
      k: 2,
    };
    expect(evaluateMemoryRecall(input)).toEqual(evaluateMemoryRecall(input));
  });

  it("(M22) batch summary aggregates verdicts + mean recall", () => {
    const { reports, summary } = evaluateMemoryRecallBatch([
      { evalCaseId: "p", expectedMemoryIds: ["a"], retrieved: [{ memoryId: "a", rank: 1 }] },
      { evalCaseId: "f", expectedMemoryIds: ["a"], forbiddenMemoryIds: ["x"], retrieved: [{ memoryId: "x", rank: 1 }] },
      { evalCaseId: "e", expectedMemoryIds: [], retrieved: [{ memoryId: "z", rank: 1 }] },
    ]);
    expect(reports).toHaveLength(3);
    expect(summary.totalCases).toBe(3);
    expect(summary.passedCases).toBe(2); // p passes, e (empty expected, no issues) passes
    expect(summary.failedCases).toBe(1); // f fails
    // mean recall counts only non-null cases: p=1, f=0 → mean 0.5 (e is null → excluded)
    expect(summary.meanRecallAtK).toBeCloseTo(0.5);
  });

  it("(M23) k defaults to deduped retrieved length when not provided", () => {
    const report = evaluateMemoryRecall({
      evalCaseId: "c23",
      expectedMemoryIds: ["a", "b"],
      retrieved: [
        { memoryId: "a", rank: 1 },
        { memoryId: "b", rank: 2 },
      ],
    });
    expect(report.k).toBe(2);
    expect(report.recallAtK).toBe(1);
  });
});

// The freshness reference-date precedence (lastAccessedAt > updatedAt > createdAt),
// the unparseable-date guard (Date.parse NaN → treated as NOT stale, never a crash
// or a false-stale), and the EMPTY-batch summary + the batch mean forbidden/stale
// rate aggregation (M22 asserts only mean recall) are all unpinned. They are
// honesty-load-bearing: a wrong reference date or a NaN crash could silently flip a
// fresh memory to stale (or a stale one to fresh). Pin them, self-consistent (rates
// computed straight from the per-case hit counts).
describe("freshness reference precedence + NaN guard + batch aggregation", () => {
  it("(M24) lastAccessedAt takes precedence over a stale updatedAt — a recently-touched memory is NOT stale", () => {
    const report = evaluateMemoryRecall({
      evalCaseId: "c24",
      expectedMemoryIds: ["a"],
      retrieved: [{ memoryId: "a", rank: 1 }],
      // updatedAt is ancient, but lastAccessedAt is recent → referenceDate uses lastAccessedAt
      recordsById: recordsById(
        rec("a", { activationState: "active", updatedAt: "2026-01-01T00:00:00Z", lastAccessedAt: "2026-06-15T00:00:00Z" }),
      ),
      now: "2026-06-16T00:00:00Z",
      staleAfterDays: 30,
    });
    expect(report.staleHitIds).toEqual([]); // recent lastAccessedAt wins → fresh
    expect(report.verdict).toBe("pass");
  });

  it("(M25) an unparseable reference date is treated as NOT stale (NaN guard, no crash, no false-stale)", () => {
    const report = evaluateMemoryRecall({
      evalCaseId: "c25",
      expectedMemoryIds: ["a"],
      retrieved: [{ memoryId: "a", rank: 1 }],
      recordsById: recordsById(rec("a", { activationState: "active", updatedAt: "not-a-real-date" })),
      now: "2026-06-16T00:00:00Z",
      staleAfterDays: 30,
    });
    expect(report.staleHitIds).toEqual([]); // Date.parse NaN → guard returns false
    expect(report.verdict).toBe("pass");
  });

  it("(M26) empty batch → zeroed counts, mean rates 0, meanRecallAtK null", () => {
    const { reports, summary } = evaluateMemoryRecallBatch([]);
    expect(reports).toEqual([]);
    expect(summary).toEqual({
      totalCases: 0,
      passedCases: 0,
      warningCases: 0,
      failedCases: 0,
      meanRecallAtK: null, // no non-null recalls → null, not NaN
      meanForbiddenHitRate: 0,
      meanStaleHitRate: 0,
    });
  });

  it("(M27) batch means the per-case forbidden/stale hit rates", () => {
    const { summary } = evaluateMemoryRecallBatch([
      // case A: 1 forbidden of 2 retrieved → forbiddenHitRate 0.5, staleHitRate 0
      { evalCaseId: "A", expectedMemoryIds: ["a"], forbiddenMemoryIds: ["bad"], retrieved: [{ memoryId: "a", rank: 1 }, { memoryId: "bad", rank: 2 }] },
      // case B: 1 inactive(stale) of 2 retrieved → staleHitRate 0.5, forbiddenHitRate 0
      { evalCaseId: "B", expectedMemoryIds: ["a"], retrieved: [{ memoryId: "a", rank: 1 }, { memoryId: "old", rank: 2 }], recordsById: recordsById(rec("a"), rec("old", { activationState: "inactive" })) },
    ]);
    expect(summary.meanForbiddenHitRate).toBeCloseTo(0.25); // (0.5 + 0) / 2
    expect(summary.meanStaleHitRate).toBeCloseTo(0.25); // (0 + 0.5) / 2
    expect(summary.failedCases).toBe(1); // A fails on forbidden
    expect(summary.warningCases).toBe(1); // B warns on stale
  });
});
