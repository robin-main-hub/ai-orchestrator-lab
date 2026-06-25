import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  appShellSections,
  defaultAppShellTabBySection,
  resolveAppShellTabForSurface,
} from "./lib/appShellIa";

const appSource = readFileSync(fileURLToPath(new URL("./App.tsx", import.meta.url)), "utf8");

describe("App shell IA wiring smoke", () => {
  it("renders both AppShellNav and RuntimeStatusBar", () => {
    expect(appSource).toContain("<AppShellNav");
    expect(appSource).toContain("<RuntimeStatusBar");
  });

  it("imports AppShellNav and IA helpers", () => {
    expect(appSource).toContain('from "./components/AppShellNav"');
    expect(appSource).toContain("resolveAppShellTabForSurface");
    expect(appSource).toContain("findAppShellTab");
    expect(appSource).toContain("appShellSections");
  });

  it("imports renewal-shell.css", () => {
    expect(appSource).toContain('import "./styles/renewal-shell.css"');
  });

  it("derives active shell tab from existing mode and activeNavItem", () => {
    expect(appSource).toContain("resolveAppShellTabForSurface({ activeNavItem, mode })");
  });

  it("wires pendingApprovals from unifiedControlQueueSnapshot", () => {
    expect(appSource).toContain("pendingApprovals={unifiedControlQueueSnapshot.summary.pending}");
  });

  it("wires onCommandPalette to existing setCommandPaletteOpen", () => {
    expect(appSource).toContain("onCommandPalette={() => setCommandPaletteOpen(true)}");
  });

  it("wires onOpenQueue to existing setApprovalDrawerOpen", () => {
    expect(appSource).toContain("onOpenQueue={() => setApprovalDrawerOpen(true)}");
  });

  it("wires onProbeRuntime to existing handleProbeDgx", () => {
    expect(appSource).toContain("onProbeRuntime={handleProbeDgx}");
  });

  it("wires onSelectTab to handler that sets mode/nav from target", () => {
    expect(appSource).toContain("handleSelectShellTab");
    expect(appSource).toContain("if (tab.target.mode) setMode(tab.target.mode)");
    expect(appSource).toContain("if (tab.target.nav) setActiveNavItem(tab.target.nav)");
  });

  it("wires onSelectSection to route-backed default tab", () => {
    expect(appSource).toContain("handleSelectShellSection");
    expect(appSource).toContain("routeBackedDefaultTabBySection");
  });

  it("does not replace RuntimeStatusBar", () => {
    const runtimeStatusBarCount = (appSource.match(/<RuntimeStatusBar/g) ?? []).length;
    expect(runtimeStatusBarCount).toBe(1);
  });

  it("does not dispatch runner or call tmux from shell tab selection", () => {
    const handlerBlock = appSource.match(
      /const handleSelectShellTab = useCallback\([\s\S]*?\}, \[\]\);/,
    )?.[0];
    expect(handlerBlock).toBeDefined();
    expect(handlerBlock).not.toContain("dispatch");
    expect(handlerBlock).not.toContain("runner");
    expect(handlerBlock).not.toContain("tmux");
    expect(handlerBlock).not.toContain("send-keys");
    expect(handlerBlock).not.toContain("fetch(");
  });
});

