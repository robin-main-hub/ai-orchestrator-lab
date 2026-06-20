import { describe, expect, it, vi } from "vitest";
import { createHermesSlotPool, type HermesSlotPool } from "./hermesSlotPool";
import { HERMES_POOL_STORAGE_KEY, loadHermesPool, saveHermesPool } from "./hermesPoolStore";

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

// Characterization tests for the Hermes slot-pool persistence shim (no behavior
// change). loadHermesPool reads the storage key and only trusts a value whose
// shape matches (slots array + numeric nextSlotNumber); anything absent,
// corrupt, or mis-shaped falls back to a fresh default pool. saveHermesPool is
// a best-effort write that no-ops on absent storage and swallows setItem
// failures so a run never breaks. Injectable StorageLike, no real localStorage.
describe("loadHermesPool", () => {
  it("returns a fresh default pool when storage is absent", () => {
    expect(loadHermesPool(null)).toEqual(createHermesSlotPool());
  });

  it("returns a fresh default pool when the key is missing", () => {
    expect(loadHermesPool(fakeStorage())).toEqual(createHermesSlotPool());
  });

  it("returns the persisted pool when the stored shape is valid", () => {
    const pool: HermesSlotPool = {
      slots: [{ id: "hermes-01", status: "bound", persona: "kurumi", needsReset: false }],
      nextSlotNumber: 2,
    };
    const storage = fakeStorage({ [HERMES_POOL_STORAGE_KEY]: JSON.stringify(pool) });
    expect(loadHermesPool(storage)).toEqual(pool);
  });

  it("falls back to a fresh pool on corrupt JSON", () => {
    const storage = fakeStorage({ [HERMES_POOL_STORAGE_KEY]: "{not json" });
    expect(loadHermesPool(storage)).toEqual(createHermesSlotPool());
  });

  it("falls back to a fresh pool when the parsed shape is wrong", () => {
    const badSlots = fakeStorage({ [HERMES_POOL_STORAGE_KEY]: JSON.stringify({ slots: "nope", nextSlotNumber: 2 }) });
    expect(loadHermesPool(badSlots)).toEqual(createHermesSlotPool());

    const badCounter = fakeStorage({ [HERMES_POOL_STORAGE_KEY]: JSON.stringify({ slots: [], nextSlotNumber: "2" }) });
    expect(loadHermesPool(badCounter)).toEqual(createHermesSlotPool());
  });
});

describe("saveHermesPool", () => {
  it("does nothing (and does not throw) when storage is absent", () => {
    expect(() => saveHermesPool(createHermesSlotPool(), null)).not.toThrow();
  });

  it("round-trips through storage so a saved pool loads back equal", () => {
    const storage = fakeStorage();
    const pool: HermesSlotPool = {
      slots: [{ id: "hermes-01", status: "spare", needsReset: true }],
      nextSlotNumber: 9,
    };
    saveHermesPool(pool, storage);
    expect(storage.map.get(HERMES_POOL_STORAGE_KEY)).toBe(JSON.stringify(pool));
    expect(loadHermesPool(storage)).toEqual(pool);
  });

  it("swallows setItem failures so a run never breaks", () => {
    const storage: StorageLike = {
      getItem: () => null,
      setItem: vi.fn(() => {
        throw new Error("quota exceeded");
      }),
    };
    expect(() => saveHermesPool(createHermesSlotPool(), storage)).not.toThrow();
    expect(storage.setItem).toHaveBeenCalledOnce();
  });
});
