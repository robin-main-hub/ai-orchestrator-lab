import React from "react";
import { Activity, BrainCircuit, Monitor, RefreshCw, Server, ShieldAlert } from "lucide-react";
import type { OperatorCockpitSnapshot } from "@ai-orchestrator/protocol";
import { ApprovalEvidenceCard } from "./ApprovalEvidenceCard";
import { Badge } from "./Badge";
import { DispatchHistoryCard } from "./DispatchHistoryCard";
import { HandoffCard } from "./HandoffCard";
import { MemoryRecallCard } from "./MemoryRecallCard";
import { ProviderRoutingCard } from "./ProviderRoutingCard";
import { RecoveryContinuityCard } from "./RecoveryContinuityCard";
import { WorkerFleetCard } from "./WorkerFleetCard";
import { badgeColorForMirror, formatClock, mirrorHealthLabel } from "./presentation";

export function OperatorCockpit({
  snapshot,
  onPreviewEvidence,
  onOpenMemory,
  onOpenProviderRouting,
  onOpenRecovery,
}: {
  snapshot: OperatorCockpitSnapshot;
  onPreviewEvidence?: () => void;
  onOpenMemory?: () => void;
  onOpenProviderRouting?: () => void;
  onOpenRecovery?: () => void;
}) {
  const blockedCount = snapshot.fleet.filter((worker) => worker.status === "blocked" || worker.status === "error").length;
  const approvalCount = snapshot.approvals.length;
  const riskyApprovalCount = snapshot.approvals.filter((approval) => approval.payloadBindingStatus !== "bound").length;
  const totalSignals =
    blockedCount +
    riskyApprovalCount +
    snapshot.handoffs.reduce((count, handoff) => count + handoff.missingInfoSlots.length, 0) +
    snapshot.memory.contradictionWarnings.length +
    snapshot.dispatchHistory.filter((dispatch) => dispatch.tamperWarning).length;

  return (
    <div
      aria-label="운영자 관제판 읽기 전용 지휘 화면"
      className="relative flex h-full min-h-0 flex-col overflow-hidden bg-transparent text-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50"
      data-focus-id="cockpit-container"
      tabIndex={-1}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(6,182,212,0.12),transparent_32%),radial-gradient(circle_at_82%_8%,rgba(139,92,246,0.10),transparent_34%),linear-gradient(180deg,rgba(24,24,27,0.56),rgba(9,9,11,0.96))]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.03] [background-image:linear-gradient(to_right,rgba(255,255,255,0.8)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.8)_1px,transparent_1px)] [background-size:32px_32px]"
      />

      <header className="sticky top-0 z-10 border-b border-zinc-800/60 bg-zinc-900/40 px-4 py-3 backdrop-blur-xl">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-300 shadow-[0_0_24px_rgba(6,182,212,0.18)]">
              <BrainCircuit className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-sm font-semibold tracking-tight text-zinc-100">운영자 관제판</h1>
                <Badge color="outline" size="xs">
                  읽기 전용 지휘 화면
                </Badge>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-zinc-500">
                <span className="inline-flex items-center gap-1">
                  <RefreshCw className="h-3 w-3" />
                  마지막 동기화: {formatClock(snapshot.timestamp)}
                </span>
                <span className="text-zinc-700">/</span>
                <span>스냅샷 {snapshot.id}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge color={blockedCount > 0 ? "red" : "green"} pulse={blockedCount > 0}>
              <ShieldAlert className="h-3 w-3" />
              {blockedCount}건 차단
            </Badge>
            <Badge color={approvalCount > 0 ? "yellow" : "green"}>
              <Activity className="h-3 w-3" />
              {approvalCount}건 승인
            </Badge>
            <Badge color={snapshot.memory.macBookAuthorityEnabled ? "green" : "gray"}>
              <Monitor className="h-3 w-3" />
              MacBook 권위
            </Badge>
            <Badge color={badgeColorForMirror(snapshot.memory.dgxMirrorHealth)}>
              <Server className="h-3 w-3" />
              DGX {mirrorHealthLabel(snapshot.memory.dgxMirrorHealth)}
            </Badge>
            <Badge color={totalSignals > 0 ? "yellow" : "blue"}>{totalSignals}건 신호</Badge>
          </div>
        </div>
      </header>

      <div className="relative z-[1] flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-12">
          <div className="min-w-0 lg:col-span-4">
            <WorkerFleetCard fleet={snapshot.fleet} />
          </div>

          <div className="min-w-0 space-y-4 lg:col-span-5">
            <ApprovalEvidenceCard approvals={snapshot.approvals} onPreview={onPreviewEvidence} />
            <HandoffCard handoffs={snapshot.handoffs} />
            <DispatchHistoryCard history={snapshot.dispatchHistory} />
          </div>

          <div className="min-w-0 space-y-4 md:col-span-2 lg:col-span-3">
            <ProviderRoutingCard onOpen={onOpenProviderRouting} routing={snapshot.routing} />
            <MemoryRecallCard memory={snapshot.memory} onOpen={onOpenMemory} />
            <RecoveryContinuityCard onOpen={onOpenRecovery} recovery={snapshot.recovery} />
          </div>
        </div>
      </div>
    </div>
  );
}
