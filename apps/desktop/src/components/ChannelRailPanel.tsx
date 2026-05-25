import { RadioTower, Smartphone } from "lucide-react";
import type { PermissionMatrixSnapshot, RuntimeSnapshot } from "@ai-orchestrator/protocol";
import type { Stage8IngressSnapshot } from "../runtime/stage8Ingress";
import { guardStepLabel } from "../lib/uiLabels";

export function ChannelRailPanel({
  ingressSnapshot,
  onImportTelegram,
  permissionSnapshot,
  runtime,
}: {
  ingressSnapshot: Stage8IngressSnapshot;
  onImportTelegram: () => void;
  permissionSnapshot: PermissionMatrixSnapshot;
  runtime: RuntimeSnapshot;
}) {
  const visibleSteps = ingressSnapshot.result.guardSteps.slice(0, 7);
  const channels = [
    { label: "Telegram", status: ingressSnapshot.channel === "legacy_telegram" ? "linked" : "ready" },
    { label: "OpenClaw Bridge", status: "pending adapter" },
    { label: "Mobile", status: runtime.dgxStatus === "online" ? "approval ready" : "read-only pending" },
    { label: "API", status: "guarded ingress" },
  ];

  return (
    <section className="mini-panel rail-panel channel-rail-panel">
      <header>
        <RadioTower size={16} />
        <span>Channels</span>
        <button className="rail-icon-button" onClick={onImportTelegram} title="Telegram에서 이어받기" type="button">
          <Smartphone size={13} />
        </button>
      </header>
      <div className="rail-card-list compact">
        {channels.map((channel) => (
          <article key={channel.label}>
            <strong>{channel.label}</strong>
            <span>{channel.status}</span>
          </article>
        ))}
      </div>
      <div className="rail-hero-card">
        <span>ingress confidence</span>
        <strong>{ingressSnapshot.result.confidence} / {ingressSnapshot.result.approvalState}</strong>
        <p>{ingressSnapshot.result.reason}</p>
      </div>
      <div className="rail-card-list">
        {visibleSteps.map((step) => (
          <article className={step.status} key={step.name}>
            <strong>{guardStepLabel(step.name)}</strong>
            <span>{step.status}</span>
            <p>{step.reason}</p>
          </article>
        ))}
      </div>
      <div className="rail-stat-list">
        <div>
          <span>permission queue</span>
          <strong>{permissionSnapshot.summary.pending}</strong>
        </div>
        <div>
          <span>0-token safety</span>
          <strong>{ingressSnapshot.zeroTokenSafety.enabled ? ingressSnapshot.zeroTokenSafety.cadence : "off"}</strong>
        </div>
      </div>
    </section>
  );
}
