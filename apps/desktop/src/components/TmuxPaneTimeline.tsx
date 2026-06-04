import { useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/ui/collapsible";

import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Eye,
  Forward,
  Lightbulb,
  Loader2,
  Send,
  ShieldCheck,
  SkipForward,
  StickyNote,
} from "lucide-react";
import type {
  TerminalTimelineBlock,
  TerminalTimelineBlockKind,
  TerminalTimelineBlockStatus,
} from "@ai-orchestrator/protocol";
import { cn } from "../lib/utils";

/**
 * Stage 2-6 Tmux block model UI — Warp-style timeline inside each pane.
 *
 * Consumes the `TerminalTimelineBlock` schema landed in PR #125 (see
 * `packages/protocol/src/index.ts:1492`). Renders the most recent
 * blocks as a stacked timeline with mono header (stamp · kind ·
 * status dot), click-to-expand details, and optional output preview.
 *
 * The component is intentionally presentation-only — the host
 * (`TmuxSwarmBoard`) decides which blocks to feed in. When the host
 * passes an empty array the component renders a quiet empty state
 * rather than nothing, so the user knows the slot is intentional.
 */

export type TmuxPaneTimelineProps = {
  blocks: TerminalTimelineBlock[];
  /** Render only the last N blocks. Default 5. */
  limit?: number;
};

export function TmuxPaneTimeline({ blocks, limit = 5 }: TmuxPaneTimelineProps) {
  const visible = blocks.slice(-limit).reverse();

  return (
    <div className="tmux-pane-timeline" aria-label="pane timeline">
      <header className="tmux-pane-timeline__head">
        <Clock3 size={11} />
        <span>timeline</span>
        <em>{blocks.length}</em>
      </header>
      {visible.length === 0 ? (
        <p className="tmux-pane-timeline__empty">
          아직 기록된 block 없음. dispatch / capture 시 자동으로 누적됩니다.
        </p>
      ) : (
        <ol className="tmux-pane-timeline__list">
          {visible.map((block) => (
            <TimelineBlockRow block={block} key={block.id} />
          ))}
        </ol>
      )}
    </div>
  );
}

function TimelineBlockRow({ block }: { block: TerminalTimelineBlock }) {
  const [open, setOpen] = useState(false);
  const tone = statusTone(block.status);
  const hasDetail = Boolean(block.summary || block.outputPreview);

  return (
    <li
      className={cn(
        "tmux-block",
        `tmux-block--${tone}`,
        `tmux-block--kind-${block.kind}`,
      )}
    >
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button
            aria-expanded={open}
            className="tmux-block__head"
            disabled={!hasDetail}
            type="button"
          >
            <span className="tmux-block__stamp">{formatStamp(block.createdAt)}</span>
            <span className="tmux-block__kind-icon">{kindIcon(block.kind)}</span>
            <span className="tmux-block__kind-label">{kindLabel(block.kind)}</span>
            <span className="tmux-block__title">{block.title}</span>
            <span
              className={cn("tmux-block__status-dot", `tmux-block__status-dot--${tone}`)}
              title={statusLabel(block.status)}
            >
              <span className="sr-only">상태: {statusLabel(block.status)}</span>
            </span>
            {hasDetail ? (
              <ChevronDown
                className={cn(
                  "tmux-block__chevron",
                  !open && "tmux-block__chevron--closed",
                )}
                size={11}
              />
            ) : null}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          {hasDetail ? (
            <div className="tmux-block__detail">
              {block.summary ? <p className="tmux-block__summary">{block.summary}</p> : null}
              {block.outputPreview ? (
                <pre className="tmux-block__output">{block.outputPreview}</pre>
              ) : null}
              <footer className="tmux-block__meta">
                <span>{statusLabel(block.status)}</span>
                {block.redactionApplied ? <em>redacted</em> : null}
                {block.approvalId ? <span>approval:{block.approvalId.slice(-6)}</span> : null}
                {block.runId ? <span>run:{block.runId.slice(-6)}</span> : null}
              </footer>
            </div>
          ) : null}
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}

function statusTone(status: TerminalTimelineBlockStatus): "ok" | "warn" | "bad" | "neutral" {
  switch (status) {
    case "completed":
    case "running":
      return "ok";
    case "pending_approval":
    case "dry_run":
    case "planned":
      return "warn";
    case "failed":
    case "blocked":
      return "bad";
    case "stale":
    default:
      return "neutral";
  }
}

function kindIcon(kind: TerminalTimelineBlockKind) {
  const props = { size: 11 };
  switch (kind) {
    case "planning":
      return <Lightbulb {...props} />;
    case "command_intent":
      return <SkipForward {...props} />;
    case "approval":
      return <ShieldCheck {...props} />;
    case "dry_run":
      return <Eye {...props} />;
    case "dispatch":
      return <Send {...props} />;
    case "capture":
      return <Loader2 {...props} />;
    case "handoff":
      return <Forward {...props} />;
    case "note":
      return <StickyNote {...props} />;
    default:
      return <AlertTriangle {...props} />;
  }
}

function kindLabel(kind: TerminalTimelineBlockKind): string {
  const labels: Record<TerminalTimelineBlockKind, string> = {
    planning: "계획",
    command_intent: "의도",
    approval: "승인",
    dry_run: "리허설",
    dispatch: "발사",
    capture: "수집",
    handoff: "넘김",
    note: "메모",
  };
  return labels[kind];
}

function statusLabel(status: TerminalTimelineBlockStatus): string {
  const labels: Record<TerminalTimelineBlockStatus, string> = {
    planned: "계획됨",
    pending_approval: "승인 대기",
    blocked: "차단",
    dry_run: "리허설 중",
    running: "실행 중",
    completed: "완료",
    failed: "실패",
    stale: "오래됨",
  };
  return labels[status];
}

function formatStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(-8);
  return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/** Helper for hosts: create a synthetic block from a dispatch/capture result. */
export function makeSyntheticBlock(input: {
  paneId: string;
  role: string;
  host: string;
  sessionId: string;
  terminalSessionId: string;
  kind: TerminalTimelineBlockKind;
  status: TerminalTimelineBlockStatus;
  title: string;
  summary?: string;
  outputPreview?: string;
  approvalId?: string;
  runId?: string;
}): TerminalTimelineBlock {
  return {
    id: `block_${input.kind}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    sessionId: input.sessionId,
    terminalSessionId: input.terminalSessionId,
    paneId: input.paneId,
    role: input.role as TerminalTimelineBlock["role"],
    host: input.host as TerminalTimelineBlock["host"],
    kind: input.kind,
    status: input.status,
    title: input.title,
    summary: input.summary ?? "",
    relatedEventIds: [],
    outputPreview: input.outputPreview,
    redactionApplied: false,
    approvalId: input.approvalId,
    runId: input.runId,
    createdAt: new Date().toISOString(),
  };
}
