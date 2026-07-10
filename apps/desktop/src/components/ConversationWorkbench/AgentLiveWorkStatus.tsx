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
    <div className="shrink-0 border-b border-primary/10 bg-surface/90 px-4 py-2">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary shadow-[0_0_22px_var(--accent-dim)]">
              <Activity className="h-3 w-3 animate-pulse" />
              {displayName}가 지금 맡은 일
            </span>
            <span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[11px] text-primary">
              {indicator.label}
            </span>
          </div>
          <p className="mt-1 truncate text-[11px] text-muted-foreground">{indicator.narration}</p>
        </div>
        <div className="flex min-w-0 flex-wrap gap-1.5">
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
          ? "border-primary/20 bg-primary/10 text-primary"
          : active
            ? "border-warning/25 bg-warning/10 text-warning"
            : "border-border bg-surface/70 text-muted-foreground"
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
