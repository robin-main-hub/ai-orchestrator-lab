import React, { useMemo, useState } from "react";
import { AlertCircle, Brain, Clock3, FolderGit2, GitBranch, MessageSquare, Route, ShieldCheck, Sparkles } from "lucide-react";
import type {
  OperatorCockpitMemoryRecall,
  OperatorCockpitProviderRouting,
  OperatorCockpitWorkerFleet,
} from "@ai-orchestrator/protocol";
import { AgentPortrait } from "./AgentPortrait";
import { Badge } from "./Badge";
import { GlassPanel, GlassPanelHeader } from "./GlassPanel";
import { useAgentExpression } from "./useAgentExpression";
import { badgeColorForStatus, workerStatusLabel } from "./presentation";
import {
  formatOperatorWorktreeLabel,
  resolveOperatorWorkerDetailDisplay,
  resolveOperatorWorkerDisplay,
  resolveOperatorWorkerSkillDisplay,
} from "./workerDisplay";

const coreRoles = new Set(["orchestrator", "architect", "reviewer", "builder", "executor"]);

export function WorkerFleetCard({
  fleet,
  memory,
  onOpenAgentConversation,
  routing,
}: {
  fleet: OperatorCockpitWorkerFleet[];
  memory?: OperatorCockpitMemoryRecall;
  onOpenAgentConversation?: (agentId: string) => void;
  routing?: OperatorCockpitProviderRouting;
}) {
  const [selectedWorkerId, setSelectedWorkerId] = useState(fleet[0]?.workerId ?? "");
  const coreFleet = fleet.filter((worker) => coreRoles.has(worker.role));
  const specialistFleet = fleet.filter((worker) => !coreRoles.has(worker.role));
  const selectedWorker = useMemo(
    () => fleet.find((worker) => worker.workerId === selectedWorkerId) ?? fleet[0],
    [fleet, selectedWorkerId],
  );

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
          <span className="h-2 w-2 rounded-full bg-primary shadow-[0_0_14px_var(--accent-dim)]" />
          <h3 className="text-sm font-semibold text-foreground">워커 함대</h3>
        </div>
      </GlassPanelHeader>

      <div className="space-y-4 p-3">
        {coreFleet.length > 0 ? (
          <WorkerGroup
            label="핵심"
            onOpenAgentConversation={onOpenAgentConversation}
            onSelectWorker={setSelectedWorkerId}
            selectedWorkerId={selectedWorker?.workerId}
            workers={coreFleet}
          />
        ) : null}
        {specialistFleet.length > 0 ? (
          <WorkerGroup
            label="전문가"
            onOpenAgentConversation={onOpenAgentConversation}
            onSelectWorker={setSelectedWorkerId}
            selectedWorkerId={selectedWorker?.workerId}
            workers={specialistFleet}
          />
        ) : null}
        {selectedWorker ? (
          <SelectedWorkerDetail memory={memory} routing={routing} worker={selectedWorker} />
        ) : null}
      </div>
    </GlassPanel>
  );
}

function WorkerGroup({
  label,
  workers,
  onOpenAgentConversation,
  onSelectWorker,
  selectedWorkerId,
}: {
  label: string;
  workers: OperatorCockpitWorkerFleet[];
  onOpenAgentConversation?: (agentId: string) => void;
  onSelectWorker: (workerId: string) => void;
  selectedWorkerId?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <span>{label}</span>
        <span className="rounded bg-muted/80 px-1.5 py-0.5 text-[9px] text-muted-foreground">{workers.length}</span>
      </div>
      <div className="space-y-2">
        {workers.map((worker) => (
          <WorkerRow
            isSelected={worker.workerId === selectedWorkerId}
            key={worker.workerId}
            onOpenAgentConversation={onOpenAgentConversation}
            onSelectWorker={onSelectWorker}
            worker={worker}
          />
        ))}
      </div>
    </div>
  );
}

