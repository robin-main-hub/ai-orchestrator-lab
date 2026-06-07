import type { AssistantDraft, WorkItem, WorkItemHandoff } from "@ai-orchestrator/protocol";
import { deriveWorkQueueBoard } from "../lib/workItemBoard";

export function WorkItemHandoffPanel({
  drafts,
  handoffs,
  items,
  onArchiveItem,
  onApproveHandoff,
  onRouteItem,
  onSendDraft,
}: {
  drafts: AssistantDraft[];
  handoffs: WorkItemHandoff[];
  items: WorkItem[];
  onArchiveItem: (workItemId: string) => void;
  onApproveHandoff: (handoffId: string) => void;
  onRouteItem: (workItemId: string, lane: WorkItem["lane"]) => void;
  onSendDraft: (draftId: string) => void;
}) {
  const board = deriveWorkQueueBoard({ drafts, handoffs, items });
  const visibleDrafts = board.pendingDrafts;
  const visibleHandoffs = handoffs.filter((handoff) => handoff.approvalState === "required").slice(0, 3);

  return (
    <section className="work-handoff-strip inbox-strip work-os-board" aria-label="작업 대기열 Work OS 보드">
      <header>
        <div>
          <span>작업 대기열</span>
          <strong>
            작업 {board.activeCount}건 / 초안 {visibleDrafts.length}건 / 승인 {board.pendingHandoffCount}건
          </strong>
        </div>
        <em>
          {board.waitingInputCount > 0
            ? `질문 ${board.waitingInputCount}건 대기`
            : board.staleCount > 0
              ? `오래된 작업 ${board.staleCount}건`
              : "작업 항목 우선"}
        </em>
      </header>
      <div className="work-handoff-grid">
        {board.lanes.map((lane) => {
          const firstItem = lane.items[0];

          return (
            <article className={`work-handoff-card inbox-lane ${lane.id}`} key={lane.id}>
              <span className="work-lane-kicker">
                {lane.label} / {lane.count}
                {lane.urgentCount > 0 ? <b>{lane.urgentCount} 높음</b> : null}
                {lane.staleCount > 0 ? <b className="stale">{lane.staleCount} 오래됨</b> : null}
              </span>
              <strong>{firstItem?.title ?? "대기 중인 작업 없음"}</strong>
              <p>{firstItem?.summary ?? "새 작업 항목은 여기에서 자동 분류됩니다."}</p>
              {firstItem ? (
                <dl className="work-item-meta">
                  <div>
                    <dt>경과</dt>
                    <dd>{firstItem.ageLabel}</dd>
                  </div>
                  <div>
                    <dt>우선순위</dt>
                    <dd>{workPriorityLabel(firstItem.priority)}</dd>
                  </div>
                  <div>
                    <dt>화면</dt>
                    <dd>{workSurfaceLabel(firstItem.surface)}</dd>
                  </div>
                </dl>
              ) : null}
              {firstItem ? (
                <div className="inbox-card-actions">
                  {lane.id !== "check" ? (
                    <button onClick={() => onRouteItem(firstItem.id, "check")} type="button">
                      검토로
                    </button>
                  ) : null}
                  {lane.id !== "approve" ? (
                    <button onClick={() => onRouteItem(firstItem.id, "approve")} type="button">
                      승인으로
                    </button>
                  ) : null}
                  <button onClick={() => onArchiveItem(firstItem.id)} type="button">
                    보관
                  </button>
                </div>
              ) : null}
            </article>
          );
        })}
        {visibleDrafts.map((draft) => (
          <article className="work-handoff-card draft" key={draft.id}>
            <span>{workSurfaceLabel(draft.targetSurface)} / {confidenceLabel(draft.confidence)}</span>
            <strong>{draft.title}</strong>
            <p>{draft.body}</p>
            <div className="inbox-card-actions">
              <button onClick={() => onSendDraft(draft.id)} type="button">
                보냄 처리
              </button>
            </div>
          </article>
        ))}
        {visibleHandoffs.map((handoff) => (
          <article className="work-handoff-card approve" key={handoff.id}>
            <span>{workSurfaceLabel(handoff.targetSurface)} / 승인</span>
            <strong>위임 승인 대기</strong>
            <p>{handoff.summary}</p>
            <div className="inbox-card-actions">
              <button onClick={() => onApproveHandoff(handoff.id)} type="button">
                승인 처리
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function workPriorityLabel(priority: WorkItem["priority"]): string {
  const labels: Record<WorkItem["priority"], string> = {
    high: "높음",
    low: "낮음",
    normal: "보통",
    urgent: "긴급",
  };
  return labels[priority];
}

function workSurfaceLabel(surface: WorkItem["surface"] | AssistantDraft["targetSurface"] | undefined): string {
  const labels: Record<NonNullable<WorkItem["surface"]>, string> = {
    coding_packet: "코딩 패킷",
    conversation: "대화",
    debate: "토론",
    execution_slot: "실행 슬롯",
    mobile: "모바일",
    notion: "노션",
    obsidian: "옵시디언",
    tmux: "tmux",
  };
  return surface ? labels[surface] : "없음";
}

function confidenceLabel(confidence: AssistantDraft["confidence"]): string {
  const labels: Record<AssistantDraft["confidence"], string> = {
    high: "높음",
    low: "낮음",
    medium: "중간",
  };
  return labels[confidence];
}
