import { Archive, Check, KeyRound, RefreshCw, ShieldCheck, Smartphone, X } from "lucide-react";
import type {
  ApprovalRequest,
  ApprovalState,
  PermissionMatrixSnapshot,
  ProviderRuntimeReadiness,
  SecretVaultSnapshot,
} from "@ai-orchestrator/protocol";
import { StatusBadge } from "@/ui/status-badge";
import type { DesktopApprovalListResponse } from "../runtime/stage34ApprovalServer";
import type { Stage7BackupSnapshot } from "../runtime/stage7Backup";
import type { Stage8IngressSnapshot } from "../runtime/stage8Ingress";

export type TmuxRedispatchOutcome = {
  approvalId: string;
  createdAt: string;
  reason: string;
  role: string;
  sourceItemId?: string;
  status: "sent" | "failed" | "blocked" | "recorded" | "pending_approval" | "dry_run";
};

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
  tmuxRedispatchOutcomes = [],
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
  tmuxRedispatchOutcomes?: TmuxRedispatchOutcome[];
}) {
  const serverPending = approvalServerSnapshot?.queue.length ?? 0;
  const visibleApprovals = approvalServerSnapshot?.approvals.filter((approval) => approval.state === "required").slice(0, 4) ?? [];
  const pendingTmuxApprovalKeySet = new Set(pendingTmuxApprovalKeys);
  const tmuxRedispatchPending = visibleApprovals.filter((approval) =>
    pendingTmuxApprovalKeySet.has(approval.id) ||
    (approval.sourceItemId ? pendingTmuxApprovalKeySet.has(approval.sourceItemId) : false),
  ).length;

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
          <StatusBadge
            size="sm"
            variant={
              providerReadiness.status === "ready"
                ? "success"
                : providerReadiness.status === "needs_approval"
                  ? "warning"
                  : "danger"
            }
          >
            {providerReadiness.status}
          </StatusBadge>
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
      {tmuxRedispatchOutcomes.length > 0 ? (
        <div className="server-approval-outcomes">
          <header>
            <span>최근 tmux 재전송</span>
            <strong>{tmuxRedispatchOutcomes.length}</strong>
          </header>
          {tmuxRedispatchOutcomes.slice(0, 3).map((outcome) => (
            <article className={`server-approval-outcome-${outcome.status}`} key={`${outcome.approvalId}:${outcome.createdAt}`}>
              <div>
                <strong>{outcome.role}</strong>
                <span className="server-approval-outcome-reason">{outcome.reason}</span>
              </div>
              <StatusBadge
                size="sm"
                variant={
                  outcome.status === "sent" || outcome.status === "recorded"
                    ? "success"
                    : outcome.status === "failed" || outcome.status === "blocked"
                      ? "danger"
                      : outcome.status === "dry_run"
                        ? "warning"
                        : "warning"
                }
              >
                {outcome.status}
              </StatusBadge>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
