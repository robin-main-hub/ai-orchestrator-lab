import { RadioTower, Smartphone } from "lucide-react";
import type { PermissionMatrixSnapshot, RuntimeSnapshot } from "@ai-orchestrator/protocol";
import type { Stage8IngressSnapshot } from "../runtime/stage8Ingress";
import { guardStepLabel } from "../lib/uiLabels";
import type { WindowAuditItem } from "../types";
import { WindowChecklist } from "./WindowChecklist";

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
  const auditItems: WindowAuditItem[] = [
    {
      id: "telegram",
      label: "Telegram 이어받기",
      status: "ready",
      detail: "대화 세션으로 가져오되 위험 작업은 permission queue로 보냅니다.",
    },
    {
      id: "mobile",
      label: "모바일 권한",
      status: runtime.dgxStatus === "online" ? "ready" : "partial",
      detail: "폰은 읽기, 승인, 중단, 재시도 중심이고 터미널 직접 입력은 막습니다.",
    },
    {
      id: "ingress-guard",
      label: "7중 가드",
      status: visibleSteps.every((step) => step.status === "passed") ? "ready" : "partial",
      detail: "noise/self-response/debounce/PII/checklist를 통과한 입력만 agent로 보냅니다.",
    },
    {
      id: "zero-token",
      label: "0-token 안전망",
      status: ingressSnapshot.zeroTokenSafety.enabled ? "ready" : "partial",
      detail: "LLM 없이 누락 문의와 미승인 항목을 감시하는 비상 루틴입니다.",
    },
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
      <WindowChecklist items={auditItems} title="채널 창 점검" />
    </section>
  );
}
