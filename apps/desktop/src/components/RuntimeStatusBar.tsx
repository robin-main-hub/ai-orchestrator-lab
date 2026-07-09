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
import { runtimeStatusLabel } from "../lib/railStatusLabels";
import type { CenterMode } from "../types";

const modeConfig: Array<{
  id: Exclude<CenterMode, "annex">;
  label: string;
  icon: ElementType;
  shortLabel?: string;
}> = [
  { id: "conversation", label: "대화", icon: MessageSquare, shortLabel: "대화" },
  { id: "debate", label: "토론", icon: Scale },
  { id: "tmux", label: "Tmux", icon: Terminal },
  { id: "cockpit", label: "운영 관제판", icon: LayoutDashboard, shortLabel: "관제판" },
];

export function RuntimeStatusBar({
  drawerAvailable,
  homeActive,
  mode,
  onChangeMode,
  onCommandPalette,
  onHome,
  onOpenOpsDetail,
  onProbeDgx,
  onToggleDrawer,
  providerName,
  snapshot,
  viewTitle,
}: {
  drawerAvailable: boolean;
  /** highlight the 홈(대시보드) pill */
  homeActive?: boolean;
  mode: CenterMode;
  onChangeMode: (mode: CenterMode) => void;
  onCommandPalette: () => void;
  /** jump to the 대시보드 landing view */
  onHome?: () => void;
  onOpenOpsDetail: () => void;
  onProbeDgx: () => void;
  onToggleDrawer: () => void;
  providerName: string;
  snapshot: RuntimeSnapshot;
  /** title of the view that currently owns the center (single-rail IA) */
  viewTitle: string;
}) {
  const health = deriveHealth(snapshot);
  const healthLabel = {
    healthy: "모든 시스템 정상",
    degraded: "일부 시스템 저하",
    critical: "시스템 위험",
    unknown: "시스템 상태 알 수 없음",
  }[health];
  const activeMode = mode === "annex" ? "debate" : mode;

  return (
    <header className="status-bar flex h-14 shrink-0 items-center justify-between gap-4 border-b border-zinc-800/60 bg-zinc-950/90 px-4 backdrop-blur-xl">
      <div className="flex min-w-0 items-center gap-3">
        {drawerAvailable ? (
          <Button
            aria-label="내비게이션 열기/닫기"
            className="mobile-menu-btn h-8 w-8 shrink-0 text-zinc-500 hover:bg-zinc-800/70 hover:text-zinc-100"
            onClick={onToggleDrawer}
            size="icon"
            title="내비게이션 열기/닫기"
            variant="ghost"
          >
            <Menu className="h-5 w-5" />
          </Button>
        ) : (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                aria-label="모바일 모드 메뉴 열기"
                className="mobile-menu-btn h-8 w-8 shrink-0 text-zinc-500 hover:bg-zinc-800/70 hover:text-zinc-100"
                size="icon"
                title="모바일 모드 메뉴 열기"
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
                const displayLabel = item.shortLabel ?? item.label;
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
                    <span>{displayLabel}</span>
                  </button>
                );
              })}
            </PopoverContent>
          </Popover>
        )}
        <button
          aria-label="대시보드 홈"
          className="flex shrink-0 select-none items-center gap-2 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-white/[0.05]"
          onClick={onHome}
          title="대시보드 홈"
          type="button"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-emerald-500/15 text-emerald-300">
            <Brain className="h-4 w-4" />
          </span>
          <span className="hidden whitespace-nowrap text-[11px] font-semibold tracking-tight text-zinc-400 lg:inline">
            AI Orchestrator Lab
          </span>
        </button>
        <span className="hidden h-4 w-px shrink-0 bg-zinc-700/70 md:block" />
        <h1 className="min-w-0 truncate text-sm font-semibold text-zinc-100" data-focus-id="topbar-view-title">
          {viewTitle}
        </h1>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Button
          aria-label="명령 팔레트 열기"
          className="h-8 gap-2 rounded-full border-white/10 bg-black/35 px-2.5 text-xs text-zinc-500 hover:border-cyan-300/25 hover:bg-white/[0.06] hover:text-zinc-100"
          onClick={onCommandPalette}
          size="sm"
          title="명령 팔레트"
          variant="outline"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">명령</span>
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
  const providerLabel = providerName || "공급자 미지정";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          aria-label={`시스템 상태: ${title} · ${providerLabel}`}
          className="h-8 gap-2 rounded-full border border-white/10 bg-black/25 px-2.5 text-xs text-zinc-500 hover:border-cyan-300/25 hover:bg-white/[0.06] hover:text-zinc-100"
          size="sm"
          variant="outline"
        >
          <span className={cn("h-2 w-2 rounded-full", dotClass, health !== "healthy" && "animate-pulse")} />
          <Activity className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">상태</span>
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
            런타임 상태 요약 · {providerLabel}
          </p>
        </div>
        <div className="space-y-1 p-2">
          <StatusRow label={dgxLabel} status={snapshot.dgxStatus} />
          <StatusRow label="로컬" status={snapshot.localModelStatus} />
          <StatusRow label="기억" status={snapshot.memorySyncStatus} />
          <StatusRow label="권위 노드" status={snapshot.syncTopology.authorityLabel} />
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
            DGX 점검
          </Button>
          <Button
            className="h-8 flex-1 justify-start text-xs text-zinc-500 hover:bg-zinc-800/70 hover:text-zinc-100"
            onClick={onOpenOpsDetail}
            size="sm"
            variant="ghost"
          >
            <Settings className="mr-2 h-3.5 w-3.5" />
            운영 상세
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
        {status ? runtimeStatusLabel(status) : "알 수 없음"}
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
