import { describe, expect, it } from "vitest";
import type { EventEnvelope } from "@ai-orchestrator/protocol";
import {
  createBrowserEventOutboxStorage,
  createOutboxSnapshot,
  mergeOutboxEvents,
  removeSyncedOutboxEvents,
  type Stage16StorageLike,
} from "./stage16LocalOutbox";

const eventA: EventEnvelope = {
  id: "event_a",
  sessionId: "session_1",
  type: "conversation.message.created",
  payload: { redaction: "applied" },
  createdAt: "2026-05-24T00:00:00.000Z",
  source: "desktop",
  sourceTrust: "trusted",
  redacted: true,
};

const eventB: EventEnvelope = {
  ...eventA,
  id: "event_b",
  createdAt: "2026-05-24T00:01:00.000Z",
};

describe("stage16 local outbox", () => {
  it("persists the MacBook outbox in browser storage", () => {
    const storage = createMemoryStorage();
    const outbox = createBrowserEventOutboxStorage(storage, "test-outbox");

    outbox.save([eventA]);
    const restored = createBrowserEventOutboxStorage(storage, "test-outbox");
    const snapshot = createOutboxSnapshot(restored, "client_macbook", "2026-05-24T00:02:00.000Z");

    expect(restored.kind).toBe("browser_local_storage");
    expect(snapshot.clientId).toBe("client_macbook");
    expect(snapshot.events[0]?.id).toBe("event_a");
  });

  it("dedupes and removes synced events", () => {
    const merged = mergeOutboxEvents([eventA], [eventA, eventB]);
    const remaining = removeSyncedOutboxEvents(merged, ["event_b"]);

    expect(merged.map((event) => event.id)).toEqual(["event_b", "event_a"]);
    expect(remaining.map((event) => event.id)).toEqual(["event_a"]);
  });

  it("falls back to memory when browser storage is unavailable", () => {
    const outbox = createBrowserEventOutboxStorage(undefined, "unused");

    outbox.save([eventA]);

    expect(outbox.kind).toBe("memory_fallback");
    expect(outbox.load()[0]?.id).toBe("event_a");
  });
});

function createMemoryStorage(): Stage16StorageLike {
  const values = new Map<string, string>();
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}
