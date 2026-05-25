import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import type { EventEnvelope, RuntimeSnapshot } from "@ai-orchestrator/protocol";
import {
  createInitialEventSyncState,
  pushEventsToDgxEventStorage,
  reduceEventSyncState,
  type Stage14EventSyncState,
} from "../runtime/stage14EventSync";
import {
  createLocalClientEventCache,
  mergeClientEventOutboxEvents,
} from "../runtime/stage29LocalEventStore";
import { mergeEventReplayLogs } from "../runtime/stage18EventReplay";

export type DgxEventSyncController = {
  eventOutbox: EventEnvelope[];
  eventSyncState: Stage14EventSyncState;
  syncedEventIds: Record<string, true>;
  localClientEventCache: ReturnType<typeof createLocalClientEventCache>;
  setEventSyncState: Dispatch<SetStateAction<Stage14EventSyncState>>;
  setSyncedEventIds: Dispatch<SetStateAction<Record<string, true>>>;
  bootstrapLocalEventStorage: () => Promise<void>;
  queueEventForSync: (event: EventEnvelope, options?: { skipRemoteSync?: boolean }) => void;
  syncEventsToDgx: (eventsToSync: EventEnvelope[]) => Promise<void>;
  handleSyncEventStorage: () => Promise<void>;
};

export type UseDgxEventSyncControllerParams = {
  activeSessionId: string;
  eventLog: EventEnvelope[];
  seedEvents: EventEnvelope[];
  setEventLog: Dispatch<SetStateAction<EventEnvelope[]>>;
  setRuntimeSnapshotState: Dispatch<SetStateAction<RuntimeSnapshot>>;
  refreshSessionIndex: () => void | Promise<void>;
};

export function useDgxEventSyncController({
  activeSessionId,
  eventLog,
  seedEvents,
  setEventLog,
  setRuntimeSnapshotState,
  refreshSessionIndex,
}: UseDgxEventSyncControllerParams): DgxEventSyncController {
  const localClientEventCache = useMemo(
    () => createLocalClientEventCache(typeof window === "undefined" ? undefined : window.localStorage),
    [],
  );
  const [eventOutbox, setEventOutbox] = useState<EventEnvelope[]>([]);
  const [eventSyncState, setEventSyncState] = useState<Stage14EventSyncState>(() => createInitialEventSyncState(0));
  const [syncedEventIds, setSyncedEventIds] = useState<Record<string, true>>({});

  async function bootstrapLocalEventStorage() {
    for (const event of seedEvents) {
      await localClientEventCache.append(event);
    }

    const localEvents = await localClientEventCache.listBySession(activeSessionId);
    const localUnsyncedEvents = await localClientEventCache.listUnsynced();
    const queuedEvents = mergeClientEventOutboxEvents([], localUnsyncedEvents);
    setEventLog((events) => mergeEventReplayLogs(events, localEvents));
    setEventOutbox(queuedEvents);

    if (queuedEvents.length > 0) {
      void syncEventsToDgx(queuedEvents);
    } else {
      void syncEventsToDgx(seedEvents);
    }
    void refreshSessionIndex();
  }

  function queueEventForSync(event: EventEnvelope, options?: { skipRemoteSync?: boolean }) {
    void localClientEventCache.append(event);
    if (!options?.skipRemoteSync) {
      void syncEventsToDgx([event]);
    }
  }

  async function syncEventsToDgx(eventsToSync: EventEnvelope[]) {
    if (eventsToSync.length === 0) {
      return;
    }

    for (const event of eventsToSync) {
      await localClientEventCache.append(event);
    }

    setEventSyncState((state) => ({
      ...state,
      status: "syncing",
      outboxCount: Math.max(state.outboxCount, eventsToSync.length),
    }));

    const result = await pushEventsToDgxEventStorage({
      events: eventsToSync,
    });
    if (result.syncedEventIds.length > 0) {
      await localClientEventCache.markProjected(result.syncedEventIds, "dgx-02");
    }

    const localUnsyncedEvents = await localClientEventCache.listUnsynced();
    const nextOutbox = mergeClientEventOutboxEvents(localUnsyncedEvents, result.queuedEvents);
    setEventOutbox(nextOutbox);

    setEventSyncState((state) => {
      const nextState = reduceEventSyncState(state, result);
      return {
        ...nextState,
        status: nextOutbox.length > 0 && nextState.status === "synced" ? "queued" : nextState.status,
        outboxCount: nextOutbox.length,
      };
    });
    if (result.syncedEventIds.length > 0) {
      setSyncedEventIds((current) => ({
        ...current,
        ...Object.fromEntries(result.syncedEventIds.map((eventId) => [eventId, true])),
      }));
    }
    const dgxReachable = Boolean(result.response);
    setRuntimeSnapshotState((snapshot) => ({
      ...snapshot,
      status: dgxReachable && nextOutbox.length === 0 ? "online" : "degraded",
      dgxStatus: dgxReachable ? "online" : "offline",
      memorySyncStatus: result.status === "synced" && nextOutbox.length === 0 ? "online" : "degraded",
      runtimeNodes: snapshot.runtimeNodes.map((node) =>
        node.id === "dgx-02"
          ? {
              ...node,
              status: dgxReachable ? "online" : "offline",
            }
          : node,
      ),
      syncTopology: {
        ...snapshot.syncTopology,
        clients: snapshot.syncTopology.clients.map((client) =>
          client.id === "client_macbook"
            ? {
                ...client,
                status: nextOutbox.length === 0 ? "online" : "degraded",
                outboxCount: nextOutbox.length,
                lastSeenAt: result.response?.createdAt ?? client.lastSeenAt,
              }
            : client.id === "client_home_pc"
              ? {
                  ...client,
                  status: dgxReachable ? "online" : "degraded",
                  outboxCount: 0,
                  lastSeenAt: result.response?.createdAt ?? client.lastSeenAt,
                }
              : client,
        ),
      },
      recentError:
        result.status === "queued"
          ? `DGX-02 Event Storage unavailable; MacBook local outbox active, Home PC waits for DGX recovery. ${result.error ?? ""}`
          : result.status === "failed"
            ? `Event Storage sync needs review. ${result.error ?? ""}`
            : undefined,
      updatedAt: result.response?.createdAt ?? new Date().toISOString(),
    }));

    if (dgxReachable) {
      void refreshSessionIndex();
    }
  }

  async function handleSyncEventStorage() {
    const unsyncedEvents = eventLog.filter((event) => !syncedEventIds[event.id]);
    const localUnsyncedEvents = await localClientEventCache.listUnsynced();
    void syncEventsToDgx(
      mergeClientEventOutboxEvents(eventOutbox, mergeClientEventOutboxEvents(localUnsyncedEvents, unsyncedEvents)),
    );
  }

  return {
    eventOutbox,
    eventSyncState,
    syncedEventIds,
    localClientEventCache,
    setEventSyncState,
    setSyncedEventIds,
    bootstrapLocalEventStorage,
    queueEventForSync,
    syncEventsToDgx,
    handleSyncEventStorage,
  };
}
