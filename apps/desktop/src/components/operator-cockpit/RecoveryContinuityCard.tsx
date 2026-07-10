import React from "react";
import { Activity, ArchiveRestore, CloudUpload, HeartPulse } from "lucide-react";
import type { OperatorCockpitRecovery } from "@ai-orchestrator/protocol";
import { Badge } from "./Badge";
import { GlassPanel, GlassPanelHeader } from "./GlassPanel";
import { operatorCockpitActionLabels } from "./actionLabels";
import { badgeColorForOutbox, outboxSyncLabel } from "./presentation";

export function RecoveryContinuityCard({
  recovery,
  onOpen,
}: {
  recovery: OperatorCockpitRecovery;
  onOpen?: () => void;
}) {
  return (
    <GlassPanel>
      <GlassPanelHeader
        action={
          <div className="flex items-center gap-2">
            <Badge color="green">{recovery.healthIndicators.length}건 점검</Badge>
            {onOpen ? (
              <button
                aria-label={operatorCockpitActionLabels.openRecoveryContinuity}
                className="rounded-md border border-border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground transition hover:border-primary/60 hover:text-primary"
                onClick={onOpen}
                title={operatorCockpitActionLabels.openRecoveryContinuity}
                type="button"
              >
                열기
              </button>
            ) : null}
          </div>
        }
      >
        <div className="flex items-center gap-2">
          <HeartPulse className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">복구와 연속성</h3>
        </div>
      </GlassPanelHeader>

      <div className="space-y-4 p-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-border bg-muted/40 p-3">
            <span className="mb-2 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <ArchiveRestore className="h-3 w-3" />
              오프라인 재개
            </span>
            <Badge color={recovery.offlineResumeSupported ? "green" : "gray"}>
              {recovery.offlineResumeSupported ? "지원됨" : "미지원"}
            </Badge>
          </div>
          <div className="rounded-lg border border-border bg-muted/40 p-3">
            <span className="mb-2 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <CloudUpload className="h-3 w-3" />
              발신함 동기화
            </span>
            <Badge color={badgeColorForOutbox(recovery.outboxSyncStatus)}>{outboxSyncLabel(recovery.outboxSyncStatus)}</Badge>
          </div>
        </div>

        <div>
          <span className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">상태 신호</span>
          <div className="flex flex-wrap gap-2">
            {recovery.healthIndicators.map((indicator) => (
              <Badge
                key={indicator}
                color={indicator.toLowerCase().includes("warning") || indicator.toLowerCase().includes("degraded") ? "yellow" : "gray"}
                size="xs"
              >
                <Activity className="h-3 w-3" />
                {indicator}
              </Badge>
            ))}
          </div>
        </div>
      </div>
    </GlassPanel>
  );
}
