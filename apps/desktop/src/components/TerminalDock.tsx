import { useMemo, useState } from "react";
import {
  Activity,
  ChevronDown,
  KeyRound,
  LockKeyhole,
  Radio,
  Server,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import type {
  EventEnvelope,
  PermissionMatrixSnapshot,
  ProviderRuntimeReadiness,
  SecretVaultSnapshot,
  TerminalSlot,
} from "@ai-orchestrator/protocol";
import type { Stage4AgentRun } from "../runtime/stage4Runtime";
import type { Stage5DgxBridge } from "../runtime/stage5Runtime";
import type { Stage14EventSyncState } from "../runtime/stage14EventSync";
import { cn } from "../lib/utils";

/**
 * Stage 2-3 Terminal Dock — Warp block model.
 *
 * Applies docs/design-decisions.md §10 (TerminalDock → Warp block
 * model: mono typography + status block timeline) and §1 (no
 * WindowChecklist in production UI).
 *
 * The legacy dock rendered 7 sibling cards in a horizontal flat grid
 * (terminal slots + DGX bridge + agent runtime + permission matrix
 * + provider vault + event log + WindowChecklist). Same data, no
 * hierarchy — the user could not tell which card demanded attention.
 *
 * v2 layout strategy:
 *   1. Compact status strip on top — 4 always-visible chips
 *      (permission · DGX · sync · vault). Mono typography for IDs.
 *   2. Block timeline below — horizontally scrolling Warp-style
 *      blocks. Every block has the same header shape: mono ID /
 *      timestamp · type · status dot. Urgent blocks (permission
 *      pending) lead; status blocks follow.
 *
 * WindowChecklist intentionally removed. All TerminalDock callbacks
 * (onApproveNext / onRejectNext / onCheckProviderVault /
 * onReplayEvents / onSyncEvents) preserved verbatim.
 */

export type TerminalDockProps = {
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
};

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
}: TerminalDockProps) {
  const pendingPermission = permissionSnapshot.queue[0];
  const visibleEvents = events.slice(0, 4);
  const visibleSlots = slots.slice(0, 3);

  const syncTone =
    eventSyncState.status === "synced"
      ? "ok"
      : eventSyncState.status === "syncing"
        ? "warn"
        : "bad";
  const dgxTone =
    dgxBridge.heartbeat.status === "connected"
      ? "ok"
      : dgxBridge.heartbeat.status === "unreachable"
        ? "bad"
        : "warn";
  const permTone = pendingPermission ? "warn" : "ok";
  const vaultTone = providerReadiness.status === "ready" ? "ok" : "warn";

  return (
    <footer className="terminal-dock terminal-dock-v2" aria-label="Terminal · Run Log">
      <div className="terminal-dock-v2__header">
        <span className="terminal-dock-v2__title">
          <Terminal size={15} />
          <strong>Terminal / Run Log</strong>
          <em>승인 기반 실행</em>
        </span>
        <div className="terminal-dock-v2__chips">
          <StatusChip
            icon={<LockKeyhole size={11} />}
            label="승인"
            value={`${permissionSnapshot.summary.pending}건 대기`}
            tone={permTone}
          />
          <StatusChip
            icon={<Server size={11} />}
            label="DGX"
            value={dgxBridge.heartbeat.status}
            tone={dgxTone}
          />
          <StatusChip
            icon={<Radio size={11} />}
            label="동기화"
            value={`rev ${eventSyncState.serverRevision ?? "-"} · 보류 ${eventSyncState.outboxCount}`}
            tone={syncTone}
          />
          <StatusChip
            icon={<KeyRound size={11} />}
            label="금고"
            value={`${secretVaultSnapshot.summary.available}/${secretVaultSnapshot.entries.length}`}
            tone={vaultTone}
          />
        </div>
      </div>

      <div className="terminal-dock-v2__stream">
        {pendingPermission ? (
          <Block
            type="permission"
            tone="warn"
            stamp={`perm-${pendingPermission.id.slice(-6)}`}
            title={pendingPermission.summary}
            meta={pendingPermission.permissions.join(" · ")}
            actions={
              <>
                <button
                  className="terminal-dock-v2__action terminal-dock-v2__action--primary"
                  onClick={onApproveNext}
                  type="button"
                >
                  승인
                </button>
                <button
                  className="terminal-dock-v2__action"
                  onClick={onRejectNext}
                  type="button"
                >
                  거부
                </button>
              </>
            }
          />
        ) : (
          <Block
            type="permission"
            tone="ok"
            stamp="perm-queue"
            title="대기 중인 승인 요청 없음"
            meta={`허용 ${permissionSnapshot.summary.allowed} · 승인됨 ${permissionSnapshot.summary.approved} · 거부 ${permissionSnapshot.summary.denied}`}
          />
        )}

        <Block
          type="runtime"
          tone="ok"
          stamp={`run-${agentRun.status}`}
          title={agentRun.soulSummary}
          meta={`기억 ${agentRun.recallTrace.length}개 · 사용 ${agentRun.recallTrace.filter((t) => t.usedInDecision).length}개 · 검증 ${agentRun.verifier.status} · 재생 ${agentRun.replay.eventIds.length}개`}
        />

        <Block
          type="dgx"
          tone={dgxTone}
          stamp={dgxBridge.authorityNodeId}
          title={`원격 ${dgxBridge.response.status} · 동기화 ${dgxBridge.syncMode}`}
          meta={`대체 경로 ${dgxBridge.localFallbackEnabled ? dgxBridge.response.fallbackMode : "없음"}`}
        />

        <Block
          type="vault"
          tone={vaultTone}
          stamp={`vault ${providerReadiness.modelCount}m`}
          title={providerReadiness.reason}
          meta={`비밀값 ${providerReadiness.secretAvailability} · 기억 ${providerReadiness.canUseAutomaticMemory ? "자동" : "수동"} · 원문 저장 없음`}
          actions={
            <button
              className="terminal-dock-v2__action"
              onClick={onCheckProviderVault}
              type="button"
            >
              확인
            </button>
          }
        />

        {visibleSlots.map((slot) => (
          <Block
            key={slot.id}
            type="slot"
            tone={
              slot.status === "completed" || slot.status === "running"
                ? "ok"
                : slot.status === "failed"
                  ? "bad"
                  : slot.status === "pending_approval"
                    ? "warn"
                    : "neutral"
            }
            stamp={slot.label}
            title={slot.lastCommandPreview || "아직 명령 없음"}
            meta={`상태 ${slot.status} · 승인 ${slot.permissionState}`}
          />
        ))}

        <EventLogBlock
          events={visibleEvents}
          eventSyncState={eventSyncState}
          onSyncEvents={onSyncEvents}
          onReplayEvents={onReplayEvents}
          tone={syncTone}
        />
      </div>
    </footer>
  );
}

