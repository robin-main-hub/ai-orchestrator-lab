import { BrainCircuit, Database, MessageCircle, Sparkles, Wrench } from "lucide-react";
import type { AgentChannelAdapterStatus } from "../../lib/agentChannelStatus";
import { createAgentChatContinuitySummary } from "../../lib/agentChatContinuity";
import type { AgentChannelMemoryScope } from "../../lib/agentConversationChannels";

export function AgentMemoryContinuityPanel({
  adapterStatus,
  agentName,
  memoryRecordCount,
  memoryScope,
  messageCount,
  onEditAgents,
  onEditMemory,
  onEditSoul,
  onViewTools,
  personaAgentsMdApplied,
  personaSoulApplied,
  toolLabels = [],
}: {
  adapterStatus: AgentChannelAdapterStatus;
  agentName?: string;
  memoryRecordCount: number;
  memoryScope?: AgentChannelMemoryScope;
  messageCount: number;
  onEditAgents?: () => void;
  onEditMemory?: () => void;
  onEditSoul?: () => void;
  onViewTools?: () => void;
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
  const scopeLabel = memoryScope ? `${memoryScope.roomLabel ?? "이 대화방"} 기억 사용` : "전용 기억 준비 중";
  const traceLabel = memoryScope?.recallTraceId ? "조회 흔적 남길 준비됨" : "조회 흔적 대기";
  const conversationLabel = messageCount > 0 ? `${messageCount}개 대화 단서` : "첫 말부터 따로 기록";
  const toolCueLabel =
    toolLabels.length > 0
      ? `${toolLabels.slice(0, 2).join(", ")} 참고`
      : "도구 단서 대기";

  return (
    <section className="rounded-lg border border-primary/10 bg-primary/[0.035] p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-primary/80">
            <BrainCircuit className="h-3 w-3" />
            함께 기억하는 것
          </p>
          <p className="mt-1 text-sm font-semibold text-foreground">{agentName ?? "선택 에이전트"}가 이어받는 맥락</p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            {summary.detail}. 필요한 단서만 답변에 반영하고, 기억 원문은 이 카드에 그대로 드러내지 않습니다.
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-white/10 bg-black/30 px-2 py-1 text-[10px] font-medium text-foreground">
          <Database className="h-3 w-3 text-primary" />
          {memoryLabel}
        </span>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <MemoryContinuityBadge
          detail={personaSoulApplied ? "말투와 성격 단서 적용" : "말투 단서 대기"}
          icon={Sparkles}
          label={personaSoulApplied ? "SOUL 적용" : "SOUL 대기"}
          onClick={onEditSoul}
          actionLabel="SOUL 수정"
          tone={personaSoulApplied ? "ready" : "pending"}
        />
        <MemoryContinuityBadge
          detail={personaAgentsMdApplied ? "작업 규칙을 같이 봄" : "작업 규칙 대기"}
          icon={Sparkles}
          label={personaAgentsMdApplied ? "AGENTS 적용" : "AGENTS 대기"}
          onClick={onEditAgents}
          actionLabel="AGENTS 수정"
          tone={personaAgentsMdApplied ? "ready" : "pending"}
        />
        <MemoryContinuityBadge
          detail={conversationLabel}
          icon={MessageCircle}
          label={scopeLabel}
          onClick={onEditMemory}
          actionLabel="기억 주입"
          tone={memoryScope ? "ready" : "pending"}
        />
        <MemoryContinuityBadge
          detail={toolCueLabel}
          icon={Wrench}
          label={traceLabel}
          onClick={onViewTools}
          actionLabel="도구 보기"
          tone={memoryScope?.recallTraceId ? "ready" : "pending"}
        />
      </div>
    </section>
  );
}

function MemoryContinuityBadge({
  actionLabel,
  detail,
  icon: Icon,
  label,
  onClick,
  tone,
}: {
  actionLabel?: string;
  detail: string;
  icon: typeof BrainCircuit;
  label: string;
  onClick?: () => void;
  tone: "pending" | "ready";
}) {
  const content = (
    <>
      <Icon className="mt-0.5 h-3 w-3 shrink-0" />
      <span className="min-w-0">
        <span className="block truncate font-medium">{label}</span>
        <span className="block truncate opacity-70">{detail}</span>
        {actionLabel ? <span className="block text-[9px] text-primary/80">{actionLabel}</span> : null}
      </span>
    </>
  );

  const className = `inline-flex min-w-0 items-start gap-1.5 rounded-md border px-2 py-1.5 text-left text-[10px] ${
    tone === "ready"
      ? "border-primary/20 bg-primary/10 text-primary"
      : "border-border bg-surface/50 text-muted-foreground"
  }`;

  if (onClick) {
    return (
      <button
        className={`${className} transition hover:border-primary/35 hover:bg-primary/[0.07] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40`}
        onClick={onClick}
        type="button"
      >
        {content}
      </button>
    );
  }

  return (
    <span className={className}>{content}</span>
  );
}
