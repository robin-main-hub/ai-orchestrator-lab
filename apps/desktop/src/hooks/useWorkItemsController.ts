import { useEffect, useRef, useState } from "react";
import type {
  AssistantDraft,
  EventEnvelope,
  WorkItem,
  WorkItemHandoff,
} from "@ai-orchestrator/protocol";
import {
  assistantDraftSchema,
  workItemHandoffSchema,
  workItemSchema,
} from "@ai-orchestrator/protocol";
import {
  initialAssistantDrafts,
  initialWorkItemHandoffs,
  initialWorkItems,
} from "../seeds/workItems";
import { readJsonState, writeJsonState } from "../lib/persistentJsonState";
import { statusForWorkLane } from "../lib/workbenchDerived";

type AppendWorkbenchEvent = <T>(type: string, payload: T) => EventEnvelope<T>;

type WorkItemsControllerInput = {
  appendEvent: AppendWorkbenchEvent;
};

const WORK_ITEMS_STORAGE_KEY = "ai-orchestrator.work-items.v1";
const ASSISTANT_DRAFTS_STORAGE_KEY = "ai-orchestrator.assistant-drafts.v1";
const WORK_ITEM_HANDOFFS_STORAGE_KEY = "ai-orchestrator.work-item-handoffs.v1";

export function useWorkItemsController({ appendEvent }: WorkItemsControllerInput) {
  const didHydrateWorkItemsRef = useRef(false);
  const didHydrateAssistantDraftsRef = useRef(false);
  const didHydrateWorkItemHandoffsRef = useRef(false);
  const [workItems, setWorkItems] = useState<WorkItem[]>(() =>
    readJsonState(WORK_ITEMS_STORAGE_KEY, initialWorkItems, parseStoredWorkItems),
  );
  const [assistantDrafts, setAssistantDrafts] = useState<AssistantDraft[]>(() =>
    readJsonState(ASSISTANT_DRAFTS_STORAGE_KEY, initialAssistantDrafts, parseStoredAssistantDrafts),
  );
  const [workItemHandoffs, setWorkItemHandoffs] = useState<WorkItemHandoff[]>(() =>
    readJsonState(WORK_ITEM_HANDOFFS_STORAGE_KEY, initialWorkItemHandoffs, parseStoredWorkItemHandoffs),
  );

  useEffect(() => {
    if (!didHydrateWorkItemsRef.current) {
      didHydrateWorkItemsRef.current = true;
      return;
    }
    writeJsonState(WORK_ITEMS_STORAGE_KEY, workItems);
  }, [workItems]);

  useEffect(() => {
    if (!didHydrateAssistantDraftsRef.current) {
      didHydrateAssistantDraftsRef.current = true;
      return;
    }
    writeJsonState(ASSISTANT_DRAFTS_STORAGE_KEY, assistantDrafts);
  }, [assistantDrafts]);

  useEffect(() => {
    if (!didHydrateWorkItemHandoffsRef.current) {
      didHydrateWorkItemHandoffsRef.current = true;
      return;
    }
    writeJsonState(WORK_ITEM_HANDOFFS_STORAGE_KEY, workItemHandoffs);
  }, [workItemHandoffs]);

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

function parseStoredWorkItems(value: unknown): WorkItem[] {
  return parseStoredArray(value, (item) => workItemSchema.safeParse(item));
}

function parseStoredAssistantDrafts(value: unknown): AssistantDraft[] {
  return parseStoredArray(value, (item) => assistantDraftSchema.safeParse(item));
}

function parseStoredWorkItemHandoffs(value: unknown): WorkItemHandoff[] {
  return parseStoredArray(value, (item) => workItemHandoffSchema.safeParse(item));
}

function parseStoredArray<T>(
  value: unknown,
  parseItem: (item: unknown) => { success: true; data: T } | { success: false },
): T[] {
  if (!Array.isArray(value)) {
    throw new Error("Expected a stored array");
  }

  return value.flatMap((item) => {
    const parsed = parseItem(item);
    return parsed.success ? [parsed.data] : [];
  });
}
