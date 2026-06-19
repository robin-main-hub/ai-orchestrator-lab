import { describe, expect, it } from "vitest";
import type { MemoryRecord } from "@ai-orchestrator/protocol";
import { lexicalView, metadataView, rrfFuse, semanticView, type ViewResult } from "./memoryViews";

const createdAt = "2026-05-24T00:00:00.000Z";

function record(id: string, fields: Partial<MemoryRecord>): MemoryRecord {
  return {
    id,
    layer: "project_memory",
    scope: "project",
    kind: "context",
    title: id,
    content: "",
    sourceChannel: "desktop",
    trustLevel: "trusted",
    createdAt,
    pinned: false,
    ...fields,
  };
}

describe("EvolveMemento memory views", () => {
  it("ranks exact keyword matches first in the lexical view", () => {
    const results = lexicalView("DGX authority", [
      record("weak", { keywords: ["mobile", "backup"] }),
      record("strong", { keywords: ["dgx", "authority", "server"] }),
    ], 5);

    expect(results[0]?.recordId).toBe("strong");
    expect(results[0]?.rank).toBe(1);
  });

  it("sorts metadata matches by entity and person intersection score", () => {
    const results = metadataView(
      "Maomao checks DGX-02",
      [
        record("entity-only", { entities: ["DGX-02"] }),
        record("entity-and-person", { entities: ["DGX-02"], persons: ["Maomao"] }),
      ],
      5,
      { entities: ["DGX-02"], persons: ["Maomao"] },
    );

    expect(results.map((result) => result.recordId)).toEqual(["entity-and-person", "entity-only"]);
  });

  it("keeps semantic view disabled until an embedding provider is chosen", () => {
    expect(semanticView("anything", [record("one", {})], 5)).toEqual([]);
  });

  it("sums reciprocal ranks when the same record appears in multiple views", () => {
    const lexical: ViewResult[] = [{ recordId: "same", rank: 1, rawScore: 1000, view: "lexical" }];
    const metadata: ViewResult[] = [{ recordId: "same", rank: 2, rawScore: 0.01, view: "metadata" }];

    const [result] = rrfFuse([lexical, metadata], 60);

    expect(result?.recordId).toBe("same");
    expect(result?.viewBreakdown).toHaveLength(2);
    expect(result?.fusedScore).toBeCloseTo(1 / 61 + 1 / 62);
  });

  it("uses rank rather than raw score scale during RRF fusion", () => {
    const highMagnitude: ViewResult[] = [{ recordId: "scaled", rank: 1, rawScore: 1000, view: "lexical" }];
    const lowMagnitude: ViewResult[] = [{ recordId: "other", rank: 1, rawScore: 0.01, view: "metadata" }];

    const results = rrfFuse([highMagnitude, lowMagnitude], 60);

    expect(results.find((result) => result.recordId === "scaled")?.fusedScore).toBeCloseTo(
      results.find((result) => result.recordId === "other")?.fusedScore ?? 0,
    );
  });
});

// Characterization tests for previously-uncovered memory-view branches (no
// behavior change, no network, no secret). These pin: the lexical guard
// returns (empty query / empty records / k<=0), the no-keyword
// title/content/tags fallback plus the rawScore>0 drop, the lexical tie-break
// (equal score → recordId ascending) and k slice, the metadata k<=0 guard with
// missing persons/entities defaulting to empty and zero-intersection drop, and
// the rrfFuse default k=60 ordering with a recordId tie-break.
describe("memoryViews — retrieval projection characterization", () => {
  it("returns no lexical results for empty query, empty records, or non-positive k", () => {
    expect(lexicalView("", [record("a", { keywords: ["x"] })], 5)).toEqual([]);
    expect(lexicalView("x", [], 5)).toEqual([]);
    expect(lexicalView("x", [record("a", { keywords: ["x"] })], 0)).toEqual([]);
  });

  it("falls back to title/content/tags tokens when a record has no keywords and drops non-matches", () => {
    const results = lexicalView(
      "dgx authority",
      [
        record("alpha", { content: "authority note", tags: ["dgx", "server"] }),
        record("beta", { content: "mobile backup only" }),
      ],
      5,
    );

    expect(results.map((result) => result.recordId)).toEqual(["alpha"]);
    expect(results[0]?.rank).toBe(1);
  });

  it("breaks lexical score ties by recordId ascending and honors the k slice", () => {
    const ordered = lexicalView(
      "term",
      [record("b-second", { keywords: ["term"] }), record("a-first", { keywords: ["term"] })],
      5,
    );
    expect(ordered.map((result) => result.recordId)).toEqual(["a-first", "b-second"]);

    const limited = lexicalView(
      "term",
      [record("b-second", { keywords: ["term"] }), record("a-first", { keywords: ["term"] })],
      1,
    );
    expect(limited.map((result) => result.recordId)).toEqual(["a-first"]);
  });

  it("guards metadata on non-positive k and drops zero-intersection records with empty defaults", () => {
    expect(
      metadataView("q", [record("a", { persons: ["X"] })], 0, { persons: ["X"], entities: [] }),
    ).toEqual([]);

    const results = metadataView(
      "q",
      [record("match", { persons: ["Alice"] }), record("nomatch", {})],
      5,
      { persons: ["Alice"], entities: [] },
    );

    expect(results.map((result) => result.recordId)).toEqual(["match"]);
  });

  it("applies the default k=60 in RRF fusion and tie-breaks equal scores by recordId", () => {
    const byRank = rrfFuse([
      [{ recordId: "low", rank: 5, rawScore: 1, view: "lexical" }],
      [{ recordId: "high", rank: 1, rawScore: 1, view: "lexical" }],
    ]);
    expect(byRank.map((result) => result.recordId)).toEqual(["high", "low"]);
    expect(byRank[0]?.fusedScore).toBeCloseTo(1 / 61);
    expect(byRank[1]?.fusedScore).toBeCloseTo(1 / 65);

    const tied = rrfFuse([
      [{ recordId: "z", rank: 1, rawScore: 1, view: "lexical" }],
      [{ recordId: "a", rank: 1, rawScore: 1, view: "lexical" }],
    ]);
    expect(tied.map((result) => result.recordId)).toEqual(["a", "z"]);
  });
});
