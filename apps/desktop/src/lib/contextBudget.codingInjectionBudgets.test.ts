import { describe, expect, it } from "vitest";
import { codingInjectionBudgets, modelContextCharBudget } from "./contextBudget";

// Characterization tests (no behavior change) for codingInjectionBudgets, whose
// prExcerptCharBudget field is left unasserted by the existing suites. The
// contextBudget.test.ts suite pins only modelContextCharBudget; the
// codingContextBudget.smoke.test.ts exercises codingInjectionBudgets end-to-end
// but only ever asserts totalCharBudget — it feeds prExcerptCharBudget into
// buildPrContextAttachment as an opaque number and never pins its value or its
// floor/half rule.
//
// codingInjectionBudgets derives the two char budgets the coding workbench
// injects with:
//   totalCharBudget  ← modelContextCharBudget(model)  (delegated verbatim)
//   prExcerptCharBudget ← max(8_000, floor(totalCharBudget / 2))
// The load-bearing rule (from the source comment): a single PR excerpt is capped
// at "at most half the total so one PR can't monopolize context" — BUT a hard
// 8_000 floor sits under that half. The two arms of the max are the gap:
//   - half-wins arm: when total/2 >= 8_000, the excerpt is exactly half the total.
//   - floor-wins arm: when total/2 < 8_000, the excerpt is pinned at 8_000 — and
//     for a tiny model this floor can actually EXCEED the whole total budget, which
//     the "at most half" comment does not anticipate. We pin the real behavior.

describe("codingInjectionBudgets", () => {
  it("delegates totalCharBudget to modelContextCharBudget verbatim", () => {
    expect(codingInjectionBudgets(undefined).totalCharBudget).toBe(modelContextCharBudget(undefined));
    expect(codingInjectionBudgets({ contextWindow: 8_000 }).totalCharBudget).toBe(
      modelContextCharBudget({ contextWindow: 8_000 }),
    );
    expect(codingInjectionBudgets({ contextWindow: 200_000 }).totalCharBudget).toBe(
      modelContextCharBudget({ contextWindow: 200_000 }),
    );
  });

  it("half-wins arm: prExcerpt is exactly floor(total/2) once half clears the 8K floor (unknown model)", () => {
    // unknown model → total 48_000, half 24_000 (>= 8_000) → half wins
    const { totalCharBudget, prExcerptCharBudget } = codingInjectionBudgets(undefined);
    expect(totalCharBudget).toBe(48_000);
    expect(prExcerptCharBudget).toBe(24_000);
    expect(prExcerptCharBudget).toBe(Math.floor(totalCharBudget / 2));
    // a single PR cannot monopolize: it stays at or below the total
    expect(prExcerptCharBudget).toBeLessThanOrEqual(totalCharBudget);
  });

  it("half-wins arm holds for a large (provider-capped) model too", () => {
    // 200K-token window → total capped at 180_000, half 90_000 → half wins
    const { totalCharBudget, prExcerptCharBudget } = codingInjectionBudgets({ contextWindow: 200_000 });
    expect(totalCharBudget).toBe(180_000);
    expect(prExcerptCharBudget).toBe(90_000);
    expect(prExcerptCharBudget).toBe(Math.floor(totalCharBudget / 2));
  });

  it("floor-wins arm: a small model pins the excerpt at the 8K floor instead of half", () => {
    // 8K-token window → total 8_400, half 4_200 (< 8_000) → 8_000 floor wins
    const { totalCharBudget, prExcerptCharBudget } = codingInjectionBudgets({ contextWindow: 8_000 });
    expect(totalCharBudget).toBe(8_400);
    expect(prExcerptCharBudget).toBe(8_000);
    expect(prExcerptCharBudget).toBeGreaterThan(Math.floor(totalCharBudget / 2));
    // floor still happens to sit under this total — one PR not (quite) monopolizing
    expect(prExcerptCharBudget).toBeLessThan(totalCharBudget);
  });

  it("floor-wins edge: for a tiny model the 8K floor EXCEEDS the whole total budget (the 'at most half' comment does not hold here)", () => {
    // 4K-token window → total 4_200, half 2_100 → 8_000 floor wins and overshoots total
    const { totalCharBudget, prExcerptCharBudget } = codingInjectionBudgets({ contextWindow: 4_000 });
    expect(totalCharBudget).toBe(4_200);
    expect(prExcerptCharBudget).toBe(8_000);
    expect(prExcerptCharBudget).toBeGreaterThan(totalCharBudget);
  });
});
