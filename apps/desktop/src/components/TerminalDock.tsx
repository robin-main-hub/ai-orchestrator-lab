import { Activity, CheckCircle2, KeyRound, LockKeyhole, Terminal } from "lucide-react";
import type { EventEnvelope, PermissionMatrixSnapshot, ProviderRuntimeReadiness, SecretVaultSnapshot, TerminalSlot } from "@ai-orchestrator/protocol";
import type { Stage4AgentRun } from "../runtime/stage4Runtime";
import type { Stage5DgxBridge } from "../runtime/stage5Runtime";
import type { Stage14EventSyncState } from "../runtime/stage14EventSync";
import type { WindowAuditItem } from "../types";
import { auditStatusLabel } from "./WindowChecklist";

export function TerminalDock({
  agentRun,
  dgxBridge,
  eventSyncState,
  events,
  onApproveNext,
  onCheckProviderVault,
  onRejectNext,
  onReplayEvents,
  onSyncEvents,
  permissionSnapshot,
  providerReadiness,
  secretVaultSnapshot,
  slots,
}: {
  agentRun: Stage4AgentRun;
  dgxBridge: Stage5DgxBridge;
  eventSyncState: Stage14EventSyncState;
  events: EventEnvelope[];
  onApproveNext: () => void;
  onCheckProviderVault: () => void;
  onRejectNext: () => void;
  onReplayEvents: () => void;
  onSyncEvents: () => void;
  permissionSnapshot: PermissionMatrixSnapshot;
  providerReadiness: ProviderRuntimeReadiness;
  secretVaultSnapshot: SecretVaultSnapshot;
  slots: TerminalSlot[];
}) {
  const visibleEvents = events.slice(0, 4);
  const pendingPermission = permissionSnapshot.queue[0];
  const auditItems: WindowAuditItem[] = [
    {
      id: "execution-disabled",
      label: "실행 잠금",
      status: "ready",
      detail: "실제 명령 실행은 tmux/permission/redaction 안정화 전까지 막습니다.",
    },
    {
      id: "approval",
      label: "승인",
      status: pendingPermission ? "partial" : "ready",
      detail: pendingPermission ? "승인 대기 작업이 있습니다." : "승인 대기열이 비어 있습니다.",
    },
    {
      id: "event-sync",
      label: "동기화",
      status: eventSyncState.status === "synced" ? "ready" : "partial",
      detail: `DGX-02 rev ${eventSyncState.serverRevision ?? "-"} / outbox ${eventSyncState.outboxCount}`,
    },
  ];

  return (
    <footer className="terminal-dock">
      <div className="dock-title">
        <Terminal size={17} />
        <strong>Terminal / Run Log</strong>
        <span>execution disabled</span>
      </div>
      <div className="slot-list">
        <article className="dock-check-card">
          <header>
            <span>
              <CheckCircle2 size={14} />
              창 점검
            </span>
            <em>{auditItems.filter((item) => item.status === "ready").length}/{auditItems.length}</em>
          </header>
          {auditItems.map((item) => (
            <p className={item.status} key={item.id}>
              <span>{item.label}</span>
              <strong>{auditStatusLabel(item.status)}</strong>
              <small>{item.detail}</small>
            </p>
          ))}
        </article>
        {slots.map((slot) => (
          <article className="terminal-slot" key={slot.id}>
            <header>
              <span>{slot.label}</span>
              <em>{slot.status}</em>
            </header>
            <p>{slot.lastCommandPreview}</p>
            <small>approval: {slot.permissionState}</small>
          </article>
        ))}
        <article className="dgx-bridge-card">
          <header>
            <span>DGX Bridge</span>
            <em>{dgxBridge.heartbeat.status}</em>
          </header>
          <div className="bridge-card-grid">
            <p>
              <span>authority</span>
              <strong>{dgxBridge.authorityNodeId}</strong>
            </p>
            <p>
              <span>remote</span>
              <strong>{dgxBridge.response.status}</strong>
            </p>
            <p>
              <span>fallback</span>
              <strong>{dgxBridge.localFallbackEnabled ? dgxBridge.response.fallbackMode : "none"}</strong>
            </p>
            <p>
              <span>sync</span>
              <strong>{dgxBridge.syncMode}</strong>
            </p>
          </div>
        </article>
        <article className="agent-runtime-card">
          <header>
            <span>Agent Runtime</span>
            <em>{agentRun.status}</em>
          </header>
          <div className="runtime-card-grid">
            <p>
              <span>soul</span>
              <strong>{agentRun.soulSummary}</strong>
            </p>
            <p>
              <span>memento</span>
              <strong>{agentRun.recallTrace.length} recall / {agentRun.recallTrace.filter((trace) => trace.usedInDecision).length} used</strong>
            </p>
            <p>
              <span>verifier</span>
              <strong>{agentRun.verifier.status}</strong>
            </p>
            <p>
              <span>replay</span>
              <strong>{agentRun.replay.eventIds.length} events</strong>
            </p>
          </div>
        </article>
        <article className="permission-matrix-card">
          <header>
            <span>
              <LockKeyhole size={14} />
              Permission Matrix
            </span>
            <em>{permissionSnapshot.summary.pending} pending</em>
          </header>
          <div className="permission-summary-grid">
            <p>
              <span>allow</span>
              <strong>{permissionSnapshot.summary.allowed}</strong>
            </p>
            <p>
              <span>approved</span>
              <strong>{permissionSnapshot.summary.approved}</strong>
            </p>
            <p>
              <span>deny</span>
              <strong>{permissionSnapshot.summary.denied}</strong>
            </p>
          </div>
          <div className="permission-queue-preview">
            <span>{pendingPermission ? pendingPermission.summary : "queue empty"}</span>
            <small>{pendingPermission ? pendingPermission.permissions.join(", ") : "execution stays display-only"}</small>
          </div>
          <div className="permission-actions">
            <button disabled={!pendingPermission} onClick={onApproveNext} type="button">
              approve
            </button>
            <button disabled={!pendingPermission} onClick={onRejectNext} type="button">
              reject
            </button>
          </div>
        </article>
        <article className="secret-vault-card">
          <header>
            <span>
              <KeyRound size={14} />
              Provider Vault
            </span>
            <em>{providerReadiness.status}</em>
          </header>
          <div className="vault-summary-grid">
            <p>
              <span>secret</span>
              <strong>{providerReadiness.secretAvailability}</strong>
            </p>
            <p>
              <span>models</span>
              <strong>{providerReadiness.modelCount}</strong>
            </p>
            <p>
              <span>memory</span>
              <strong>{providerReadiness.canUseAutomaticMemory ? "auto" : "manual"}</strong>
            </p>
          </div>
          <div className="vault-preview">
            <span>{providerReadiness.reason}</span>
            <small>
              vault {secretVaultSnapshot.summary.available}/{secretVaultSnapshot.entries.length} available · raw persisted: no
            </small>
          </div>
          <div className="permission-actions">
            <button onClick={onCheckProviderVault} type="button">
              check
            </button>
          </div>
        </article>
        <article className="event-log">
          <header>
            <span>
              <Activity size={15} />
              Event Storage
            </span>
            <em className={eventSyncState.status === "synced" ? "positive" : "warning"}>{eventSyncState.status}</em>
          </header>
          <div className="event-sync-summary">
            <span>DGX-02 rev {eventSyncState.serverRevision ?? "-"}</span>
            <small>outbox {eventSyncState.outboxCount}</small>
            <button onClick={onSyncEvents} type="button">
              sync
            </button>
            <button onClick={onReplayEvents} type="button">
              pull
            </button>
          </div>
          <div className="event-log-list">
            {visibleEvents.map((event) => (
              <p key={event.id}>
                <span>{event.type}</span>
                <small>{new Date(event.createdAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}</small>
              </p>
            ))}
          </div>
        </article>
      </div>
    </footer>
  );
}
