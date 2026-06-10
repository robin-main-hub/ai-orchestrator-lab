import { useState } from "react";
import { ChevronDown, ChevronRight, Clock3, Eye, Loader2, Send } from "lucide-react";
import type { TerminalTimelineBlock } from "@ai-orchestrator/protocol";
import type { TmuxPaneRole } from "@ai-orchestrator/protocol";
import type { AgentVisualSettings, WorkbenchAgent } from "../types";
import { agentRoleLabel } from "../lib/helpers";
import { deriveTmuxPaneLifecycleSummary, type TmuxPaneLifecycleTone } from "../lib/tmuxPaneLifecycle";
import {
  compactTmuxPreview,
  sanitizeTmuxWorkbenchText,
  tmuxPaneRoleLabel,
  tmuxPaneStateLabel,
} from "../lib/tmuxWorkbenchPresentation";
import { cn } from "@/lib/utils";
import { Button } from "@/ui/button";
import { StatusBadge } from "@/ui/status-badge";
import { AvatarWithStatus, roleColorFromRole } from "@/ui/avatar-with-status";
import { TmuxPaneTimeline } from "./TmuxPaneTimeline";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/ui/collapsible";

/**
 * Tmux pane card — strict v0 port.
 * source: docs/v0/v0-output/components/tmux/agent-pane.tsx
 *
 * Layout:
 *   header: avatar + subtitle/title + status badge
 *   role description row
 *   agent assignment row (name / model)
 *   signal text line
 *   command input row (input + 읽기 + 보내기)
 *   optional output preview
 *   optional Warp-style timeline blocks
 */

