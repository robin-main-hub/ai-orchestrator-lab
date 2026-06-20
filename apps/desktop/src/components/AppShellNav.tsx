import {
  Archive,
  Boxes,
  Brain,
  ChevronRight,
  CircleGauge,
  Code2,
  Command,
  Database,
  FileCog,
  FlaskConical,
  GitBranch,
  HardDrive,
  Inbox,
  LayoutDashboard,
  MessageSquare,
  Play,
  RadioTower,
  Search,
  ServerCog,
  ShieldCheck,
  Sparkles,
  Terminal,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  AppShellSection,
  AppShellSectionId,
  AppShellTab,
  AppShellTabId,
} from "../lib/appShellIa";

const sectionIcons: Record<AppShellSectionId, LucideIcon> = {
  command: Sparkles,
  studio: Code2,
  operations: CircleGauge,
  library: Archive,
  system: ServerCog,
};

const tabIcons: Record<AppShellTabId, LucideIcon> = {
  "command.overview": LayoutDashboard,
  "command.attention": Inbox,
  "command.cockpit": CircleGauge,
  "studio.chat": MessageSquare,
  "studio.code": Code2,
  "studio.research": FlaskConical,
  "studio.debate": GitBranch,
  "operations.launch": Play,
  "operations.live": Sparkles,
  "operations.missions": Boxes,
  "operations.terminal": Terminal,
  "operations.queue": ShieldCheck,
  "operations.replay": HardDrive,
  "library.workspaces": Boxes,
  "library.sessions": MessageSquare,
  "library.artifacts": Database,
  "library.memory": Brain,
  "library.replay": HardDrive,
  "library.agents": Users,
  "system.models": Brain,
  "system.providers": ServerCog,
  "system.sources": RadioTower,
  "system.modules": Boxes,
  "system.config": FileCog,
  "system.backup": Archive,
  "system.runtime": Terminal,
};

export function AppShellNav({
  activeSection,
  activeTab,
  pendingApprovals,
  providerName,
  sections,
  onCommandPalette,
  onOpenQueue,
  onProbeRuntime,
  onSelectSection,
  onSelectTab,
}: {
  activeSection: AppShellSection;
  activeTab: AppShellTab;
  pendingApprovals: number;
  providerName: string;
  sections: readonly AppShellSection[];
  onCommandPalette: () => void;
  onOpenQueue: () => void;
  onProbeRuntime: () => void;
  onSelectSection: (sectionId: AppShellSectionId) => void;
  onSelectTab: (tabId: AppShellTabId) => void;
}) {
  return (
    <>
      <header className="os-topbar" aria-label="AI Orchestrator command shell">
        <div className="os-brand">
          <div className="os-brand-mark">
            <Brain size={17} />
          </div>
          <div>
            <strong>AI Orchestrator Lab</strong>
            <span>personal command OS</span>
          </div>
        </div>

        <nav className="os-primary-nav" aria-label="Primary sections">
          {sections.map((section) => {
            const Icon = sectionIcons[section.id];
            const active = section.id === activeSection.id;
            return (
              <button
                aria-current={active ? "page" : undefined}
                className={cn("os-primary-nav__item", active && "active")}
                key={section.id}
                onClick={() => onSelectSection(section.id)}
                title={section.purpose}
                type="button"
              >
                <Icon size={15} />
                <span>{section.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="os-topbar-actions">
          <button className="os-command-button" onClick={onCommandPalette} type="button">
            <Search size={14} />
            <span>Command</span>
            <kbd>Ctrl K</kbd>
          </button>
          <button className="os-queue-button" onClick={onOpenQueue} type="button">
            <ShieldCheck size={14} />
            <span>Queue</span>
            <strong>{pendingApprovals}</strong>
          </button>
          <button className="os-runtime-pill" onClick={onProbeRuntime} type="button" title="Probe runtime">
            <span className={pendingApprovals > 0 ? "warning" : "online"} />
            {providerName || "local-provider"}
          </button>
        </div>
      </header>

      <section className="os-contextbar" aria-label={`${activeSection.label} tabs`}>
        <div className="os-contextbar__title">
          <span>{activeSection.shortLabel}</span>
          <div>
            <strong>{activeSection.label}</strong>
            <small>{activeTab.purpose}</small>
          </div>
        </div>
        <nav className="os-section-tabs" aria-label={`${activeSection.label} section tabs`}>
          {activeSection.tabs.map((tab) => (
            <SectionTab
              active={tab.id === activeTab.id}
              key={tab.id}
              tab={tab}
              onSelect={onSelectTab}
            />
          ))}
        </nav>
      </section>
    </>
  );
}

function SectionTab({
  active,
  onSelect,
  tab,
}: {
  active: boolean;
  onSelect: (tabId: AppShellTabId) => void;
  tab: AppShellTab;
}) {
  const Icon = tabIcons[tab.id] ?? Command;
  return (
    <button
      aria-current={active ? "page" : undefined}
      className={cn("os-section-tab", active && "active")}
      onClick={() => onSelect(tab.id)}
      title={tab.purpose}
      type="button"
    >
      <Icon size={14} />
      <span>{tab.label}</span>
      {active ? <ChevronRight size={13} /> : null}
    </button>
  );
}