function WorkerRow({
  worker,
  onOpenAgentConversation,
  onSelectWorker,
  isSelected,
}: {
  worker: OperatorCockpitWorkerFleet;
  onOpenAgentConversation?: (agentId: string) => void;
  onSelectWorker: (workerId: string) => void;
  isSelected: boolean;
}) {
  const workerDisplay = resolveOperatorWorkerDisplay(worker);
  const skillDisplay = resolveOperatorWorkerSkillDisplay(worker.role);
  const expression = useAgentExpression({
    isActive: worker.status === "working",
    taskStatus: worker.status === "error" || worker.status === "blocked" ? "error" : worker.status === "working" ? "running" : undefined,
  });

  return (
    <div
      className={`group rounded-lg border bg-muted/30 p-3 transition-colors hover:border-primary/30 hover:bg-muted/50 ${
        isSelected ? "border-primary/35 shadow-[0_0_22px_var(--accent-dim)]" : "border-border"
      }`}
    >
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
            <span className="truncate text-sm font-semibold text-foreground group-hover:text-primary">{workerDisplay.displayName}</span>
            <Badge color="blue" size="xs">
              {workerDisplay.roleLabel}
            </Badge>
            <Badge color={badgeColorForStatus(worker.status)} size="xs">
              {workerStatusLabel(worker.status)}
            </Badge>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
            {worker.worktree ? (
              <span className="inline-flex min-w-0 items-center gap-1">
                <FolderGit2 className="h-3 w-3 text-primary/70" />
                <span className="truncate">{formatOperatorWorktreeLabel(worker.worktree)}</span>
              </span>
            ) : null}
            {worker.branch ? (
              <span className="inline-flex items-center gap-1">
                <GitBranch className="h-3 w-3 text-primary/70" />
                {worker.branch}
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1">
              <Clock3 className="h-3 w-3 text-muted-foreground" />
              실시간
            </span>
          </div>
          <div className="mt-2 rounded-md border border-border bg-muted/40 px-2.5 py-2">
            <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
              <span className="font-semibold text-muted-foreground">스킬</span>
              <span>{skillDisplay.label}</span>
              <span className="rounded-full border border-border px-1.5 py-0.5 text-[9px] text-muted-foreground">
                {skillDisplay.boundaryLabel}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {skillDisplay.tools.map((tool) => (
                <span
                  className="rounded-full border border-primary/15 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"
                  key={tool}
                >
                  {tool}
                </span>
              ))}
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button
              aria-label={`${workerDisplay.displayName} 상세 보기`}
              aria-pressed={isSelected}
              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[10px] font-semibold transition-colors ${
                isSelected
                  ? "border-primary/45 bg-primary/15 text-primary"
                  : "border-border bg-muted/40 text-foreground hover:border-primary/35 hover:text-primary"
              }`}
              onClick={() => onSelectWorker(worker.workerId)}
              type="button"
            >
              <Sparkles className="h-3 w-3" />
              {isSelected ? "선택됨" : "상세"}
            </button>
            {onOpenAgentConversation ? (
              <button
                aria-label={`${workerDisplay.displayName} 대화 열기`}
                className="inline-flex items-center gap-1.5 rounded-md border border-primary/20 bg-primary/10 px-2.5 py-1 text-[10px] font-semibold text-primary transition-colors hover:border-primary/45 hover:bg-primary/15"
                onClick={() => onOpenAgentConversation(worker.workerId)}
                type="button"
              >
                <MessageSquare className="h-3 w-3" />
                대화 열기
              </button>
            ) : null}
          </div>
        </div>
        {worker.securityTier ? (
          <Badge color="green" size="xs">
            <ShieldCheck className="h-3 w-3" />
            {worker.securityTier}
          </Badge>
        ) : null}
      </div>

      {worker.blockedReason ? (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{worker.blockedReason}</span>
        </div>
      ) : null}
    </div>
  );
}

function SelectedWorkerDetail({
  memory,
  routing,
  worker,
}: {
  memory?: OperatorCockpitMemoryRecall;
  routing?: OperatorCockpitProviderRouting;
  worker: OperatorCockpitWorkerFleet;
}) {
  const detail = resolveOperatorWorkerDetailDisplay({ memory, routing, worker });

  return (
    <section className="rounded-lg border border-primary/15 bg-primary/[0.035] p-3">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-primary/80">선택 워커 상세</p>
          <h4 className="mt-1 break-words text-sm font-semibold text-foreground">{detail.identity.displayName}</h4>
        </div>
        <Badge color={badgeColorForStatus(worker.status)} size="xs">
          최근 상태 · {detail.recent.statusLabel}
        </Badge>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <DetailTile
          icon={<Sparkles className="h-3.5 w-3.5" />}
          label="작업 우선순위"
          value={detail.roleBrief}
        />
        <DetailTile
          icon={<ShieldCheck className="h-3.5 w-3.5" />}
          label="스킬 묶음"
          value={`${detail.skills.label} · ${detail.skills.boundaryLabel}`}
        />
        <DetailTile
          icon={<Brain className="h-3.5 w-3.5" />}
          label="관제 기억"
          value={detail.memory.primary}
        />
        <DetailTile
          icon={<Route className="h-3.5 w-3.5" />}
          label="현재 대화 모델"
          value={detail.model.routeLabel}
        />
        <DetailTile
          icon={<Clock3 className="h-3.5 w-3.5" />}
          label="최근 상태"
          value={`${detail.recent.statusLabel} · ${detail.recent.detail}`}
        />
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {detail.skills.tools.map((tool) => (
          <span
            className="rounded-full border border-primary/15 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"
            key={tool}
          >
            {tool}
          </span>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Badge color={detail.memory.warningLabel === "정상" ? "green" : "yellow"} size="xs">
          {detail.memory.detail}
        </Badge>
        {detail.memory.reasons.map((reason) => (
          <span
            className="rounded-full border border-border bg-muted/45 px-2 py-0.5 text-[10px] text-muted-foreground"
            key={reason}
          >
            {reason}
          </span>
        ))}
        {detail.model.badges.map((badge) => (
          <Badge color="purple" key={badge} size="xs">
            {badge}
          </Badge>
        ))}
      </div>
    </section>
  );
}

function DetailTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-border bg-muted/45 px-2.5 py-2">
      <p className="flex items-center gap-1.5 text-[9px] font-medium text-muted-foreground">
        <span className="text-primary/70">{icon}</span>
        {label}
      </p>
      <p className="mt-1 break-words text-[11px] font-semibold leading-5 text-foreground" title={value}>
        {value}
      </p>
    </div>
  );
}
