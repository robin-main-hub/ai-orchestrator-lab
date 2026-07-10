import type { AgentRole } from "@ai-orchestrator/protocol";
import { FileText, Handshake, ShieldCheck, Sparkles, Wrench } from "lucide-react";
import type { AgentConfigFile } from "../../types";
import {
  getAgentToolBadgeLabels,
  getAgentToolCollaborationProfile,
  getAgentToolProfileSummary,
} from "../../lib/agentToolProfiles";

export function AgentSkillProfilePanel({
  displayName,
  onOpenConfig,
  onViewToolOptions,
  role,
  runtimeConfigFiles = [],
}: {
  displayName?: string;
  onOpenConfig?: () => void;
  /** 도구 칩 클릭 — 해당 도구의 권한·경계가 정의된 AGENTS.md 설정을 연다 */
  onViewToolOptions?: (toolLabel: string) => void;
  role: AgentRole;
  runtimeConfigFiles?: AgentConfigFile[];
}) {
  const summary = getAgentToolProfileSummary(role);
  const collaboration = getAgentToolCollaborationProfile(role);
  const tools = getAgentToolBadgeLabels(role);
  const agentLabel = displayName ?? "이 동료";
  const visibleRuntimeFiles = runtimeConfigFiles.slice(0, 4);
  const hiddenRuntimeFileCount = Math.max(runtimeConfigFiles.length - visibleRuntimeFiles.length, 0);

  return (
    <section
      className="rounded-lg border border-primary/10 bg-primary/[0.04] p-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      data-focus-id="agent-skill-profile-panel"
      tabIndex={-1}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-primary/80">
            <Wrench className="h-3 w-3" />
            협업 스킬/도구
          </p>
          <p className="mt-1 text-sm font-semibold text-foreground">{agentLabel}가 맡기 좋은 일</p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{collaboration.headline}</p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-warning/20 bg-warning/10 px-2 py-1 text-[10px] font-medium text-warning">
          <ShieldCheck className="h-3 w-3" />
          {summary.runtime.boundaryLabel}
        </span>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <SkillCue icon={Sparkles} label="먼저 보는 것" value={collaboration.focusLabel} />
        <SkillCue icon={Handshake} label="넘겨주는 것" value={collaboration.handoffLabel} />
        <SkillCue icon={Wrench} label="호흡" value={collaboration.rhythmLabel} />
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <SkillOptionButton active label={summary.label} onClick={() => onViewToolOptions?.(summary.label)} />
        {tools.map((tool) => (
          <SkillOptionButton key={tool} label={tool} onClick={() => onViewToolOptions?.(tool)} />
        ))}
      </div>
      <RuntimeConfigList files={visibleRuntimeFiles} hiddenCount={hiddenRuntimeFileCount} onOpenConfig={onOpenConfig} />
      <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
        실제 호출은 목적과 권한을 먼저 맞춘 뒤 진행하고, 대화에는 확인 가능한 작업 흔적만 남깁니다.
      </p>
    </section>
  );
}

function RuntimeConfigList({
  files,
  hiddenCount,
  onOpenConfig,
}: {
  files: AgentConfigFile[];
  hiddenCount: number;
  onOpenConfig?: () => void;
}) {
  if (files.length === 0) {
    return (
      <div className="mt-3 rounded-md border border-border bg-surface/45 px-2.5 py-2">
        <p className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground">
          <FileText className="h-3 w-3 text-muted-foreground" />
          실제 적용 지침
        </p>
        <div className="mt-1 flex items-center justify-between gap-2">
          <p className="text-[10px] text-muted-foreground">연결된 SOUL/AGENTS/스킬 파일이 없습니다.</p>
          {onOpenConfig ? (
            <button className="text-[10px] font-medium text-primary hover:text-primary" onClick={onOpenConfig} type="button">
              연결
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-md border border-primary/15 bg-primary/[0.045] px-2.5 py-2">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[10px] font-semibold text-primary">
          <FileText className="h-3 w-3 text-primary/80" />
          실제 적용 지침
        </p>
        {hiddenCount > 0 ? (
          <span className="rounded-full border border-primary/15 bg-primary/10 px-1.5 py-0.5 text-[9px] text-primary">
            +{hiddenCount}
          </span>
        ) : null}
        {onOpenConfig ? (
          <button className="rounded-full border border-primary/20 px-1.5 py-0.5 text-[9px] text-primary" onClick={onOpenConfig} type="button">
            편집
          </button>
        ) : null}
      </div>
      <div className="mt-2 space-y-1.5">
        {files.map((file) => (
          <div className="min-w-0 rounded-md border border-white/10 bg-surface/45 px-2 py-1.5" key={file.id}>
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="rounded-full border border-border bg-surface/80 px-1.5 py-0.5 text-[8px] uppercase tracking-wide text-muted-foreground">
                {configKindLabel(file.kind)}
              </span>
              <p className="truncate text-[10px] font-semibold text-foreground" title={file.label}>
                {file.label}
              </p>
            </div>
            <p className="mt-1 truncate font-mono text-[9px] text-muted-foreground" title={file.path}>
              {file.path}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function SkillOptionButton({
  active = false,
  label,
  onClick,
}: {
  active?: boolean;
  label: string;
  onClick?: () => void;
}) {
  const className = `rounded-full border px-2 py-0.5 text-[10px] font-medium transition ${
    active
      ? "border-primary/20 bg-primary/10 text-primary"
      : "border-border bg-surface/60 text-foreground"
  }`;

  if (!onClick) return <span className={className}>{label}</span>;

  return (
    <button
      className={`${className} hover:border-primary/35 hover:bg-primary/[0.07] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40`}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function configKindLabel(kind: AgentConfigFile["kind"]) {
  const labels: Record<AgentConfigFile["kind"], string> = {
    agents: "AGENTS",
    memory_policy: "기억",
    prompt_template: "프롬프트",
    skill: "스킬",
    soul: "SOUL",
  };
  return labels[kind];
}

function SkillCue({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Wrench;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-md border border-white/10 bg-surface/50 px-2 py-1.5">
      <p className="flex items-center gap-1 text-[9px] font-medium text-muted-foreground">
        <Icon className="h-3 w-3 shrink-0 text-primary/70" />
        {label}
      </p>
      <p className="mt-1 truncate text-[10px] font-medium text-foreground" title={value}>
        {value}
      </p>
    </div>
  );
}
