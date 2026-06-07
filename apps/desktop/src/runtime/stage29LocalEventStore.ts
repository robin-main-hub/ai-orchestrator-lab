import type { EventEnvelope } from "@ai-orchestrator/protocol";

export type ProjectionTarget = "dgx-02";

export type ClientEventStorageLike = Pick<Storage, "getItem" | "setItem">;

export type LocalClientEventCache = {
  append(event: EventEnvelope): Promise<void>;
  listBySession(sessionId: string): Promise<EventEnvelope[]>;
  listUnsynced(): Promise<EventEnvelope[]>;
  markProjected(eventIds: string[], projectionTarget: ProjectionTarget): Promise<void>;
};

export type LocalClientOutboxSnapshot = {
  clientId: string;
  projectionTarget: ProjectionTarget;
  events: EventEnvelope[];
  updatedAt: string;
};

type StoredClientCachedEvent = {
  event: EventEnvelope;
  projectedTo: Partial<Record<ProjectionTarget, string>>;
};

const defaultStoreKey = "ai-orchestrator:local-event-cache:client_macbook";

// This is the single desktop-side cache/outbox for DGX-02 Event Storage.
// DGX-02 remains the authority; this store only preserves client events until
// they are projected to the authority and keeps a local replay cache.
export function createLocalClientEventCache(
  storage?: ClientEventStorageLike,
  key = defaultStoreKey,
): LocalClientEventCache {
  let memoryRecords: StoredClientCachedEvent[] = [];
  let storageDisabled = false;

  const load = () => {
    if (!storage || storageDisabled) {
      return memoryRecords;
    }

    return parseRecords(storage.getItem(key));
  };

  const save = (records: StoredClientCachedEvent[]) => {
    const deduped = dedupeRecords(records);
    if (!storage) {
      memoryRecords = deduped;
      return;
    }

    try {
      storage.setItem(key, JSON.stringify(deduped));
    } catch {
      storageDisabled = true;
      memoryRecords = deduped;
    }
  };

  return {
    async append(event) {
      save([{ event, projectedTo: {} }, ...load()]);
    },
    async listBySession(sessionId) {
      return load()
        .map((record) => record.event)
        .filter((event) => event.sessionId === sessionId)
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    },
    async listUnsynced() {
      return load()
        .filter((record) => !record.projectedTo["dgx-02"])
        .map((record) => record.event)
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    },
    async markProjected(eventIds, projectionTarget) {
      const projectedAt = new Date().toISOString();
      const projectedIds = new Set(eventIds);
      save(
        load().map((record) =>
          projectedIds.has(record.event.id)
            ? {
                ...record,
                projectedTo: {
                  ...record.projectedTo,
                  [projectionTarget]: projectedAt,
                },
              }
            : record,
        ),
      );
    },
  };
}

export function createLocalClientOutboxSnapshot(
  events: EventEnvelope[],
  clientId = "client_macbook",
  projectionTarget: ProjectionTarget = "dgx-02",
  updatedAt = new Date().toISOString(),
): LocalClientOutboxSnapshot {
  return {
    clientId,
    projectionTarget,
    events: mergeClientEventOutboxEvents([], events),
    updatedAt,
  };
}

export function mergeClientEventOutboxEvents(
  currentEvents: EventEnvelope[],
  nextEvents: EventEnvelope[],
): EventEnvelope[] {
  return dedupeEvents([...nextEvents, ...currentEvents]).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function parseRecords(rawValue: string | null): StoredClientCachedEvent[] {
  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isStoredClientCachedEvent);
  } catch {
    return [];
  }
}

function dedupeRecords(records: StoredClientCachedEvent[]): StoredClientCachedEvent[] {
  const dedupedByEventId = new Map<string, StoredClientCachedEvent>();

  for (const record of records) {
    const existing = dedupedByEventId.get(record.event.id);
    dedupedByEventId.set(record.event.id, existing ? mergeCachedEventRecords(record, existing) : record);
  }

  return Array.from(dedupedByEventId.values());
}

function dedupeEvents(events: EventEnvelope[]): EventEnvelope[] {
  return Array.from(new Map(events.map((event) => [event.id, event])).values());
}

function mergeCachedEventRecords(
  currentRecord: StoredClientCachedEvent,
  existingRecord: StoredClientCachedEvent,
): StoredClientCachedEvent {
  return {
    event: currentRecord.event,
    projectedTo: {
      ...existingRecord.projectedTo,
      ...currentRecord.projectedTo,
    },
  };
}

function isStoredClientCachedEvent(value: unknown): value is StoredClientCachedEvent {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as StoredClientCachedEvent;
  return Boolean(
    candidate.event &&
      candidate.event.id &&
      candidate.event.sessionId &&
      candidate.event.type &&
      candidate.event.createdAt &&
      candidate.event.source &&
      candidate.event.sourceTrust &&
      candidate.projectedTo &&
      typeof candidate.projectedTo === "object",
  );
}
