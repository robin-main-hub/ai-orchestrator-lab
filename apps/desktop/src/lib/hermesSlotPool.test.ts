import { describe, expect, it } from "vitest";
import {
  acquireHermesSlot,
  createHermesSlotPool,
  DEFAULT_HERMES_POOL_SIZE,
  releaseHermesSlot,
  summarizeHermesPool,
} from "./hermesSlotPool";
import { HERMES_POOL_STORAGE_KEY, loadHermesPool, saveHermesPool } from "./hermesPoolStore";

describe("hermes slot pool", () => {
  it("creates the default spare pool", () => {
    const pool = createHermesSlotPool();
    expect(pool.slots).toHaveLength(DEFAULT_HERMES_POOL_SIZE);
    expect(pool.slots[0]!.id).toBe("hermes-01");
    expect(summarizeHermesPool(pool)).toEqual({ total: 12, bound: 0, spare: 12 });
  });

  it("attaches a new persona to a spare slot without a reset (fresh spare)", () => {
    const { pool, slot, outcome, requiresBoot } = acquireHermesSlot(createHermesSlotPool(2), "kurumi");
    expect(outcome).toBe("spare_attached");
    expect(requiresBoot).toBe(false);
    expect(slot.persona).toBe("kurumi");
    expect(summarizeHermesPool(pool)).toEqual({ total: 2, bound: 1, spare: 1 });
  });

  it("sticky reuse: the same persona keeps her own agent (no reset, no new slot)", () => {
    const first = acquireHermesSlot(createHermesSlotPool(2), "kurumi");
    const second = acquireHermesSlot(first.pool, "kurumi");
    expect(second.outcome).toBe("sticky_reuse");
    expect(second.slot.id).toBe(first.slot.id);
    expect(second.requiresBoot).toBe(false);
    expect(summarizeHermesPool(second.pool).bound).toBe(1);
  });

  it("provisions exactly one new agent when the pool is exhausted", () => {
    let pool = createHermesSlotPool(1);
    ({ pool } = acquireHermesSlot(pool, "kurumi"));
    const overflow = acquireHermesSlot(pool, "yuno");
    expect(overflow.outcome).toBe("provisioned_new");
    expect(overflow.slot.id).toBe("hermes-02");
    expect(overflow.requiresBoot).toBe(false); // brand-new agent: nothing to inherit
    const next = acquireHermesSlot(overflow.pool, "yohane");
    expect(next.slot.id).toBe("hermes-03"); // grows one agent at a time
  });

  it("a released slot returns to spare and resets when a DIFFERENT character takes it", () => {
    let pool = createHermesSlotPool(1);
    const sora = acquireHermesSlot(pool, "sora_legacy");
    pool = releaseHermesSlot(sora.pool, "sora_legacy");
    expect(summarizeHermesPool(pool)).toEqual({ total: 1, bound: 0, spare: 1 });

    const yuno = acquireHermesSlot(pool, "yuno");
    expect(yuno.outcome).toBe("spare_attached");
    expect(yuno.slot.id).toBe(sora.slot.id); // recycled slot
    expect(yuno.requiresBoot).toBe(true); // previous character's session must be reset
  });
});

describe("hermes pool store", () => {
  const fakeStorage = () => {
    const map = new Map<string, string>();
    return {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => void map.set(key, value),
      map,
    };
  };

  it("round-trips the pool and survives a corrupt entry", () => {
    const storage = fakeStorage();
    const { pool } = acquireHermesSlot(createHermesSlotPool(3), "kurumi");
    saveHermesPool(pool, storage);
    expect(loadHermesPool(storage)).toEqual(pool);

    storage.map.set(HERMES_POOL_STORAGE_KEY, "{nope");
    expect(summarizeHermesPool(loadHermesPool(storage)).total).toBe(DEFAULT_HERMES_POOL_SIZE);
  });

  it("falls back to a fresh default pool without storage", () => {
    expect(summarizeHermesPool(loadHermesPool(null)).spare).toBe(DEFAULT_HERMES_POOL_SIZE);
  });
});