describe("shell IA virtual surface filtering", () => {
  it("routeBackedShellSections uses isTabRendered filter", () => {
    expect(appSource).toContain("routeBackedShellSections");
    expect(appSource).toContain("isTabRendered");
  });

  it("safeVirtualSurfaces contains operations_queue, operations_missions, system_runtime, system_models", () => {
    expect(appSource).toContain("safeVirtualSurfaces");
    expect(appSource).toContain('"operations_queue"');
    expect(appSource).toContain('"operations_missions"');
    expect(appSource).toContain('"system_models"');
    expect(appSource).toContain('"system_runtime"');
  });

  it("operations.queue tab is rendered (safe virtual surface)", () => {
    const opsSection = appShellSections.find((s) => s.id === "operations");
    const queueTab = opsSection?.tabs.find((t) => t.id === "operations.queue");
    expect(queueTab).toBeDefined();
    expect(queueTab?.target.virtual).toBe("operations_queue");
  });

  it("unsafe virtual surfaces are not in safeVirtualSurfaces", () => {
    const safe = new Set(["operations_queue", "operations_missions", "system_runtime", "system_models"]);
    const allVirtualTabs = appShellSections.flatMap((s) => s.tabs).filter((t) => t.target.virtual);
    const unsafeVirtuals = allVirtualTabs.filter((t) => !safe.has(t.target.virtual as string));
    expect(unsafeVirtuals.length).toBe(7);
    for (const tab of unsafeVirtuals) {
      expect(appSource).not.toContain(`"${tab.target.virtual}"`);
    }
  });

  it("every section has at least one route-backed tab after filtering", () => {
    for (const section of appShellSections) {
      const routeBacked = section.tabs.filter((t) => t.target.nav || t.target.mode);
      expect(routeBacked.length).toBeGreaterThan(0);
    }
  });

  it("virtual surface tabs are not in routeBackedDefaultTabBySection", () => {
    for (const section of appShellSections) {
      const defaultTabId = defaultAppShellTabBySection[section.id];
      const defaultTab = section.tabs.find((t) => t.id === defaultTabId);
      if (defaultTab?.target.virtual) {
        const routeBacked = section.tabs.filter((t) => t.target.nav || t.target.mode);
        expect(routeBacked.length).toBeGreaterThan(0);
      }
    }
  });

  it("resolveAppShellTabForSurface never returns a virtual-only tab for real mode/nav inputs", () => {
    const testCases = [
      { mode: "conversation", activeNavItem: "none" },
      { mode: "cockpit", activeNavItem: "none" },
      { mode: "tmux", activeNavItem: "none" },
      { mode: "debate", activeNavItem: "none" },
      { mode: "annex", activeNavItem: "none" },
      { mode: "cockpit", activeNavItem: "dashboard" },
      { mode: "cockpit", activeNavItem: "coding" },
      { mode: "cockpit", activeNavItem: "research" },
      { mode: "cockpit", activeNavItem: "sessions" },
      { mode: "cockpit", activeNavItem: "providers" },
      { mode: "cockpit", activeNavItem: "channels" },
      { mode: "cockpit", activeNavItem: "config_files" },
      { mode: "cockpit", activeNavItem: "backup" },
      { mode: "cockpit", activeNavItem: "run" },
      { mode: "cockpit", activeNavItem: "theater" },
      { mode: "cockpit", activeNavItem: "command_center" },
    ] as const;

    for (const input of testCases) {
      const tabId = resolveAppShellTabForSurface(input);
      const section = appShellSections.find((s) => s.tabs.some((t) => t.id === tabId));
      const tab = section?.tabs.find((t) => t.id === tabId);
      expect(tab).toBeDefined();
      expect(tab?.target.virtual ?? false).toBe(false);
    }
  });
});

describe("operations.queue virtual surface mapping", () => {
  it("handleSelectShellTab opens approval drawer for operations_queue", () => {
    expect(appSource).toContain('tab.target.virtual === "operations_queue"');
    expect(appSource).toContain("setApprovalDrawerOpen(true)");
  });

  it("handleSelectShellTab does not dispatch runner for operations_queue", () => {
    const handlerBlock = appSource.match(
      /const handleSelectShellTab = useCallback\([\s\S]*?\}, \[\]\);/,
    )?.[0];
    expect(handlerBlock).toBeDefined();
    expect(handlerBlock).not.toContain("dispatch");
    expect(handlerBlock).not.toContain("runner");
    expect(handlerBlock).not.toContain("tmux");
    expect(handlerBlock).not.toContain("send-keys");
    expect(handlerBlock).not.toContain("fetch(");
    expect(handlerBlock).not.toContain("approve");
  });

  it("operations.queue only opens existing drawer, does not change route", () => {
    const handlerBlock = appSource.match(
      /const handleSelectShellTab = useCallback\([\s\S]*?\}, \[\]\);/,
    )?.[0];
    expect(handlerBlock).toBeDefined();
    const queueLine = handlerBlock!
      .split("\n")
      .find((l) => l.includes("operations_queue"));
    expect(queueLine).toBeDefined();
    expect(queueLine).toContain("setApprovalDrawerOpen(true)");
    expect(queueLine).not.toContain("setMode");
    expect(queueLine).not.toContain("setActiveNavItem");
  });
});

