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
