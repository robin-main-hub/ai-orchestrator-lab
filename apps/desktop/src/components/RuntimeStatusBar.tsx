import { useState } from "react";
import { Activity } from "lucide-react";
import type { RuntimeSnapshot } from "@ai-orchestrator/protocol";
import { cn } from "@/lib/utils";
import { Button } from "@/ui/button";

/**
 * Runtime status bar — v0 visual port (TopNav 의 status 영역).
 *
 * source: docs/v0/v0-output/components/layout/top-nav.tsx +
 *         status-indicator.tsx
 *
 * v0 의 TopNav 는 [logo] [mode tabs] [⌘K + status dot] 3-zone.
 * 우리 layout 은 mode tabs 가 별도 board-toolbar 에 있어서 이 컴포넌트
 * 는 v0 의 **status 영역** 만 담당 (좌측 시스템 health + 우측 Probe).
 *
 * v0 의 popover-on-click 형태로 system health detail 노출. 우리 protocol
 * 의 RuntimeSnapshot 그대로 사용. 모드 switching consolidation 은
 * docs/specs/v0-port-deferred-features.md 에 기록.
 */

export function RuntimeStatusBar({
  onProbeDgx,
  providerName,
  snapshot,
}: {
  onProbeDgx: () => void;
  providerName: string;
  snapshot: RuntimeSnapshot;
}) {
  const primaryNode = snapshot.runtimeNodes.find((node) => node.isPrimary);
  const dgxLabel = primaryNode?.label ?? snapshot.syncTopology.authorityLabel;
  const overallHealth = deriveHealth(snapshot);

  return (
    <header className="flex h-10 shrink-0 items-center justify-between gap-4 border-b border-border bg-card/50 px-4">
      {/* Left: meta strip */}
      <div className="flex min-w-0 items-center gap-3 text-[11px]">
        <span className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Active</span>
          <span className="font-medium text-foreground">{providerName}</span>
        </span>
        <Separator />
        <span className="flex items-center gap-1.5">
          <span className="text-muted-foreground">{dgxLabel}</span>
          <StatusDot status={snapshot.dgxStatus} />
          <span className={cn("font-mono text-[10px]", statusToneClasses(snapshot.dgxStatus))}>
            {snapshot.dgxStatus}
          </span>
        </span>
        <Separator />
        <span className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Local</span>
          <StatusDot status={snapshot.localModelStatus} />
          <span
            className={cn(
              "font-mono text-[10px]",
              statusToneClasses(snapshot.localModelStatus),
            )}
          >
            {snapshot.localModelStatus}
          </span>
        </span>
        {snapshot.recentError ? (
          <>
            <Separator />
            <span className="truncate text-destructive">{snapshot.recentError}</span>
          </>
        ) : null}
      </div>

      {/* Right: health indicator + probe action */}
      <div className="flex shrink-0 items-center gap-2">
        <HealthIndicator
          dgxStatus={snapshot.dgxStatus}
          dgxLabel={dgxLabel}
          health={overallHealth}
          localStatus={snapshot.localModelStatus}
          providerName={providerName}
        />
        <Button
          className="h-7 gap-1.5 text-xs"
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

function StatusDot({ status }: { status: string }) {
  const tone = statusToneFromString(status);
  return (
    <span
      aria-hidden
      className={cn(
        "h-1.5 w-1.5 rounded-full",
        tone === "online" && "bg-success",
        tone === "offline" && "bg-destructive",
        tone === "pending" && "bg-warning animate-pulse",
        tone === "idle" && "bg-muted-foreground/50",
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
  dgxStatus: string;
  dgxLabel: string;
  health: "healthy" | "degraded" | "error";
  localStatus: string;
  providerName: string;
}) {
  const [open, setOpen] = useState(false);
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
    <div className="relative">
      <button
        aria-expanded={open}
        aria-label={`System status: ${healthLabel}`}
        className="relative flex h-6 w-6 items-center justify-center rounded-full transition-colors hover:bg-card/60"
        onClick={() => setOpen((o) => !o)}
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

      {open ? (
        <>
          {/* backdrop to close on click outside */}
          <div
            aria-hidden
            className="fixed inset-0 z-20"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-8 z-30 w-72 overflow-hidden rounded-lg border border-border bg-card shadow-2xl">
            <div className="border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <span className={cn("h-2 w-2 rounded-full", healthColor)} />
                <span className="text-sm font-medium text-foreground">
                  {healthLabel}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Active provider · {providerName}
              </p>
            </div>
            <div className="space-y-1 p-2">
              <StatusRow label={dgxLabel} status={dgxStatus} />
              <StatusRow label="Local" status={localStatus} />
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function StatusRow({ label, status }: { label: string; status: string }) {
  return (
    <div className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-card/60">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1.5">
        <StatusDot status={status} />
        <span
          className={cn("text-xs font-medium", statusToneClasses(status))}
        >
          {status}
        </span>
      </div>
    </div>
  );
}

function statusToneFromString(status: string): "online" | "offline" | "pending" | "idle" {
  const s = status.toLowerCase();
  if (s.includes("online") || s.includes("ready") || s.includes("connected")) return "online";
  if (s.includes("offline") || s.includes("error") || s.includes("unreachable")) return "offline";
  if (s.includes("pending") || s.includes("preparing") || s.includes("fallback")) return "pending";
  return "idle";
}

function statusToneClasses(status: string): string {
  switch (statusToneFromString(status)) {
    case "online":
      return "text-success";
    case "offline":
      return "text-destructive";
    case "pending":
      return "text-warning";
    case "idle":
    default:
      return "text-muted-foreground";
  }
}

function deriveHealth(snapshot: RuntimeSnapshot): "healthy" | "degraded" | "error" {
  if (snapshot.recentError) return "error";
  const dgxTone = statusToneFromString(snapshot.dgxStatus);
  const localTone = statusToneFromString(snapshot.localModelStatus);
  if (dgxTone === "offline" || localTone === "offline") return "error";
  if (dgxTone === "pending" || localTone === "pending") return "degraded";
  return "healthy";
}
