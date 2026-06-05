import type { AssistantDraft, WorkItem, WorkItemHandoff } from "@ai-orchestrator/protocol";

export type WorkQueueLaneId = "auto" | "check" | "ask" | "approve" | "blocked";

export const WORK_QUEUE_LANES: Array<{ id: WorkQueueLaneId; label: string }> = [
  { id: "auto", label: "자동" },
  { id: "check", label: "검토" },
  { id: "ask", label: "질문" },
  { id: "approve", label: "승인" },
  { id: "blocked", label: "차단" },
];

const priorityWeight: Record<WorkItem["priority"], number> = {
  urgent: 4,
  high: 3,
  normal: 2,
  low: 1,
};

export type WorkQueueBoardItem = WorkItem & {
  ageLabel: string;
  inboxLane: WorkQueueLaneId;
  isStale: boolean;
};

export type WorkQueueBoardLane = {
  id: WorkQueueLaneId;
  label: string;
  items: WorkQueueBoardItem[];
  count: number;
  urgentCount: number;
  staleCount: number;
};

export type WorkQueueBoard = {
  activeCount: number;
  lanes: WorkQueueBoardLane[];
  pendingDrafts: AssistantDraft[];
  pendingHandoffCount: number;
  staleCount: number;
  waitingInputCount: number;
};

export function classifyWorkItemLane(item: WorkItem): WorkQueueLaneId {
  if (item.status === "blocked" || item.lane === "blocked") {
    return "blocked";
  }

  if (item.missingInfo.some((slot) => slot.required && slot.status === "missing") || item.lane === "ask") {
    return "ask";
  }

  if (item.status === "waiting_approval" || item.lane === "approve") {
    return "approve";
  }

  if (item.lane === "auto") {
    return "auto";
  }

  return "check";
}

export function formatWorkItemAge(createdAt: string, now = new Date()): { ageLabel: string; isStale: boolean } {
  const created = Date.parse(createdAt);

  if (!Number.isFinite(created)) {
    return { ageLabel: "시간 미상", isStale: false };
  }

  const deltaMs = Math.max(0, now.getTime() - created);
  const deltaMinutes = Math.floor(deltaMs / 60_000);

  if (deltaMinutes < 1) {
    return { ageLabel: "방금", isStale: false };
  }

  if (deltaMinutes < 60) {
    return { ageLabel: `${deltaMinutes}분`, isStale: deltaMinutes >= 30 };
  }

  const deltaHours = Math.floor(deltaMinutes / 60);

  if (deltaHours < 24) {
    return { ageLabel: `${deltaHours}시간`, isStale: deltaHours >= 4 };
  }

  const deltaDays = Math.floor(deltaHours / 24);
  return { ageLabel: `${deltaDays}일`, isStale: true };
}

export function deriveWorkQueueBoard({
  drafts,
  handoffs,
  items,
  now = new Date(),
}: {
  drafts: AssistantDraft[];
  handoffs: WorkItemHandoff[];
  items: WorkItem[];
  now?: Date;
}): WorkQueueBoard {
  const activeItems = items
    .filter((item) => item.status !== "archived")
    .map((item): WorkQueueBoardItem => {
      const { ageLabel, isStale } = formatWorkItemAge(item.createdAt, now);
      return {
        ...item,
        ageLabel,
        inboxLane: classifyWorkItemLane(item),
        isStale,
      };
    })
    .sort((a, b) => {
      const priorityDelta = priorityWeight[b.priority] - priorityWeight[a.priority];

      if (priorityDelta !== 0) {
        return priorityDelta;
      }

      return Date.parse(a.createdAt) - Date.parse(b.createdAt);
    });

  const lanes = WORK_QUEUE_LANES.map((lane): WorkQueueBoardLane => {
    const laneItems = activeItems.filter((item) => item.inboxLane === lane.id);

    return {
      ...lane,
      items: laneItems,
      count: laneItems.length,
      urgentCount: laneItems.filter((item) => item.priority === "urgent" || item.priority === "high").length,
      staleCount: laneItems.filter((item) => item.isStale).length,
    };
  });

  return {
    activeCount: activeItems.length,
    lanes,
    pendingDrafts: drafts.filter((draft) => draft.status === "draft" || draft.status === "ready_for_review").slice(0, 3),
    pendingHandoffCount: handoffs.filter((handoff) => handoff.approvalState === "required").length,
    staleCount: activeItems.filter((item) => item.isStale).length,
    waitingInputCount: lanes.find((lane) => lane.id === "ask")?.count ?? 0,
  };
}
