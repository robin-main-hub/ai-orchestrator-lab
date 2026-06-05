import React from "react";
import { Activity, ArchiveRestore, CloudUpload, HeartPulse } from "lucide-react";
import type { OperatorCockpitRecovery } from "@ai-orchestrator/protocol";
import { Badge } from "./Badge";
import { GlassPanel, GlassPanelHeader } from "./GlassPanel";
import { operatorCockpitActionLabels } from "./actionLabels";
import { badgeColorForOutbox } from "./presentation";

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
            <Badge color="green">{recovery.healthIndicators.length} checks</Badge>
            {onOpen ? (
              <button
                aria-label={operatorCockpitActionLabels.openRecoveryContinuity}
                className="rounded-md border border-zinc-700/70 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 transition hover:border-emerald-400/60 hover:text-emerald-200"
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
          <HeartPulse className="h-4 w-4 text-emerald-400" />
          <h3 className="text-sm font-semibold text-zinc-100">Recovery & Continuity</h3>
        </div>
      </GlassPanelHeader>

      <div className="space-y-4 p-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-zinc-800/50 bg-black/20 p-3">
            <span className="mb-2 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
              <ArchiveRestore className="h-3 w-3" />
              Offline Resume
            </span>
            <Badge color={recovery.offlineResumeSupported ? "green" : "gray"}>
              {recovery.offlineResumeSupported ? "Supported" : "Unsupported"}
            </Badge>
          </div>
          <div className="rounded-lg border border-zinc-800/50 bg-black/20 p-3">
            <span className="mb-2 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
              <CloudUpload className="h-3 w-3" />
              Outbox Sync
            </span>
            <Badge color={badgeColorForOutbox(recovery.outboxSyncStatus)}>{recovery.outboxSyncStatus}</Badge>
          </div>
        </div>

        <div>
          <span className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-zinc-600">Health Indicators</span>
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
