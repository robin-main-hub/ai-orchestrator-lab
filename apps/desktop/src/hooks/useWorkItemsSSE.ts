import { useEffect, useRef } from "react";
import { useWorkItemsStore } from "../store/useWorkItemsStore";
import { useStreamingStore } from "../store/useStreamingStore";
import { fetchControlQueueItems } from "../runtime/controlQueueApi";
import { resolveDgxServerBaseUrls } from "../runtime/stage30DgxEndpoints";

export function useWorkItemsSSE(sessionId: string = "session_desktop_001") {
  const { setWorkItems, updateWorkItem, prependWorkItem, setError } = useWorkItemsStore();
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    // 1. Initial Load
    fetchControlQueueItems({ sessionId })
      .then((items) => setWorkItems(items))
      .catch((err) => {
        console.error("Failed to load initial control queue items:", err);
        setError(err instanceof Error ? err.message : String(err));
      });

    // 2. Establish SSE Stream Connection
    const baseUrls = resolveDgxServerBaseUrls();
    const primaryUrl = baseUrls[0] || "http://localhost:4317";
    const sseUrl = `${primaryUrl}/events/stream?sessionId=${encodeURIComponent(sessionId)}`;
    
    console.info(`[SSE Controller] Opening EventSource stream connection to ${sseUrl}`);
    const es = new EventSource(sseUrl);
    eventSourceRef.current = es;

    // Listen for work_item updates
    es.addEventListener("work_item_update", (event: MessageEvent) => {
      try {
        const eventsArray = JSON.parse(event.data);
        if (Array.isArray(eventsArray)) {
          for (const ev of eventsArray) {
            if (ev.type === "work_item.created") {
              const item = ev.payload?.workItem || ev.payload;
              if (item && item.id) {
                prependWorkItem(item);
              }
            } else if (ev.type === "work_item.status_changed" || ev.type === "work_item.updated") {
              const id = ev.payload?.id || ev.payload?.workItemId;
              if (id) {
                updateWorkItem(id, ev.payload?.patch || ev.payload);
              }
            }
          }
        }
      } catch (err) {
        console.error("[SSE Controller] JSON parsing error on work_item_update:", err);
      }
    });

    // Listen for agent activity updates
    es.addEventListener("agent_activity_update", (event: MessageEvent) => {
      try {
        const eventsArray = JSON.parse(event.data);
        if (Array.isArray(eventsArray)) {
          for (const ev of eventsArray) {
            if (ev.type === "agent.activity.changed") {
              const { agentId, currentStep } = ev.payload;
              if (agentId && currentStep) {
                useStreamingStore.getState().setAgentStep(agentId, currentStep);
              }
            }
          }
        }
      } catch (err) {
        console.error("[SSE Controller] JSON parsing error on agent_activity_update:", err);
      }
    });

    es.onerror = (err) => {
      console.warn("[SSE Controller] Connection disconnected or failed, reconnecting...", err);
    };

    return () => {
      console.info("[SSE Controller] Closing EventSource stream connection");
      es.close();
    };
  }, [sessionId, setWorkItems, updateWorkItem, prependWorkItem, setError]);
}

