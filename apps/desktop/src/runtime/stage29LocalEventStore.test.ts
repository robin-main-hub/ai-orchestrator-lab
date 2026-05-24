import { describe, expect, it } from "vitest";
import type { EventEnvelope } from "@ai-orchestrator/protocol";
import {
  createLocalClientEventCache,
  createLocalClientOutboxSnapshot,
  mergeClientEventOutboxEvents,
} from "./stage29LocalEventStore";

const eventA: EventEnvelope = {
  id: "event_a",
  sessionId: "session_desktop_001",
  type: "conversation.message.created",
  payload: { content: "first" },
  createdAt: "2026-05-24T00:00:00.000Z",
  source: "desktop",
  sourceTrust: "trusted",
  redacted: true,
};

const eventB: EventEnvelope = {
  id: "event_b",
  sessionId: "session_desktop_001",
  type: "coding_packet.created",
  payload: { goal: "ship local client cache" },
  createdAt: "2026-05-24T00:01:00.000Z",
  source: "agent",
  sourceTrust: "trusted",
  redacted: true,
};

describe("stage29 local client event cache", () => {
  it("keeps MacBook cache events locally and lists them by session", async () => {
    const store = createLocalClientEventCache();

    await store.append(eventB);
    await store.append(eventA);

    const sessionEvents = await store.listBySession("session_desktop_001");
    expect(sessionEvents.map((event) => event.id)).toEqual(["event_a", "event_b"]);
  });

  it("treats unsynced events as projection outbox until DGX-02 is marked", async () => {
    const store = createLocalClientEventCache();

    await store.append(eventA);
    await store.append(eventB);
    await store.markProjected(["event_a"], "dgx-02");

    const unsynced = await store.listUnsynced();
    expect(unsynced.map((event) => event.id)).toEqual(["event_b"]);
  });

  it("persists through a localStorage-compatible adapter without taking DGX authority", async () => {
    const memoryStorage = new Map<string, string>();
    const storage = {
      getItem: (key: string) => memoryStorage.get(key) ?? null,
      setItem: (key: string, value: string) => memoryStorage.set(key, value),
      removeItem: (key: string) => memoryStorage.delete(key),
    };

    const firstStore = createLocalClientEventCache(storage);
    await firstStore.append(eventA);

    const secondStore = createLocalClientEventCache(storage);
    expect(await secondStore.listUnsynced()).toHaveLength(1);
    await secondStore.markProjected(["event_a"], "dgx-02");
    expect(await secondStore.listUnsynced()).toHaveLength(0);
  });

  it("is the single client projection outbox source for unsynced events", async () => {
    const outbox = mergeClientEventOutboxEvents([eventA], [eventA, eventB]);
    const snapshot = createLocalClientOutboxSnapshot(outbox, "client_macbook", "dgx-02", "2026-05-24T00:02:00.000Z");

    expect(outbox.map((event) => event.id)).toEqual(["event_b", "event_a"]);
    expect(snapshot.clientId).toBe("client_macbook");
    expect(snapshot.projectionTarget).toBe("dgx-02");
    expect(snapshot.events).toHaveLength(2);
  });
});