function StatusChip({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "ok" | "warn" | "bad" | "neutral";
}) {
  return (
    <span className={cn("terminal-dock-v2__chip", `terminal-dock-v2__chip--${tone}`)}>
      {icon}
      <span className="terminal-dock-v2__chip-label">{label}</span>
      <span className="terminal-dock-v2__chip-value">{value}</span>
    </span>
  );
}

const TYPE_LABEL: Record<string, string> = {
  permission: "permission",
  runtime: "runtime",
  dgx: "dgx-bridge",
  vault: "vault",
  slot: "slot",
  event: "event",
};

function Block({
  type,
  tone,
  stamp,
  title,
  meta,
  actions,
  children,
}: {
  type: keyof typeof TYPE_LABEL;
  tone: "ok" | "warn" | "bad" | "neutral";
  stamp: string;
  title: string;
  meta?: string;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <article
      className={cn(
        "terminal-dock-v2__block",
        `terminal-dock-v2__block--${tone}`,
        `terminal-dock-v2__block--type-${type}`,
      )}
    >
      <header className="terminal-dock-v2__block-head">
        <span className="terminal-dock-v2__block-stamp">{stamp}</span>
        <span className="terminal-dock-v2__block-type">{TYPE_LABEL[type]}</span>
        <span
          className={cn(
            "terminal-dock-v2__block-dot",
            `terminal-dock-v2__block-dot--${tone}`,
          )}
          aria-hidden
        />
      </header>
      <p className="terminal-dock-v2__block-title">{title}</p>
      {meta ? <small className="terminal-dock-v2__block-meta">{meta}</small> : null}
      {children}
      {actions ? <div className="terminal-dock-v2__block-actions">{actions}</div> : null}
    </article>
  );
}

function EventLogBlock({
  events,
  eventSyncState,
  onSyncEvents,
  onReplayEvents,
  tone,
}: {
  events: EventEnvelope[];
  eventSyncState: Stage14EventSyncState;
  onSyncEvents: () => void;
  onReplayEvents: () => void;
  tone: "ok" | "warn" | "bad";
}) {
  const [open, setOpen] = useState(false);
  const formattedEvents = useMemo(
    () =>
      events.map((event) => ({
        id: event.id,
        type: event.type,
        time: new Date(event.createdAt).toLocaleTimeString("ko-KR", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      })),
    [events],
  );

  return (
    <article
      className={cn(
        "terminal-dock-v2__block",
        `terminal-dock-v2__block--${tone}`,
        "terminal-dock-v2__block--type-event",
        "terminal-dock-v2__block--wide",
      )}
    >
      <header className="terminal-dock-v2__block-head">
        <span className="terminal-dock-v2__block-stamp">
          <Activity size={11} />
          event-log
        </span>
        <span className="terminal-dock-v2__block-type">{eventSyncState.status}</span>
        <span
          className={cn(
            "terminal-dock-v2__block-dot",
            `terminal-dock-v2__block-dot--${tone}`,
          )}
          aria-hidden
        />
      </header>
      <p className="terminal-dock-v2__block-title">
        DGX-02 rev {eventSyncState.serverRevision ?? "-"} · outbox {eventSyncState.outboxCount}
      </p>
      <button
        aria-expanded={open}
        className="terminal-dock-v2__block-toggle"
        onClick={() => setOpen((o) => !o)}
        type="button"
      >
        <ChevronDown
          className={cn(
            "terminal-dock-v2__block-chevron",
            !open && "terminal-dock-v2__block-chevron--closed",
          )}
          size={11}
        />
        recent ({formattedEvents.length})
      </button>
      {open && formattedEvents.length > 0 ? (
        <ul className="terminal-dock-v2__event-list">
          {formattedEvents.map((event) => (
            <li key={event.id}>
              <span>{event.type}</span>
              <small>{event.time}</small>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="terminal-dock-v2__block-actions">
        <button className="terminal-dock-v2__action" onClick={onSyncEvents} type="button">
          sync
        </button>
        <button className="terminal-dock-v2__action" onClick={onReplayEvents} type="button">
          <ShieldCheck size={11} />
          pull
        </button>
      </div>
    </article>
  );
}
