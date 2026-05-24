import type {
  EventEnvelope,
  EventSyncItemResult,
  EventSyncPushRequest,
  EventSyncPushResponse,
} from "@ai-orchestrator/protocol";

export type Stage14EventSyncStatus = "synced" | "syncing" | "queued" | "failed";

export type Stage14EventSyncState = {
  status: Stage14EventSyncStatus;
  outboxCount: number;
  serverRevision?: number;
  lastSyncedAt?: string;
  lastError?: string;
};

export type Stage14EventSyncPushResult = {
  status: Exclude<Stage14EventSyncStatus, "syncing">;
  response?: EventSyncPushResponse;
  queuedEvents: EventEnvelope[];
  syncedEventIds: string[];
  error?: string;
};

export type Stage14EventSyncInput = {
  events: EventEnvelope[];
  clientId?: string;
  sessionId?: string;
  serverBaseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  createdAt?: string;
};

const DEFAULT_DGX_EVENT_SYNC_BASE_URL = "http://dgx-02:4317";

export function createInitialEventSyncState(outboxCount = 0): Stage14EventSyncState {
  return {
    status: outboxCount > 0 ? "queued" : "synced",
    outboxCount,
  };
}

export function createEventSyncPushRequest({
  events,
  clientId = "client_macbook",
  sessionId = events[0]?.sessionId ?? "session_desktop_001",
  createdAt = new Date().toISOString(),
}: Pick<Stage14EventSyncInput, "events" | "clientId" | "sessionId" | "createdAt">): EventSyncPushRequest {
  return {
    id: `event_sync_push_${crypto.randomUUID()}`,
    clientId,
    sessionId,
    events,
    idempotencyKey: `${clientId}:${sessionId}:${events.map((event) => event.id).join(",")}`,
    createdAt,
  };
}

export async function pushEventsToDgxEventStorage({
  events,
  clientId = "client_macbook",
  sessionId = events[0]?.sessionId ?? "session_desktop_001",
  serverBaseUrl = DEFAULT_DGX_EVENT_SYNC_BASE_URL,
  fetchImpl = fetch,
  timeoutMs = 1_500,
  createdAt = new Date().toISOString(),
}: Stage14EventSyncInput): Promise<Stage14EventSyncPushResult> {
  if (events.length === 0) {
    return {
      status: "synced",
      queuedEvents: [],
      syncedEventIds: [],
    };
  }

  const request = createEventSyncPushRequest({
    events,
    clientId,
    sessionId,
    createdAt,
  });
  const endpoint = `${serverBaseUrl.replace(/\/$/, "")}/events/sync`;

  try {
    const response = await fetchWithTimeout(
      fetchImpl,
      endpoint,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(request),
      },
      timeoutMs,
    );
    const rawText = await response.text();

    if (!response.ok) {
      throw new Error(`DGX-02 Event Storage sync failed: ${response.status} ${rawText.slice(0, 240)}`);
    }

    const syncResponse = JSON.parse(rawText) as EventSyncPushResponse;
    const syncedEventIds = getSyncedEventIds(syncResponse.results);
    const queuedEvents = events.filter((event) => !syncedEventIds.includes(event.id));

    return {
      status: queuedEvents.length === 0 ? "synced" : "failed",
      response: syncResponse,
      queuedEvents,
      syncedEventIds,
      error: queuedEvents.length > 0 ? `${queuedEvents.length} events need conflict review` : undefined,
    };
  } catch (error) {
    return {
      status: "queued",
      queuedEvents: events,
      syncedEventIds: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function reduceEventSyncState(
  previous: Stage14EventSyncState,
  result: Stage14EventSyncPushResult,
): Stage14EventSyncState {
  if (result.response) {
    return {
      status: result.status,
      outboxCount: result.queuedEvents.length,
      serverRevision: result.response.serverRevision,
      lastSyncedAt: result.response.createdAt,
      lastError: result.error,
    };
  }

  return {
    ...previous,
    status: result.status,
    outboxCount: result.queuedEvents.length,
    lastError: result.error,
  };
}

function getSyncedEventIds(results: EventSyncItemResult[]) {
  return results
    .filter((result) => result.status === "accepted" || result.status === "duplicate")
    .map((result) => result.eventId);
}

async function fetchWithTimeout(fetchImpl: typeof fetch, input: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    return await fetchImpl(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}
