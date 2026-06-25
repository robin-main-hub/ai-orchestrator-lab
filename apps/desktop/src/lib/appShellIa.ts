import type { CenterMode, NavItemId } from "../types";

export type AppShellSectionId = "command" | "studio" | "operations" | "library" | "system";

export type AppShellVirtualSurface =
  | "operations_missions"
  | "operations_queue"
  | "operations_replay"
  | "library_workspaces"
  | "library_artifacts"
  | "library_memory"
  | "library_agents"
  | "system_models"
  | "system_modules"
  | "system_runtime";

export type AppShellTabId =
  | "command.overview"
  | "command.attention"
  | "command.cockpit"
  | "studio.chat"
  | "studio.code"
  | "studio.research"
  | "studio.debate"
  | "operations.launch"
  | "operations.live"
  | "operations.missions"
  | "operations.terminal"
  | "operations.queue"
  | "operations.replay"
  | "library.workspaces"
  | "library.sessions"
  | "library.artifacts"
  | "library.memory"
  | "library.replay"
  | "library.agents"
  | "system.models"
  | "system.providers"
  | "system.sources"
  | "system.modules"
  | "system.config"
  | "system.backup"
  | "system.runtime";

export type AppShellTarget = {
  mode?: CenterMode;
  nav?: NavItemId;
  virtual?: AppShellVirtualSurface;
};

export type AppShellTab = {
  id: AppShellTabId;
  label: string;
  purpose: string;
  target: AppShellTarget;
};

export type AppShellSection = {
  id: AppShellSectionId;
  label: string;
  shortLabel: string;
  purpose: string;
  tabs: readonly AppShellTab[];
};

