import type { AssistantDraft, WorkItem, WorkItemHandoff } from "@ai-orchestrator/protocol";

function workLaneLabel(lane: WorkItem["lane"]) {
  const labels: Partial<Record<WorkItem["lane"], string>> = {
    auto: "자동",
    check: "검토",
    ask: "질문",
    approve: "승인",
    blocked: "차단",
    inbox: "수신",
    conversation: "대화",
    debate: "토론",
    coding: "코딩",
    review: "리뷰",
    execution: "실행",
    memory: "기억",
    backup: "백업",
  };

  return labels[lane] ?? lane;
}

function getInboxLane(item: WorkItem): "auto" | "check" | "ask" | "approve" | "blocked" {
  if (item.status === "blocked" || item.lane === "blocked") {
    return "blocked";
  }

  if (item.missingInfo.some((slot) => slot.required && slot.status === "missing") || item.lane === "ask") {
    return "ask";
  }

  if (item.status === "waiting_approval" || item.kind === "approval" || item.lane === "approve") {
    return "approve";
  }

  if (item.lane === "auto") {
    return "auto";
  }

  return "check";
}

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
  const activeItems = items.filter((item) => item.status !== "archived").slice(0, 12);
  const lanes = [
    { id: "auto" as const, label: workLaneLabel("auto") },
    { id: "check" as const, label: workLaneLabel("check") },
    { id: "ask" as const, label: workLaneLabel("ask") },
    { id: "approve" as const, label: workLaneLabel("approve") },
    { id: "blocked" as const, label: workLaneLabel("blocked") },
  ];
  const laneItems = Object.fromEntries(
    lanes.map((lane) => [lane.id, activeItems.filter((item) => getInboxLane(item) === lane.id)]),
  ) as Record<(typeof lanes)[number]["id"], WorkItem[]>;
  const visibleDrafts = drafts.slice(0, 2);
  const pendingHandoffs = handoffs.filter((handoff) => handoff.approvalState === "required").length;
  const waitingInput = laneItems.ask.length;

  return (
    <section className="work-handoff-strip inbox-strip" aria-label="Control Queue strip">
      <header>
        <div>
          <span>Control Queue</span>
          <strong>
            {activeItems.length} tasks / {visibleDrafts.length} drafts / {pendingHandoffs} approvals
          </strong>
        </div>
        <em>{waitingInput > 0 ? `${waitingInput} questions pending` : "WorkItem first"}</em>
      </header>
      <div className="work-handoff-grid">
        {lanes.map((lane) => {
          const firstItem = laneItems[lane.id][0];

          return (
            <article className={`work-handoff-card inbox-lane ${lane.id}`} key={lane.id}>
              <span>
                {lane.label} / {laneItems[lane.id].length}
              </span>
              <strong>{firstItem?.title ?? "No waiting item"}</strong>
              <p>{firstItem?.summary ?? "New WorkItems will be classified here."}</p>
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
