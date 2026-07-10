import { BrainCircuit, MessageCircle, Route, Sparkles, UserRoundCog, Wrench } from "lucide-react";
import { Button } from "@/ui/button";

export function AgentHermesControlCard({
  continuityDetail,
  displayName,
  memoryQualityLabel,
  modelLabel,
  learnedSkillLabels = [],
  nextPrompt,
  onApplyNextPrompt,
  onEditAgents,
  onEditMemory,
  onEditModel,
  onEditSoul,
  onFocusChat,
  onViewSkills,
  personaAgentsMdApplied,
  personaSoulApplied,
  toolBoundaryLabel,
  toolGroupLabel,
  toolLabels,
  workStatusLabel,
}: {
  continuityDetail: string;
  displayName: string;
  learnedSkillLabels?: string[];
  memoryQualityLabel: string;
  modelLabel: string;
  nextPrompt?: string;
  onApplyNextPrompt?: (prompt: string) => void;
  onEditAgents?: () => void;
  onEditMemory?: () => void;
  onEditModel?: () => void;
  onEditSoul?: () => void;
  onFocusChat?: () => void;
  onViewSkills?: () => void;
  personaAgentsMdApplied: boolean;
  personaSoulApplied: boolean;
  toolBoundaryLabel: string;
  toolGroupLabel: string;
  toolLabels: string[];
  workStatusLabel: string;
}) {
  const hasPrompt = Boolean(nextPrompt?.trim());
  const visibleTools = toolLabels.length > 0 ? toolLabels : ["대화", "기억", "인계"];
  const visibleLearnedSkills = learnedSkillLabels.map((label) => label.trim()).filter(Boolean).slice(0, 3);
  const learnedSkillCount = learnedSkillLabels.filter((label) => label.trim()).length;
  const learnedSkillSummary =
    learnedSkillCount > 0
      ? `${visibleLearnedSkills[0]}${learnedSkillCount > 1 ? ` 외 ${learnedSkillCount - 1}개` : ""}`
      : "스킬 습득 대기";
  const soulLabel = personaSoulApplied ? "SOUL 적용" : "SOUL 설정 필요";
  const agentsLabel = personaAgentsMdApplied ? "AGENTS 적용" : "AGENTS 설정 필요";

  return (
    <section
      className="shrink-0 border-b border-primary/10 bg-[radial-gradient(circle_at_15%_0%,var(--accent-dim),transparent_32%),linear-gradient(180deg,rgba(24,24,27,0.94),rgba(9,9,11,0.97))] px-4 py-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      data-focus-id="agent-hermes-control-card"
      tabIndex={-1}
    >
      <div className="mx-auto grid max-w-5xl gap-3 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div className="min-w-0 rounded-xl border border-white/10 bg-white/[0.035] p-3 shadow-[0_0_32px_var(--accent-dim)] backdrop-blur-xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-[10px] font-semibold text-primary">
              <UserRoundCog className="h-3 w-3" />
              Hermes 에이전트
            </span>
            <span className="rounded-full border border-warning/20 bg-warning/10 px-2.5 py-1 text-[10px] text-warning">
              {workStatusLabel}
            </span>
          </div>
          <h2 className="mt-2 truncate text-sm font-semibold text-foreground">{displayName} 운영 카드</h2>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{continuityDetail}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <HermesPill label={toolGroupLabel} tone="primary" />
            <HermesPill label={toolBoundaryLabel} tone="warning" />
            <HermesPill label={memoryQualityLabel} tone="primary" />
            <HermesPill
              label={learnedSkillCount > 0 ? `학습 스킬 ${learnedSkillCount}개` : "학습 스킬 대기"}
              tone={learnedSkillCount > 0 ? "primary" : "neutral"}
            />
            {visibleTools.map((label) => (
              <HermesPill key={label} label={label} tone="neutral" />
            ))}
          </div>
          <div className="mt-3 rounded-lg border border-primary/15 bg-primary/[0.045] px-2.5 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-primary/80">습득한 스킬</p>
            <p className="mt-1 truncate text-xs font-medium text-foreground" title={learnedSkillSummary}>
              {learnedSkillSummary}
            </p>
          </div>
        </div>

        <div className="grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          <HermesAction icon={MessageCircle} label="대화방" onClick={onFocusChat} value={`${displayName}와 이어서 대화`} />
          <HermesAction icon={Route} label="모델" onClick={onEditModel} value={modelLabel} />
          <HermesAction icon={BrainCircuit} label="기억" onClick={onEditMemory} value={memoryQualityLabel} />
          <HermesAction icon={Wrench} label="스킬" onClick={onViewSkills} value={`${toolGroupLabel} · 습득 ${learnedSkillCount}개`} />
          <HermesAction icon={Sparkles} label="SOUL" onClick={onEditSoul} value={soulLabel} />
          <HermesAction icon={Sparkles} label="AGENTS" onClick={onEditAgents} value={agentsLabel} />
        </div>

        <div className="xl:col-span-2 rounded-xl border border-white/10 bg-black/25 p-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">다음 대화 제안</p>
              <p className="mt-1 text-sm leading-5 text-foreground">
                {hasPrompt ? nextPrompt : "답변을 받은 뒤 이 에이전트 방의 맥락에 맞춰 추천합니다."}
              </p>
            </div>
            <Button
              className="shrink-0 rounded-full border-primary/20 bg-primary/10 text-xs text-primary hover:bg-primary/20"
              disabled={!hasPrompt || !onApplyNextPrompt}
              onClick={hasPrompt && onApplyNextPrompt ? () => onApplyNextPrompt(nextPrompt!.trim()) : undefined}
              size="sm"
              variant="outline"
            >
              {hasPrompt ? "초안 적용" : "답변 후 생성"}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function HermesAction({
  icon: Icon,
  label,
  onClick,
  value,
}: {
  icon: typeof MessageCircle;
  label: string;
  onClick?: () => void;
  value: string;
}) {
  const content = (
    <>
      <p className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground">
        <Icon className="h-3.5 w-3.5 text-primary/75" />
        {label}
      </p>
      <p className="mt-1 truncate text-xs font-medium text-foreground" title={value}>
        {value}
      </p>
      <span className="mt-1 inline-flex text-[9px] font-medium text-primary/75">열기</span>
    </>
  );

  if (!onClick) {
    return <div className="min-w-0 rounded-lg border border-white/10 bg-surface/50 px-3 py-2">{content}</div>;
  }

  return (
    <button
      className="min-w-0 rounded-lg border border-white/10 bg-surface/50 px-3 py-2 text-left transition hover:border-primary/30 hover:bg-primary/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      onClick={onClick}
      type="button"
    >
      {content}
    </button>
  );
}

function HermesPill({ label, tone }: { label: string; tone: "neutral" | "primary" | "warning" }) {
  const className = {
    neutral: "border-white/10 bg-white/[0.04] text-muted-foreground",
    primary: "border-primary/20 bg-primary/10 text-primary",
    warning: "border-warning/20 bg-warning/10 text-warning",
  }[tone];

  return <span className={`rounded-full border px-2 py-0.5 text-[10px] ${className}`}>{label}</span>;
}
