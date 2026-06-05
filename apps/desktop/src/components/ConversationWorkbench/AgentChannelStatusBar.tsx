import type { ReactNode } from "react";
import { Brain, ListChecks, MessageSquareText, RadioTower } from "lucide-react";
import type { AgentChannelMemoryScope } from "../../lib/agentConversationChannels";
import {
  createAgentChannelDetailChips,
  createAgentChannelStatus,
  type AgentChannelAdapterStatus,
} from "../../lib/agentChannelStatus";
import {
  createAgentConversationReadiness,
  type AgentConversationReadinessTone,
} from "../../lib/agentConversationReadiness";
import type { ControlQueueContinuitySummary } from "../../lib/controlQueueContinuity";
import { getAgentToolBadgeLabels } from "../../lib/agentToolProfiles";
import { agentRoleLabel } from "../../lib/helpers";
import type { WorkbenchAgent } from "../../types";

export function AgentChannelStatusBar({
  adapterStatus,
  agentToolRuntimeLabel,
  controlQueueContinuity,
  memoryGovernanceLabel,
  memoryRecordCount,
  memoryScope,
  messageCount,
  modelId,
  providerProfileId,
  selectedAgent,
}: {
  adapterStatus: AgentChannelAdapterStatus;
  agentToolRuntimeLabel?: string;
  controlQueueContinuity?: ControlQueueContinuitySummary;
  memoryGovernanceLabel?: string;
  memoryRecordCount: number;
  memoryScope?: AgentChannelMemoryScope;
  messageCount: number;
  modelId?: string;
  providerProfileId?: string;
  selectedAgent?: WorkbenchAgent;
}) {
  const status = createAgentChannelStatus({
    agentName: selectedAgent?.name,
    roleLabel: selectedAgent ? agentRoleLabel(selectedAgent.role) : undefined,
    adapterStatus,
    memoryRecordCount,
    messageCount,
  });
  const detailChips = createAgentChannelDetailChips({
    memoryScope,
    modelId,
    providerProfileId,
    toolLabels: selectedAgent ? getAgentToolBadgeLabels(selectedAgent.role) : [],
  });
  const readiness = createAgentConversationReadiness({
    adapterStatus,
    agentId: selectedAgent?.id,
    memoryRecordCount,
    messageCount,
    toolCount: selectedAgent ? getAgentToolBadgeLabels(selectedAgent.role).length : 0,
  });

  return (
    <div className="border-b border-white/10 bg-zinc-950/80 px-4 py-2">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-2 text-[11px] text-zinc-400">
        <StatusPill tone={status.tone}>
          <RadioTower className="h-3.5 w-3.5" />
          <span className="font-semibold text-zinc-200">{status.title}</span>
        </StatusPill>
        <StatusPill>
          <MessageSquareText className="h-3.5 w-3.5" />
          <span>{status.continuityLabel}</span>
        </StatusPill>
        <StatusPill tone={status.tone}>
          <Brain className="h-3.5 w-3.5" />
          <span>{status.memoryLabel}</span>
        </StatusPill>
        {memoryGovernanceLabel ? (
          <StatusPill tone={status.tone}>
            <span>{memoryGovernanceLabel}</span>
          </StatusPill>
        ) : null}
        {agentToolRuntimeLabel ? (
          <StatusPill tone="ready">
            <span>{agentToolRuntimeLabel}</span>
          </StatusPill>
        ) : null}
        <ReadinessPill tone={readiness.tone}>
          <span className="font-semibold text-zinc-300">운영 준비</span>
          <span>{readiness.label}</span>
          {readiness.checks.length > 0 ? (
            <span className="hidden max-w-[260px] truncate text-zinc-400 xl:inline">
              {readiness.checks.join(" · ")}
            </span>
          ) : null}
        </ReadinessPill>
        {controlQueueContinuity?.hasItems ? (
          <StatusPill tone={controlQueueContinuity.tone}>
            <ListChecks className="h-3.5 w-3.5" />
            <span>{controlQueueContinuity.label}</span>
            {controlQueueContinuity.latestTitle ? (
              <span className="hidden max-w-[220px] truncate text-zinc-300 lg:inline">
                {controlQueueContinuity.latestTitle}
              </span>
            ) : null}
          </StatusPill>
        ) : null}
        {detailChips.map((chip) => (
          <StatusPill key={`${chip.label}:${chip.value}`} tone={chip.tone}>
            <span className="font-semibold text-zinc-300">{chip.label}</span>
            <span className="hidden max-w-[260px] truncate text-zinc-500 lg:inline">
              {chip.value}
            </span>
          </StatusPill>
        ))}
      </div>
    </div>
  );
}

function ReadinessPill({
  children,
  tone,
}: {
  children: ReactNode;
  tone: AgentConversationReadinessTone;
}) {
  const toneClass =
    tone === "attention"
      ? "border-rose-400/25 bg-rose-500/10 text-rose-200"
      : tone === "warming"
        ? "border-amber-300/25 bg-amber-400/10 text-amber-100"
        : "border-violet-300/20 bg-violet-400/10 text-violet-100";

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${toneClass}`}>
      {children}
    </span>
  );
}

function StatusPill({
  children,
  tone = "ready",
}: {
  children: ReactNode;
  tone?: AgentChannelAdapterStatus;
}) {
  const toneClass =
    tone === "error"
      ? "border-rose-400/25 bg-rose-500/10 text-rose-200"
      : tone === "loading"
        ? "border-amber-300/25 bg-amber-400/10 text-amber-100"
        : "border-cyan-300/20 bg-cyan-400/10 text-cyan-100";

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${toneClass}`}>
      {children}
    </span>
  );
}