export const appShellSections: readonly AppShellSection[] = [
  {
    id: "command",
    label: "Command",
    shortLabel: "CMD",
    purpose: "Three-second overview, attention, and diagnostics.",
    tabs: [
      {
        id: "command.overview",
        label: "Overview",
        purpose: "What is happening, blocked, running, and useful next.",
        target: { nav: "dashboard" },
      },
      {
        id: "command.attention",
        label: "Attention",
        purpose: "Assistant inbox, review lanes, source packs, and pending work.",
        target: { nav: "command_center" },
      },
      {
        id: "command.cockpit",
        label: "Cockpit",
        purpose: "Deep operator diagnostics and evidence-backed next actions.",
        target: { mode: "cockpit" },
      },
    ],
  },
  {
    id: "studio",
    label: "Studio",
    shortLabel: "STD",
    purpose: "Direct creative and technical work surfaces.",
    tabs: [
      {
        id: "studio.chat",
        label: "Chat",
        purpose: "Conversation workbench with agent personas and provider routing.",
        target: { mode: "conversation" },
      },
      {
        id: "studio.code",
        label: "Code",
        purpose: "IDE-like coding workspace and mission coding threads.",
        target: { nav: "coding" },
      },
      {
        id: "studio.research",
        label: "Research",
        purpose: "Multi-agent research swarm workspace.",
        target: { nav: "research" },
      },
      {
        id: "studio.debate",
        label: "Debate",
        purpose: "Structured decision rounds and debate annex entry.",
        target: { mode: "debate" },
      },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    shortLabel: "OPS",
    purpose: "Launch, live work, missions, terminal, queue, and replay.",
    tabs: [
      {
        id: "operations.launch",
        label: "Launch",
        purpose: "Single-agent and parallel launch controls.",
        target: { nav: "run" },
      },
      {
        id: "operations.live",
        label: "Live",
        purpose: "Summon Theater and live operations state.",
        target: { nav: "theater" },
      },
      {
        id: "operations.missions",
        label: "Missions",
        purpose: "Mission board, workspaces, verification, and publish flow.",
        target: { virtual: "operations_missions" },
      },
      {
        id: "operations.terminal",
        label: "Terminal",
        purpose: "Tmux worker board and terminal execution overview.",
        target: { mode: "tmux" },
      },
      {
        id: "operations.queue",
        label: "Queue",
        purpose: "Unified approval and permission control queue.",
        target: { virtual: "operations_queue" },
      },
      {
        id: "operations.replay",
        label: "Replay",
        purpose: "Event replay and recent execution timeline.",
        target: { virtual: "operations_replay" },
      },
    ],
  },
  {
    id: "library",
    label: "Library",
    shortLabel: "LIB",
    purpose: "Accumulated work, sessions, artifacts, memory, replay, and agents.",
    tabs: [
      {
        id: "library.workspaces",
        label: "Workspaces",
        purpose: "Mission workspaces and recent project continuity.",
        target: { virtual: "library_workspaces" },
      },
      {
        id: "library.sessions",
        label: "Sessions",
        purpose: "Session index and replayable conversation state.",
        target: { nav: "sessions" },
      },
      {
        id: "library.artifacts",
        label: "Artifacts",
        purpose: "Observed artifacts from backup and mission continuity.",
        target: { virtual: "library_artifacts" },
      },
      {
        id: "library.memory",
        label: "Memory",
        purpose: "Memory governance, recall, activation, and learning.",
        target: { virtual: "library_memory" },
      },
      {
        id: "library.replay",
        label: "Replay",
        purpose: "Readable replay timeline for accumulated events.",
        target: { virtual: "operations_replay" },
      },
      {
        id: "library.agents",
        label: "Agents",
        purpose: "Persona roster, roles, models, and assignment controls.",
        target: { virtual: "library_agents" },
      },
    ],
  },
  {
    id: "system",
    label: "System",
    shortLabel: "SYS",
    purpose: "Machine room for models, providers, sources, modules, config, backup, and runtime.",
    tabs: [
      {
        id: "system.models",
        label: "Models",
        purpose: "Model catalog by provider.",
        target: { virtual: "system_models" },
      },
      {
        id: "system.providers",
        label: "Providers",
        purpose: "Provider registration and model discovery.",
        target: { nav: "providers" },
      },
      {
        id: "system.sources",
        label: "Sources",
        purpose: "Channels, ingress, and source permission state.",
        target: { nav: "channels" },
      },
      {
        id: "system.modules",
        label: "Modules",
        purpose: "Installed product modules and reachable surfaces.",
        target: { virtual: "system_modules" },
      },
      {
        id: "system.config",
        label: "Config",
        purpose: "Config files, SOUL, AGENTS, prompts, and policy libraries.",
        target: { nav: "config_files" },
      },
      {
        id: "system.backup",
        label: "Backup",
        purpose: "Backup and recovery projections.",
        target: { nav: "backup" },
      },
      {
        id: "system.runtime",
        label: "Runtime",
        purpose: "Runtime health, route diagnostics, and recovery controls.",
        target: { virtual: "system_runtime" },
      },
    ],
  },
] as const;

export const defaultAppShellTabId: AppShellTabId = "command.overview";

export const defaultAppShellTabBySection: Record<AppShellSectionId, AppShellTabId> = {
  command: "command.overview",
  studio: "studio.chat",
  operations: "operations.launch",
  library: "library.workspaces",
  system: "system.models",
};

const allAppShellTabs: readonly AppShellTab[] = appShellSections.flatMap((section) => section.tabs);

export const appShellTabIds = allAppShellTabs.map((tab) => tab.id);

export function findAppShellTab(tabId: AppShellTabId): AppShellTab {
  for (const section of appShellSections) {
    const tab = section.tabs.find((candidate) => candidate.id === tabId);
    if (tab) return tab;
  }
  const fallback = appShellSections[0]?.tabs[0];
  if (!fallback) {
    throw new Error("App shell IA requires at least one tab.");
  }
  return fallback;
}

export function findAppShellSection(sectionId: AppShellSectionId): AppShellSection {
  const fallback = appShellSections[0];
  if (!fallback) {
    throw new Error("App shell IA requires at least one section.");
  }
  return appShellSections.find((section) => section.id === sectionId) ?? fallback;
}

export function sectionIdForAppShellTab(tabId: AppShellTabId): AppShellSectionId {
  return tabId.split(".")[0] as AppShellSectionId;
}

export function resolveAppShellTabForSurface(input: {
  activeNavItem: NavItemId;
  mode: CenterMode;
  virtualSurface?: AppShellVirtualSurface | null;
}): AppShellTabId {
  if (input.virtualSurface) {
    const match = allAppShellTabs.find((tab) => tab.target.virtual === input.virtualSurface);
    return match?.id ?? defaultAppShellTabId;
  }

  const modeMatch = allAppShellTabs.find(
    (tab) => tab.target.mode === input.mode && !tab.target.nav && !tab.target.virtual,
  );
  if (input.activeNavItem === "none" && modeMatch) {
    return modeMatch.id;
  }

  const navMatch = allAppShellTabs.find((tab) => tab.target.nav === input.activeNavItem);
  return navMatch?.id ?? modeMatch?.id ?? defaultAppShellTabId;
}
