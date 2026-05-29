import { useCallback } from "react";
import type {
  AssistantDraft,
  EventEnvelope,
  WorkItem,
  WorkItemHandoff,
} from "@ai-orchestrator/protocol";
import { useWorkItemsStore } from "../store/useWorkItemsStore";
import { useWorkItemsSSE } from "./useWorkItemsSSE";
import { statusForWorkLane } from "../lib/workbenchDerived";
import { fetchControlQueueItems, submitControlQueueAction } from "../runtime/controlQueueApi";

type AppendWorkbenchEvent = <T>(type: string, payload: T) => EventEnvelope<T>;

type WorkItemsControllerInput = {
  appendEvent: AppendWorkbenchEvent;
  sessionId?: string;
};

export function useWorkItemsController({ appendEvent, sessionId = "session_desktop_001" }: WorkItemsControllerInput) {
  // Zustand 전역 상태 바인딩
  const {
    workItems,
    assistantDrafts,
    workItemHandoffs,
    isLoading,
    error,
    setWorkItems,
    updateWorkItem,
    prependWorkItem,
    prependAssistantDraft,
    prependWorkItemHandoff,
    setIsLoading,
    setError,
  } = useWorkItemsStore();

  // SSE 채널 실시간 구독 마운트
  useWorkItemsSSE(sessionId);

  const fetchWorkItems = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const items = await fetchControlQueueItems({ sessionId });
      setWorkItems(items);
    } catch (err) {
      console.error("Failed to fetch control queue items:", err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, setWorkItems, setIsLoading, setError]);

  const handleControlQueueAction = useCallback(async (workItemId: string, action: string, payload?: any) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await submitControlQueueAction({
        workItemId,
        action,
        payload,
        sessionId,
      });
      if (result.success) {
        appendEvent("work_item.action_submitted", {
          workItemId,
          action,
          payload,
          nextStatus: result.nextStatus,
        });
      } else {
        throw new Error("Action failed on server");
      }
    } catch (err) {
      console.error("Failed to submit control queue action:", err);
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      appendEvent("work_item.action_failed", {
        workItemId,
        action,
        error: msg,
      });
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, setIsLoading, setError, appendEvent]);

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
    fetchWorkItems,
    handleControlQueueAction,
    isLoading,
    error,
  };
}
