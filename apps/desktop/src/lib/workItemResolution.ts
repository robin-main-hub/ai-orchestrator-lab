import type { AssistantDraft, WorkItem, WorkItemHandoff } from "@ai-orchestrator/protocol";

export type MarkAssistantDraftSentInput = {
  draftId: string;
  drafts: AssistantDraft[];
  items: WorkItem[];
  updatedAt: string;
};

export type MarkAssistantDraftSentResult = {
  drafts: AssistantDraft[];
  items: WorkItem[];
  updated: boolean;
};

export type ApproveWorkItemHandoffInput = {
  handoffId: string;
  handoffs: WorkItemHandoff[];
  items: WorkItem[];
  updatedAt: string;
};

export type ApproveWorkItemHandoffResult = {
  handoffs: WorkItemHandoff[];
  items: WorkItem[];
  updated: boolean;
};

export function markAssistantDraftSentState({
  draftId,
  drafts,
  items,
  updatedAt,
}: MarkAssistantDraftSentInput): MarkAssistantDraftSentResult {
  const targetDraft = drafts.find((draft) => draft.id === draftId);

  if (!targetDraft) {
    return { drafts, items, updated: false };
  }

  return {
    drafts: drafts.map((draft) =>
      draft.id === draftId
        ? {
            ...draft,
            status: "sent",
            updatedAt,
          }
        : draft,
    ),
    items: closeLinkedWorkItem(items, targetDraft.workItemId, updatedAt),
    updated: true,
  };
}

export function approveWorkItemHandoffState({
  handoffId,
  handoffs,
  items,
  updatedAt,
}: ApproveWorkItemHandoffInput): ApproveWorkItemHandoffResult {
  const targetHandoff = handoffs.find((handoff) => handoff.id === handoffId);

  if (!targetHandoff) {
    return { handoffs, items, updated: false };
  }

  return {
    handoffs: handoffs.map((handoff) =>
      handoff.id === handoffId
        ? {
            ...handoff,
            approvalState: "approved",
          }
        : handoff,
    ),
    items: closeLinkedWorkItem(items, targetHandoff.workItemId, updatedAt),
    updated: true,
  };
}

function closeLinkedWorkItem(items: WorkItem[], workItemId: string, updatedAt: string): WorkItem[] {
  return items.map((item) =>
    item.id === workItemId
      ? {
          ...item,
          status: "done",
          updatedAt,
        }
      : item,
  );
}
