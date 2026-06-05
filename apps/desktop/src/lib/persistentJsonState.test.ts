import { describe, expect, it } from "vitest";
import { readJsonState, writeJsonState, type JsonStorageLike } from "./persistentJsonState";

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
