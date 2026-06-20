import { describe, expect, it } from "vitest";
import {
  getBrowserLocalStorage,
  readJsonState,
  writeJsonState,
  type JsonStorageLike,
} from "./persistentJsonState";

class MemoryStorage implements JsonStorageLike {
  private readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

describe("persistentJsonState", () => {
  it("round-trips JSON through the supplied storage", () => {
    const storage = new MemoryStorage();
    writeJsonState("state", { mode: "cockpit" }, storage);

    expect(
      readJsonState("state", { mode: "conversation" }, (value) => value as { mode: string }, storage),
    ).toEqual({ mode: "cockpit" });
  });

  it("falls back and clears invalid JSON", () => {
    const storage = new MemoryStorage();
    storage.setItem("state", "{broken");

    expect(readJsonState("state", "fallback", String, storage)).toBe("fallback");
    expect(storage.getItem("state")).toBeNull();
  });

  it("falls back and clears values rejected by the parser", () => {
    const storage = new MemoryStorage();
    storage.setItem("state", JSON.stringify({ mode: "bad" }));

    const result = readJsonState(
      "state",
      "cockpit",
      (value) => {
        if (value && typeof value === "object" && (value as { mode?: unknown }).mode === "cockpit") {
          return "cockpit";
        }
        throw new Error("invalid");
      },
      storage,
    );

    expect(result).toBe("cockpit");
    expect(storage.getItem("state")).toBeNull();
  });

  it("does not throw when storage rejects writes", () => {
    const storage: JsonStorageLike = {
      getItem: () => null,
      removeItem: () => undefined,
      setItem: () => {
        throw new Error("quota");
      },
    };

    expect(() => writeJsonState("state", { mode: "cockpit" }, storage)).not.toThrow();
  });
});

// Characterization tests (no behavior change) for the previously-untested SSR guard
// `getBrowserLocalStorage` and the default-storage / missing-value EARLY-RETURN
// branches of readJsonState/writeJsonState that the block above never exercises
// (it always injects a concrete storage and always seeds a value). Load-bearing
// contract: the module must be safe to import and call in a window-less runtime
// (SSR / unit test / worker) — getBrowserLocalStorage returns undefined instead of
// throwing on `window`, and that undefined flows through the read/write defaults so
// a missing browser is a silent fallback/no-op, never a crash. A missing or empty
// stored value is a plain fallback that does NOT call the parser and does NOT evict
// (distinct from the invalid-JSON path which clears the key).
describe("getBrowserLocalStorage / window-less defaults", () => {
  it("no window → undefined (SSR/worker safe, never throws)", () => {
    // this vitest runtime has no `window`, so the guard takes its undefined branch
    expect(typeof window).toBe("undefined");
    expect(getBrowserLocalStorage()).toBeUndefined();
  });

  it("window present → returns exactly window.localStorage (same reference)", () => {
    const fakeLocalStorage = new MemoryStorage();
    const had = "window" in globalThis;
    (globalThis as { window?: unknown }).window = { localStorage: fakeLocalStorage };
    try {
      expect(getBrowserLocalStorage()).toBe(fakeLocalStorage);
    } finally {
      if (had) {
        (globalThis as { window?: unknown }).window = undefined;
      } else {
        delete (globalThis as { window?: unknown }).window;
      }
    }
  });

  it("default storage in a window-less runtime: read falls back, write is a silent no-op", () => {
    const thrower = () => {
      throw new Error("parser must not run when storage is absent");
    };
    // omitting the storage arg defaults to getBrowserLocalStorage() === undefined
    expect(readJsonState("any-key", "fallback", thrower)).toBe("fallback");
    expect(() => writeJsonState("any-key", { mode: "cockpit" })).not.toThrow();
  });

  it("missing key → fallback without calling the parser and without evicting", () => {
    const storage = new MemoryStorage();
    storage.setItem("other", "kept");
    const thrower = () => {
      throw new Error("parser must not run for a missing value");
    };
    expect(readJsonState("absent", "fallback", thrower, storage)).toBe("fallback");
    // unrelated keys are untouched — the early !raw return never calls removeItem
    expect(storage.getItem("other")).toBe("kept");
  });

  it("empty-string value is treated as missing → fallback, parser skipped", () => {
    const storage = new MemoryStorage();
    storage.setItem("state", "");
    const thrower = () => {
      throw new Error("parser must not run for an empty value");
    };
    expect(readJsonState("state", "fallback", thrower, storage)).toBe("fallback");
  });
});
