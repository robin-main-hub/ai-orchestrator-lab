import type { EventEnvelope } from "@ai-orchestrator/protocol";

export type Stage16OutboxStorageKind = "browser_local_storage" | "memory_fallback";

export type Stage16OutboxSnapshot = {
  clientId: string;
  storage: Stage16OutboxStorageKind;
  events: EventEnvelope[];
  updatedAt: string;
};

export type Stage16OutboxStorage = {
  kind: Stage16OutboxStorageKind;
  load(): EventEnvelope[];
  save(events: EventEnvelope[]): void;
  clear(): void;
};

export type Stage16StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

const defaultOutboxKey = "ai-orchestrator:event-outbox:client_macbook";

export function createBrowserEventOutboxStorage(
  storage?: Stage16StorageLike,
  key = defaultOutboxKey,
): Stage16OutboxStorage {
  if (!storage) {
    let events: EventEnvelope[] = [];
    return {
      kind: "memory_fallback",
      load() {
        return events;
      },
      save(nextEvents) {
        events = dedupeEvents(nextEvents);
      },
      clear() {
        events = [];
      },
    };
  }

  return {
    kind: "browser_local_storage",
    load() {
      return parseStoredEvents(storage.getItem(key));
    },
    save(events) {
      storage.setItem(key, JSON.stringify(dedupeEvents(events)));
    },
    clear() {
      storage.removeItem(key);
    },
  };
}

export function createOutboxSnapshot(
  storage: Stage16OutboxStorage,
  clientId = "client_macbook",
  updatedAt = new Date().toISOString(),
): Stage16OutboxSnapshot {
  return {
    clientId,
    storage: storage.kind,
    events: storage.load(),
    updatedAt,
  };
}

export function mergeOutboxEvents(currentEvents: EventEnvelope[], nextEvents: EventEnvelope[]): EventEnvelope[] {
  return dedupeEvents([...nextEvents, ...currentEvents]).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function removeSyncedOutboxEvents(events: EventEnvelope[], syncedEventIds: string[]): EventEnvelope[] {
  const syncedIds = new Set(syncedEventIds);
  return events.filter((event) => !syncedIds.has(event.id));
}

function parseStoredEvents(rawValue: string | null): EventEnvelope[] {
  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isEventEnvelope);
  } catch {
    return [];
  }
}

function dedupeEvents(events: EventEnvelope[]): EventEnvelope[] {
  return Array.from(new Map(events.map((event) => [event.id, event])).values());
}

function isEventEnvelope(value: unknown): value is EventEnvelope {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as EventEnvelope;
  return Boolean(
    candidate.id &&
      candidate.sessionId &&
      candidate.type &&
      candidate.createdAt &&
      candidate.source &&
      candidate.sourceTrust,
  );
}
