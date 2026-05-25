import { useState } from "react";
import {
  CheckCircle2,
  Clock3,
  Edit3,
  Forward,
  HelpCircle,
  ShieldCheck,
  ShieldOff,
  X,
  XCircle,
} from "lucide-react";
import type { ApprovalQueueItem, PermissionMatrixSnapshot } from "@ai-orchestrator/protocol";
import { cn } from "../lib/utils";

/**
 * Stage 2-5 Control Queue — formerly ApprovalDrawer / "Assistant Inbox".
 *
 * Applies docs/design-decisions.md §1 (rename: Assistant Inbox →
 * **Control Queue** with 6 lane actions: approve / ask / edit /
 * delegate / block / archive — all keyboard-accessible) and §6
 * (⌘⇧A shortcut already wired through useGlobalShortcuts).
 *
 * Two-section layout:
 *   1. Header — title + pending count + close
 *   2. Lane chip strip — 6 lanes per §1. Approve/Reject are wired
 *      to existing permission handlers; ask/edit/delegate/block/
 *      archive are rendered as the canonical vocabulary but stay
 *      disabled until protocol handoff actions land (📌 future
 *      schema work, design-decisions §7 territory).
 *   3. Queue list — each item card carries the same 6 actions so
 *      the user can route any pending item without leaving the
 *      drawer.
 *
 * All existing callbacks (`onApprove`, `onReject`, `onClose`)
 * preserved verbatim. Visual upgrade only — zero functional
 * regression compared to legacy ApprovalDrawer.
 */

export type ControlQueueDrawerProps = {
  onApprove: (sourceItemId: string) => void;
  onClose: () => void;
  onReject: (sourceItemId: string) => void;
  open: boolean;
  snapshot: PermissionMatrixSnapshot;
};

type LaneId = "approve" | "ask" | "edit" | "delegate" | "block" | "archive";

const LANES: Array<{ id: LaneId; label: string; icon: React.ReactNode; status: "live" | "soon" }> = [
  { id: "approve", label: "approve", icon: <CheckCircle2 size={12} />, status: "live" },
  { id: "ask", label: "ask", icon: <HelpCircle size={12} />, status: "soon" },
  { id: "edit", label: "edit", icon: <Edit3 size={12} />, status: "soon" },
  { id: "delegate", label: "delegate", icon: <Forward size={12} />, status: "soon" },
  { id: "block", label: "block", icon: <ShieldOff size={12} />, status: "soon" },
  { id: "archive", label: "archive", icon: <XCircle size={12} />, status: "live" }, // archive = reject
];

export function ControlQueueDrawer({
  onApprove,
  onClose,
  onReject,
  open,
  snapshot,
}: ControlQueueDrawerProps) {
  const [activeLane, setActiveLane] = useState<LaneId | "all">("all");

  const pendingItems = snapshot.queue.filter((item) => item.state === "required");
  const resolvedCount = snapshot.queue.length - pendingItems.length;

  return (
    <aside
      aria-hidden={!open}
      aria-label="Control Queue"
      className={cn("approval-drawer control-queue", open && "open")}
    >
      <header>
        <div>
          <span>
            <ShieldCheck size={16} />
            Control Queue
          </span>
          <strong>{pendingItems.length} pending · ⌘⇧A</strong>
        </div>
        <button aria-label="Close Control Queue" onClick={onClose} type="button">
          <X size={16} />
        </button>
      </header>

      <div className="control-queue__summary">
        <p>
          <span>allow</span>
          <strong>{snapshot.summary.allowed}</strong>
        </p>
        <p>
          <span>approved</span>
          <strong>{snapshot.summary.approved}</strong>
        </p>
        <p>
          <span>denied</span>
          <strong>{snapshot.summary.denied}</strong>
        </p>
      </div>

      <div className="control-queue__lanes" role="tablist" aria-label="lane filter">
        <button
          aria-selected={activeLane === "all"}
          className={cn(
            "control-queue__lane",
            activeLane === "all" && "control-queue__lane--active",
          )}
          onClick={() => setActiveLane("all")}
          role="tab"
          type="button"
        >
          <span className="control-queue__lane-label">all</span>
          <span className="control-queue__lane-count">{pendingItems.length}</span>
        </button>
        {LANES.map((lane) => (
          <button
            aria-selected={activeLane === lane.id}
            className={cn(
              "control-queue__lane",
              activeLane === lane.id && "control-queue__lane--active",
              lane.status === "soon" && "control-queue__lane--soon",
            )}
            disabled={lane.status === "soon"}
            key={lane.id}
            onClick={() => setActiveLane(lane.id)}
            role="tab"
            title={lane.status === "soon" ? "곧 추가됨 (protocol handoff schema 대기)" : undefined}
            type="button"
          >
            {lane.icon}
            <span className="control-queue__lane-label">{lane.label}</span>
          </button>
        ))}
      </div>

      <div className="control-queue__list">
        {pendingItems.length === 0 ? (
          <article className="control-queue__empty">
            <CheckCircle2 size={18} />
            <strong>대기 중인 항목 없음</strong>
            <span>
              {resolvedCount > 0
                ? `${resolvedCount}개 항목은 이미 처리됐습니다.`
                : "위험 실행은 아직 큐에 없습니다."}
            </span>
          </article>
        ) : (
          pendingItems.map((item) => (
            <ControlQueueCard
              item={item}
              key={item.id}
              onApprove={onApprove}
              onReject={onReject}
            />
          ))
        )}
      </div>

      <footer className="control-queue__footer">
        <span>
          {LANES.filter((l) => l.status === "live").length} live lane · {LANES.filter((l) => l.status === "soon").length} pending schema
        </span>
        <kbd>esc</kbd>
      </footer>
    </aside>
  );
}

function ControlQueueCard({
  item,
  onApprove,
  onReject,
}: {
  item: ApprovalQueueItem;
  onApprove: (sourceItemId: string) => void;
  onReject: (sourceItemId: string) => void;
}) {
  return (
    <article className="control-queue__card">
      <header>
        <div>
          <span>
            <Clock3 size={12} />
            {item.requestedBy}
          </span>
          <strong>{item.summary}</strong>
        </div>
        <em>{item.state}</em>
      </header>
      <p>{item.permissions.join(" · ")}</p>
      <small className="control-queue__card-id">{item.sourceItemId}</small>
      <div className="control-queue__card-actions">
        <button
          className="control-queue__card-action control-queue__card-action--approve"
          onClick={() => onApprove(item.sourceItemId)}
          type="button"
          title="approve"
        >
          <CheckCircle2 size={12} />
          approve
        </button>
        <button
          className="control-queue__card-action"
          disabled
          type="button"
          title="ask — protocol handoff schema 대기"
        >
          <HelpCircle size={12} />
          ask
        </button>
        <button
          className="control-queue__card-action"
          disabled
          type="button"
          title="edit — protocol handoff schema 대기"
        >
          <Edit3 size={12} />
          edit
        </button>
        <button
          className="control-queue__card-action"
          disabled
          type="button"
          title="delegate — protocol handoff schema 대기"
        >
          <Forward size={12} />
          delegate
        </button>
        <button
          className="control-queue__card-action"
          disabled
          type="button"
          title="block — protocol handoff schema 대기"
        >
          <ShieldOff size={12} />
          block
        </button>
        <button
          className="control-queue__card-action control-queue__card-action--archive"
          onClick={() => onReject(item.sourceItemId)}
          type="button"
          title="archive (reject)"
        >
          <XCircle size={12} />
          archive
        </button>
      </div>
    </article>
  );
}
