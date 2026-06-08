import { BrainCircuit, Database, Route, Sparkles, Wrench } from "lucide-react";
import type { ReactNode } from "react";

export function AgentConversationMissionBrief({
  continuityDetail,
  memoryQualityLabel,
  modelLabel,
  nextPrompt,
  onApplyNextPrompt,
  onEditMemory,
  onEditPersona,
  onEditModel,
  personaAppliedLabel,
  selectedAgentName,
  toolLabels,
  workStatusLabel,
}: {
  continuityDetail: string;
  memoryQualityLabel: string;
  modelLabel: string;
  nextPrompt?: string;
  onApplyNextPrompt?: (prompt: string) => void;
  onEditMemory?: () => void;
  onEditModel?: () => void;
  onEditPersona?: () => void;
  personaAppliedLabel: string;
  selectedAgentName: string;
  toolLabels: string[];
  workStatusLabel: string;
}) {
  const visibleTools = toolLabels.length > 0 ? toolLabels : ["대화", "기억", "요약"];
  const hasContextualPrompt = Boolean(nextPrompt?.trim());
  const suggestedPrompt = nextPrompt?.trim() ?? "답변을 받은 뒤 맥락 기반 추천을 표시합니다";

  return (
    <section
      className="shrink-0 border-b border-violet-400/10 bg-[radial-gradient(circle_at_12%_0%,rgba(139,92,246,0.14),transparent_34%),linear-gradient(180deg,rgba(24,24,27,0.94),rgba(9,9,11,0.96))] px-4 py-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/40"
      data-focus-id="agent-mission-brief"
      tabIndex={-1}
    >
      <div className="mx-auto grid max-w-5xl gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div className="min-w-0 rounded-xl border border-white/10 bg-white/[0.035] p-3 shadow-[0_0_36px_rgba(139,92,246,0.08)] backdrop-blur-xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-300/25 bg-violet-400/10 px-2.5 py-1 text-[10px] font-semibold text-violet-100">
              <BrainCircuit className="h-3 w-3" />
              대화 작전 브리프
            </span>
            <span className="rounded-full border border-amber-300/20 bg-amber-400/10 px-2.5 py-1 text-[10px] text-amber-100">
              {workStatusLabel}
            </span>
          </div>
          <h2 className="mt-2 truncate text-sm font-semibold text-zinc-50">
            {selectedAgentName}와 이어서 작업합니다
          </h2>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-400">{continuityDetail}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {visibleTools.map((label) => (
              <span
                className="rounded-full border border-cyan-300/15 bg-cyan-400/10 px-2 py-0.5 text-[10px] text-cyan-100"
                key={label}
              >
                {label}
              </span>
            ))}
          </div>
        </div>

        <div className="grid min-w-0 gap-2 sm:grid-cols-2">
          <BriefFact actionLabel="모델 선택" icon={<Route className="h-3.5 w-3.5" />} label="모델" onClick={onEditModel} value={modelLabel} />
          <BriefFact actionLabel="기억 설정" icon={<Database className="h-3.5 w-3.5" />} label="기억" onClick={onEditMemory} value={memoryQualityLabel} />
          <BriefFact actionLabel="인격 수정" icon={<Sparkles className="h-3.5 w-3.5" />} label="인격" onClick={onEditPersona} value={personaAppliedLabel} />
          <BriefFact
            actionLabel={hasContextualPrompt ? "초안 적용" : "답변 후 생성"}
            icon={<Wrench className="h-3.5 w-3.5" />}
            label="다음 제안"
            onClick={hasContextualPrompt && onApplyNextPrompt ? () => onApplyNextPrompt(suggestedPrompt) : undefined}
            value={suggestedPrompt}
          />
        </div>
      </div>
    </section>
  );
}

function BriefFact({
  actionLabel,
  icon,
  label,
  onClick,
  value,
}: {
  actionLabel?: string;
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  value: string;
}) {
  const content = (
    <>
      <p className="flex items-center gap-1.5 text-[10px] font-semibold text-zinc-500">
        {icon}
        {label}
      </p>
      <p className="mt-1 truncate text-xs font-medium text-zinc-100" title={value}>
        {value}
      </p>
      {actionLabel ? (
        <span className="mt-1 inline-flex text-[9px] font-medium text-cyan-200/80">{actionLabel}</span>
      ) : null}
    </>
  );

  if (onClick) {
    return (
      <button
        className="min-w-0 rounded-lg border border-white/10 bg-zinc-950/50 px-3 py-2 text-left transition hover:border-cyan-300/30 hover:bg-cyan-400/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/40"
        onClick={onClick}
        type="button"
      >
        {content}
      </button>
    );
  }

  return (
    <div className="min-w-0 rounded-lg border border-white/10 bg-zinc-950/50 px-3 py-2">
      {content}
    </div>
  );
}
