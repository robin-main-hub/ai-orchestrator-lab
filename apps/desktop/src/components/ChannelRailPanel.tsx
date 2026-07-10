import { RadioTower, Smartphone } from "lucide-react";
import type { PermissionMatrixSnapshot, RuntimeSnapshot } from "@ai-orchestrator/protocol";
import { StatusBadge, type StatusBadgeVariant } from "@/ui/status-badge";
import type { Stage8IngressSnapshot } from "../runtime/stage8Ingress";
import { guardStepLabel } from "../lib/uiLabels";

export function ChannelRailPanel({
  ingressSnapshot,
  onImportExternalIngress,
  permissionSnapshot,
  runtime,
}: {
  ingressSnapshot: Stage8IngressSnapshot;
  onImportExternalIngress: () => void;
  permissionSnapshot: PermissionMatrixSnapshot;
  runtime: RuntimeSnapshot;
}) {
  const visibleSteps = ingressSnapshot.result.guardSteps.slice(0, 7);
  const channels = [
    { label: "외부 인입", status: ingressSnapshot.channel === "external_legacy" ? "검사됨" : "준비됨" },
    { label: "OpenClaw Bridge", status: "어댑터 설정 필요" },
    { label: "Mobile", status: runtime.dgxStatus === "online" ? "승인 준비됨" : "읽기 전용 대기" },
    { label: "API", status: "인입 보호 중" },
  ];

  return (
    <section className="mgmt-mini-panel mgmt-panel channel-rail-panel">
      <header>
        <RadioTower size={16} />
        <span>채널</span>
        <button className="mgmt-icon-button" onClick={onImportExternalIngress} aria-label="외부 인입 가져오기" title="외부 인입 가져오기" type="button">
          <Smartphone size={13} />
        </button>
      </header>
      <div className="mgmt-card-list compact">
        {channels.map((channel) => (
          <article key={channel.label}>
            <strong>{channel.label}</strong>
            <span>
              <StatusBadge size="sm" variant={channelStatusBadgeVariant(channel.status)}>
                {channel.status}
              </StatusBadge>
            </span>
          </article>
        ))}
      </div>
      <div className="mgmt-hero-card">
        <span>인입 신뢰도</span>
        <strong>{ingressSnapshot.result.confidence} / {ingressSnapshot.result.approvalState}</strong>
        <p>{ingressSnapshot.result.reason}</p>
      </div>
      <div className="mgmt-card-list">
        {visibleSteps.map((step) => (
          <article className={step.status} key={step.name}>
            <strong>{guardStepLabel(step.name)}</strong>
            <span>
              <StatusBadge size="sm" variant={guardStatusBadgeVariant(step.status)}>
                {step.status}
              </StatusBadge>
            </span>
            <p>{step.reason}</p>
          </article>
        ))}
      </div>
      <div className="mgmt-stat-list">
        <div>
          <span>승인 대기열</span>
          <strong>{permissionSnapshot.summary.pending}</strong>
        </div>
        <div>
          <span>0-토큰 안전장치</span>
          <strong>{ingressSnapshot.zeroTokenSafety.enabled ? ingressSnapshot.zeroTokenSafety.cadence : "off"}</strong>
        </div>
      </div>
    </section>
  );
}

function channelStatusBadgeVariant(status: string): StatusBadgeVariant {
  if (status.includes("연결") || status.includes("준비")) return "success";
  if (status.includes("차단") || status.includes("거부")) return "danger";
  if (status.includes("대기") || status.includes("보호") || status.includes("설정")) return "warning";
  return "muted";
}

function guardStatusBadgeVariant(status: string): StatusBadgeVariant {
  if (status === "passed") return "success";
  if (status === "blocked") return "danger";
  if (status === "review") return "warning";
  return "muted";
}
