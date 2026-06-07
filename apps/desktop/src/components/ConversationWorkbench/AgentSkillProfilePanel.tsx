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
  role,
  runtimeConfigFiles = [],
}: {
  displayName?: string;
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
    <section className="rounded-lg border border-cyan-400/10 bg-cyan-400/[0.04] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-cyan-200/80">
            <Wrench className="h-3 w-3" />
            협업 스킬/도구
          </p>
          <p className="mt-1 text-sm font-semibold text-zinc-100">{agentLabel}가 맡기 좋은 일</p>
          <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">{collaboration.headline}</p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-400/20 bg-amber-400/10 px-2 py-1 text-[10px] font-medium text-amber-200">
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
        <span className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-medium text-cyan-100">
          {summary.label}
        </span>
        {tools.map((tool) => (
          <span
            className="rounded-full border border-zinc-700/80 bg-zinc-950/60 px-2 py-0.5 text-[10px] font-medium text-zinc-200"
            key={tool}
          >
            {tool}
          </span>
        ))}
      </div>
      <RuntimeConfigList files={visibleRuntimeFiles} hiddenCount={hiddenRuntimeFileCount} />
      <p className="mt-2 text-[10px] leading-relaxed text-zinc-500">
        실제 호출은 목적과 권한을 먼저 맞춘 뒤 진행하고, 대화에는 확인 가능한 작업 흔적만 남깁니다.
      </p>
    </section>
  );
}

function RuntimeConfigList({
  files,
  hiddenCount,
}: {
  files: AgentConfigFile[];
  hiddenCount: number;
}) {
  if (files.length === 0) {
    return (
      <div className="mt-3 rounded-md border border-zinc-800/80 bg-zinc-950/45 px-2.5 py-2">
        <p className="flex items-center gap-1.5 text-[10px] font-semibold text-zinc-400">
          <FileText className="h-3 w-3 text-zinc-500" />
          실제 적용 지침
        </p>
        <p className="mt-1 text-[10px] text-zinc-600">연결된 SOUL/AGENTS/스킬 파일이 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-md border border-violet-300/15 bg-violet-500/[0.045] px-2.5 py-2">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[10px] font-semibold text-violet-100">
          <FileText className="h-3 w-3 text-violet-200/80" />
          실제 적용 지침
        </p>
        {hiddenCount > 0 ? (
          <span className="rounded-full border border-violet-300/15 bg-violet-500/10 px-1.5 py-0.5 text-[9px] text-violet-100">
            +{hiddenCount}
          </span>
        ) : null}
      </div>
      <div className="mt-2 space-y-1.5">
        {files.map((file) => (
          <div className="min-w-0 rounded-md border border-white/10 bg-zinc-950/45 px-2 py-1.5" key={file.id}>
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="rounded-full border border-zinc-700/80 bg-zinc-900/80 px-1.5 py-0.5 text-[8px] uppercase tracking-wide text-zinc-400">
                {configKindLabel(file.kind)}
              </span>
              <p className="truncate text-[10px] font-semibold text-zinc-100" title={file.label}>
                {file.label}
              </p>
            </div>
            <p className="mt-1 truncate font-mono text-[9px] text-zinc-500" title={file.path}>
              {file.path}
            </p>
          </div>
        ))}
      </div>
    </div>
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
    <div className="min-w-0 rounded-md border border-white/10 bg-zinc-950/50 px-2 py-1.5">
      <p className="flex items-center gap-1 text-[9px] font-medium text-zinc-500">
        <Icon className="h-3 w-3 shrink-0 text-cyan-200/70" />
        {label}
      </p>
      <p className="mt-1 truncate text-[10px] font-medium text-zinc-200" title={value}>
        {value}
      </p>
    </div>
  );
}
