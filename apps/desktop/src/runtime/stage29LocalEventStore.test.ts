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

  it("redacts secret-like local outbox payloads before browser storage persistence", async () => {
    const memoryStorage = new Map<string, string>();
    const storage = {
      getItem: (key: string) => memoryStorage.get(key) ?? null,
      setItem: (key: string, value: string) => memoryStorage.set(key, value),
    };
    const event: EventEnvelope = {
      id: "event_local_secret_redaction",
      sessionId: "session_desktop_001",
      type: "provider.profile.imported",
      payload: {
        apiKey: "fake-test-sensitive-value",
        label: "kept provider label",
        note: "Bearer fake-token-for-redaction",
      },
      createdAt: "2026-05-24T00:03:00.000Z",
      source: "desktop",
      sourceTrust: "trusted",
      redacted: false,
    };

    const store = createLocalClientEventCache(storage);
    await store.append(event);

    const storedText = [...memoryStorage.values()].join("\n");
    const unsynced = await store.listUnsynced();
    const payload = unsynced[0]?.payload as { apiKey?: string; label?: string; note?: string } | undefined;

    expect(storedText).not.toContain("fake-test-sensitive-value");
    expect(storedText).not.toContain("fake-token-for-redaction");
    expect(payload?.apiKey).toBe("[REDACTED:secret]");
    expect(payload?.note).toBe("[REDACTED:secret]");
    expect(payload?.label).toBe("kept provider label");
    expect(unsynced[0]?.redacted).toBe(true);
  });

  it("falls back to in-memory cache when browser storage quota is exhausted", async () => {
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException("quota", "QuotaExceededError");
      },
    };
    const store = createLocalClientEventCache(storage);

    await expect(store.append(eventA)).resolves.toBeUndefined();
    await expect(store.append(eventB)).resolves.toBeUndefined();

    expect((await store.listBySession("session_desktop_001")).map((event) => event.id)).toEqual(["event_a", "event_b"]);
    expect((await store.listUnsynced()).map((event) => event.id)).toEqual(["event_a", "event_b"]);
  });

  it("does not resurrect a projected event when the local cache re-appends it", async () => {
    const store = createLocalClientEventCache();

    await store.append(eventA);
    await store.markProjected(["event_a"], "dgx-02");
    await store.append(eventA);

    expect(await store.listUnsynced()).toHaveLength(0);
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

// Characterization tests for the local cache's persistence/recovery durability
// boundary (no behavior change, no DGX authority). These pin existing behavior
// on previously-uncovered branches: corrupt/non-array/invalid stored-record
// recovery (parseRecords resilience), projection-mark preservation across a
// storage-backed reload (vs the in-memory resurrection test above), outbox
// snapshot defaults, and outbox id-collision precedence.
describe("stage29 local cache — persistence/recovery durability characterization", () => {
  it("starts empty without throwing when the stored cache JSON is corrupt", async () => {
    const storage = {
      getItem: () => "not-json{definitely[broken",
      setItem: () => undefined,
    };
    const store = createLocalClientEventCache(storage);

    expect(await store.listUnsynced()).toEqual([]);
    await expect(store.append(eventA)).resolves.toBeUndefined();
  });

  it("ignores a non-array stored cache payload", async () => {
    const storage = {
      getItem: () => JSON.stringify({ not: "an array" }),
      setItem: () => undefined,
    };
    const store = createLocalClientEventCache(storage);

    expect(await store.listBySession("session_desktop_001")).toEqual([]);
  });

  it("drops structurally-invalid stored records while keeping valid ones", async () => {
    const storedRecords = JSON.stringify([
      { event: eventA, projectedTo: {} },
      { event: { id: "event_partial" }, projectedTo: {} },
      { event: eventB, projectedTo: {} },
      "totally-not-a-record",
    ]);
    const storage = {
      getItem: () => storedRecords,
      setItem: () => undefined,
    };
    const store = createLocalClientEventCache(storage);

    const sessionEvents = await store.listBySession("session_desktop_001");
    expect(sessionEvents.map((event) => event.id)).toEqual(["event_a", "event_b"]);
  });

  it("preserves the DGX projection mark when the same event is re-appended through a storage reload", async () => {
    const memoryStorage = new Map<string, string>();
    const storage = {
      getItem: (key: string) => memoryStorage.get(key) ?? null,
      setItem: (key: string, value: string) => memoryStorage.set(key, value),
    };

    const firstStore = createLocalClientEventCache(storage);
    await firstStore.append(eventA);
    await firstStore.markProjected(["event_a"], "dgx-02");

    const secondStore = createLocalClientEventCache(storage);
    await secondStore.append(eventA);

    expect(await secondStore.listUnsynced()).toEqual([]);
  });

  it("applies client_macbook/dgx-02 defaults for an outbox snapshot", () => {
    const snapshot = createLocalClientOutboxSnapshot([eventA]);

    expect(snapshot.clientId).toBe("client_macbook");
    expect(snapshot.projectionTarget).toBe("dgx-02");
    expect(snapshot.events.map((event) => event.id)).toEqual(["event_a"]);
    expect(typeof snapshot.updatedAt).toBe("string");
    expect(Number.isNaN(Date.parse(snapshot.updatedAt))).toBe(false);
  });

  it("lets the current local outbox entry win on an id collision", () => {
    const incoming: EventEnvelope = { ...eventA, payload: { content: "INCOMING" } };
    const localCurrent: EventEnvelope = { ...eventA, payload: { content: "LOCAL_CURRENT" } };

    const merged = mergeClientEventOutboxEvents([localCurrent], [incoming]);

    expect(merged).toHaveLength(1);
    expect((merged[0]?.payload as { content: string }).content).toBe("LOCAL_CURRENT");
  });
});
