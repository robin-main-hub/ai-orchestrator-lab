import React from "react";
import { AlertTriangle, Brain, Database, Monitor } from "lucide-react";
import type { OperatorCockpitMemoryRecall } from "@ai-orchestrator/protocol";
import { Badge } from "./Badge";
import { GlassPanel, GlassPanelHeader } from "./GlassPanel";
import { operatorCockpitActionLabels } from "./actionLabels";
import { badgeColorForMirror, mirrorHealthLabel } from "./presentation";

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
            <Badge color="purple">{memory.contextReasons.length}건 기억</Badge>
            {onOpen ? (
              <button
                aria-label={operatorCockpitActionLabels.openMemoryRecall}
                className="rounded-md border border-border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground transition hover:border-primary/60 hover:text-primary"
                onClick={onOpen}
                title={operatorCockpitActionLabels.openMemoryRecall}
                type="button"
              >
                열기
              </button>
            ) : null}
          </div>
        }
      >
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">기억 근거</h3>
        </div>
      </GlassPanelHeader>

      <div className="space-y-4 p-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-border bg-muted/40 p-3">
            <span className="mb-2 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Monitor className="h-3 w-3" />
              MacBook 권위
            </span>
            <Badge color={memory.macBookAuthorityEnabled ? "green" : "gray"}>
              {memory.macBookAuthorityEnabled ? "활성" : "비활성"}
            </Badge>
          </div>
          <div className="rounded-lg border border-border bg-muted/40 p-3">
            <span className="mb-2 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Database className="h-3 w-3" />
              DGX 미러
            </span>
            <Badge color={badgeColorForMirror(memory.dgxMirrorHealth)}>{mirrorHealthLabel(memory.dgxMirrorHealth)}</Badge>
          </div>
        </div>

        <div>
          <span className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">맥락 근거</span>
          <ul className="space-y-2">
            {memory.contextReasons.map((reason, idx) => (
              <li key={`${reason}-${idx}`} className="flex items-start gap-2 rounded-md bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" />
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        </div>

        {memory.contradictionWarnings.length > 0 ? (
          <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3">
            <span className="mb-2 flex items-center gap-2 text-sm font-semibold text-destructive">
              <AlertTriangle className="h-4 w-4" /> 충돌 경고
            </span>
          <ul className="space-y-1">
            {memory.contradictionWarnings.map((warning, idx) => (
              <li key={`${warning}-${idx}`} className="flex items-start gap-2 text-sm text-destructive">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-destructive" />
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
