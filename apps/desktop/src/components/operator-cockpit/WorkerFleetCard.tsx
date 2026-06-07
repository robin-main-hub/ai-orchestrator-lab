import React from "react";
import { AlertCircle, Clock3, FolderGit2, GitBranch, MessageSquare, ShieldCheck } from "lucide-react";
import type { OperatorCockpitWorkerFleet } from "@ai-orchestrator/protocol";
import { AgentPortrait } from "./AgentPortrait";
import { Badge } from "./Badge";
import { GlassPanel, GlassPanelHeader } from "./GlassPanel";
import { useAgentExpression } from "./useAgentExpression";
import { badgeColorForStatus, workerStatusLabel } from "./presentation";
import {
  resolveOperatorWorkerDisplay,
  resolveOperatorWorkerSkillDisplay,
} from "./workerDisplay";

const coreRoles = new Set(["orchestrator", "architect", "reviewer", "builder", "executor"]);

export function WorkerFleetCard({
  fleet,
  onOpenAgentConversation,
}: {
  fleet: OperatorCockpitWorkerFleet[];
  onOpenAgentConversation?: (agentId: string) => void;
}) {
  const coreFleet = fleet.filter((worker) => coreRoles.has(worker.role));
  const specialistFleet = fleet.filter((worker) => !coreRoles.has(worker.role));

  return (
    <GlassPanel variant="glow">
      <GlassPanelHeader
        action={
          <div className="flex items-center gap-2">
            {fleet.some((worker) => worker.status === "blocked" || worker.status === "error") ? (
              <Badge color="red" pulse>
                {fleet.filter((worker) => worker.status === "blocked" || worker.status === "error").length}명 차단
              </Badge>
            ) : null}
            <Badge color="outline">{fleet.length}명</Badge>
          </div>
        }
      >
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,0.55)]" />
          <h3 className="text-sm font-semibold text-zinc-100">워커 함대</h3>
        </div>
      </GlassPanelHeader>

      <div className="space-y-4 p-3">
        {coreFleet.length > 0 ? (
          <WorkerGroup label="핵심" onOpenAgentConversation={onOpenAgentConversation} workers={coreFleet} />
        ) : null}
        {specialistFleet.length > 0 ? (
          <WorkerGroup label="전문가" onOpenAgentConversation={onOpenAgentConversation} workers={specialistFleet} />
        ) : null}
      </div>
    </GlassPanel>
  );
}

function WorkerGroup({
  label,
  workers,
  onOpenAgentConversation,
}: {
  label: string;
  workers: OperatorCockpitWorkerFleet[];
  onOpenAgentConversation?: (agentId: string) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
        <span>{label}</span>
        <span className="rounded bg-zinc-800/80 px-1.5 py-0.5 text-[9px] text-zinc-500">{workers.length}</span>
      </div>
      <div className="space-y-2">
        {workers.map((worker) => (
          <WorkerRow key={worker.workerId} onOpenAgentConversation={onOpenAgentConversation} worker={worker} />
        ))}
      </div>
    </div>
  );
}

function WorkerRow({
  worker,
  onOpenAgentConversation,
}: {
  worker: OperatorCockpitWorkerFleet;
  onOpenAgentConversation?: (agentId: string) => void;
}) {
  const workerDisplay = resolveOperatorWorkerDisplay(worker);
  const skillDisplay = resolveOperatorWorkerSkillDisplay(worker.role);
  const expression = useAgentExpression({
    isActive: worker.status === "working",
    taskStatus: worker.status === "error" || worker.status === "blocked" ? "error" : worker.status === "working" ? "running" : undefined,
  });

  return (
    <div className="group rounded-lg border border-zinc-800/50 bg-zinc-900/30 p-3 transition-colors hover:border-cyan-500/30 hover:bg-zinc-900/50">
      <div className="flex items-start gap-3">
        <AgentPortrait
          active={worker.status === "working"}
          agentId={workerDisplay.portraitAgentId}
          displayName={workerDisplay.displayName}
          expression={expression}
          role={worker.role}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-semibold text-zinc-100 group-hover:text-cyan-300">{workerDisplay.displayName}</span>
            <Badge color="blue" size="xs">
              {workerDisplay.roleLabel}
            </Badge>
            <Badge color={badgeColorForStatus(worker.status)} size="xs">
              {workerStatusLabel(worker.status)}
            </Badge>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-zinc-500">
            {worker.worktree ? (
              <span className="inline-flex min-w-0 items-center gap-1">
                <FolderGit2 className="h-3 w-3 text-cyan-500/70" />
                <span className="truncate">{worker.worktree}</span>
              </span>
            ) : null}
            {worker.branch ? (
              <span className="inline-flex items-center gap-1">
                <GitBranch className="h-3 w-3 text-emerald-500/70" />
                {worker.branch}
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1">
              <Clock3 className="h-3 w-3 text-zinc-600" />
              실시간
            </span>
          </div>
          <div className="mt-2 rounded-md border border-zinc-800/70 bg-black/20 px-2.5 py-2">
            <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[10px] text-zinc-500">
              <span className="font-semibold text-zinc-300">스킬</span>
              <span>{skillDisplay.label}</span>
              <span className="rounded-full border border-zinc-700/80 px-1.5 py-0.5 text-[9px] text-zinc-400">
                {skillDisplay.boundaryLabel}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {skillDisplay.tools.map((tool) => (
                <span
                  className="rounded-full border border-cyan-400/15 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-medium text-cyan-100"
                  key={tool}
                >
                  {tool}
                </span>
              ))}
            </div>
          </div>
          {onOpenAgentConversation ? (
            <button
              aria-label={`${workerDisplay.displayName} 대화 열기`}
              className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-cyan-400/20 bg-cyan-400/10 px-2.5 py-1 text-[10px] font-semibold text-cyan-100 transition-colors hover:border-cyan-300/45 hover:bg-cyan-400/15"
              onClick={() => onOpenAgentConversation(worker.workerId)}
              type="button"
            >
              <MessageSquare className="h-3 w-3" />
              대화 열기
            </button>
          ) : null}
        </div>
        {worker.securityTier ? (
          <Badge color="green" size="xs">
            <ShieldCheck className="h-3 w-3" />
            {worker.securityTier}
          </Badge>
        ) : null}
      </div>

      {worker.blockedReason ? (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{worker.blockedReason}</span>
        </div>
      ) : null}
    </div>
  );
}
