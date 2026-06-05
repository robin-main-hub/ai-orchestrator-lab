import type { AssistantDraft, WorkItem, WorkItemHandoff } from "@ai-orchestrator/protocol";
import { deriveWorkQueueBoard } from "../lib/workItemBoard";

export function WorkItemHandoffPanel({
  drafts,
  handoffs,
  items,
  onArchiveItem,
  onRouteItem,
}: {
  drafts: AssistantDraft[];
  handoffs: WorkItemHandoff[];
  items: WorkItem[];
  onArchiveItem: (workItemId: string) => void;
  onRouteItem: (workItemId: string, lane: WorkItem["lane"]) => void;
}) {
  const board = deriveWorkQueueBoard({ drafts, handoffs, items });
  const visibleDrafts = board.pendingDrafts;

  return (
    <section className="work-handoff-strip inbox-strip work-os-board" aria-label="Control Queue Work OS board">
      <header>
        <div>
          <span>Control Queue</span>
          <strong>
            {board.activeCount} tasks / {visibleDrafts.length} drafts / {board.pendingHandoffCount} approvals
          </strong>
        </div>
        <em>
          {board.waitingInputCount > 0
            ? `${board.waitingInputCount} questions pending`
            : board.staleCount > 0
              ? `${board.staleCount} stale items`
              : "WorkItem first"}
        </em>
      </header>
      <div className="work-handoff-grid">
        {board.lanes.map((lane) => {
          const firstItem = lane.items[0];

          return (
            <article className={`work-handoff-card inbox-lane ${lane.id}`} key={lane.id}>
              <span className="work-lane-kicker">
                {lane.label} / {lane.count}
                {lane.urgentCount > 0 ? <b>{lane.urgentCount} high</b> : null}
                {lane.staleCount > 0 ? <b className="stale">{lane.staleCount} stale</b> : null}
              </span>
              <strong>{firstItem?.title ?? "No waiting item"}</strong>
              <p>{firstItem?.summary ?? "New WorkItems will be classified here."}</p>
              {firstItem ? (
                <dl className="work-item-meta">
                  <div>
                    <dt>age</dt>
                    <dd>{firstItem.ageLabel}</dd>
                  </div>
                  <div>
                    <dt>priority</dt>
                    <dd>{firstItem.priority}</dd>
                  </div>
                  <div>
                    <dt>surface</dt>
                    <dd>{firstItem.surface ?? "none"}</dd>
                  </div>
                </dl>
              ) : null}
              {firstItem ? (
                <div className="inbox-card-actions">
                  {lane.id !== "check" ? (
                    <button onClick={() => onRouteItem(firstItem.id, "check")} type="button">
                      Check
                    </button>
                  ) : null}
                  {lane.id !== "approve" ? (
                    <button onClick={() => onRouteItem(firstItem.id, "approve")} type="button">
                      Approve
                    </button>
                  ) : null}
                  <button onClick={() => onArchiveItem(firstItem.id)} type="button">
                    Archive
                  </button>
                </div>
              ) : null}
            </article>
          );
        })}
        {visibleDrafts.map((draft) => (
          <article className="work-handoff-card draft" key={draft.id}>
            <span>{draft.targetSurface} / {draft.confidence}</span>
            <strong>{draft.title}</strong>
            <p>{draft.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
