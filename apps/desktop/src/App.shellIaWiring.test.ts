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

  it("safeVirtualSurfaces contains only operations_queue", () => {
    expect(appSource).toContain("safeVirtualSurfaces");
    expect(appSource).toContain('"operations_queue"');
  });

  it("operations.queue tab is rendered (safe virtual surface)", () => {
    const opsSection = appShellSections.find((s) => s.id === "operations");
    const queueTab = opsSection?.tabs.find((t) => t.id === "operations.queue");
    expect(queueTab).toBeDefined();
    expect(queueTab?.target.virtual).toBe("operations_queue");
  });

  it("all 9 unsafe virtual surfaces are not in safeVirtualSurfaces", () => {
    const allVirtualTabs = appShellSections.flatMap((s) => s.tabs).filter((t) => t.target.virtual);
    const unsafeVirtuals = allVirtualTabs.filter((t) => t.target.virtual !== "operations_queue");
    expect(unsafeVirtuals.length).toBe(10);
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
