import { memo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  MessageSquare,
  Users,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  Route,
  Network,
} from "lucide-react";
import { useDebateStore } from "../store/useDebateStore";
import { StatusBadge } from "@/ui/status-badge";
import { cn } from "@/lib/utils";
import { InteractiveTopologyMap } from "./InteractiveTopologyMap";

export type RoundSummaryMapProps = {
  sessionId: string;
  onSelectRound: (roundId: string) => void;
  currentRoundId?: string;
};

type RoundNodeItemProps = {
  node: import("../store/useDebateStore").RoundNodeInfo;
  isActive: boolean;
  onSelectRound: (roundId: string) => void;
};

const RoundNodeItem = memo(function RoundNodeItem({
  node,
  isActive,
  onSelectRound,
}: RoundNodeItemProps) {
  return (
    <div className="relative group/node">
      {/* Station Dot Marker */}
      <button
        type="button"
        onClick={() => onSelectRound(node.id)}
        className={cn(
          "absolute -left-[45px] top-1.5 flex h-7 w-7 items-center justify-center rounded-full border-2 bg-background shadow-md transition-all cursor-pointer",
          node.type === "agreement" && "border-success text-success hover:bg-success/10",
          node.type === "conflict" && "border-warning text-warning hover:bg-warning/10",
          node.type === "risk" && "border-destructive text-destructive hover:bg-destructive/10",
          isActive && "scale-120 ring-4 ring-primary/20"
        )}
        title={`${node.title} 선택`}
      >
        {node.type === "agreement" && <CheckCircle2 className="h-4 w-4" />}
        {node.type === "conflict" && <AlertTriangle className="h-4 w-4" />}
        {node.type === "risk" && <ShieldAlert className="h-4 w-4" />}
      </button>

      {/* Station Label & Box */}
      <div
        onClick={() => onSelectRound(node.id)}
        className={cn(
          "cursor-pointer rounded-lg border border-border/50 bg-card/50 p-4 transition-all hover:border-primary/40 hover:bg-card relative shadow-xs",
          isActive && "border-primary/60 bg-card shadow-sm"
        )}
      >
        {/* Connector line indicator for active node */}
        {isActive && (
          <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l bg-primary" />
        )}

        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-foreground">
                {node.title}
              </span>
              <div className="flex gap-1">
                {node.keywords.map((kw) => (
                  <span
                    key={kw}
                    className={cn(
                      "rounded-sm px-1.5 py-0.5 text-[8px] font-mono leading-none border",
                      node.type === "agreement" && "bg-success/10 text-success border-success/20",
                      node.type === "conflict" && "bg-warning/10 text-warning border-warning/20",
                      node.type === "risk" && "bg-destructive/10 text-destructive border-destructive/20"
                    )}
                  >
                    {kw}
                  </span>
                ))}
              </div>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {node.summary}
            </p>
          </div>

          <span className="text-[10px] text-muted-foreground font-mono shrink-0">
            {node.utteranceCount} 발언
          </span>
        </div>

        {/* Hover Detail Panel (Progressive Disclosure) */}
        <div className="mt-3 pt-3 border-t border-border/40 flex flex-wrap items-center justify-between gap-3 text-[10px]">
          {/* 에이전트 목록 */}
          <div className="flex items-center gap-1 text-muted-foreground">
            <Users className="h-3 w-3" />
            <span>참여:</span>
            <div className="flex -space-x-1.5 ml-1">
              {node.agents.map((ag) => (
                <div
                  key={ag}
                  className="h-4.5 w-4.5 rounded-full bg-muted border border-background flex items-center justify-center text-[7px] font-mono font-semibold"
                  title={ag}
                >
                  {ag.slice(0, 2).toUpperCase()}
                </div>
              ))}
            </div>
          </div>

          {/* 탭 상태 배지 */}
          <StatusBadge
            variant={
              node.type === "agreement" ? "success"
                : node.type === "conflict" ? "warning"
                : "danger"
            }
            size="sm"
            className="font-mono uppercase text-[8px] scale-90"
          >
            {node.type === "agreement" ? "Agreement"
              : node.type === "conflict" ? "Conflict"
              : "Risk"}
          </StatusBadge>
        </div>
      </div>
    </div>
  );
});

export const RoundSummaryMap = memo(function RoundSummaryMap({
  sessionId,
  onSelectRound,
  currentRoundId,
}: RoundSummaryMapProps) {
  const [viewMode, setViewMode] = useState<"subway" | "network">("subway");

  // Subscribe to the pre-computed roundNodes from the Zustand store with shallow equality
  const roundNodes = useDebateStore(
    useShallow((state) => state.roundNodes[sessionId] ?? [])
  );

  return (
    <div className="flex flex-col h-full bg-card/10 rounded-lg p-6 overflow-y-auto">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-primary" />
            Round Summary Map
          </h3>
          <p className="text-xs text-muted-foreground">
            토론 라운드의 흐름과 각 단계별 합의 상태를 조망합니다. 노드를 클릭해 바로 포커스할 수 있습니다.
          </p>
        </div>

        {/* View Switcher Toggle */}
        <div className="flex bg-muted/30 border border-border/15 p-0.5 rounded-md shrink-0">
          <button
            type="button"
            onClick={() => setViewMode("subway")}
            className={cn(
              "flex items-center gap-1 px-2.5 py-1 text-[10px] font-semibold rounded-sm transition-all cursor-pointer",
              viewMode === "subway"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Route className="h-3 w-3" />
            노선도
          </button>
          <button
            type="button"
            onClick={() => setViewMode("network")}
            className={cn(
              "flex items-center gap-1 px-2.5 py-1 text-[10px] font-semibold rounded-sm transition-all cursor-pointer",
              viewMode === "network"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Network className="h-3 w-3" />
            토폴로지
          </button>
        </div>
      </div>

      {viewMode === "subway" ? (
        /* 지하철 노선도 스타일 수직 트랙 */
        <div className="relative border-l-2 border-border/80 ml-6 pl-8 space-y-8 pb-4">
          {roundNodes.map((node) => (
            <RoundNodeItem
              key={node.id}
              node={node}
              isActive={currentRoundId === node.id}
              onSelectRound={onSelectRound}
            />
          ))}
        </div>
      ) : (
        <InteractiveTopologyMap
          sessionId={sessionId}
          onSelectRound={onSelectRound}
          currentRoundId={currentRoundId}
        />
      )}
    </div>
  );
});