export function TmuxPaneCard({
  busy,
  commandDraft,
  lastOutput,
  onCapture,
  onCommandDraftChange,
  onDispatch,
  pane,
  matchedPersonas,
  timelineBlocks,
  visual,
}: {
  busy?: "capture" | "dispatch";
  commandDraft?: string;
  lastOutput?: string;
  onCapture?: () => void;
  onCommandDraftChange?: (value: string) => void;
  onDispatch?: () => void;
  pane: {
    id: string;
    roleKey: TmuxPaneRole;
    title: string;
    role: string;
    state: string;
    agent?: WorkbenchAgent;
    signal: string;
  };
  /** 이 pane 워크스테이션에 배치 가능한 캐릭터 명단 (도감 매칭) */
  matchedPersonas?: ReadonlyArray<{ personaName: string; displayName: string }>;
  /** Stage 2-6: optional Warp-style timeline blocks for this pane. */
  timelineBlocks?: TerminalTimelineBlock[];
  visual?: AgentVisualSettings;
}) {
  const isIdle = pane.state === "idle";
  const [isTimelineOpen, setIsTimelineOpen] = useState(false);
  const lifecycle = deriveTmuxPaneLifecycleSummary({
    lastOutput,
    paneState: pane.state,
    timelineBlocks: timelineBlocks ?? [],
  });
  return (
    <div className="cockpit-pane flex min-h-[260px] flex-col rounded-lg border border-zinc-800/60 bg-zinc-900/40 shadow-xl shadow-black/25 backdrop-blur-xl transition-colors hover:border-zinc-700/60">
      {/* Header: avatar + title + status */}
      <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="rounded-md border border-amber-500/20 bg-amber-500/10 p-1">
            <AvatarWithStatus
              initials={pane.agent ? pane.agent.name.slice(0, 2).toUpperCase() : "??"}
              roleColor={pane.agent ? roleColorFromRole(pane.agent.role) : "companion"}
              status={
                pane.state === "chat active" || pane.state === "active"
                  ? "active"
                  : pane.state === "ready"
                    ? "online"
                    : pane.state === "dispatch gated" || pane.state === "pending_approval"
                      ? "pending"
                      : pane.state === "guarding"
                        ? "offline"
                        : "idle"
              }
              avatarDataUrl={visual?.avatarDataUrl}
              size="sm"
            />
          </div>
          <div className="min-w-0">
            <div className="truncate font-mono text-[10px] text-zinc-600">
              {pane.id}
            </div>
            <div className="truncate text-sm font-semibold text-zinc-100">
              {pane.title}
            </div>
          </div>
        </div>
        <StatusBadge variant={stateToBadgeVariant(pane.state)} size="sm">
          {tmuxPaneStateLabel(pane.state)}
        </StatusBadge>
      </div>

      {/* Role description */}
      <div className="border-b border-white/[0.07] px-3 py-2">
        <p className="line-clamp-2 text-[10px] text-zinc-500">{pane.role}</p>
      </div>

      {/* Agent assignment */}
      <div className="flex items-center justify-between gap-2 border-b border-white/[0.07] px-3 py-2">
        <div className="min-w-0">
          <span className="text-[10px] text-zinc-600">
            {pane.agent ? agentRoleLabel(pane.agent.role) : `${tmuxPaneRoleLabel(pane.roleKey)} 대기`}
          </span>
          <div className="truncate text-[11px] font-semibold text-zinc-200">
            {pane.agent?.name ?? "담당 agent 미정"}
          </div>
        </div>
        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 font-mono text-[10px] text-zinc-500">
          {pane.agent?.modelId ?? "모델 대기"}
        </span>
      </div>

      {/* 배치 가능한 캐릭터 (도감 매칭) — 매칭 없는 pane은 행 자체를 생략 */}
      {matchedPersonas && matchedPersonas.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1 border-b border-white/[0.07] px-3 py-2">
          <span className="mr-1 text-[10px] uppercase tracking-wider text-zinc-600">소환 후보</span>
          {matchedPersonas.map((persona) => (
            <span
              className="rounded-full border border-violet-400/20 bg-violet-500/10 px-2 py-0.5 text-[10px] text-violet-200"
              key={persona.personaName}
              title={`agents/${persona.personaName}`}
            >
              {persona.displayName}
            </span>
          ))}
        </div>
      ) : null}

      {/* Signal text */}
      <p className="line-clamp-2 px-3 py-2 text-[10px] text-zinc-500">
        {pane.signal}
      </p>

      <div className="mx-3 mb-2 rounded-lg border border-white/[0.07] bg-black/20 p-2">
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
            <span className={cn("h-1.5 w-1.5 rounded-full", lifecycleToneDot(lifecycle.tone))} />
            {tmuxPaneStateLabel(lifecycle.lastBlockLabel)}
          </span>
          <span className={cn("shrink-0 text-[10px]", lifecycleToneText(lifecycle.tone))}>
            {lifecycle.pendingApprovalCount > 0
              ? `승인 ${lifecycle.pendingApprovalCount}건`
              : lifecycle.failedCount > 0
                ? `차단 ${lifecycle.failedCount}건`
                : lifecycleToneLabel(lifecycle.tone)}
          </span>
        </div>
        <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-zinc-500">
          {sanitizeTmuxWorkbenchText(lifecycle.detail)}
        </p>
      </div>

      {/* Command controls */}
      {onCapture || onDispatch ? (
        <div className="mt-auto border-t border-white/10 p-2">
          <div className="flex items-center gap-1">
            <input
              aria-label={`${pane.title} 명령 미리보기`}
              className={cn(
                "h-8 min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-2 font-mono text-[10px] text-zinc-200 placeholder:text-zinc-700 focus-visible:border-amber-400/50 focus-visible:outline-none",
                isIdle && "cursor-not-allowed opacity-50",
              )}
              disabled={isIdle}
              onChange={(event) => onCommandDraftChange?.(event.target.value)}
              placeholder={isIdle ? "에이전트 배정 후 명령 가능" : "승인 후 실행할 명령"}
              value={commandDraft ?? ""}
            />
            <Button
              aria-label={`${pane.title} 읽기`}
              className="h-8 gap-1 rounded-lg px-2 text-[10px] text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-100"
              disabled={Boolean(busy) || isIdle}
              onClick={onCapture}
              size="sm"
              variant="ghost"
            >
              {busy === "capture" ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Eye className="h-3 w-3" />
              )}
              읽기
            </Button>
            <Button
              aria-label={`${pane.title} 보내기`}
              className="h-8 gap-1 rounded-lg px-2 text-[10px] text-amber-300 hover:bg-amber-500/10"
              disabled={Boolean(busy) || isIdle}
              onClick={onDispatch}
              size="sm"
              variant="ghost"
            >
              {busy === "dispatch" ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Send className="h-3 w-3" />
              )}
              보내기
            </Button>
          </div>
        </div>
      ) : null}

      {/* Output preview */}
      {lastOutput ? (
        <pre className="mx-2 mb-2 max-h-24 overflow-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-black/40 p-2 font-mono text-[10px] text-zinc-500">
          {compactTmuxPreview(lastOutput)}
        </pre>
      ) : null}

      {/* Timeline blocks (Stage 2-6) - Collapsible */}
      {timelineBlocks && timelineBlocks.length > 0 ? (
        <div className="border-t border-white/[0.07] p-2">
          <Collapsible open={isTimelineOpen} onOpenChange={setIsTimelineOpen}>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex w-full cursor-pointer items-center justify-between rounded px-1.5 py-1 text-[10px] font-medium text-zinc-500 transition-colors hover:bg-white/[0.04] hover:text-zinc-200"
              >
                <div className="flex items-center gap-1.5">
                  <Clock3 size={11} />
                  <span>타임라인 로그 ({timelineBlocks.length})</span>
                </div>
                {isTimelineOpen ? (
                  <ChevronDown className="h-3.5 w-3.5 text-zinc-500" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 text-zinc-500" />
                )}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-1.5">
              <div className="max-h-60 overflow-y-auto pr-1">
                <TmuxPaneTimeline blocks={timelineBlocks} />
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      ) : null}
    </div>
  );
}

function stateToBadgeVariant(state: string): "primary" | "success" | "warning" | "danger" | "muted" {
  if (state === "chat active" || state === "active") return "primary";
  if (state === "ready") return "success";
  if (state === "dispatch gated" || state === "pending_approval") return "warning";
  if (state === "guarding" || state === "failed" || state === "dispatch failed") return "danger";
  return "muted";
}

function lifecycleToneLabel(tone: TmuxPaneLifecycleTone) {
  const labels: Record<TmuxPaneLifecycleTone, string> = {
    danger: "문제",
    idle: "대기",
    ok: "정상",
    warn: "주의",
  };
  return labels[tone];
}

function lifecycleToneDot(tone: TmuxPaneLifecycleTone) {
  const colors: Record<TmuxPaneLifecycleTone, string> = {
    danger: "bg-rose-400",
    idle: "bg-zinc-600",
    ok: "bg-emerald-400",
    warn: "bg-amber-400",
  };
  return colors[tone];
}

function lifecycleToneText(tone: TmuxPaneLifecycleTone) {
  const colors: Record<TmuxPaneLifecycleTone, string> = {
    danger: "text-rose-300",
    idle: "text-zinc-500",
    ok: "text-emerald-300",
    warn: "text-amber-300",
  };
  return colors[tone];
}
