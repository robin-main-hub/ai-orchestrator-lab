import { Activity, CheckCircle2, CircleDashed } from "lucide-react";
import type { AgentThinkingIndicator, AgentThinkingStep } from "../../lib/agentThinkingIndicator";

export function AgentLiveWorkStatus({
  displayName,
  indicator,
}: {
  displayName: string;
  indicator: AgentThinkingIndicator;
}) {
  return (
    <div className="shrink-0 border-b border-cyan-400/10 bg-cyan-500/[0.035] px-4 py-2">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-300/20 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-semibold text-cyan-100 shadow-[0_0_22px_rgba(34,211,238,0.10)]">
          <Activity className="h-3 w-3 animate-pulse" />
          {displayName} 작업 중
        </span>
        <span className="rounded-full border border-violet-300/20 bg-violet-400/10 px-2.5 py-1 text-[11px] text-violet-100">
          {indicator.label}
        </span>
        <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
          {indicator.steps.map((step) => (
            <AgentLiveWorkStepBadge key={step.label} step={step} />
          ))}
        </div>
      </div>
    </div>
  );
}

function AgentLiveWorkStepBadge({ step }: { step: AgentThinkingStep }) {
  const active = step.state === "active";
  const done = step.state === "done";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] ${
        done
          ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-200"
          : active
            ? "border-cyan-300/25 bg-cyan-400/10 text-cyan-100"
            : "border-zinc-700/70 bg-zinc-900/70 text-zinc-500"
      }`}
    >
      {done ? (
        <CheckCircle2 className="h-3 w-3" />
      ) : (
        <CircleDashed className={`h-3 w-3 ${active ? "animate-spin" : ""}`} />
      )}
      {step.label}
    </span>
  );
}
