import { AlertTriangle, CheckCircle2, ShieldAlert } from "lucide-react";
import type { ProviderRuntimeReadiness } from "@ai-orchestrator/protocol";

type ProviderReadinessPreflightProps = {
  pendingRetryAgentName?: string;
  providerName?: string;
  readiness: ProviderRuntimeReadiness;
  selectedModelName?: string;
};

export function ProviderReadinessPreflight({
  pendingRetryAgentName,
  providerName = "Provider",
  readiness,
  selectedModelName,
}: ProviderReadinessPreflightProps) {
  if (readiness.status === "ready" && readiness.warnings.length === 0 && !pendingRetryAgentName) {
    return null;
  }

  const copy = copyForReadiness(readiness, Boolean(pendingRetryAgentName));
  const modelLabel = selectedModelName ?? readiness.selectedModelId ?? "모델 선택 대기";

  return (
    <aside
      aria-label="Provider 실행 전 점검"
      className={`shrink-0 border-b px-4 py-2 ${copy.frameClassName}`}
    >
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2">
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${copy.badgeClassName}`}>
          <copy.icon className="h-3 w-3" />
          {copy.title}
        </span>
        <span className="rounded-full border border-white/10 bg-black/25 px-2.5 py-1 text-[11px] text-zinc-200">
          {providerName} · {modelLabel}
        </span>
        <span className="min-w-0 flex-1 text-[11px] leading-relaxed text-zinc-400">
          {copy.description}
          {pendingRetryAgentName ? ` · ${pendingRetryAgentName} 메시지는 승인되면 이어서 전송됩니다.` : ""}
        </span>
        {readiness.reason ? (
          <span className="max-w-sm truncate rounded-full border border-white/10 bg-zinc-950/60 px-2.5 py-1 text-[11px] text-zinc-300">
            {readiness.reason}
          </span>
        ) : null}
        {readiness.warnings.map((warning) => (
          <span
            className="rounded-full border border-white/10 bg-zinc-950/60 px-2 py-0.5 text-[10px] text-zinc-400"
            key={warning}
          >
            {warning}
          </span>
        ))}
      </div>
    </aside>
  );
}

function copyForReadiness(readiness: ProviderRuntimeReadiness, hasPendingRetry: boolean) {
  if (readiness.status === "needs_approval" || hasPendingRetry) {
    return {
      badgeClassName: "border-amber-300/30 bg-amber-400/10 text-amber-100",
      description: "원격 모델 호출에 운영자 승인이 필요합니다. 승인되면 이어서 전송됩니다.",
      frameClassName: "border-amber-300/10 bg-amber-950/[0.08]",
      icon: ShieldAlert,
      title: "승인 대기",
    };
  }

  if (readiness.status === "credential_required" || readiness.status === "blocked") {
    return {
      badgeClassName: "border-rose-300/30 bg-rose-400/10 text-rose-100",
      description: "설정 또는 승인 상태를 먼저 확인해야 대화 호출이 실패하지 않습니다.",
      frameClassName: "border-rose-300/10 bg-rose-950/[0.08]",
      icon: AlertTriangle,
      title: "보내기 전 확인 필요",
    };
  }

  return {
    badgeClassName: "border-violet-300/25 bg-violet-400/10 text-violet-100",
    description: "Provider는 준비됐지만 참고 경고가 있습니다.",
    frameClassName: "border-violet-300/10 bg-violet-950/[0.08]",
    icon: CheckCircle2,
    title: "참고 경고",
  };
}
