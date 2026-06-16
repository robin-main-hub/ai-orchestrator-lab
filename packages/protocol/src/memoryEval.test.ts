import { describe, it, expect } from "vitest";
import { evaluateMemoryRecall, type MemoryEvalCase, type RecallResultSubset } from "./memoryEval.js";

describe("Memory Recall Evaluation Harness", () => {
  it("should pass when expected records are recalled and no forbidden records are hit", () => {
    const cases: MemoryEvalCase[] = [
      {
        id: "case-1",
        query: "git workflow",
        expectedRecordIds: ["rec-1"],
        forbiddenRecordIds: ["rec-99"],
        topK: 5,
        severity: "critical",
      },
    ];

    const recallResults: Record<string, RecallResultSubset[]> = {
      "case-1": [
        { record: { id: "rec-1" }, score: 0.9 },
        { record: { id: "rec-2" }, score: 0.5 },
      ],
    };

    const summary = evaluateMemoryRecall(cases, recallResults);
    expect(summary.totalCases).toBe(1);
    expect(summary.passedCases).toBe(1);
    expect(summary.failedCases).toBe(0);
    expect(summary.recallAtK).toBe(1.0);
    expect(summary.forbiddenHitRate).toBe(0.0);
  });

  it("should fail when expected records are not recalled in topK", () => {
    const cases: MemoryEvalCase[] = [
      {
        id: "case-2",
        query: "git workflow",
        expectedRecordIds: ["rec-1", "rec-3"],
        forbiddenRecordIds: [],
        topK: 2,
        severity: "warning",
      },
    ];

    const recallResults: Record<string, RecallResultSubset[]> = {
      "case-2": [
        { record: { id: "rec-2" }, score: 0.9 },
        { record: { id: "rec-1" }, score: 0.8 },
        { record: { id: "rec-3" }, score: 0.7 }, // outside topK=2
      ],
    };

    const summary = evaluateMemoryRecall(cases, recallResults);
    expect(summary.passedCases).toBe(0);
    expect(summary.failedCases).toBe(1);
    expect(summary.recallAtK).toBe(0.5); // only rec-1 found in top 2 (1/2 = 0.5)
  });

  it("should fail immediately (hard fail) when a forbidden record is hit", () => {
    const cases: MemoryEvalCase[] = [
      {
        id: "case-3",
        query: "credentials",
        expectedRecordIds: ["rec-10"],
        forbiddenRecordIds: ["rec-forbidden-pwd"],
        topK: 5,
        severity: "critical",
      },
    ];

    const recallResults: Record<string, RecallResultSubset[]> = {
      "case-3": [
        { record: { id: "rec-10" }, score: 0.9 },
        { record: { id: "rec-forbidden-pwd" }, score: 0.85 },
      ],
    };

    const summary = evaluateMemoryRecall(cases, recallResults);
    expect(summary.passedCases).toBe(0);
    expect(summary.failedCases).toBe(1);
    expect(summary.forbiddenHitRate).toBe(1.0);
    expect(summary.warnings).toContain("Case case-3: Hard fail due to forbidden record hit.");
  });

  it("should record stale hits when quarantined or tombstoned records are returned", () => {
    const cases: MemoryEvalCase[] = [
      {
        id: "case-4",
        query: "stale test",
        expectedRecordIds: ["rec-safe"],
        forbiddenRecordIds: [],
        topK: 5,
        severity: "info",
      },
    ];

    const recallResults: Record<string, RecallResultSubset[]> = {
      "case-4": [
        { record: { id: "rec-safe" }, score: 0.9 },
        { record: { id: "rec-stale", activationState: "quarantined" }, score: 0.8 },
      ],
    };

    const summary = evaluateMemoryRecall(cases, recallResults);
    expect(summary.staleHitRate).toBe(1.0);
  });

  it("should record contradiction hits when expected and forbidden records are both hit", () => {
    const cases: MemoryEvalCase[] = [
      {
        id: "case-5",
        query: "contradiction check",
        expectedRecordIds: ["rec-expected"],
        forbiddenRecordIds: ["rec-forbidden"],
        topK: 5,
        severity: "critical",
      },
    ];

    const recallResults: Record<string, RecallResultSubset[]> = {
      "case-5": [
        { record: { id: "rec-expected" }, score: 0.9 },
        { record: { id: "rec-forbidden" }, score: 0.8 },
      ],
    };

    const summary = evaluateMemoryRecall(cases, recallResults);
    expect(summary.contradictionHitRate).toBe(1.0);
  });
});