describe("operations.missions virtual surface mapping", () => {
  it("operations.missions is exposed as a safe virtual surface tab", () => {
    expect(appSource).toContain('"operations_missions"');
    const opsSection = appShellSections.find((s) => s.id === "operations");
    const missionsTab = opsSection?.tabs.find((t) => t.id === "operations.missions");
    expect(missionsTab).toBeDefined();
    expect(missionsTab?.target.virtual).toBe("operations_missions");
  });

  it("selecting operations.missions routes to the existing RunWorkspace board via existing state", () => {
    expect(appSource).toContain('tab.target.virtual === "operations_missions"');
    const handlerBlock = appSource.match(
      /const handleSelectShellTab = useCallback\([\s\S]*?\}, \[\]\);/,
    )?.[0];
    expect(handlerBlock).toBeDefined();
    const missionLines = handlerBlock!
      .split("\n")
      .filter((l) => l.includes("operations_missions"));
    // Reuses existing nav + run-mode state (no new store, no new router).
    expect(missionLines.some((l) => l.includes('setActiveNavItem("run")'))).toBe(true);
    expect(missionLines.some((l) => l.includes('setSummonSeedMode("board")'))).toBe(true);
  });

  it("operations.missions selection performs no fetch/dispatch/lifecycle action", () => {
    const handlerBlock = appSource.match(
      /const handleSelectShellTab = useCallback\([\s\S]*?\}, \[\]\);/,
    )?.[0];
    expect(handlerBlock).toBeDefined();
    const missionLines = handlerBlock!
      .split("\n")
      .filter((l) => l.includes("operations_missions"))
      .join("\n");
    expect(missionLines).not.toContain("dispatch");
    expect(missionLines).not.toContain("runner");
    expect(missionLines).not.toContain("tmux");
    expect(missionLines).not.toContain("fetch(");
    expect(missionLines).not.toContain("approve");
    expect(missionLines).not.toContain("createDgxMission");
    expect(missionLines).not.toContain("verifyDgxMission");
    expect(missionLines).not.toContain("mergeDgxMission");
  });

  it("reuses one RunWorkspace mission board instance (no duplicate store)", () => {
    // The single RunWorkspace's key includes summonSeedMode so a board request
    // re-mounts the same component into board mode — no second board/fetch/store.
    const keyLine = appSource
      .split("\n")
      .find((l) => l.includes("key={") && l.includes("summonSeedPersona"));
    expect(keyLine).toBeDefined();
    expect(keyLine).toContain("summonSeedMode");
    expect(appSource).toContain("initialMode={summonSeedMode}");
    const runWorkspaceCount = (appSource.match(/<RunWorkspace/g) ?? []).length;
    expect(runWorkspaceCount).toBe(1);
  });

  it("existing RunWorkspace mission board (boardProps) stays intact", () => {
    expect(appSource).toContain("<RunWorkspace");
    expect(appSource).toContain("boardProps={{");
  });

  it("operations.queue safe-surface behavior is preserved", () => {
    expect(appSource).toContain('tab.target.virtual === "operations_queue"');
    expect(appSource).toContain("setApprovalDrawerOpen(true)");
  });
});

