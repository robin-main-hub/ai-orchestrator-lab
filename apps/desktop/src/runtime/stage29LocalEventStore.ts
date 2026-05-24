import type { EventEnvelope } from "@ai-orchestrator/protocol";
import type { Stage16StorageLike } from "./stage16LocalOutbox";

export type ProjectionTarget = "dgx-02";

export type LocalClientEventCache = {
  append(event: EventEnvelope): Promise<void>;
  listBySession(sessionId: string): Promise<EventEnvelope[]>;
  listUnsynced(): Promise<EventEnvelope[]>;
  markProjected(eventIds: string[], projectionTarget: ProjectionTarget): Promise<void>;
};

type StoredClientCachedEvent = {
  event: EventEnvelope;
  projectedTo: Partial<Record<ProjectionTarget, string>>;
};

const defaultStoreKey = "ai-orchestrator:local-event-cache:client_macbook";

export function createLocalClientEventCache(
  storage?: Stage16StorageLike,
  key = defaultStoreKey,
): LocalClientEventCache {
  let memoryRecords: StoredClientCachedEvent[] = [];

  const load = () => {
    if (!storage) {
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

    storage.setItem(key, JSON.stringify(deduped));
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
  return Array.from(new Map(records.map((record) => [record.event.id, record])).values());
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
