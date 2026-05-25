import { useState } from "react";
import type {
  AssistantDraft,
  EventEnvelope,
  WorkItem,
  WorkItemHandoff,
} from "@ai-orchestrator/protocol";
import {
  initialAssistantDrafts,
  initialWorkItemHandoffs,
  initialWorkItems,
} from "../seeds/workItems";
import { statusForWorkLane } from "../lib/workbenchDerived";

type AppendWorkbenchEvent = <T>(type: string, payload: T) => EventEnvelope<T>;

type WorkItemsControllerInput = {
  appendEvent: AppendWorkbenchEvent;
};

export function useWorkItemsController({ appendEvent }: WorkItemsControllerInput) {
  const [workItems, setWorkItems] = useState<WorkItem[]>(initialWorkItems);
  const [assistantDrafts, setAssistantDrafts] = useState<AssistantDraft[]>(initialAssistantDrafts);
  const [workItemHandoffs, setWorkItemHandoffs] = useState<WorkItemHandoff[]>(initialWorkItemHandoffs);

  function prependWorkItem(workItem: WorkItem) {
    setWorkItems((items) => [workItem, ...items].slice(0, 12));
  }

  function prependAssistantDraft(assistantDraft: AssistantDraft) {
    setAssistantDrafts((drafts) => [assistantDraft, ...drafts].slice(0, 12));
  }

  function prependWorkItemHandoff(handoff: WorkItemHandoff) {
    setWorkItemHandoffs((handoffs) => [handoff, ...handoffs].slice(0, 12));
  }

  function updateWorkItem(workItemId: string, patch: Partial<WorkItem>) {
    setWorkItems((items) =>
      items.map((item) =>
        item.id === workItemId
          ? {
              ...item,
              ...patch,
            }
          : item,
      ),
    );
  }

  function handleRouteWorkItem(workItemId: string, lane: WorkItem["lane"]) {
    const updatedAt = new Date().toISOString();
    const status = statusForWorkLane(lane);
    updateWorkItem(workItemId, {
      lane,
      status,
      updatedAt,
    });
    appendEvent("work_item.routed", {
      workItemId,
      lane,
      status,
    });
  }

  function handleArchiveWorkItem(workItemId: string) {
    const updatedAt = new Date().toISOString();
    updateWorkItem(workItemId, {
      status: "archived",
      updatedAt,
    });
    appendEvent("work_item.archived", {
      workItemId,
    });
  }

  return {
    assistantDrafts,
    handleArchiveWorkItem,
    handleRouteWorkItem,
    prependAssistantDraft,
    prependWorkItem,
    prependWorkItemHandoff,
    updateWorkItem,
    workItemHandoffs,
    workItems,
  };
}
