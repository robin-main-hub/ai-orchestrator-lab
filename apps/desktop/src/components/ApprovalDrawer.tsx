import { CheckCircle2, Clock3, ShieldCheck, X, XCircle } from "lucide-react";
import type { ApprovalQueueItem, PermissionMatrixSnapshot } from "@ai-orchestrator/protocol";

export function ApprovalDrawer({
  onApprove,
  onClose,
  onReject,
  open,
  snapshot,
}: {
  onApprove: (sourceItemId: string) => void;
  onClose: () => void;
  onReject: (sourceItemId: string) => void;
  open: boolean;
  snapshot: PermissionMatrixSnapshot;
}) {
  const pendingItems = snapshot.queue.filter((item) => item.state === "required");
  const resolvedCount = snapshot.queue.length - pendingItems.length;

  return (
    <aside className={`approval-drawer ${open ? "open" : ""}`} aria-hidden={!open} aria-label="Approval queue">
      <header>
        <div>
          <span>
            <ShieldCheck size={16} />
            승인 큐
          </span>
          <strong>{pendingItems.length} pending</strong>
        </div>
        <button aria-label="Close approval queue" onClick={onClose} type="button">
          <X size={16} />
        </button>
      </header>

      <div className="approval-drawer-summary">
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

      <div className="approval-drawer-list">
        {pendingItems.length === 0 ? (
          <article className="approval-empty-state">
            <CheckCircle2 size={18} />
            <strong>대기 중인 승인 없음</strong>
            <span>{resolvedCount > 0 ? `${resolvedCount}개 항목은 이미 처리됐습니다.` : "위험 실행은 아직 큐에 없습니다."}</span>
          </article>
        ) : (
          pendingItems.map((item) => (
            <ApprovalQueueCard item={item} key={item.id} onApprove={onApprove} onReject={onReject} />
          ))
        )}
      </div>
    </aside>
  );
}

function ApprovalQueueCard({
  item,
  onApprove,
  onReject,
}: {
  item: ApprovalQueueItem;
  onApprove: (sourceItemId: string) => void;
  onReject: (sourceItemId: string) => void;
}) {
  return (
    <article className="approval-queue-card">
      <header>
        <div>
          <span>
            <Clock3 size={14} />
            {item.requestedBy}
          </span>
          <strong>{item.summary}</strong>
        </div>
        <em>{item.state}</em>
      </header>
      <p>{item.permissions.join(" / ")}</p>
      <small>{item.sourceItemId}</small>
      <div className="approval-card-actions">
        <button onClick={() => onReject(item.sourceItemId)} type="button">
          <XCircle size={14} />
          거절
        </button>
        <button className="approve" onClick={() => onApprove(item.sourceItemId)} type="button">
          <CheckCircle2 size={14} />
          승인
        </button>
      </div>
    </article>
  );
}
