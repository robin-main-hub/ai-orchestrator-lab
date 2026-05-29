import { useMemo, useState } from "react";
import {
  FileCode2,
  GitBranch,
  ChevronDown,
  ChevronUp,
  Link2,
} from "lucide-react";
import type { Stage3DebateUtteranceView } from "../types";
import { AvatarWithStatus, roleColorFromRole } from "@/ui/avatar-with-status";
import { StatusBadge } from "@/ui/status-badge";
import { cn } from "@/lib/utils";

export type DecisionTimelineWidgetProps = {
  utterances: Stage3DebateUtteranceView[];
  onSelectUtterance: (u: Stage3DebateUtteranceView) => void;
  onSwitchToRoundsView?: () => void;
};

export function DecisionTimelineWidget({
  utterances,
  onSelectUtterance,
  onSwitchToRoundsView,
}: DecisionTimelineWidgetProps) {
  // 1. 결정 노드 필터링 (decisionId가 있거나 특정 키워드가 포함된 본문)
  const decisions = useMemo(() => {
    return utterances.filter(
      (u) =>
        u.decisionId !== undefined ||
        /결정|합의|최종안|채택|확정|의사결정|decision|resolved/i.test(u.content)
    );
  }, [utterances]);

  return (
    <div className="rounded-lg border border-border bg-card/40 p-3 space-y-3">
      {/* Widget Header */}
      <div className="flex items-center justify-between border-b border-border/60 pb-2">
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-success"></span>
          </span>
          <span className="text-xs font-semibold text-foreground">Decision Timeline</span>
        </div>
        <span className="text-[10px] text-muted-foreground font-mono">
          {decisions.length} resolved
        </span>
      </div>

      {/* Timeline List */}
      {decisions.length === 0 ? (
        <p className="text-[10px] text-muted-foreground italic py-1 pl-1">
          아직 토론 합의가 도출되지 않았습니다.
        </p>
      ) : (
        <div className="relative border-l border-border/80 ml-2 pl-3 space-y-3.5 pt-1">
          {decisions.map((dec) => (
            <TimelineItem
              key={dec.id}
              decision={dec}
              onSelect={() => {
                onSwitchToRoundsView?.();
                onSelectUtterance(dec);
                // 스크롤 및 포커스 효과 부여
                setTimeout(() => {
                  const el = document.getElementById(`utterance-card-${dec.id}`);
                  if (el) {
                    el.scrollIntoView({ behavior: "smooth", block: "center" });
                    el.classList.add("ring-2", "ring-primary", "scale-[1.01]", "transition-all", "duration-300");
                    setTimeout(() => {
                      el.classList.remove("ring-2", "ring-primary", "scale-[1.01]");
                    }, 3000);
                  }
                }, 150);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Sub-component: Individual Timeline Item ──────────────────────────

function TimelineItem({
  decision,
  onSelect,
}: {
  decision: Stage3DebateUtteranceView;
  onSelect: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const formattedTime = useMemo(() => {
    try {
      return new Date(decision.createdAt).toLocaleTimeString("ko-KR", {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  }, [decision.createdAt]);

  return (
    <div className="relative group">
      {/* Timeline dot */}
      <div className="absolute -left-[17px] top-1.5 h-2 w-2 rounded-full border border-success bg-background group-hover:bg-success transition-colors" />

      {/* Content box */}
      <div className="space-y-1.5 cursor-pointer" onClick={onSelect}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <AvatarWithStatus
              initials={decision.agentName.slice(0, 2).toUpperCase()}
              roleColor={roleColorFromRole(decision.agentName.toLowerCase())}
              size="sm"
            />
            <span className="text-[10px] font-semibold text-foreground leading-none">
              {decision.agentName}
            </span>
          </div>
          <span className="text-[9px] text-muted-foreground font-mono leading-none">
            {formattedTime}
          </span>
        </div>

        {/* Accordion style text for progressive disclosure */}
        <div className="space-y-1" onClick={(e) => e.stopPropagation()}>
          <div 
            onClick={onSelect}
            className="flex items-start gap-1 group/text"
          >
            <p className={cn(
              "text-[10px] leading-relaxed text-muted-foreground group-hover/text:text-foreground transition-colors",
              !expanded && "line-clamp-2"
            )}>
              {decision.content}
            </p>
          </div>

          <div className="flex items-center justify-between gap-2">
            {/* Meta Tags */}
            <div className="flex flex-wrap gap-1">
              <span className="inline-flex items-center gap-0.5 rounded bg-success/15 border border-success/35 px-1 py-0.5 text-[8px] font-mono font-semibold text-success uppercase leading-none">
                Resolved
              </span>
              {decision.codingImpactRefs && decision.codingImpactRefs.length > 0 && (
                <span className="inline-flex items-center gap-0.5 rounded bg-primary/10 border border-primary/20 px-1 py-0.5 text-[8px] font-mono text-primary leading-none">
                  <FileCode2 className="h-2 w-2" />
                  {decision.codingImpactRefs[0]?.split("/").pop() || "code"}
                </span>
              )}
            </div>

            {/* Toggle Button */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(!expanded);
              }}
              className="inline-flex h-4 w-4 items-center justify-center rounded-sm hover:bg-muted/80 text-muted-foreground transition-colors"
            >
              {expanded ? (
                <ChevronUp className="h-2.5 w-2.5" />
              ) : (
                <ChevronDown className="h-2.5 w-2.5" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
