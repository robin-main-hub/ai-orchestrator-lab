import { Archive, ChevronRight, KeyRound, RefreshCw, ShieldCheck, Smartphone } from "lucide-react";
import type {
  ApprovalRequest,
  ApprovalState,
  PermissionMatrixSnapshot,
  ProviderRuntimeReadiness,
  SecretVaultSnapshot,
  TmuxPaneRole,
} from "@ai-orchestrator/protocol";
import { StatusBadge } from "@/ui/status-badge";
import {
  approvalServerStatusLabel,
  ingressApprovalStateLabel,
  ingressConfidenceLabel,
  providerReadinessLabel,
  tmuxRedispatchOutcomeLabel,
} from "../lib/railStatusLabels";
import type { DesktopApprovalListResponse } from "../runtime/stage34ApprovalServer";
import type { Stage7BackupSnapshot } from "../runtime/stage7Backup";
import type { Stage8IngressSnapshot } from "../runtime/stage8Ingress";

export type TmuxRedispatchOutcome = {
  approvalId: string;
  createdAt: string;
  reason: string;
  role: TmuxPaneRole;
  sourceItemId?: string;
  status: "sent" | "failed" | "blocked" | "recorded" | "pending_approval" | "dry_run";
};

export function OperationsRailPanel({
  approvalError,
  approvalServerStatus,
  approvalServerSnapshot,
  backupSnapshot,
  ingressSnapshot,
  onCheckProviderVault,
  onExportBackup,
  onImportExternalIngress,
  onRefreshApprovals,
  onOpenControlQueue,
  pendingTmuxApprovalKeys = [],
  permissionSnapshot,
  providerReadiness,
  secretVaultSnapshot,
  tmuxRedispatchOutcomes = [],
}: {
  approvalError?: string;
  approvalServerStatus: "idle" | "loading" | "error" | "ready";
  approvalServerSnapshot?: DesktopApprovalListResponse;
  backupSnapshot: Stage7BackupSnapshot;
  ingressSnapshot: Stage8IngressSnapshot;
  onCheckProviderVault: () => void;
  onExportBackup: () => void;
  onImportExternalIngress: () => void;
  onRefreshApprovals: () => void;
  /** 승인/거부는 Control Queue 드로어가 정본 — 여기선 딥링크만 */
  onOpenControlQueue?: () => void;
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
    <section className="mgmt-mini-panel mgmt-panel ops-rail-panel">
      <header>
        <ShieldCheck size={16} />
        <span>운영</span>
        <div className="mgmt-action-row">
          <button className="mgmt-icon-button" onClick={onImportExternalIngress} aria-label="외부 인입 가져오기" title="외부 인입 가져오기" type="button">
            <Smartphone size={13} />
          </button>
          <button className="mgmt-icon-button" onClick={onExportBackup} aria-label="백업 내보내기" title="백업 내보내기" type="button">
            <Archive size={13} />
          </button>
          <button className="mgmt-icon-button" onClick={onCheckProviderVault} aria-label="프로바이더 보관소 점검" title="프로바이더 보관소 점검" type="button">
            <KeyRound size={13} />
          </button>
          <button className="mgmt-icon-button" onClick={onRefreshApprovals} aria-label="DGX 승인 새로고침" title="DGX 승인 새로고침" type="button">
            <RefreshCw size={13} />
          </button>
        </div>
      </header>
      <div className="mgmt-stat-list">
        <div>
          <span>권한</span>
          <strong>{permissionSnapshot.summary.pending} 로컬 / {serverPending} DGX</strong>
        </div>
        <div>
          <span>인입</span>
          <strong>
            {ingressConfidenceLabel(ingressSnapshot.result.confidence)} / {ingressApprovalStateLabel(ingressSnapshot.result.approvalState)}
          </strong>
        </div>
        <div>
          <span>백업</span>
          <strong>{backupSnapshot.summary.ready} 준비 / {backupSnapshot.summary.queued} 대기</strong>
        </div>
        <div>
          <span>프로바이더</span>
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
            {providerReadinessLabel(providerReadiness.status)}
          </StatusBadge>
        </div>
        <div>
          <span>보관소</span>
          <strong>{secretVaultSnapshot.summary.available}/{secretVaultSnapshot.entries.length} 사용 가능</strong>
        </div>
      </div>
      <div className="server-approval-queue">
        <header>
          <span>DGX 승인 큐</span>
          <strong>
            {approvalServerStatus === "loading"
              ? approvalServerStatusLabel(approvalServerStatus)
              : `${serverPending}건 대기${tmuxRedispatchPending > 0 ? ` / tmux ${tmuxRedispatchPending}건` : ""}`}
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
                <small>{approval.requestedLevels.join(", ") || "정책 검토"}</small>
                {pendingTmuxApprovalKeySet.has(approval.id) ||
                (approval.sourceItemId ? pendingTmuxApprovalKeySet.has(approval.sourceItemId) : false) ? (
                  <em>승인 후 tmux 재전송</em>
                ) : null}
              </div>
              <div className="server-approval-actions">
                <button
                  aria-label="Control Queue에서 처리"
                  disabled={!onOpenControlQueue}
                  onClick={() => onOpenControlQueue?.()}
                  title="Control Queue 드로어에서 승인/거부 (⌘⇧A)"
                  type="button"
                >
                  <ChevronRight size={12} />
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
                {tmuxRedispatchOutcomeLabel(outcome.status)}
              </StatusBadge>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
