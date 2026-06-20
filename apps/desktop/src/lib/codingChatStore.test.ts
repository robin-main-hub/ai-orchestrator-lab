import { describe, expect, it, vi } from "vitest";
import type { CodingSession } from "./codingChat";
import { CODING_SESSIONS_STORAGE_KEY, loadCodingSessions, saveCodingSessions } from "./codingChatStore";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function fakeStorage(seed: Record<string, string> = {}): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>(Object.entries(seed));
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };
}

function session(over: Partial<CodingSession> = {}): CodingSession {
  return {
    id: "s1",
    title: "Session",
    messages: [],
    updatedAt: "2026-06-20T00:00:00.000Z",
    ...over,
  } as unknown as CodingSession;
}

// Characterization tests for the coding-session persistence shim (no behavior
// change). loadCodingSessions returns [] for absent/missing/corrupt/non-array
// storage and otherwise keeps only well-formed sessions (string id + messages
// array). saveCodingSessions is best-effort: no-op on absent storage, sorts
// newest-updated first and caps at 30 before writing, and swallows setItem
// failures. Injectable StorageLike, no real localStorage, no network.
describe("loadCodingSessions", () => {
  it("returns [] when storage is absent or the key is missing", () => {
    expect(loadCodingSessions(null)).toEqual([]);
    expect(loadCodingSessions(fakeStorage())).toEqual([]);
  });

  it("returns [] on corrupt JSON or a non-array payload", () => {
    expect(loadCodingSessions(fakeStorage({ [CODING_SESSIONS_STORAGE_KEY]: "{nope" }))).toEqual([]);
    expect(loadCodingSessions(fakeStorage({ [CODING_SESSIONS_STORAGE_KEY]: JSON.stringify({ a: 1 }) }))).toEqual([]);
  });

  it("keeps only well-formed sessions (string id + messages array)", () => {
    const payload = [
      session({ id: "ok" }),
      { id: 5, messages: [] },
      { id: "no-messages" },
      null,
      session({ id: "ok2", messages: [{ role: "user" }] as unknown as CodingSession["messages"] }),
    ];
    const storage = fakeStorage({ [CODING_SESSIONS_STORAGE_KEY]: JSON.stringify(payload) });
    expect(loadCodingSessions(storage).map((s) => s.id)).toEqual(["ok", "ok2"]);
  });
});

describe("saveCodingSessions", () => {
  it("does nothing (and does not throw) when storage is absent", () => {
    expect(() => saveCodingSessions([session()], null)).not.toThrow();
  });

  it("sorts newest-updated first and caps the persisted list at 30", () => {
    const many = Array.from({ length: 35 }, (_, i) =>
      session({ id: `s${i}`, updatedAt: `2026-06-${String((i % 28) + 1).padStart(2, "0")}T00:00:00.000Z` }),
    );
    const storage = fakeStorage();
    saveCodingSessions(many, storage);
    const persisted = JSON.parse(storage.map.get(CODING_SESSIONS_STORAGE_KEY)!) as CodingSession[];
    expect(persisted).toHaveLength(30);
    // monotonically non-increasing updatedAt — newest first
    for (let i = 1; i < persisted.length; i++) {
      expect(persisted[i - 1]!.updatedAt >= persisted[i]!.updatedAt).toBe(true);
    }
  });

  it("round-trips through storage and swallows setItem failures", () => {
    const storage = fakeStorage();
    const sessions = [session({ id: "a" }), session({ id: "b" })];
    saveCodingSessions(sessions, storage);
    expect(loadCodingSessions(storage).map((s) => s.id).sort()).toEqual(["a", "b"]);

    const throwing: StorageLike = {
      getItem: () => null,
      setItem: vi.fn(() => {
        throw new Error("quota exceeded");
      }),
    };
    expect(() => saveCodingSessions([session()], throwing)).not.toThrow();
    expect(throwing.setItem).toHaveBeenCalledOnce();
  });
});
