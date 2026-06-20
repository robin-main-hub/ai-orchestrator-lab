import { describe, expect, it } from "vitest";
import type { CenterMode } from "../types";
import {
  MODE_OWNS_CENTER_NAV,
  NAV_CENTER_ITEMS,
  isNavCenterActive,
  resolveActiveSurface,
} from "./navSurface";

// Characterization tests (no behavior change) for MODE_OWNS_CENTER_NAV, the only
// export in navSurface.ts the existing navSurface.test.ts leaves unasserted (that
// suite pins NAV_CENTER_ITEMS / isNavCenterActive / resolveActiveSurface but never
// the sentinel that means "the mode axis owns the center").
//
// MODE_OWNS_CENTER_NAV is the value onChangeMode and the mode-change effect both
// write to clear the left nav. The load-bearing invariant is mutual exclusion: the
// sentinel must NOT itself be a center-owning nav item — if it were, isNavCenterActive
// would be true for it and the mode axis could never own the center, so resolveActiveSurface
// would always pick the nav axis and the top mode tabs would be permanently masked.
// We pin: the sentinel equals "none"; it is excluded from NAV_CENTER_ITEMS;
// isNavCenterActive(sentinel) is false; and feeding it to resolveActiveSurface yields
// the mode axis for EVERY CenterMode (so switching modes always surfaces, never hides).

const ALL_MODES: CenterMode[] = ["annex", "cockpit", "conversation", "debate", "tmux"];

describe("MODE_OWNS_CENTER_NAV", () => {
  it("is the 'none' sentinel and is not a center-owning nav item", () => {
    expect(MODE_OWNS_CENTER_NAV).toBe("none");
    expect((NAV_CENTER_ITEMS as readonly string[]).includes(MODE_OWNS_CENTER_NAV)).toBe(false);
    // the mutual-exclusion invariant: the sentinel never claims the center
    expect(isNavCenterActive(MODE_OWNS_CENTER_NAV)).toBe(false);
  });

  it("hands the center to the mode axis for every CenterMode when nav is the sentinel", () => {
    for (const mode of ALL_MODES) {
      expect(resolveActiveSurface({ mode, activeNavItem: MODE_OWNS_CENTER_NAV }), mode).toEqual({
        axis: "mode",
        mode,
      });
    }
  });
});
