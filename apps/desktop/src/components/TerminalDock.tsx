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
    <footer className="terminal-dock terminal-dock-v2" aria-label="터미널 · 실행 로그">
      <div className="terminal-dock-v2__header">
        <span className="terminal-dock-v2__title">
          <Terminal size={15} />
          <strong>터미널 / 실행 로그</strong>
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
            value={connectionStatusLabel(dgxBridge.heartbeat.status)}
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
          meta={`기억 ${agentRun.recallTrace.length}개 · 사용 ${agentRun.recallTrace.filter((t) => t.usedInDecision).length}개 · 검증 ${terminalStatusLabel(agentRun.verifier.status)} · 재생 ${agentRun.replay.eventIds.length}개`}
        />

        <Block
          type="dgx"
          tone={dgxTone}
          stamp={dgxBridge.authorityNodeId}
          title={`원격 ${terminalStatusLabel(dgxBridge.response.status)} · 동기화 ${dgxBridge.syncMode}`}
          meta={`대체 경로 ${dgxBridge.localFallbackEnabled ? dgxBridge.response.fallbackMode : "없음"}`}
        />

        <Block
          type="vault"
          tone={vaultTone}
          stamp={`vault ${providerReadiness.modelCount}m`}
          title={providerReadiness.reason}
          meta={`비밀값 ${terminalStatusLabel(providerReadiness.secretAvailability)} · 기억 ${providerReadiness.canUseAutomaticMemory ? "자동" : "수동"} · 원문 저장 없음`}
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
            meta={`상태 ${terminalStatusLabel(slot.status)} · 승인 ${terminalStatusLabel(slot.permissionState)}`}
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
  permission: "승인",
  runtime: "런타임",
  dgx: "DGX 연결",
  vault: "금고",
  slot: "슬롯",
  event: "이벤트",
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
          이벤트 로그
        </span>
        <span className="terminal-dock-v2__block-type">{terminalStatusLabel(eventSyncState.status)}</span>
        <span
          className={cn(
            "terminal-dock-v2__block-dot",
            `terminal-dock-v2__block-dot--${tone}`,
          )}
          aria-hidden
        />
      </header>
      <p className="terminal-dock-v2__block-title">
        DGX-02 리비전 {eventSyncState.serverRevision ?? "-"} · 보낼 항목 {eventSyncState.outboxCount}
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
        최근 기록 ({formattedEvents.length})
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
          동기화
        </button>
        <button className="terminal-dock-v2__action" onClick={onReplayEvents} type="button">
          <ShieldCheck size={11} />
          가져오기
        </button>
      </div>
    </article>
  );
}

function connectionStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    connected: "연결됨",
    degraded: "저하",
    disconnected: "끊김",
    failed: "실패",
    ready: "준비됨",
    unreachable: "도달 불가",
  };
  return labels[status] ?? terminalStatusLabel(status);
}

function terminalStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    approved: "승인됨",
    available: "사용 가능",
    blocked: "차단",
    completed: "완료",
    denied: "거부됨",
    expired: "만료됨",
    failed: "실패",
    passed: "통과",
    pending: "대기",
    pending_approval: "승인 대기",
    ready: "준비됨",
    ready_for_approval: "승인 대기",
    rejected: "거부됨",
    required: "승인 필요",
    running: "실행 중",
    sent: "전송됨",
    synced: "동기화됨",
    syncing: "동기화 중",
  };
  return labels[status] ?? status;
}
