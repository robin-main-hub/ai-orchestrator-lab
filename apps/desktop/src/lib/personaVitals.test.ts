import { beforeEach, describe, expect, it } from "vitest";
import {
  computePersonaVitals,
  MEMORY_HP_BY_SIGNAL,
  PERSONA_RUN_HISTORY_KEY,
  readPersonaRunHistory,
  resolveMemoryHp,
  resolveTrustMp,
  type PersonaRunHistoryEntry,
} from "./personaVitals";

class MemoryStorage implements Storage {
  private readonly map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  key(index: number) {
    return Array.from(this.map.keys())[index] ?? null;
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
}

describe("resolveMemoryHp", () => {
  it("maps signal states to HP", () => {
    expect(resolveMemoryHp("healthy")).toEqual({ value: MEMORY_HP_BY_SIGNAL.healthy, source: "signal" });
    expect(resolveMemoryHp("building")).toEqual({ value: 0.65, source: "signal" });
    expect(resolveMemoryHp("empty")).toEqual({ value: 0.45, source: "signal" });
  });

  it("returns null for non-signal states", () => {
    expect(resolveMemoryHp("error")).toBeNull();
    expect(resolveMemoryHp("loading")).toBeNull();
    expect(resolveMemoryHp(undefined)).toBeNull();
  });
});

describe("readPersonaRunHistory", () => {
  let storage: MemoryStorage;
  beforeEach(() => {
    storage = new MemoryStorage();
  });

  it("returns [] when the key is absent", () => {
    expect(readPersonaRunHistory(storage)).toEqual([]);
  });

  it("returns [] for invalid JSON", () => {
    storage.setItem(PERSONA_RUN_HISTORY_KEY, "{not json");
    expect(readPersonaRunHistory(storage)).toEqual([]);
  });

  it("returns [] for non-array payloads", () => {
    storage.setItem(PERSONA_RUN_HISTORY_KEY, JSON.stringify({ foo: 1 }));
    expect(readPersonaRunHistory(storage)).toEqual([]);
  });

  it("filters to well-formed entries and normalizes status", () => {
    storage.setItem(
      PERSONA_RUN_HISTORY_KEY,
      JSON.stringify([
        { personaName: "orchestrator", status: "completed" },
        { status: "completed" },
        { personaName: 42, status: "x" },
        null,
        { personaName: "verifier" },
      ]),
    );
    expect(readPersonaRunHistory(storage)).toEqual([
      { personaName: "orchestrator", status: "completed" },
      { personaName: "verifier", status: "" },
    ]);
  });
});

describe("resolveTrustMp", () => {
  it("returns null below three samples", () => {
    const history: PersonaRunHistoryEntry[] = [
      { personaName: "a", status: "completed" },
      { personaName: "a", status: "failed" },
    ];
    expect(resolveTrustMp("a", history)).toBeNull();
  });

  it("computes the completion rate at three or more samples", () => {
    const history: PersonaRunHistoryEntry[] = [
      { personaName: "a", status: "completed" },
      { personaName: "a", status: "completed" },
      { personaName: "a", status: "failed" },
      { personaName: "a", status: "failed" },
      { personaName: "b", status: "completed" },
    ];
    expect(resolveTrustMp("a", history)).toEqual({ value: 0.5, source: "history" });
  });
});

describe("computePersonaVitals", () => {
  it("marks both vitals as default when there is no signal", () => {
    const result = computePersonaVitals({ personaName: "a", history: [] });
    expect(result.memoryQuality).toBeUndefined();
    expect(result.trust).toBeUndefined();
    expect(result.hpIsDefault).toBe(true);
    expect(result.mpIsDefault).toBe(true);
  });

  it("surfaces resolved values and clears the default flags", () => {
    const history: PersonaRunHistoryEntry[] = [
      { personaName: "a", status: "completed" },
      { personaName: "a", status: "completed" },
      { personaName: "a", status: "failed" },
    ];
    const result = computePersonaVitals({ personaName: "a", memoryState: "healthy", history });
    expect(result.memoryQuality).toBe(0.9);
    expect(result.hpIsDefault).toBe(false);
    expect(result.trust).toBeCloseTo(2 / 3);
    expect(result.mpIsDefault).toBe(false);
  });
});
