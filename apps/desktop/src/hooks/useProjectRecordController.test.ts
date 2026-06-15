import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useProjectRecordController } from "./useProjectRecordController";
import {
  PROJECT_RECORDS_STORAGE_KEY,
  unknownVisualQaSummary,
} from "../lib/projectRecord";
import type { JsonStorageLike } from "../lib/persistentJsonState";

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

  rawAt(key: string): string | null {
    return this.values.get(key) ?? null;
  }
}

function makeClock(seedIso: string) {
  let counter = 0;
  const base = new Date(seedIso).getTime();
  return () => new Date(base + counter++ * 1000).toISOString();
}

describe("useProjectRecordController", () => {
  it("starts empty when storage has no prior records", () => {
    const storage = new MemoryStorage();
    const { result } = renderHook(() =>
      useProjectRecordController({ now: makeClock("2026-06-15T01:00:00.000Z"), storage }),
    );
    expect(result.current.records).toEqual([]);
  });

  it("hydrates from storage on mount", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      PROJECT_RECORDS_STORAGE_KEY,
      JSON.stringify({
        records: [
          {
            missionId: "m1",
            title: "Persisted App",
            scaffold: "available",
            editTimeline: { totalEvents: 0, hasRestorablePatch: false },
            createdAt: "2026-06-15T00:00:00.000Z",
            updatedAt: "2026-06-15T00:00:00.000Z",
          },
        ],
        updatedAt: "2026-06-15T00:00:00.000Z",
      }),
    );

    const { result } = renderHook(() =>
      useProjectRecordController({ now: makeClock("2026-06-15T01:00:00.000Z"), storage }),
    );
    expect(result.current.records).toHaveLength(1);
    expect(result.current.records[0]?.title).toBe("Persisted App");
  });

  it("ensureRecord creates with honest defaults when missing", () => {
    const storage = new MemoryStorage();
    const { result } = renderHook(() =>
      useProjectRecordController({ now: makeClock("2026-06-15T01:00:00.000Z"), storage }),
    );

    let created: ReturnType<typeof result.current.ensureRecord> | undefined;
    act(() => {
      created = result.current.ensureRecord({ missionId: "m1", title: "App One", goal: "Make app" });
    });

    expect(created?.scaffold).toBe("unknown");
    expect(created?.editTimeline).toEqual({ totalEvents: 0, hasRestorablePatch: false });
    expect(created?.lastPreviewUrl).toBeUndefined();
    expect(result.current.records).toHaveLength(1);
  });

  it("ensureRecord returns the existing record without duplicating", () => {
    const storage = new MemoryStorage();
    const { result } = renderHook(() =>
      useProjectRecordController({ now: makeClock("2026-06-15T01:00:00.000Z"), storage }),
    );

    act(() => {
      result.current.ensureRecord({ missionId: "m1", title: "App One" });
    });
    act(() => {
      result.current.ensureRecord({ missionId: "m1", title: "ignored second title" });
    });

    expect(result.current.records).toHaveLength(1);
    expect(result.current.records[0]?.title).toBe("App One");
  });

  it("recordPreview persists URL only when truth === observed", () => {
    const storage = new MemoryStorage();
    const { result } = renderHook(() =>
      useProjectRecordController({ now: makeClock("2026-06-15T01:00:00.000Z"), storage }),
    );

    act(() => {
      result.current.ensureRecord({ missionId: "m1", title: "x" });
    });
    act(() => {
      result.current.recordPreview("m1", {
        url: "http://127.0.0.1:5174/",
        truth: "observed",
        observedAt: "2026-06-15T01:30:00.000Z",
      });
    });
    expect(result.current.find("m1")?.lastPreviewUrl).toBe("http://127.0.0.1:5174/");
    expect(result.current.find("m1")?.lastPreviewTruth).toBe("observed");

    // Switching to stale clears the URL — no fake preview persists.
    act(() => {
      result.current.recordPreview("m1", {
        url: "http://127.0.0.1:5174/",
        truth: "stale",
        observedAt: "2026-06-15T01:31:00.000Z",
      });
    });
    expect(result.current.find("m1")?.lastPreviewUrl).toBeUndefined();
    expect(result.current.find("m1")?.lastPreviewTruth).toBe("stale");
  });

  it("recordVisualQa accepts unknown summary", () => {
    const storage = new MemoryStorage();
    const { result } = renderHook(() =>
      useProjectRecordController({ now: makeClock("2026-06-15T01:00:00.000Z"), storage }),
    );

    act(() => {
      result.current.ensureRecord({ missionId: "m1", title: "x" });
    });
    act(() => {
      result.current.recordVisualQa("m1", unknownVisualQaSummary());
    });
    expect(result.current.find("m1")?.visualQa).toEqual({ status: "unknown" });

    act(() => {
      result.current.recordVisualQa("m1", {
        status: "passed",
        checkedAt: "2026-06-15T02:00:00.000Z",
        summary: "0 issues",
      });
    });
    expect(result.current.find("m1")?.visualQa?.status).toBe("passed");
  });

  it("recordScaffold + recordEditTimeline + recordPublishStatus update the record", () => {
    const storage = new MemoryStorage();
    const { result } = renderHook(() =>
      useProjectRecordController({ now: makeClock("2026-06-15T01:00:00.000Z"), storage }),
    );

    act(() => {
      result.current.ensureRecord({ missionId: "m1", title: "x" });
    });
    act(() => {
      result.current.recordScaffold("m1", "available");
      result.current.recordEditTimeline("m1", {
        totalEvents: 3,
        lastEventAt: "2026-06-15T02:00:00.000Z",
        lastSource: "search_replace",
        lastStatus: "applied",
        hasRestorablePatch: true,
      });
      result.current.recordPublishStatus("m1", {
        hasDraft: true,
        prNumber: 514,
        prUrl: "https://github.com/example/pr/514",
        lastUpdatedAt: "2026-06-15T02:30:00.000Z",
      });
    });

    const r = result.current.find("m1");
    expect(r?.scaffold).toBe("available");
    expect(r?.editTimeline.totalEvents).toBe(3);
    expect(r?.editTimeline.hasRestorablePatch).toBe(true);
    expect(r?.publish?.prNumber).toBe(514);
  });

  it("recordPublishStatus(undefined) clears publish info", () => {
    const storage = new MemoryStorage();
    const { result } = renderHook(() =>
      useProjectRecordController({ now: makeClock("2026-06-15T01:00:00.000Z"), storage }),
    );

    act(() => {
      result.current.ensureRecord({ missionId: "m1", title: "x" });
      result.current.recordPublishStatus("m1", { hasDraft: true });
    });
    expect(result.current.find("m1")?.publish?.hasDraft).toBe(true);

    act(() => {
      result.current.recordPublishStatus("m1", undefined);
    });
    expect(result.current.find("m1")?.publish).toBeUndefined();
  });

  it("remove deletes a record", () => {
    const storage = new MemoryStorage();
    const { result } = renderHook(() =>
      useProjectRecordController({ now: makeClock("2026-06-15T01:00:00.000Z"), storage }),
    );

    act(() => {
      result.current.ensureRecord({ missionId: "m1", title: "x" });
      result.current.ensureRecord({ missionId: "m2", title: "y" });
    });
    expect(result.current.records).toHaveLength(2);

    act(() => {
      result.current.remove("m1");
    });
    expect(result.current.records.map((r) => r.missionId)).toEqual(["m2"]);
  });

  it("records are sorted by updatedAt descending", () => {
    const storage = new MemoryStorage();
    const { result } = renderHook(() =>
      useProjectRecordController({ now: makeClock("2026-06-15T01:00:00.000Z"), storage }),
    );

    act(() => {
      result.current.ensureRecord({ missionId: "first", title: "f" });
      result.current.ensureRecord({ missionId: "second", title: "s" });
      result.current.ensureRecord({ missionId: "third", title: "t" });
    });
    // Touch the first one most recently → it should jump to front.
    act(() => {
      result.current.recordScaffold("first", "available");
    });

    expect(result.current.records[0]?.missionId).toBe("first");
  });

  it("persists each change to storage", () => {
    const storage = new MemoryStorage();
    const setItemSpy = vi.spyOn(storage, "setItem");

    const { result } = renderHook(() =>
      useProjectRecordController({ now: makeClock("2026-06-15T01:00:00.000Z"), storage }),
    );

    act(() => {
      result.current.ensureRecord({ missionId: "m1", title: "x" });
    });
    act(() => {
      result.current.recordScaffold("m1", "available");
    });

    expect(setItemSpy).toHaveBeenCalled();
    const rawSnapshot = storage.rawAt(PROJECT_RECORDS_STORAGE_KEY);
    expect(rawSnapshot).toBeTruthy();
    expect(JSON.parse(rawSnapshot!).records[0].scaffold).toBe("available");
  });

  it("does not throw when storage rejects writes", () => {
    const brokenStorage: JsonStorageLike = {
      getItem: () => null,
      removeItem: () => undefined,
      setItem: () => {
        throw new Error("quota exceeded");
      },
    };

    const { result } = renderHook(() =>
      useProjectRecordController({ now: makeClock("2026-06-15T01:00:00.000Z"), storage: brokenStorage }),
    );
    expect(() =>
      act(() => {
        result.current.ensureRecord({ missionId: "m1", title: "x" });
      }),
    ).not.toThrow();
    expect(result.current.records).toHaveLength(1);
  });

  it("update on a missing missionId is a no-op", () => {
    const storage = new MemoryStorage();
    const { result } = renderHook(() =>
      useProjectRecordController({ now: makeClock("2026-06-15T01:00:00.000Z"), storage }),
    );

    act(() => {
      result.current.recordScaffold("does-not-exist", "available");
    });
    expect(result.current.records).toEqual([]);
  });
});
