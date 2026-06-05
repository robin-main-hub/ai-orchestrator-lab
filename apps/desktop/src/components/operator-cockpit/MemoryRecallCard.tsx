import React from "react";
import { AlertTriangle, Brain, Database, Monitor } from "lucide-react";
import type { OperatorCockpitMemoryRecall } from "@ai-orchestrator/protocol";
import { Badge } from "./Badge";
import { GlassPanel, GlassPanelHeader } from "./GlassPanel";
import { badgeColorForMirror } from "./presentation";

export function MemoryRecallCard({
  memory,
  onOpen,
}: {
  memory: OperatorCockpitMemoryRecall;
  onOpen?: () => void;
}) {
  return (
    <GlassPanel variant={memory.contradictionWarnings.length > 0 ? "danger" : "default"}>
      <GlassPanelHeader
        action={
          <div className="flex items-center gap-2">
            <Badge color="purple">{memory.contextReasons.length} recalls</Badge>
            {onOpen ? (
              <button
                className="rounded-md border border-zinc-700/70 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 transition hover:border-violet-400/60 hover:text-violet-200"
                onClick={onOpen}
                type="button"
              >
                열기
              </button>
            ) : null}
          </div>
        }
      >
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-violet-400" />
          <h3 className="text-sm font-semibold text-zinc-100">Memory Recall</h3>
        </div>
      </GlassPanelHeader>

      <div className="space-y-4 p-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-zinc-800/50 bg-black/20 p-3">
            <span className="mb-2 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
              <Monitor className="h-3 w-3" />
              MacBook
            </span>
            <Badge color={memory.macBookAuthorityEnabled ? "green" : "gray"}>
              {memory.macBookAuthorityEnabled ? "Authority" : "Offline"}
            </Badge>
          </div>
          <div className="rounded-lg border border-zinc-800/50 bg-black/20 p-3">
            <span className="mb-2 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
              <Database className="h-3 w-3" />
              DGX Mirror
            </span>
            <Badge color={badgeColorForMirror(memory.dgxMirrorHealth)}>{memory.dgxMirrorHealth}</Badge>
          </div>
        </div>

        <div>
          <span className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-zinc-600">Context Reasons</span>
          <ul className="space-y-2">
            {memory.contextReasons.map((reason, idx) => (
              <li key={`${reason}-${idx}`} className="flex items-start gap-2 rounded-md bg-zinc-900/30 px-3 py-2 text-sm text-zinc-300">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-violet-400" />
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        </div>

        {memory.contradictionWarnings.length > 0 ? (
          <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-3">
            <span className="mb-2 flex items-center gap-2 text-sm font-semibold text-rose-300">
              <AlertTriangle className="h-4 w-4" /> Contradiction Warnings
            </span>
          <ul className="space-y-1">
            {memory.contradictionWarnings.map((warning, idx) => (
              <li key={`${warning}-${idx}`} className="flex items-start gap-2 text-sm text-rose-200">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-rose-300" />
                <span>{warning}</span>
              </li>
            ))}
          </ul>
          </div>
        ) : null}
      </div>
    </GlassPanel>
  );
}
