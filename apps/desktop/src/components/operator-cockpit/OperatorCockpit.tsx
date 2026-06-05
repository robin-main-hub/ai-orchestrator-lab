import React from "react";
import { Activity, BrainCircuit, Monitor, RefreshCw, Server, ShieldAlert } from "lucide-react";
import { mockSnapshot } from "./fixtures/mockSnapshot";
import { ApprovalEvidenceCard } from "./ApprovalEvidenceCard";
import { Badge } from "./Badge";
import { DispatchHistoryCard } from "./DispatchHistoryCard";
import { HandoffCard } from "./HandoffCard";
import { MemoryRecallCard } from "./MemoryRecallCard";
import { ProviderRoutingCard } from "./ProviderRoutingCard";
import { RecoveryContinuityCard } from "./RecoveryContinuityCard";
import { WorkerFleetCard } from "./WorkerFleetCard";
import { badgeColorForMirror, formatClock } from "./presentation";

export function OperatorCockpit() {
  const snapshot = mockSnapshot;
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
      aria-label="Operator Cockpit read-only command view"
      className="relative flex h-full min-h-0 flex-col overflow-hidden bg-zinc-950 text-zinc-100"
      data-focus-id="cockpit-container"
      tabIndex={-1}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(6,182,212,0.12),transparent_32%),radial-gradient(circle_at_82%_8%,rgba(139,92,246,0.10),transparent_34%),linear-gradient(180deg,rgba(24,24,27,0.56),rgba(9,9,11,0.96))]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.018] [background-image:linear-gradient(to_right,#fff_1px,transparent_1px),linear-gradient(to_bottom,#fff_1px,transparent_1px)] [background-size:32px_32px]"
      />

      <header className="sticky top-0 z-10 border-b border-zinc-800/60 bg-zinc-950/80 px-4 py-3 backdrop-blur-xl">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-300 shadow-[0_0_24px_rgba(6,182,212,0.18)]">
              <BrainCircuit className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-sm font-semibold tracking-tight text-zinc-100">Operator Cockpit</h1>
                <Badge color="outline" size="xs">
                  Read-only Command View
                </Badge>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-zinc-500">
                <span className="inline-flex items-center gap-1">
                  <RefreshCw className="h-3 w-3" />
                  Last sync: {formatClock(snapshot.timestamp)}
                </span>
                <span className="text-zinc-700">/</span>
                <span>snapshot {snapshot.id}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge color={blockedCount > 0 ? "red" : "green"} pulse={blockedCount > 0}>
              <ShieldAlert className="h-3 w-3" />
              {blockedCount} blocked
            </Badge>
            <Badge color={approvalCount > 0 ? "yellow" : "green"}>
              <Activity className="h-3 w-3" />
              {approvalCount} approvals
            </Badge>
            <Badge color={snapshot.memory.macBookAuthorityEnabled ? "green" : "gray"}>
              <Monitor className="h-3 w-3" />
              MacBook authority
            </Badge>
            <Badge color={badgeColorForMirror(snapshot.memory.dgxMirrorHealth)}>
              <Server className="h-3 w-3" />
              DGX {snapshot.memory.dgxMirrorHealth}
            </Badge>
            <Badge color={totalSignals > 0 ? "yellow" : "blue"}>{totalSignals} signals</Badge>
          </div>
        </div>
      </header>

      <div className="relative z-[1] flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-12">
          <div className="min-w-0 lg:col-span-4">
            <WorkerFleetCard fleet={snapshot.fleet} />
          </div>

          <div className="min-w-0 space-y-4 lg:col-span-5">
            <ApprovalEvidenceCard approvals={snapshot.approvals} />
            <HandoffCard handoffs={snapshot.handoffs} />
            <DispatchHistoryCard history={snapshot.dispatchHistory} />
          </div>

          <div className="min-w-0 space-y-4 md:col-span-2 lg:col-span-3">
            <ProviderRoutingCard routing={snapshot.routing} />
            <MemoryRecallCard memory={snapshot.memory} />
            <RecoveryContinuityCard recovery={snapshot.recovery} />
          </div>
        </div>
      </div>
    </div>
  );
}
