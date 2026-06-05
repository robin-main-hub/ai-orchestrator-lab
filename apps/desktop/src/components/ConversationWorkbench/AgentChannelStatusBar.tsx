import type { ReactNode } from "react";
import { Brain, ListChecks, MessageSquareText, RadioTower } from "lucide-react";
import type { AgentChannelMemoryScope } from "../../lib/agentConversationChannels";
import {
  createAgentChannelStatus,
  type AgentChannelAdapterStatus,
} from "../../lib/agentChannelStatus";
import type { ControlQueueContinuitySummary } from "../../lib/controlQueueContinuity";
import type { WorkbenchAgent } from "../../types";

export function AgentChannelStatusBar({
  adapterStatus,
  controlQueueContinuity,
  memoryRecordCount,
  memoryScope,
  messageCount,
  selectedAgent,
}: {
  adapterStatus: AgentChannelAdapterStatus;
  controlQueueContinuity?: ControlQueueContinuitySummary;
  memoryRecordCount: number;
  memoryScope?: AgentChannelMemoryScope;
  messageCount: number;
  selectedAgent?: WorkbenchAgent;
}) {
  const status = createAgentChannelStatus({
    agentName: selectedAgent?.name,
    adapterStatus,
    memoryRecordCount,
    messageCount,
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
        {memoryScope ? (
          <span className="hidden rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[10px] text-zinc-500 lg:inline-flex">
            범위: 에이전트·세션·모델별 기억
          </span>
        ) : null}
      </div>
    </div>
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
