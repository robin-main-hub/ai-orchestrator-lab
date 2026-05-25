import { Archive, Check, KeyRound, RefreshCw, ShieldCheck, Smartphone, X } from "lucide-react";
import type {
  ApprovalRequest,
  ApprovalState,
  PermissionMatrixSnapshot,
  ProviderRuntimeReadiness,
  SecretVaultSnapshot,
} from "@ai-orchestrator/protocol";
import type { DesktopApprovalListResponse } from "../runtime/stage34ApprovalServer";
import type { Stage7BackupSnapshot } from "../runtime/stage7Backup";
import type { Stage8IngressSnapshot } from "../runtime/stage8Ingress";
import type { WindowAuditItem } from "../types";
import { WindowChecklist } from "./WindowChecklist";

export function OperationsRailPanel({
  approvalBusyId,
  approvalError,
  approvalServerStatus,
  approvalServerSnapshot,
  backupSnapshot,
  ingressSnapshot,
  onCheckProviderVault,
  onExportBackup,
  onImportTelegram,
  onRefreshApprovals,
  onResolveServerApproval,
  pendingTmuxApprovalKeys = [],
  permissionSnapshot,
  providerReadiness,
  secretVaultSnapshot,
}: {
  approvalBusyId?: string;
  approvalError?: string;
  approvalServerStatus: "idle" | "loading" | "error" | "ready";
  approvalServerSnapshot?: DesktopApprovalListResponse;
  backupSnapshot: Stage7BackupSnapshot;
  ingressSnapshot: Stage8IngressSnapshot;
  onCheckProviderVault: () => void;
  onExportBackup: () => void;
  onImportTelegram: () => void;
  onRefreshApprovals: () => void;
  onResolveServerApproval: (approval: ApprovalRequest, state: Extract<ApprovalState, "approved" | "rejected">) => void;
  pendingTmuxApprovalKeys?: string[];
  permissionSnapshot: PermissionMatrixSnapshot;
  providerReadiness: ProviderRuntimeReadiness;
  secretVaultSnapshot: SecretVaultSnapshot;
}) {
  const serverPending = approvalServerSnapshot?.queue.length ?? 0;
  const visibleApprovals = approvalServerSnapshot?.approvals.filter((approval) => approval.state === "required").slice(0, 4) ?? [];
  const pendingTmuxApprovalKeySet = new Set(pendingTmuxApprovalKeys);
  const tmuxRedispatchPending = visibleApprovals.filter((approval) =>
    pendingTmuxApprovalKeySet.has(approval.id) ||
    (approval.sourceItemId ? pendingTmuxApprovalKeySet.has(approval.sourceItemId) : false),
  ).length;
  const auditItems: WindowAuditItem[] = [
    {
      id: "permission",
      label: "승인 대기열",
      status: permissionSnapshot.summary.pending + serverPending > 0 ? "partial" : "ready",
      detail:
        permissionSnapshot.summary.pending + serverPending > 0
          ? `${permissionSnapshot.summary.pending} local / ${serverPending} DGX 승인 대기 중입니다.`
          : "위험 실행은 권한 정책을 통과했고 승인 대기열은 비어 있습니다.",
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
      detail: "원문 키는 UI와 로그에 남기지 않고 vault ref 상태만 표시합니다.",
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
          <button className="rail-icon-button" onClick={onRefreshApprovals} title="Refresh DGX approvals" type="button">
            <RefreshCw size={13} />
          </button>
        </div>
      </header>
      <div className="rail-stat-list">
        <div>
          <span>permission</span>
          <strong>{permissionSnapshot.summary.pending} local / {serverPending} DGX</strong>
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
      <div className="server-approval-queue">
        <header>
          <span>DGX 승인 큐</span>
          <strong>
            {approvalServerStatus === "loading"
              ? "loading"
              : `${serverPending} pending${tmuxRedispatchPending > 0 ? ` / ${tmuxRedispatchPending} tmux` : ""}`}
          </strong>
        </header>
        {approvalError ? <p className="server-approval-error">{approvalError}</p> : null}
        {visibleApprovals.length === 0 ? (
          <p className="server-approval-empty">
            {approvalServerSnapshot ? "서버 승인 대기열이 비어 있습니다." : "새로고침하면 DGX-02의 실제 승인 큐를 불러옵니다."}
          </p>
        ) : (
          visibleApprovals.map((approval) => (
            <article
              className={
                pendingTmuxApprovalKeySet.has(approval.id) ||
                (approval.sourceItemId ? pendingTmuxApprovalKeySet.has(approval.sourceItemId) : false)
                  ? "server-approval-queue-tmux"
                  : undefined
              }
              key={approval.id}
            >
              <div>
                <strong>{approval.action}</strong>
                <span>{approval.reason}</span>
                <small>{approval.requestedLevels.join(", ") || "policy review"}</small>
                {pendingTmuxApprovalKeySet.has(approval.id) ||
                (approval.sourceItemId ? pendingTmuxApprovalKeySet.has(approval.sourceItemId) : false) ? (
                  <em>승인 후 tmux 재전송</em>
                ) : null}
              </div>
              <div className="server-approval-actions">
                <button
                  disabled={approvalBusyId === approval.id}
                  onClick={() => onResolveServerApproval(approval, "approved")}
                  title="Approve"
                  type="button"
                >
                  <Check size={12} />
                </button>
                <button
                  disabled={approvalBusyId === approval.id}
                  onClick={() => onResolveServerApproval(approval, "rejected")}
                  title="Reject"
                  type="button"
                >
                  <X size={12} />
                </button>
              </div>
            </article>
          ))
        )}
      </div>
      <WindowChecklist items={auditItems} title="Ops 점검" />
    </section>
  );
}
