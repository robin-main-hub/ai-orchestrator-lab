import { describe, expect, it } from "vitest";
import type { CenterMode } from "../types";
import {
  createInitialFocusHistory,
  getFallbackFocusSelector,
  getRestoreFocusSelector,
} from "./focusRestoration";

// Characterization tests (no behavior change) for createInitialFocusHistory, the
// only focusRestoration.ts export the existing focusRestoration.test.ts leaves
// unasserted (that suite pins createFocusSelector/getFallbackFocusSelector/
// getRestoreFocusSelector, but only for conversation/debate/tmux — never the
// cockpit/annex modes, and never the initial-history seed).
//
// The seed is the empty-string starting point App restoration reads before any
// element has been focused. We pin: it seeds exactly the CenterMode union with
// empty strings; it returns a fresh object each call (mutation isolation, since
// callers mutate it per focus event); and the load-bearing consistency invariant
// that, because every seeded value is empty, getRestoreFocusSelector(mode, seed)
// degrades to the fallback selector for EVERY mode — including cockpit/annex that
// the existing suite never exercises.

const ALL_MODES: CenterMode[] = ["annex", "cockpit", "conversation", "debate", "tmux"];

describe("createInitialFocusHistory", () => {
  it("seeds exactly the CenterMode union with empty strings", () => {
    const seed = createInitialFocusHistory();
    expect(Object.keys(seed).sort()).toEqual([...ALL_MODES].sort());
    for (const mode of ALL_MODES) {
      expect(seed[mode], mode).toBe("");
    }
  });

  it("returns a fresh object each call so per-mode mutation does not leak", () => {
    const first = createInitialFocusHistory();
    const second = createInitialFocusHistory();
    expect(first).not.toBe(second);
    first.debate = "agent-card-reviewer";
    expect(second.debate).toBe("");
    expect(createInitialFocusHistory().debate).toBe("");
  });

  it("degrades to the fallback selector for every mode while still empty", () => {
    const seed = createInitialFocusHistory();
    for (const mode of ALL_MODES) {
      expect(getRestoreFocusSelector(mode, seed), mode).toBe(getFallbackFocusSelector(mode));
    }
  });
});
