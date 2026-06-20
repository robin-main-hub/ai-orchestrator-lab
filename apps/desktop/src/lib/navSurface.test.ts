import { describe, expect, it } from "vitest";
import {
  NAV_CENTER_ITEMS,
  PRIMARY_SECTIONS,
  SECTION_TABS,
  isNavCenterActive,
  navigationIntentForSection,
  navigationIntentForTab,
  resolveActiveSurface,
  resolveAppLocation,
  type AppSection,
} from "./navSurface";
import type { CenterMode, NavItemId } from "../types";

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

describe("navSurface · 5-section mapping", () => {
  const loc = (mode: CenterMode, activeNavItem: NavItemId, configLibraryActive = false) =>
    resolveAppLocation({
      activeSurface: resolveActiveSurface({ mode, activeNavItem }),
      configLibraryActive,
    });

  it("maps every nav-owned surface to the right section / tab", () => {
    expect(loc("conversation", "dashboard")).toEqual({ section: "command", tab: "overview" });
    expect(loc("conversation", "command_center")).toEqual({ section: "command", tab: "attention" });
    expect(loc("conversation", "coding")).toEqual({ section: "studio", tab: "code" });
    expect(loc("conversation", "research")).toEqual({ section: "studio", tab: "research" });
    expect(loc("conversation", "run")).toEqual({ section: "operations", tab: "launch" });
    expect(loc("conversation", "theater")).toEqual({ section: "operations", tab: "live" });
    expect(loc("conversation", "projects")).toEqual({ section: "library", tab: "workspaces" });
    expect(loc("conversation", "sessions")).toEqual({ section: "library", tab: "sessions" });
    expect(loc("conversation", "providers")).toEqual({ section: "system", tab: "providers" });
    expect(loc("conversation", "channels")).toEqual({ section: "system", tab: "sources" });
    expect(loc("conversation", "backup")).toEqual({ section: "system", tab: "backup" });
  });

  it("maps every mode-owned surface to the right section / tab", () => {
    expect(loc("cockpit", "none")).toEqual({ section: "command", tab: "cockpit" });
    expect(loc("conversation", "none")).toEqual({ section: "studio", tab: "chat" });
    expect(loc("debate", "none")).toEqual({ section: "studio", tab: "debate" });
    expect(loc("tmux", "none")).toEqual({ section: "operations", tab: "terminal" });
  });

  it("treats the debate annex as Studio / Debate", () => {
    expect(loc("annex", "none")).toEqual({ section: "studio", tab: "debate" });
  });

  it("prefers config library over the underlying nav/mode axis", () => {
    // config_files is not a nav-center item, so the surface reports mode axis;
    // configLibraryActive must still win and resolve to System / Config.
    expect(loc("conversation", "config_files", true)).toEqual({ section: "system", tab: "config" });
  });

  it("round-trips each tab through navigationIntentForTab back to the same location", () => {
    for (const section of PRIMARY_SECTIONS) {
      for (const spec of SECTION_TABS[section]) {
        const intent = navigationIntentForTab(section, spec.tab);
        const configLibraryActive = intent.activeNavItem === "config_files";
        const back = resolveAppLocation({
          activeSurface: resolveActiveSurface({
            mode: intent.mode ?? "conversation",
            activeNavItem: intent.activeNavItem,
          }),
          configLibraryActive,
        });
        expect(back).toEqual({ section, tab: spec.tab });
      }
    }
  });

  it("section click intents land on the documented default tabs", () => {
    const defaults: Record<AppSection, NavItemId | "mode"> = {
      command: "dashboard",
      studio: "mode", // conversation mode
      operations: "run",
      library: "projects",
      system: "providers",
    };
    for (const section of PRIMARY_SECTIONS) {
      const intent = navigationIntentForSection(section);
      if (defaults[section] === "mode") {
        expect(intent.mode).toBe("conversation");
        expect(intent.activeNavItem).toBe("none");
      } else {
        expect(intent.activeNavItem).toBe(defaults[section]);
      }
    }
  });
});
