import type { AgentRole } from "@ai-orchestrator/protocol";
import { ShieldCheck, Wrench } from "lucide-react";
import { getAgentToolBadgeLabels, getAgentToolProfileSummary } from "../../lib/agentToolProfiles";

export function AgentSkillProfilePanel({ role }: { role: AgentRole }) {
  const summary = getAgentToolProfileSummary(role);
  const tools = getAgentToolBadgeLabels(role);

  return (
    <section className="rounded-lg border border-cyan-400/10 bg-cyan-400/[0.04] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-cyan-200/80">
            <Wrench className="h-3 w-3" />
            설치된 스킬/도구
          </p>
          <p className="mt-1 text-sm font-semibold text-zinc-100">{summary.label}</p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-400/20 bg-amber-400/10 px-2 py-1 text-[10px] font-medium text-amber-200">
          <ShieldCheck className="h-3 w-3" />
          {summary.runtime.boundaryLabel}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {tools.map((tool) => (
          <span
            className="rounded-full border border-zinc-700/80 bg-zinc-950/60 px-2 py-0.5 text-[10px] font-medium text-zinc-200"
            key={tool}
          >
            {tool}
          </span>
        ))}
      </div>
      <p className="mt-2 text-[10px] leading-relaxed text-zinc-500">
        실제 호출은 승인 기록과 실행 이벤트가 확인된 뒤 공개 영수증에 남깁니다.
      </p>
    </section>
  );
}
