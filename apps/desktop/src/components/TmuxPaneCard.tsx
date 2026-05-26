import { Eye, Loader2, Send } from "lucide-react";
import type { TerminalTimelineBlock } from "@ai-orchestrator/protocol";
import type { AgentVisualSettings, WorkbenchAgent } from "../types";
import { agentRoleLabel } from "../lib/helpers";
import { cn } from "@/lib/utils";
import { Button } from "@/ui/button";
import { StatusBadge } from "@/ui/status-badge";
import { AgentAvatar } from "./AgentAvatar";
import { TmuxPaneTimeline } from "./TmuxPaneTimeline";

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
    roleKey: string;
    title: string;
    role: string;
    state: string;
    agent?: WorkbenchAgent;
    signal: string;
  };
  /** Stage 2-6: optional Warp-style timeline blocks for this pane. */
  timelineBlocks?: TerminalTimelineBlock[];
  visual?: AgentVisualSettings;
}) {
  const isIdle = pane.state === "idle";
  return (
    <div className="flex flex-col rounded-lg border border-border bg-card">
      {/* Header: avatar + title + status */}
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <AgentAvatar agent={pane.agent} size="small" visual={visual} />
          <div className="min-w-0">
            <div className="truncate text-[10px] text-muted-foreground">
              {pane.id}
            </div>
            <div className="truncate text-sm font-medium text-foreground">
              {pane.title}
            </div>
          </div>
        </div>
        <StatusBadge variant={stateToBadgeVariant(pane.state)} size="sm">
          {pane.state}
        </StatusBadge>
      </div>

      {/* Role description */}
      <div className="border-b border-border/50 px-3 py-2">
        <p className="text-[10px] text-muted-foreground line-clamp-2">{pane.role}</p>
      </div>

      {/* Agent assignment */}
      <div className="flex items-center justify-between gap-2 border-b border-border/50 px-3 py-2">
        <div className="min-w-0">
          <span className="text-[10px] text-muted-foreground">
            {pane.agent ? agentRoleLabel(pane.agent.role) : "future slot"}
          </span>
          <div className="truncate text-[11px] font-medium text-foreground">
            {pane.agent?.name ?? "담당 agent 미정"}
          </div>
        </div>
        <span className="text-[10px] font-mono text-muted-foreground">
          {pane.agent?.modelId ?? "model pending"}
        </span>
      </div>

      {/* Signal text */}
      <p className="px-3 py-2 text-[10px] text-muted-foreground line-clamp-2">
        {pane.signal}
      </p>

      {/* Command controls */}
      {onCapture || onDispatch ? (
        <div className="border-t border-border p-2">
          <div className="flex items-center gap-1">
            <input
              aria-label={`${pane.title} command preview`}
              className={cn(
                "h-7 flex-1 min-w-0 rounded-md border border-border bg-card/40 px-2 font-mono text-[10px] text-foreground placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none",
                isIdle && "cursor-not-allowed opacity-50",
              )}
              disabled={isIdle}
              onChange={(event) => onCommandDraftChange?.(event.target.value)}
              placeholder={isIdle ? "" : "codex 'command...'"}
              value={commandDraft ?? ""}
            />
            <Button
              aria-label={`${pane.title} capture`}
              className="h-7 gap-1 px-2 text-[10px]"
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
              aria-label={`${pane.title} dispatch`}
              className="h-7 gap-1 px-2 text-[10px] text-primary"
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
        <pre className="mx-2 mb-2 max-h-24 overflow-auto whitespace-pre-wrap rounded border border-border bg-background/60 p-2 font-mono text-[10px] text-muted-foreground">
          {lastOutput}
        </pre>
      ) : null}

      {/* Timeline blocks (Stage 2-6) */}
      {timelineBlocks ? (
        <div className="mx-2 mb-2">
          <TmuxPaneTimeline blocks={timelineBlocks} />
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
