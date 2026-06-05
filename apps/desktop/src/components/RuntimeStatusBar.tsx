import {
  Activity,
  Brain,
  LayoutDashboard,
  MessageSquare,
  Search,
  Settings,
  Scale,
  Terminal,
  Menu,
} from "lucide-react";
import type { ElementType } from "react";
import type { RuntimeSnapshot } from "@ai-orchestrator/protocol";
import { cn } from "@/lib/utils";
import { Button } from "@/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/ui/popover";
import { StatusBadge } from "@/ui/status-badge";
import type { CenterMode } from "../types";

const modeConfig: Array<{
  id: Exclude<CenterMode, "annex">;
  label: string;
  icon: ElementType;
  shortLabel?: string;
}> = [
  { id: "conversation", label: "Conversation", icon: MessageSquare, shortLabel: "Chat" },
  { id: "debate", label: "Debate", icon: Scale },
  { id: "tmux", label: "Tmux", icon: Terminal },
  { id: "cockpit", label: "Cockpit", icon: LayoutDashboard },
];

export function RuntimeStatusBar({
  drawerAvailable,
  mode,
  onChangeMode,
  onCommandPalette,
  onOpenOpsDetail,
  onProbeDgx,
  onToggleDrawer,
  providerName,
  snapshot,
}: {
  drawerAvailable: boolean;
  mode: CenterMode;
  onChangeMode: (mode: CenterMode) => void;
  onCommandPalette: () => void;
  onOpenOpsDetail: () => void;
  onProbeDgx: () => void;
  onToggleDrawer: () => void;
  providerName: string;
  snapshot: RuntimeSnapshot;
}) {
  const health = deriveHealth(snapshot);
  const healthLabel = {
    healthy: "All systems operational",
    degraded: "Some systems degraded",
    critical: "System critical",
    unknown: "System status unknown",
  }[health];
  const activeMode = mode === "annex" ? "debate" : mode;

  return (
    <header className="status-bar flex h-12 shrink-0 items-center justify-between gap-4 border-b border-zinc-800/60 bg-zinc-950/90 px-4 backdrop-blur-xl">
      <div className="flex min-w-0 items-center gap-3">
        {drawerAvailable ? (
          <Button
            aria-label="Toggle Navigation"
            className="mobile-menu-btn h-8 w-8 shrink-0 text-zinc-500 hover:bg-zinc-800/70 hover:text-zinc-100"
            onClick={onToggleDrawer}
            size="icon"
            title="Toggle Navigation"
            variant="ghost"
          >
            <Menu className="h-5 w-5" />
          </Button>
        ) : (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                aria-label="Open mobile mode menu"
                className="mobile-menu-btn h-8 w-8 shrink-0 text-zinc-500 hover:bg-zinc-800/70 hover:text-zinc-100"
                size="icon"
                title="Open mobile mode menu"
                variant="ghost"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              className="w-52 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/95 p-1 shadow-2xl backdrop-blur-xl"
              sideOffset={8}
            >
              {modeConfig.map((item) => {
                const Icon = item.icon;
                const isActive = activeMode === item.id;
                return (
                  <button
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                      isActive
                        ? "bg-zinc-800 text-zinc-100"
                        : "text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-100",
                    )}
                    key={item.id}
                    onClick={() => onChangeMode(item.id)}
                    type="button"
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </PopoverContent>
          </Popover>
        )}
        <div className="flex select-none items-center gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-violet-600/20 text-violet-300">
            <Brain className="h-4 w-4" />
          </div>
          <div className="hidden flex-col leading-tight sm:flex">
            <span className="whitespace-nowrap text-[11px] font-bold tracking-tight text-zinc-100">
              AI Orchestrator
            </span>
            <span className="whitespace-nowrap text-[8.5px] text-zinc-500">
              Lab
            </span>
          </div>
        </div>
      </div>

      <nav className="hidden items-center gap-1 rounded-lg border border-zinc-800/70 bg-zinc-900/70 p-1 md:flex">
        {modeConfig.map((item) => {
          const Icon = item.icon;
          const isActive = activeMode === item.id;
          return (
            <button
              aria-label={`${item.label} mode`}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                isActive
                  ? "bg-zinc-800 text-zinc-100 shadow-sm"
                  : "text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-100",
              )}
              data-focus-id={`mode-tab-${item.id}`}
              key={item.id}
              onClick={() => onChangeMode(item.id)}
              title={item.label}
              type="button"
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">{item.label}</span>
              <span className="lg:hidden">{item.shortLabel ?? item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="flex shrink-0 items-center gap-2">
        <Button
          aria-label="Open command palette"
          className="h-8 gap-2 border-zinc-800/80 bg-zinc-900/50 px-2.5 text-xs text-zinc-500 hover:bg-zinc-800/80 hover:text-zinc-100"
          onClick={onCommandPalette}
          size="sm"
          title="Command palette"
          variant="outline"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Command</span>
          <kbd className="hidden rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] font-medium text-zinc-400 sm:inline">
            ⌘K
          </kbd>
        </Button>
        <HealthIndicator
          health={health}
          onOpenOpsDetail={onOpenOpsDetail}
          onProbeDgx={onProbeDgx}
          providerName={providerName}
          snapshot={snapshot}
          title={healthLabel}
        />
      </div>
    </header>
  );
}

function HealthIndicator({
  health,
  onOpenOpsDetail,
  onProbeDgx,
  providerName,
  snapshot,
  title,
}: {
  health: "healthy" | "degraded" | "critical" | "unknown";
  onOpenOpsDetail: () => void;
  onProbeDgx: () => void;
  providerName: string;
  snapshot: RuntimeSnapshot;
  title: string;
}) {
  const dotClass = {
    critical: "bg-rose-500",
    degraded: "bg-amber-500",
    healthy: "bg-emerald-500",
    unknown: "bg-zinc-500",
  }[health];
  const primaryNode = snapshot.runtimeNodes.find((node) => node.isPrimary);
  const dgxLabel = primaryNode?.label ?? snapshot.syncTopology.authorityLabel ?? "DGX";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          aria-label={`System health: ${title}`}
          className="h-8 gap-2 px-2 text-xs text-zinc-500 hover:bg-zinc-800/70 hover:text-zinc-100"
          size="sm"
          variant="ghost"
        >
          <span className={cn("h-2 w-2 rounded-full", dotClass, health !== "healthy" && "animate-pulse")} />
          <Activity className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Health</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/95 p-0 shadow-2xl backdrop-blur-xl"
        sideOffset={8}
      >
        <div className="border-b border-zinc-800 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className={cn("h-2 w-2 rounded-full", dotClass)} />
            <h4 className="text-sm font-medium text-zinc-100">{title}</h4>
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            Runtime status overview · {providerName || "provider pending"}
          </p>
        </div>
        <div className="space-y-1 p-2">
          <StatusRow label={dgxLabel} status={snapshot.dgxStatus} />
          <StatusRow label="Local" status={snapshot.localModelStatus} />
          <StatusRow label="Memory" status={snapshot.memorySyncStatus} />
          <StatusRow label="Authority" status={snapshot.syncTopology.authorityLabel} />
          {snapshot.recentError ? (
            <div className="mt-2 rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2">
              <p className="line-clamp-3 text-xs text-rose-300">{snapshot.recentError}</p>
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-2 border-t border-zinc-800 p-2">
          <Button
            className="h-8 flex-1 justify-start text-xs text-zinc-500 hover:bg-zinc-800/70 hover:text-zinc-100"
            onClick={onProbeDgx}
            size="sm"
            variant="ghost"
          >
            <Activity className="mr-2 h-3.5 w-3.5" />
            Probe DGX
          </Button>
          <Button
            className="h-8 flex-1 justify-start text-xs text-zinc-500 hover:bg-zinc-800/70 hover:text-zinc-100"
            onClick={onOpenOpsDetail}
            size="sm"
            variant="ghost"
          >
            <Settings className="mr-2 h-3.5 w-3.5" />
            Ops Detail
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function StatusRow({ label, status }: { label: string; status?: string }) {
  return (
    <div className="flex items-center justify-between rounded-md px-3 py-1.5 hover:bg-zinc-800/50">
      <span className="text-xs text-zinc-500">{label}</span>
      <StatusBadge variant={statusToBadgeVariant(status)} size="sm">
        {status ?? "unknown"}
      </StatusBadge>
    </div>
  );
}

type StatusTone = "online" | "offline" | "pending" | "idle";

function statusToneFromString(status?: string): StatusTone {
  if (!status) return "idle";
  const s = status.toLowerCase();
  if (s.includes("online") || s.includes("ready") || s.includes("connected")) return "online";
  if (s.includes("offline") || s.includes("error") || s.includes("unreachable")) return "offline";
  if (s.includes("pending") || s.includes("preparing") || s.includes("fallback")) return "pending";
  return "idle";
}

function statusToBadgeVariant(status?: string): "success" | "danger" | "warning" | "muted" {
  const tone = statusToneFromString(status);
  switch (tone) {
    case "online":
      return "success";
    case "offline":
      return "danger";
    case "pending":
      return "warning";
    case "idle":
    default:
      return "muted";
  }
}

function deriveHealth(snapshot?: RuntimeSnapshot): "healthy" | "degraded" | "critical" | "unknown" {
  if (!snapshot) return "unknown";
  if (snapshot.recentError) return "critical";
  const dgxTone = statusToneFromString(snapshot.dgxStatus);
  const localTone = statusToneFromString(snapshot.localModelStatus);
  if (dgxTone === "offline") return "degraded";
  if (localTone === "offline") return "critical";
  if (dgxTone === "pending" || localTone === "pending") return "degraded";
  return "healthy";
}
