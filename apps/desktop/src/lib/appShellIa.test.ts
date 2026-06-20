import { describe, expect, it } from "vitest";
import {
  appShellSections,
  appShellTabIds,
  defaultAppShellTabBySection,
  resolveAppShellTabForSurface,
} from "./appShellIa";

describe("appShellIa", () => {
  it("defines the requested five-section desktop IA", () => {
    expect(appShellSections.map((section) => section.id)).toEqual([
      "command",
      "studio",
      "operations",
      "library",
      "system",
    ]);
  });

  it("keeps Library defaulted to Workspaces", () => {
    expect(defaultAppShellTabBySection.library).toBe("library.workspaces");
  });

  it("has unique tab IDs", () => {
    expect(new Set(appShellTabIds).size).toBe(appShellTabIds.length);
  });

  it("maps existing mode/nav state back to the renewed shell tab", () => {
    expect(resolveAppShellTabForSurface({ mode: "cockpit", activeNavItem: "none" })).toBe("command.cockpit");
    expect(resolveAppShellTabForSurface({ mode: "conversation", activeNavItem: "none" })).toBe("studio.chat");
    expect(resolveAppShellTabForSurface({ mode: "tmux", activeNavItem: "none" })).toBe("operations.terminal");
    expect(resolveAppShellTabForSurface({ mode: "cockpit", activeNavItem: "coding" })).toBe("studio.code");
    expect(resolveAppShellTabForSurface({ mode: "cockpit", activeNavItem: "providers" })).toBe("system.providers");
  });

  it("maps virtual presentation-only stages without inventing runtime state", () => {
    expect(
      resolveAppShellTabForSurface({
        activeNavItem: "none",
        mode: "cockpit",
        virtualSurface: "operations_queue",
      }),
    ).toBe("operations.queue");
    expect(
      resolveAppShellTabForSurface({
        activeNavItem: "none",
        mode: "cockpit",
        virtualSurface: "library_memory",
      }),
    ).toBe("library.memory");
  });
});
