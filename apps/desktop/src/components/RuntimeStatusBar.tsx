import { Activity, Brain, GitBranch, MessageSquare, Search, Terminal } from "lucide-react";
import type { RuntimeSnapshot } from "@ai-orchestrator/protocol";
import { cn } from "@/lib/utils";
import { Button } from "@/ui/button";
import { StatusBadge } from "@/ui/status-badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/ui/popover";
import { providerDisplayLabel } from "../lib/helpers";
import type { CenterMode } from "../types";

/**
 * Runtime status bar — v0 visual port (TopNav).
 *
 * source: docs/v0/v0-output/components/layout/top-nav.tsx +
 *         status-indicator.tsx
 *
 * v0 의 TopNav 는 [logo] [mode tabs] [⌘K + status dot] 3-zone 구조입니다.
 * 이 구조에 맞추어 헤더 좌측에 브랜드 로고, 중앙에 모드 전환 탭,
 * 우측에 ⌘K 명령 팔레트 실행 단추 및 상태 모니터를 통합 탑재하였습니다.
 */

export function RuntimeStatusBar({
  mode,
  onChangeMode,
  onCommandPalette,
  onProbeDgx,
  providerName,
  snapshot,
}: {
  mode: CenterMode;
  onChangeMode: (mode: CenterMode) => void;
  onCommandPalette: () => void;
  onProbeDgx: () => void;
  providerName: string;
  snapshot: RuntimeSnapshot;
}) {
  const runtimeNodes = snapshot?.runtimeNodes ?? [];
  const primaryNode = runtimeNodes.find((node) => node?.isPrimary);
  const dgxLabel = primaryNode?.label ?? snapshot?.syncTopology?.authorityLabel ?? "DGX";
  const overallHealth = deriveHealth(snapshot);
  const displayProviderName = providerDisplayLabel(providerName);

  return (
    <header className="status-bar flex h-12 shrink-0 items-center justify-between gap-4 border-b border-border bg-card/50 px-4">
      {/* Left: Brand logo + system status */}
      <div className="flex min-w-0 items-center gap-4">
        {/* Brand Block */}
        <div className="flex items-center gap-2 select-none">
          <div className="flex h-7 w-7 items-center justify-center rounded bg-primary/10 text-primary">
            <Brain className="h-4.5 w-4.5" />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-[11px] font-bold text-foreground tracking-tight">AI Orchestrator Lab</span>
            <span className="text-[8.5px] text-muted-foreground">desktop command room</span>
          </div>
        </div>

        <span className="status-bar-meta-separator"><Separator /></span>

        {/* Compact Meta Status Strip */}
        <div className="status-bar-meta-strip flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span>Active:</span>
            <span className="font-semibold text-foreground" title={providerName}>{displayProviderName}</span>
          </span>
          <Separator />
          <span className="flex items-center gap-1">
            <span>{dgxLabel}:</span>
            <StatusDot status={snapshot?.dgxStatus} />
            <span className={cn("font-mono text-[9.5px]", statusToneClasses(snapshot?.dgxStatus))}>
              {snapshot?.dgxStatus ?? "unknown"}
            </span>
          </span>
          <Separator />
          <span className="flex items-center gap-1">
            <span>Local:</span>
            <StatusDot status={snapshot?.localModelStatus} />
            <span
              className={cn(
                "font-mono text-[9.5px]",
                statusToneClasses(snapshot?.localModelStatus),
              )}
            >
              {snapshot?.localModelStatus ?? "unknown"}
            </span>
          </span>
          {snapshot?.recentError ? (
            <>
              <Separator />
              <span className="truncate max-w-[120px] text-destructive">{snapshot.recentError}</span>
            </>
          ) : null}
        </div>
      </div>

      {/* Center: Mode Switching tabs */}
      <div className="flex items-center gap-0.5 bg-muted/20 p-0.5 rounded-md border border-border/30 h-8 select-none">
        <Button
          aria-label="Conversation mode"
          data-focus-id="mode-tab-conversation"
          variant={mode === "conversation" ? "secondary" : "ghost"}
          size="sm"
          className={cn(
            "h-7 gap-1.5 px-3 text-[11px] font-medium transition-all",
            mode === "conversation" ? "text-foreground bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
          onClick={() => onChangeMode("conversation")}
          title="Conversation"
        >
          <MessageSquare className="h-3 w-3" />
          <span className="status-bar-mode-label">Conversation</span>
        </Button>
        <Button
          aria-label="Debate mode"
          data-focus-id="mode-tab-debate"
          variant={mode === "debate" ? "secondary" : "ghost"}
          size="sm"
          className={cn(
            "h-7 gap-1.5 px-3 text-[11px] font-medium transition-all",
            mode === "debate" ? "text-foreground bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
          onClick={() => onChangeMode("debate")}
          title="Debate"
        >
          <GitBranch className="h-3 w-3" />
          <span className="status-bar-mode-label">Debate</span>
        </Button>
        <Button
          aria-label="Tmux mode"
          data-focus-id="mode-tab-tmux"
          variant={mode === "tmux" ? "secondary" : "ghost"}
          size="sm"
          className={cn(
            "h-7 gap-1.5 px-3 text-[11px] font-medium transition-all",
            mode === "tmux" ? "text-foreground bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
          onClick={() => onChangeMode("tmux")}
          title="Tmux"
        >
          <Terminal className="h-3 w-3" />
          <span className="status-bar-mode-label">Tmux</span>
        </Button>
      </div>

      {/* Right: health indicator + command trigger + probe action */}
      <div className="flex shrink-0 items-center gap-2">
        {/* Command Palette Trigger Button */}
        <Button
          aria-label="Open command palette"
          variant="outline"
          size="sm"
          className="h-7 gap-2 px-2.5 text-[11px] border-border/60 bg-muted/10 text-muted-foreground hover:text-foreground transition-all"
          onClick={onCommandPalette}
          title="Command palette"
        >
          <Search className="h-3 w-3" />
          <span className="status-bar-command-label">Command...</span>
          <kbd className="status-bar-command-kbd pointer-events-none select-none rounded bg-muted/60 px-1 font-mono text-[9px] font-medium border border-border/40">
            ⌘K
          </kbd>
        </Button>

        <Separator />

        <HealthIndicator
          dgxStatus={snapshot?.dgxStatus}
          dgxLabel={dgxLabel}
          health={overallHealth}
          localStatus={snapshot?.localModelStatus}
          providerName={providerName}
        />
        <Button
          className="status-bar-probe-btn h-7 gap-1.5 text-xs"
          onClick={onProbeDgx}
          size="sm"
          variant="ghost"
        >
          <Activity className="h-3 w-3" />
          Probe DGX
        </Button>
      </div>
    </header>
  );
}

function Separator() {
  return <span className="text-border">·</span>;
}

function StatusDot({ status }: { status?: string }) {
  const tone = statusToneFromString(status);
  return (
    <span
      aria-hidden
      className={cn(
        "h-1.5 w-1.5 rounded-full",
        tone === "online" && "bg-status-online",
        tone === "offline" && "bg-status-offline",
        tone === "pending" && "bg-status-pending animate-pulse",
        tone === "idle" && "bg-status-idle",
      )}
    />
  );
}

function HealthIndicator({
  dgxStatus,
  dgxLabel,
  health,
  localStatus,
  providerName,
}: {
  dgxStatus?: string;
  dgxLabel?: string;
  health: "healthy" | "degraded" | "error";
  localStatus?: string;
  providerName?: string;
}) {
  const healthColor = {
    healthy: "bg-success",
    degraded: "bg-warning",
    error: "bg-destructive",
  }[health];
  const healthLabel = {
    healthy: "All systems operational",
    degraded: "Some systems degraded",
    error: "System error",
  }[health];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          aria-label={`System status: ${healthLabel}`}
          className="relative flex h-6 w-6 items-center justify-center rounded-full transition-colors hover:bg-card/60"
          type="button"
        >
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              healthColor,
              health !== "healthy" && "animate-pulse",
            )}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-72 overflow-hidden rounded-lg border border-border bg-card p-0 shadow-2xl"
      >
        <div className="border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <span className={cn("h-2 w-2 rounded-full", healthColor)} />
            <span className="text-sm font-medium text-foreground">
              {healthLabel}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Active provider · {providerName ?? "Unknown"}
          </p>
        </div>
        <div className="space-y-1 p-2">
          <StatusRow label={dgxLabel ?? "DGX"} status={dgxStatus} />
          <StatusRow label="Local" status={localStatus} />
        </div>
      </PopoverContent>
    </Popover>
  );
}

function StatusRow({ label, status }: { label: string; status?: string }) {
  return (
    <div className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-card/60">
      <span className="text-xs text-muted-foreground">{label}</span>
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

function statusToneClasses(status?: string): string {
  const variant = statusToBadgeVariant(status);
  switch (variant) {
    case "success":
      return "text-success";
    case "danger":
      return "text-destructive";
    case "warning":
      return "text-warning";
    case "muted":
    default:
      return "text-muted-foreground";
  }
}

function deriveHealth(snapshot?: RuntimeSnapshot): "healthy" | "degraded" | "error" {
  if (!snapshot) return "error";
  if (snapshot.recentError) return "error";
  const dgxTone = statusToneFromString(snapshot.dgxStatus);
  const localTone = statusToneFromString(snapshot.localModelStatus);
  if (dgxTone === "offline" || localTone === "offline") return "error";
  if (dgxTone === "pending" || localTone === "pending") return "degraded";
  return "healthy";
}
