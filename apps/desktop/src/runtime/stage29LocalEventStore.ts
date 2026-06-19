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
      save([{ event: redactEventForLocalCache(event), projectedTo: {} }, ...load()]);
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

const LOCAL_SECRET_REDACTION = "[REDACTED:secret]";

const LOCAL_SECRET_LIKE_PATTERNS: ReadonlyArray<RegExp> = [
  /\bsk-[A-Za-z0-9_-]{16,}\b/g,
  /\b(?:claude|anthropic|grok|xai|deepseek|ghp|gho|ghs|ghr|ghu|glpat|pat)[-_][A-Za-z0-9_-]{16,}\b/gi,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}\b/gi,
  /\b(?:API_KEY|AUTH_TOKEN|SECRET|TOKEN|PASSWORD|PRIVATE_KEY)\s*[:=]\s*[^"'\s,}]{4,}/gi,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
];

const LOCAL_SENSITIVE_KEY_PATTERN =
  /^(api[-_]?key|auth[-_]?header|authorization|bearer|cookie|password|secret|access[-_]?token|refresh[-_]?token|session[-_]?token|private[-_]?key)$/i;

function redactEventForLocalCache(event: EventEnvelope): EventEnvelope {
  const result = redactLocalUnknown(event) as { value: EventEnvelope; redacted: boolean };
  return result.redacted ? { ...result.value, redacted: true } : result.value;
}

function redactLocalUnknown(value: unknown, keyHint?: string): { value: unknown; redacted: boolean } {
  if (typeof value === "string") {
    return redactLocalString(value);
  }

  if (Array.isArray(value)) {
    let redacted = false;
    const entries = value.map((entry) => {
      const result = redactLocalUnknown(entry);
      redacted ||= result.redacted;
      return result.value;
    });
    return { value: entries, redacted };
  }

  if (!value || typeof value !== "object") {
    return { value, redacted: false };
  }

  let redacted = false;
  const entries = Object.entries(value as Record<string, unknown>).map(([key, entry]) => {
    if (LOCAL_SENSITIVE_KEY_PATTERN.test(key) || (keyHint && LOCAL_SENSITIVE_KEY_PATTERN.test(keyHint))) {
      redacted ||= entry !== LOCAL_SECRET_REDACTION;
      return [key, LOCAL_SECRET_REDACTION];
    }

    const result = redactLocalUnknown(entry, key);
    redacted ||= result.redacted;
    return [key, result.value];
  });

  return { value: Object.fromEntries(entries), redacted };
}

function redactLocalString(value: string): { value: string; redacted: boolean } {
  let redacted = value;
  for (const pattern of LOCAL_SECRET_LIKE_PATTERNS) {
    redacted = redacted.replace(pattern, LOCAL_SECRET_REDACTION);
  }
  return {
    value: redacted,
    redacted: redacted !== value,
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
