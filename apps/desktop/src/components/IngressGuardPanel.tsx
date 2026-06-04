import { RadioTower, Smartphone } from "lucide-react";
import type { Stage8IngressSnapshot } from "../runtime/stage8Ingress";
import { guardStepLabel } from "../lib/uiLabels";
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
  onImportTelegram,
  snapshot,
}: {
  onImportTelegram: () => void;
  snapshot: Stage8IngressSnapshot;
}) {
  const visibleSteps = snapshot.result.guardSteps.slice(0, 7);

  return (
    <section className="side-panel ingress-panel">
      <header className="panel-title">
        <RadioTower size={17} />
        <h2>Ingress Guard</h2>
        <button aria-label="Telegram 가져오기" className="icon-button" onClick={onImportTelegram} type="button">
          <Smartphone size={15} />
        </button>
      </header>
      <div className="ingress-summary">
        <div>
          <span>channel</span>
          <strong>{snapshot.channel}</strong>
        </div>
        <div>
          <span>confidence</span>
          <strong>{snapshot.result.confidence}</strong>
        </div>
        <div>
          <span>approval</span>
          <StatusBadge
            size="sm"
            variant={approvalStateBadgeVariant(snapshot.result.approvalState)}
            className="mt-1 w-fit"
          >
            {snapshot.result.approvalState}
          </StatusBadge>
        </div>
      </div>
      <div className="guard-step-list" aria-label="Ingress guard steps">
        {visibleSteps.map((step) => (
          <article className={step.status} key={step.name}>
            <strong>{guardStepLabel(step.name)}</strong>
            <StatusBadge
              size="sm"
              variant={guardStepBadgeVariant(step.status)}
            >
              {step.status}
            </StatusBadge>
            <span className="guard-step-reason">{step.reason}</span>
          </article>
        ))}
      </div>
      <div className="approval-queue-list">
        <span>Approval Queue</span>
        {snapshot.approvals.length === 0 ? (
          <strong>empty</strong>
        ) : (
          snapshot.approvals.map((approval) => (
            <article key={approval.id}>
              <StatusBadge
                size="sm"
                variant={approvalStateBadgeVariant(approval.state)}
              >
                {approval.state}
              </StatusBadge>
              <em>{approval.permissions.join(", ")}</em>
            </article>
          ))
        )}
      </div>
      <div className="zero-token-note">
        <span>0-token safety</span>
        <strong>
          {snapshot.zeroTokenSafety.cadence} / pending {snapshot.zeroTokenSafety.pendingCount}
        </strong>
      </div>
    </section>
  );
}
