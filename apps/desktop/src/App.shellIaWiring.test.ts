import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(fileURLToPath(new URL("./App.tsx", import.meta.url)), "utf8");

/**
 * Redesign S1 IA: the three-deck top navigation (AppShellNav "Primary
 * sections" + CMD section tabs + status-bar mode pills) is collapsed into a
 * single left rail plus a one-line topbar. These tests assert the new shape
 * and, preserving the intent of the removed tests, that navigation performs
 * no runtime side effects (no dispatch/fetch/runner/tmux) — it only flips
 * view state.
 */
describe("single-rail shell IA", () => {
  it("removes the AppShellNav top-tab decks entirely", () => {
    expect(appSource).not.toContain("<AppShellNav");
    expect(appSource).not.toContain('from "./components/AppShellNav"');
    expect(appSource).not.toContain('from "./lib/appShellIa"');
    expect(appSource).not.toContain("resolveAppShellTabForSurface");
    expect(appSource).not.toContain("routeBackedShellSections");
  });

  it("keeps a single topbar (RuntimeStatusBar) showing the current view title", () => {
    const count = (appSource.match(/<RuntimeStatusBar/g) ?? []).length;
    expect(count).toBe(1);
    expect(appSource).toContain("viewTitle={currentViewTitle}");
  });

  it("derives the topbar title from the existing mode/nav center axis", () => {
    expect(appSource).toContain("const currentViewTitle =");
    expect(appSource).toContain("CENTER_MODE_TITLES");
    // still uses navSurface (mode↔nav center axis is unchanged)
    expect(appSource).toContain("isNavCenterActive(activeNavItem)");
  });

  it("renders the single left rail (nav sections + center-mode surfaces)", () => {
    expect(appSource).toContain('<nav className="nav-stack">');
    expect(appSource).toContain("navSections.map");
    expect(appSource).toContain("RAIL_MODE_ITEMS.map");
  });

  it("re-homes the center modes into the rail (대화/토론/관제판/Tmux)", () => {
    const block = appSource.match(/const RAIL_MODE_ITEMS[\s\S]*?\];/)?.[0];
    expect(block).toBeDefined();
    expect(block).toContain('mode: "conversation"');
    expect(block).toContain('mode: "debate"');
    expect(block).toContain('mode: "cockpit"');
    expect(block).toContain('mode: "tmux"');
  });

  it("selecting a rail mode hands the center to the mode axis (no router)", () => {
    // the mode rail button sets the mode and clears the nav sentinel
    expect(appSource).toContain("setMode(item.mode)");
    expect(appSource).toContain("setActiveNavItem(MODE_OWNS_CENTER_NAV)");
  });

  it("still wires pendingApprovals-backed control queue and the command palette", () => {
    expect(appSource).toContain("onCommandPalette={() => setCommandPaletteOpen(true)}");
    expect(appSource).toContain("unifiedControlQueueSnapshot.summary.pending");
    expect(appSource).toContain("onProbeDgx={handleProbeDgx}");
  });
});

describe("re-homed read-only surfaces reach the command palette (no functionality deleted)", () => {
  const paletteBlock = appSource.match(/const paletteCommands: CommandEntry\[\] = \[[\s\S]*?\n {2}\];/)?.[0] ?? "";

  it("exposes the mission board, model catalog, memory library, and runtime status", () => {
    expect(paletteBlock).toContain('id: "open.mission-board"');
    expect(paletteBlock).toContain('id: "open.model-catalog"');
    expect(paletteBlock).toContain('id: "open.memory-library"');
    expect(paletteBlock).toContain('id: "open.runtime-status"');
  });

  it("mission board reuses the existing run workspace board state (no new store)", () => {
    const line = paletteBlock.split("\n").join(" ");
    const missionSegment = line.match(/open\.mission-board[\s\S]*?\},/)?.[0] ?? "";
    expect(missionSegment).toContain('setActiveNavItem("run")');
    expect(missionSegment).toContain('setSummonSeedMode("board")');
  });

  it("the read-only sheets only toggle their surface open (read-only peek)", () => {
    expect(paletteBlock).toContain("setModelsSurfaceOpen(true)");
    expect(paletteBlock).toContain("setMemorySurfaceOpen(true)");
    expect(paletteBlock).toContain("setRuntimeSurfaceOpen(true)");
  });

  it("re-homed palette entries perform no dispatch/fetch/runner/tmux side effects", () => {
    const rehomed = [
      "open.mission-board",
      "open.model-catalog",
      "open.memory-library",
      "open.runtime-status",
    ];
    for (const id of rehomed) {
      const segment = paletteBlock.match(new RegExp(`id: "${id}"[\\s\\S]*?\\n {4}\\},`))?.[0] ?? "";
      expect(segment.length).toBeGreaterThan(0);
      expect(segment).not.toContain("dispatch");
      expect(segment).not.toContain("runner");
      expect(segment).not.toContain("send-keys");
      expect(segment).not.toContain("fetch(");
      expect(segment).not.toContain("createDgxMission");
      expect(segment).not.toContain("verifyDgxMission");
      expect(segment).not.toContain("mergeDgxMission");
    }
  });

  it("keeps exactly one RunWorkspace instance with a summon-seed keyed board", () => {
    const runWorkspaceCount = (appSource.match(/<RunWorkspace/g) ?? []).length;
    expect(runWorkspaceCount).toBe(1);
    const keyLine = appSource
      .split("\n")
      .find((l) => l.includes("key={") && l.includes("summonSeed"));
    expect(keyLine).toBeDefined();
    expect(appSource).toContain("initialMode={summonSeedMode}");
  });

  it("keeps the read-only runtime/model/memory sheets rendered from existing state", () => {
    expect(appSource).toContain("<RuntimeRailPanel");
    expect(appSource).toContain("<ReadOnlyModelCatalogPanel");
    expect(appSource).toContain("<ReadOnlyMemoryLibraryPanel");
    // runtime peek stays read-only (no reboot mutation wired to the sheet)
    const sheetBlock = appSource.match(/<Sheet open=\{runtimeSurfaceOpen\}[\s\S]*?<\/Sheet>/)?.[0];
    expect(sheetBlock).toBeDefined();
    expect(sheetBlock).not.toContain("onRequestReboot");
  });
});
