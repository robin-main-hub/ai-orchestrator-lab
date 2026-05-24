import { Archive, KeyRound, ShieldCheck, Smartphone } from "lucide-react";
import type { PermissionMatrixSnapshot, ProviderRuntimeReadiness, SecretVaultSnapshot } from "@ai-orchestrator/protocol";
import type { Stage7BackupSnapshot } from "../runtime/stage7Backup";
import type { Stage8IngressSnapshot } from "../runtime/stage8Ingress";
import type { WindowAuditItem } from "../types";
import { WindowChecklist } from "./WindowChecklist";

export function OperationsRailPanel({
  backupSnapshot,
  ingressSnapshot,
  onCheckProviderVault,
  onExportBackup,
  onImportTelegram,
  permissionSnapshot,
  providerReadiness,
  secretVaultSnapshot,
}: {
  backupSnapshot: Stage7BackupSnapshot;
  ingressSnapshot: Stage8IngressSnapshot;
  onCheckProviderVault: () => void;
  onExportBackup: () => void;
  onImportTelegram: () => void;
  permissionSnapshot: PermissionMatrixSnapshot;
  providerReadiness: ProviderRuntimeReadiness;
  secretVaultSnapshot: SecretVaultSnapshot;
}) {
  const auditItems: WindowAuditItem[] = [
    {
      id: "permission",
      label: "승인 대기열",
      status: permissionSnapshot.summary.pending > 0 ? "partial" : "ready",
      detail:
        permissionSnapshot.summary.pending > 0
          ? `${permissionSnapshot.summary.pending}개 작업이 승인 전 대기 중입니다.`
          : "위험 실행은 모두 권한 정책을 통과했거나 대기열이 비어 있습니다.",
    },
    {
      id: "ingress",
      label: "외부 입력",
      status: ingressSnapshot.result.approvalState === "required" ? "partial" : "ready",
      detail: "Telegram/Mobile/API 입력은 ingress guard와 승인 상태를 먼저 거칩니다.",
    },
    {
      id: "secret",
      label: "비밀값",
      status: secretVaultSnapshot.summary.missing > 0 ? "partial" : "ready",
      detail: "키 원문은 UI와 로그에 남기지 않고 vault ref 상태만 표시합니다.",
    },
    {
      id: "gemini",
      label: "Gemini CLI",
      status: "blocked",
      detail: "사용자 지시대로 agy -p 설정 전까지 연결하지 않습니다.",
    },
  ];

  return (
    <section className="mini-panel rail-panel ops-rail-panel">
      <header>
        <ShieldCheck size={16} />
        <span>Ops</span>
        <div className="rail-action-row">
          <button className="rail-icon-button" onClick={onImportTelegram} title="Import Telegram" type="button">
            <Smartphone size={13} />
          </button>
          <button className="rail-icon-button" onClick={onExportBackup} title="Export Backup" type="button">
            <Archive size={13} />
          </button>
          <button className="rail-icon-button" onClick={onCheckProviderVault} title="Check Provider Vault" type="button">
            <KeyRound size={13} />
          </button>
        </div>
      </header>
      <div className="rail-stat-list">
        <div>
          <span>permission</span>
          <strong>{permissionSnapshot.summary.pending} pending</strong>
        </div>
        <div>
          <span>ingress</span>
          <strong>{ingressSnapshot.result.confidence} / {ingressSnapshot.result.approvalState}</strong>
        </div>
        <div>
          <span>backup</span>
          <strong>{backupSnapshot.summary.ready} ready / {backupSnapshot.summary.queued} queued</strong>
        </div>
        <div>
          <span>provider</span>
          <strong>{providerReadiness.status}</strong>
        </div>
        <div>
          <span>vault</span>
          <strong>{secretVaultSnapshot.summary.available}/{secretVaultSnapshot.entries.length} available</strong>
        </div>
      </div>
      <WindowChecklist items={auditItems} title="Ops 창 점검" />
    </section>
  );
}
