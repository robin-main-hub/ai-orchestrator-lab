import { RadioTower, Smartphone } from "lucide-react";
import type { Stage8IngressSnapshot } from "../runtime/stage8Ingress";
import { guardStepLabel } from "../lib/uiLabels";
import { ingressReasonLabel } from "../lib/ingressReasonLabels";
import {
  ingressApprovalStateLabel,
  ingressChannelLabel,
  ingressConfidenceLabel,
  ingressPermissionLabel,
} from "../lib/railStatusLabels";
import { StatusBadge } from "@/ui/status-badge";
import type { StatusBadgeVariant } from "@/ui/status-badge";

function approvalStateBadgeVariant(state: string): StatusBadgeVariant {
  switch (state) {
    case "approved":
    case "not_required":
      return "success";
    case "required":
      return "warning";
    case "rejected":
      return "danger";
    default:
      return "muted";
  }
}

function guardStepBadgeVariant(status: string): StatusBadgeVariant {
  switch (status) {
    case "passed":
      return "success";
    case "blocked":
      return "danger";
    case "skipped":
      return "muted";
    default:
      return "warning";
  }
}

export function IngressGuardPanel({
  onImportExternalIngress,
  snapshot,
}: {
  onImportExternalIngress: () => void;
  snapshot: Stage8IngressSnapshot;
}) {
  const visibleSteps = snapshot.result.guardSteps.slice(0, 7);

  return (
    <section className="side-panel ingress-panel">
      <header className="panel-title">
        <RadioTower size={17} />
        <h2>인입 보호</h2>
        <button aria-label="외부 인입 가져오기" className="icon-button" onClick={onImportExternalIngress} type="button">
          <Smartphone size={15} />
        </button>
      </header>
      <div className="ingress-summary">
        <div>
          <span>채널</span>
          <strong>{ingressChannelLabel(snapshot.channel)}</strong>
        </div>
        <div>
          <span>신뢰도</span>
          <strong>{ingressConfidenceLabel(snapshot.result.confidence)}</strong>
        </div>
        <div>
          <span>승인</span>
          <StatusBadge
            size="sm"
            variant={approvalStateBadgeVariant(snapshot.result.approvalState)}
            className="mt-1 w-fit"
          >
            {ingressApprovalStateLabel(snapshot.result.approvalState)}
          </StatusBadge>
        </div>
      </div>
      <div className="guard-step-list" aria-label="인입 보호 단계">
        {visibleSteps.map((step) => (
          <article className={step.status} key={step.name}>
            <strong>{guardStepLabel(step.name)}</strong>
            <StatusBadge
              size="sm"
              variant={guardStepBadgeVariant(step.status)}
            >
              {guardStepStatusLabel(step.status)}
            </StatusBadge>
            <span className="guard-step-reason">{ingressReasonLabel(step.reason)}</span>
          </article>
        ))}
      </div>
      <div className="approval-queue-list">
        <span>승인 대기열</span>
        {snapshot.approvals.length === 0 ? (
          <strong>비어 있음</strong>
        ) : (
          snapshot.approvals.map((approval) => (
            <article key={approval.id}>
              <StatusBadge
                size="sm"
                variant={approvalStateBadgeVariant(approval.state)}
              >
                {ingressApprovalStateLabel(approval.state)}
              </StatusBadge>
              <em>{approval.permissions.map(ingressPermissionLabel).join(", ")}</em>
            </article>
          ))
        )}
      </div>
      <div className="zero-token-note">
        <span>0토큰 안전장치</span>
        <strong>{snapshot.zeroTokenSafety.cadence} / 대기 {snapshot.zeroTokenSafety.pendingCount}</strong>
      </div>
    </section>
  );
}

function guardStepStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    blocked: "차단",
    passed: "통과",
    queued: "대기",
    skipped: "건너뜀",
  };
  return labels[status] ?? status;
}
