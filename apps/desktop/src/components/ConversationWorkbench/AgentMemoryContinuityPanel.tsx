import { BrainCircuit, Database, Fingerprint, Sparkles } from "lucide-react";
import type { AgentChannelAdapterStatus } from "../../lib/agentChannelStatus";
import { createAgentChatContinuitySummary } from "../../lib/agentChatContinuity";
import type { AgentChannelMemoryScope } from "../../lib/agentConversationChannels";

export function AgentMemoryContinuityPanel({
  adapterStatus,
  agentName,
  memoryRecordCount,
  memoryScope,
  messageCount,
  personaAgentsMdApplied,
  personaSoulApplied,
  toolLabels = [],
}: {
  adapterStatus: AgentChannelAdapterStatus;
  agentName?: string;
  memoryRecordCount: number;
  memoryScope?: AgentChannelMemoryScope;
  messageCount: number;
  personaAgentsMdApplied: boolean;
  personaSoulApplied: boolean;
  toolLabels?: string[];
}) {
  const summary = createAgentChatContinuitySummary({
    adapterStatus,
    agentName,
    memoryRecordCount,
    messageCount,
    toolLabels,
  });
  const memoryLabel = memoryRecordCount > 0 ? `기억 ${memoryRecordCount}개` : summary.memoryQualityLabel;
  const scopeLabel = memoryScope ? `전용 범위 · ${shortSessionLabel(memoryScope.sessionId)}` : "전용 범위 준비 중";
  const traceLabel = memoryScope?.recallTraceId ? "recall 추적 준비됨" : "recall 추적 대기";

  return (
    <section className="rounded-lg border border-violet-300/10 bg-violet-400/[0.035] p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-violet-200/80">
            <BrainCircuit className="h-3 w-3" />
            기억 여권
          </p>
          <p className="mt-1 text-sm font-semibold text-zinc-100">{agentName ?? "선택 에이전트"} 전용 맥락</p>
          <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">{summary.detail}</p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-white/10 bg-black/30 px-2 py-1 text-[10px] font-medium text-zinc-200">
          <Database className="h-3 w-3 text-violet-200" />
          {memoryLabel}
        </span>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <MemoryContinuityBadge icon={Sparkles} label={personaSoulApplied ? "SOUL 적용" : "SOUL 대기"} tone={personaSoulApplied ? "ready" : "pending"} />
        <MemoryContinuityBadge icon={Sparkles} label={personaAgentsMdApplied ? "AGENTS 적용" : "AGENTS 대기"} tone={personaAgentsMdApplied ? "ready" : "pending"} />
        <MemoryContinuityBadge icon={Fingerprint} label={scopeLabel} tone={memoryScope ? "ready" : "pending"} />
        <MemoryContinuityBadge icon={Database} label={traceLabel} tone={memoryScope?.recallTraceId ? "ready" : "pending"} />
      </div>
    </section>
  );
}

function MemoryContinuityBadge({
  icon: Icon,
  label,
  tone,
}: {
  icon: typeof BrainCircuit;
  label: string;
  tone: "pending" | "ready";
}) {
  return (
    <span
      className={`inline-flex min-w-0 items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] ${
        tone === "ready"
          ? "border-violet-300/20 bg-violet-400/10 text-violet-100"
          : "border-zinc-700/70 bg-zinc-950/50 text-zinc-500"
      }`}
    >
      <Icon className="h-3 w-3 shrink-0" />
      <span className="truncate">{label}</span>
    </span>
  );
}

function shortSessionLabel(sessionId?: string): string {
  if (!sessionId) return "세션";
  return sessionId
    .replace(/^session_/, "")
    .replace(/^desktop_/, "desk-")
    .replace(/_/g, "-");
}
