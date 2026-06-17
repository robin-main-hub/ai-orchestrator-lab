import { describe, expect, it } from "vitest";
import {
  classifyFreshness,
  projectEvidenceDraft,
  EXAMPLE_EVIDENCE_DRAFT,
  EXAMPLE_DRAFT_NOW_MS,
  FRESHNESS_THRESHOLDS,
} from "./evidenceDraft";

const FORBIDDEN = ["giolite", "erp", "customer", "sales", "quotation", "buyer", "factory"];

describe("Batch 24 — evidence draft / footnote projection", () => {
  it("classifies freshness from injected age (fresh / aging / stale / unknown)", () => {
    const H = 3_600_000;
    expect(classifyFreshness(null)).toBe("unknown");
    expect(classifyFreshness(NaN)).toBe("unknown");
    expect(classifyFreshness(1 * H)).toBe("fresh");
    expect(classifyFreshness((FRESHNESS_THRESHOLDS.freshUnderHours + 1) * H)).toBe("aging");
    expect(classifyFreshness((FRESHNESS_THRESHOLDS.agingUnderHours + 1) * H)).toBe("stale");
    expect(classifyFreshness(-5 * H)).toBe("fresh"); // future-stamped never stale
  });

  it("numbers footnotes by first appearance over known refs only", () => {
    const d = projectEvidenceDraft(EXAMPLE_EVIDENCE_DRAFT, EXAMPLE_DRAFT_NOW_MS);
    expect(d.footnotes.map((f) => f.n)).toEqual([1, 2, 3, 4]);
    expect(d.footnotes.map((f) => f.refId)).toEqual([
      "source-001",
      "source-002",
      "source-003",
      "source-004",
    ]);
  });

  it("scores each footnote's freshness from the injected now", () => {
    const d = projectEvidenceDraft(EXAMPLE_EVIDENCE_DRAFT, EXAMPLE_DRAFT_NOW_MS);
    const byRef = Object.fromEntries(d.footnotes.map((f) => [f.refId, f.freshness]));
    expect(byRef["source-001"]).toBe("fresh"); // 1h
    expect(byRef["source-002"]).toBe("aging"); // 48h
    expect(byRef["source-003"]).toBe("stale"); // ~408h
    expect(byRef["source-004"]).toBe("unknown"); // no observedAt
    expect(d.freshnessSummary).toEqual({ fresh: 1, aging: 1, stale: 1, unknown: 1 });
    expect(d.staleCount).toBe(1);
  });

  it("maps claims to their footnote numbers and flags support", () => {
    const d = projectEvidenceDraft(EXAMPLE_EVIDENCE_DRAFT, EXAMPLE_DRAFT_NOW_MS);
    const byId = Object.fromEntries(d.claims.map((c) => [c.id, c]));
    expect(byId["claim-1"]?.footnotes).toEqual([1]);
    expect(byId["claim-2"]?.footnotes).toEqual([2, 3]);
    expect(byId["claim-3"]?.footnotes).toEqual([4]);
    expect(byId["claim-1"]?.supported).toBe(true);
    expect(byId["claim-4"]?.supported).toBe(false);
  });

  it("surfaces unbacked claims in the missing-info / ask slot (no side effect)", () => {
    const d = projectEvidenceDraft(EXAMPLE_EVIDENCE_DRAFT, EXAMPLE_DRAFT_NOW_MS);
    expect(d.missing.map((m) => m.claimId)).toEqual(["claim-4"]);
    expect(d.missing[0]?.ask).toContain("ask the operator");
    expect(d.missing[0]?.ask).not.toMatch(/approve|send|dispatch|run /);
  });

  it("ignores unknown ref ids (claim falls to missing, not a phantom footnote)", () => {
    const d = projectEvidenceDraft(
      {
        id: "d",
        title: "t",
        sources: [{ id: "source-001", label: "known", observedAt: "2026-06-18T11:00:00.000Z" }],
        claims: [{ id: "c1", text: "phantom", refs: ["source-999"] }],
      },
      EXAMPLE_DRAFT_NOW_MS,
    );
    expect(d.footnotes).toHaveLength(0);
    expect(d.claims[0]?.supported).toBe(false);
    expect(d.missing[0]?.claimId).toBe("c1");
  });

  it("is deterministic and carries no domain vocabulary", () => {
    const a = JSON.stringify(projectEvidenceDraft(EXAMPLE_EVIDENCE_DRAFT, EXAMPLE_DRAFT_NOW_MS));
    const b = JSON.stringify(projectEvidenceDraft(EXAMPLE_EVIDENCE_DRAFT, EXAMPLE_DRAFT_NOW_MS));
    expect(a).toBe(b);
    const blob = a.toLowerCase();
    for (const term of FORBIDDEN) expect(blob.includes(term)).toBe(false);
  });
});
