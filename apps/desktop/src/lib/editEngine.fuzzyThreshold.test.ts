import { describe, expect, it } from "vitest";
import {
  FUZZY_THRESHOLD,
  applySearchReplace,
  similarityRatio,
  type EditBlock,
} from "./editEngine";

// Characterization tests (no behavior change) for FUZZY_THRESHOLD, the only export
// in editEngine.ts the existing editEngine.test.ts leaves unasserted (that suite
// pins parseSearchReplaceBlocks / similarityRatio / applySearchReplace / applyEdits
// / normalizeEditInput / buildEditApplyScript, but never the numeric boundary that
// gates the 4th matching tier).
//
// FUZZY_THRESHOLD (0.85) is the accept/reject line for the difflib fuzzy fallback:
// applySearchReplace tries exact → whitespace → indentation → fuzzy, and a fuzzy
// candidate is only accepted when `ratio >= FUZZY_THRESHOLD`. The load-bearing
// invariant is that this boundary actually decides strategy "fuzzy" vs "failed".
// We pin it through the public seam with two single-line inputs (so the sliding
// window is the whole content and the ratio is exactly similarityRatio(content,
// search) — deterministic), one straddling above the threshold and one below, and
// derive each ratio from similarityRatio so the test stays self-consistent rather
// than hard-coding a magic number.

const CONTENT = "const alphaBetaGammaDelta = computeTotal(items);";
// one char dropped from a long token → close but not exact/whitespace/indentation
const NEAR_SEARCH = "const alphaBetaGammaDelta = computeTotl(items);";
const FAR_SEARCH = "completely unrelated zzz qqq 123";

function block(search: string, replace: string): EditBlock {
  return { search, replace };
}

describe("FUZZY_THRESHOLD", () => {
  it("is 0.85, sitting above the 0.5 'near-miss' reason cutoff and below 1", () => {
    expect(FUZZY_THRESHOLD).toBe(0.85);
    expect(FUZZY_THRESHOLD).toBeGreaterThan(0.5);
    expect(FUZZY_THRESHOLD).toBeLessThan(1);
  });

  it("accepts a fuzzy candidate whose ratio is >= the threshold", () => {
    const ratio = similarityRatio(CONTENT, NEAR_SEARCH);
    // guard: this fixture genuinely sits on the accept side of the boundary
    expect(ratio).toBeGreaterThanOrEqual(FUZZY_THRESHOLD);

    const { content, result } = applySearchReplace(CONTENT, block(NEAR_SEARCH, "REPLACED"));
    expect(result.ok).toBe(true);
    expect(result.strategy).toBe("fuzzy");
    expect(result.confidence).toBe(ratio);
    expect(content).toBe("REPLACED");
  });

  it("rejects a fuzzy candidate whose ratio is below the threshold", () => {
    const ratio = similarityRatio(CONTENT, FAR_SEARCH);
    // guard: this fixture genuinely sits on the reject side of the boundary
    expect(ratio).toBeLessThan(FUZZY_THRESHOLD);

    const { content, result } = applySearchReplace(CONTENT, block(FAR_SEARCH, "REPLACED"));
    expect(result.ok).toBe(false);
    expect(result.strategy).toBe("failed");
    expect(result.confidence).toBeLessThan(FUZZY_THRESHOLD);
    // a rejected match leaves the content untouched (read-only on failure)
    expect(content).toBe(CONTENT);
  });
});
