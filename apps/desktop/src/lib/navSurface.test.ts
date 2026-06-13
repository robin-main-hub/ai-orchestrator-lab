import { describe, expect, it } from "vitest";
import { NAV_CENTER_ITEMS, isNavCenterActive, resolveActiveSurface } from "./navSurface";

describe("navSurface", () => {
  it("recognizes every center-owning nav item", () => {
    for (const item of NAV_CENTER_ITEMS) {
      expect(isNavCenterActive(item)).toBe(true);
    }
  });

  it("leaves the center to the mode axis for none / config_files", () => {
    expect(isNavCenterActive("none")).toBe(false);
    expect(isNavCenterActive("config_files")).toBe(false);
  });

  it("no longer treats the removed 'runtime' ghost as a center item", () => {
    expect((NAV_CENTER_ITEMS as readonly string[]).includes("runtime")).toBe(false);
  });

  it("resolves a single active-surface coordinate from the two axes", () => {
    // nav owns the center → nav axis, regardless of the background mode
    expect(resolveActiveSurface({ mode: "cockpit", activeNavItem: "dashboard" })).toEqual({
      axis: "nav",
      item: "dashboard",
    });
    // nav cleared (none) → the mode axis is active
    expect(resolveActiveSurface({ mode: "cockpit", activeNavItem: "none" })).toEqual({
      axis: "mode",
      mode: "cockpit",
    });
    // config_files is not a center item → mode axis
    expect(resolveActiveSurface({ mode: "debate", activeNavItem: "config_files" })).toEqual({
      axis: "mode",
      mode: "debate",
    });
  });
});
