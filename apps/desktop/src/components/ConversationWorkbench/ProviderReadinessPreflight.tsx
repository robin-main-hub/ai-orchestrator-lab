import { AlertTriangle, CheckCircle2, ShieldAlert } from "lucide-react";
import type { ProviderRuntimeReadiness } from "@ai-orchestrator/protocol";
import { formatModelDisplayName } from "../../lib/helpers";
import { ingressPermissionLabel } from "../../lib/railStatusLabels";

type ProviderReadinessPreflightProps = {
  pendingRetryAgentName?: string;
  providerName?: string;
  readiness: ProviderRuntimeReadiness;
  selectedModelName?: string;
};

export function ProviderReadinessPreflight({
  pendingRetryAgentName,
  providerName = "모델 연결",
  readiness,
  selectedModelName,
}: ProviderReadinessPreflightProps) {
  if (readiness.status === "ready" && readiness.warnings.length === 0 && !pendingRetryAgentName) {
    return null;
  }

  const copy = copyForReadiness(readiness, Boolean(pendingRetryAgentName));
  const modelLabel = formatModelDisplayName(selectedModelName ?? readiness.selectedModelId);

  return (
    <aside
      aria-label="모델 연결 실행 전 점검"
      className={`shrink-0 border-b px-4 py-2 ${copy.frameClassName}`}
    >
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2">
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${copy.badgeClassName}`}>
          <copy.icon className="h-3 w-3" />
          {copy.title}
        </span>
        <span className="rounded-full border border-white/10 bg-black/25 px-2.5 py-1 text-[11px] text-foreground">
          모델 연결명: {providerName} · {modelLabel}
        </span>
        <span className="min-w-0 flex-1 text-[11px] leading-relaxed text-muted-foreground">
          {copy.description}
          {pendingRetryAgentName ? ` · ${pendingRetryAgentName} 메시지는 승인되면 이어서 전송됩니다.` : ""}
        </span>
        {readiness.reason ? (
          <span className="max-w-sm truncate rounded-full border border-white/10 bg-surface/60 px-2.5 py-1 text-[11px] text-foreground">
            {providerReadinessReasonLabel(readiness.reason)}
          </span>
        ) : null}
        {readiness.warnings.map((warning) => (
          <span
            className="rounded-full border border-white/10 bg-surface/60 px-2 py-0.5 text-[10px] text-muted-foreground"
            key={warning}
          >
            {ingressPermissionLabel(warning)}
          </span>
        ))}
      </div>
    </aside>
  );
}

function copyForReadiness(readiness: ProviderRuntimeReadiness, hasPendingRetry: boolean) {
  if (readiness.status === "needs_approval" || hasPendingRetry) {
    return {
      badgeClassName: "border-warning/30 bg-warning/10 text-warning",
      description: "원격 모델 호출에 운영자 승인이 필요합니다. 승인되면 이어서 전송됩니다.",
      frameClassName: "border-warning/10 bg-warning/[0.08]",
      icon: ShieldAlert,
      title: "승인 대기",
    };
  }

  if (readiness.status === "credential_required" || readiness.status === "blocked") {
    return {
      badgeClassName: "border-destructive/30 bg-destructive/10 text-destructive",
      description: "설정 또는 승인 상태를 먼저 확인해야 대화 호출이 실패하지 않습니다.",
      frameClassName: "border-destructive/10 bg-destructive/[0.08]",
      icon: AlertTriangle,
      title: "보내기 전 확인 필요",
    };
  }

  return {
    badgeClassName: "border-primary/25 bg-primary/10 text-primary",
    description: "모델 연결은 준비됐지만 참고 경고가 있습니다.",
    frameClassName: "border-primary/10 bg-primary/[0.08]",
    icon: CheckCircle2,
    title: "참고 경고",
  };
}

function providerReadinessReasonLabel(reason: string) {
  return reason
    .replace(/\bsecretRef\b/g, "비밀값 참조")
    .replace(/\bSecretRef\b/g, "비밀값 참조")
    .replace(/\bsecret\b/gi, "비밀값")
    .replace(/\bfallback\b/gi, "대체 경로")
    .replace(/\bProvider\b/g, "모델 연결");
}
