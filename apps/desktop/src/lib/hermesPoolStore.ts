import { createHermesSlotPool, type HermesSlotPool } from "./hermesSlotPool";

/**
 * Tiny persistence shim for the Hermes slot pool so persona↔slot bindings
 * survive app restarts (sticky bindings are the whole point — kurumi keeps
 * her agent and its history). localStorage in the desktop webview; injectable
 * storage for tests; falls back to a fresh default pool when absent/corrupt.
 */

export const HERMES_POOL_STORAGE_KEY = "ai-orch.hermesSlotPool.v1";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

export function loadHermesPool(storage: StorageLike | null = defaultStorage()): HermesSlotPool {
  if (storage) {
    try {
      const raw = storage.getItem(HERMES_POOL_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as HermesSlotPool;
        if (Array.isArray(parsed.slots) && typeof parsed.nextSlotNumber === "number") {
          return parsed;
        }
      }
    } catch {
      // corrupt entry — fall through to a fresh pool
    }
  }
  return createHermesSlotPool();
}

export function saveHermesPool(pool: HermesSlotPool, storage: StorageLike | null = defaultStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(HERMES_POOL_STORAGE_KEY, JSON.stringify(pool));
  } catch {
    // quota/serialization issues must never break a run
  }
}