describe("system.runtime virtual surface mapping", () => {
  it("system.runtime is exposed as a safe virtual surface tab", () => {
    expect(appSource).toContain('"system_runtime"');
    const sysSection = appShellSections.find((s) => s.id === "system");
    const runtimeTab = sysSection?.tabs.find((t) => t.id === "system.runtime");
    expect(runtimeTab).toBeDefined();
    expect(runtimeTab?.target.virtual).toBe("system_runtime");
  });

  it("selecting system.runtime opens the read-only runtime sheet (no route change)", () => {
    expect(appSource).toContain('tab.target.virtual === "system_runtime"');
    const handlerBlock = appSource.match(
      /const handleSelectShellTab = useCallback\([\s\S]*?\}, \[\]\);/,
    )?.[0];
    expect(handlerBlock).toBeDefined();
    const line = handlerBlock!.split("\n").find((l) => l.includes("system_runtime"));
    expect(line).toBeDefined();
    expect(line).toContain("setRuntimeSurfaceOpen(true)");
    expect(line).not.toContain("setMode");
    expect(line).not.toContain("setActiveNavItem");
    expect(line).not.toContain("dispatch");
    expect(line).not.toContain("fetch(");
    expect(line).not.toContain("tmux");
    expect(line).not.toContain("Reboot");
  });

  it("renders the existing RuntimeRailPanel from the existing snapshot state", () => {
    const sheetBlock = appSource.match(/<Sheet open=\{runtimeSurfaceOpen\}[\s\S]*?<\/Sheet>/)?.[0];
    expect(sheetBlock).toBeDefined();
    expect(sheetBlock).toContain("<RuntimeRailPanel");
    expect(sheetBlock).toContain("snapshot={runtimeSnapshotState}");
  });

  it("runtime surface is read-only: no reboot mutation handler wired", () => {
    const sheetBlock = appSource.match(/<Sheet open=\{runtimeSurfaceOpen\}[\s\S]*?<\/Sheet>/)?.[0];
    expect(sheetBlock).toBeDefined();
    expect(sheetBlock).not.toContain("onRequestReboot");
    expect(sheetBlock).not.toContain("handleRequestDeviceReboot");
  });

  it("existing sessions-page RuntimeRailPanel stays intact (two usages total)", () => {
    const count = (appSource.match(/<RuntimeRailPanel/g) ?? []).length;
    expect(count).toBe(2);
  });

  it("operations.missions and operations.queue remain functional", () => {
    expect(appSource).toContain('tab.target.virtual === "operations_missions"');
    expect(appSource).toContain('tab.target.virtual === "operations_queue"');
  });
});

describe("system.models virtual surface mapping", () => {
  it("system.models is exposed as a safe virtual surface tab", () => {
    expect(appSource).toContain('"system_models"');
    const sysSection = appShellSections.find((s) => s.id === "system");
    const modelsTab = sysSection?.tabs.find((t) => t.id === "system.models");
    expect(modelsTab).toBeDefined();
    expect(modelsTab?.target.virtual).toBe("system_models");
  });

  it("selecting system.models opens the read-only catalog sheet (no route change)", () => {
    expect(appSource).toContain('tab.target.virtual === "system_models"');
    const handlerBlock = appSource.match(
      /const handleSelectShellTab = useCallback\([\s\S]*?\}, \[\]\);/,
    )?.[0];
    expect(handlerBlock).toBeDefined();
    const line = handlerBlock!.split("\n").find((l) => l.includes("system_models"));
    expect(line).toBeDefined();
    expect(line).toContain("setModelsSurfaceOpen(true)");
    // setModelsSurfaceOpen contains the substring "setMode", so assert the actual
    // route-change calls (with paren) are absent rather than the bare prefix.
    expect(line).not.toContain("setMode(");
    expect(line).not.toContain("setActiveNavItem(");
    expect(line).not.toContain("dispatch");
    expect(line).not.toContain("fetch(");
    expect(line).not.toContain("tmux");
  });

  it("renders the read-only model catalog from existing data sources", () => {
    const sheetBlock = appSource.match(/<Sheet open=\{modelsSurfaceOpen\}[\s\S]*?<\/Sheet>/)?.[0];
    expect(sheetBlock).toBeDefined();
    expect(sheetBlock).toContain("<ReadOnlyModelCatalogPanel");
    expect(sheetBlock).toContain("items={providerRoutingConsoleItems}");
    expect(sheetBlock).toContain("modelCatalog={modelCatalog}");
  });

  it("models surface wires no provider mutation / credential / discovery handler", () => {
    const sheetBlock = appSource.match(/<Sheet open=\{modelsSurfaceOpen\}[\s\S]*?<\/Sheet>/)?.[0];
    expect(sheetBlock).toBeDefined();
    expect(sheetBlock).not.toContain("onRegister");
    expect(sheetBlock).not.toContain("onRemoveProvider");
    expect(sheetBlock).not.toContain("onRenameProvider");
    expect(sheetBlock).not.toContain("onBindDefaultCredential");
    expect(sheetBlock).not.toContain("onDiscoverModels");
  });

  it("operations.queue, operations.missions, system.runtime remain functional", () => {
    expect(appSource).toContain('tab.target.virtual === "operations_queue"');
    expect(appSource).toContain('tab.target.virtual === "operations_missions"');
    expect(appSource).toContain('tab.target.virtual === "system_runtime"');
  });
});
