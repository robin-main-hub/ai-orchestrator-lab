import { describe, expect, it } from "vitest";
import {
  createProjectRecord,
  emptyProjectRecordIndex,
  findProjectRecord,
  parseProjectRecordIndex,
  PROJECT_RECORDS_STORAGE_KEY,
  readProjectRecordIndex,
  removeProjectRecord,
  sortProjectRecordsByUpdatedAt,
  unknownVisualQaSummary,
  updateProjectEditTimeline,
  updateProjectPreview,
  updateProjectPublishStatus,
  updateProjectScaffold,
  updateProjectVisualQa,
  upsertProjectRecord,
  writeProjectRecordIndex,
  type ProjectRecord,
} from "./projectRecord";
import type { JsonStorageLike } from "./persistentJsonState";

const NOW_A = "2026-06-15T01:00:00.000Z";
const NOW_B = "2026-06-15T02:00:00.000Z";
const NOW_C = "2026-06-15T03:00:00.000Z";

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

  /** test helper */
  rawAt(key: string): string | null {
    return this.values.get(key) ?? null;
  }
}

function makeRecord(missionId: string, overrides: Partial<ProjectRecord> = {}): ProjectRecord {
  return {
    ...createProjectRecord({ missionId, title: `Project ${missionId}`, now: NOW_A }),
    ...overrides,
  };
}

describe("createProjectRecord", () => {
  it("creates a record with honest defaults (scaffold=unknown, empty timeline)", () => {
    const record = createProjectRecord({ missionId: "m1", title: "App One", now: NOW_A });
    expect(record).toEqual({
      missionId: "m1",
      title: "App One",
      goal: undefined,
      scaffold: "unknown",
      editTimeline: { totalEvents: 0, hasRestorablePatch: false },
      createdAt: NOW_A,
      updatedAt: NOW_A,
    });
  });

  it("does not fabricate preview URL or visual QA on creation", () => {
    const record = createProjectRecord({ missionId: "m1", title: "x", now: NOW_A });
    expect(record.lastPreviewUrl).toBeUndefined();
    expect(record.lastPreviewTruth).toBeUndefined();
    expect(record.visualQa).toBeUndefined();
    expect(record.publish).toBeUndefined();
  });
});

describe("upsertProjectRecord", () => {
  it("appends a new record and bumps index.updatedAt", () => {
    const empty = emptyProjectRecordIndex(NOW_A);
    const next = upsertProjectRecord(empty, makeRecord("m1"), NOW_B);
    expect(next.records).toHaveLength(1);
    expect(next.updatedAt).toBe(NOW_B);
  });

  it("replaces an existing record with same missionId", () => {
    const empty = emptyProjectRecordIndex(NOW_A);
    const v1 = upsertProjectRecord(empty, makeRecord("m1", { title: "v1" }), NOW_A);
    const v2 = upsertProjectRecord(v1, makeRecord("m1", { title: "v2" }), NOW_B);
    expect(v2.records).toHaveLength(1);
    expect(v2.records[0]?.title).toBe("v2");
  });
});

describe("removeProjectRecord", () => {
  it("removes by missionId", () => {
    const empty = emptyProjectRecordIndex(NOW_A);
    const v1 = upsertProjectRecord(empty, makeRecord("m1"), NOW_A);
    const v2 = upsertProjectRecord(v1, makeRecord("m2"), NOW_A);
    const after = removeProjectRecord(v2, "m1", NOW_B);
    expect(after.records.map((r) => r.missionId)).toEqual(["m2"]);
    expect(after.updatedAt).toBe(NOW_B);
  });

  it("returns the same reference when missionId not present", () => {
    const empty = emptyProjectRecordIndex(NOW_A);
    const same = removeProjectRecord(empty, "missing", NOW_B);
    expect(same).toBe(empty);
  });
});

describe("findProjectRecord", () => {
  it("returns the record when present", () => {
    const empty = emptyProjectRecordIndex(NOW_A);
    const v1 = upsertProjectRecord(empty, makeRecord("m1"), NOW_A);
    expect(findProjectRecord(v1, "m1")?.missionId).toBe("m1");
  });

  it("returns undefined when missing", () => {
    expect(findProjectRecord(emptyProjectRecordIndex(NOW_A), "x")).toBeUndefined();
  });
});

describe("sortProjectRecordsByUpdatedAt", () => {
  it("sorts most recent first", () => {
    const a = makeRecord("a", { updatedAt: NOW_A });
    const b = makeRecord("b", { updatedAt: NOW_C });
    const c = makeRecord("c", { updatedAt: NOW_B });
    expect(sortProjectRecordsByUpdatedAt([a, b, c]).map((r) => r.missionId)).toEqual(["b", "c", "a"]);
  });
});

describe("updateProjectPreview honesty", () => {
  it("records URL only when truth === observed", () => {
    const base = makeRecord("m1");
    const observed = updateProjectPreview(base, {
      url: "http://127.0.0.1:5174/",
      truth: "observed",
      observedAt: NOW_B,
      now: NOW_B,
    });
    expect(observed.lastPreviewUrl).toBe("http://127.0.0.1:5174/");
    expect(observed.lastPreviewTruth).toBe("observed");
    expect(observed.lastPreviewAt).toBe(NOW_B);
  });

  it("clears URL when truth === stale (no fake URL persisted)", () => {
    const base = makeRecord("m1", {
      lastPreviewUrl: "http://127.0.0.1:5174/",
      lastPreviewTruth: "observed",
      lastPreviewAt: NOW_A,
    });
    const stale = updateProjectPreview(base, { url: "http://127.0.0.1:5174/", truth: "stale", observedAt: NOW_B, now: NOW_B });
    expect(stale.lastPreviewUrl).toBeUndefined();
    expect(stale.lastPreviewTruth).toBe("stale");
  });

  it("clears URL when truth === unobserved even if url passed", () => {
    const base = makeRecord("m1");
    const unobs = updateProjectPreview(base, { url: "http://lies.example", truth: "unobserved", observedAt: NOW_B, now: NOW_B });
    expect(unobs.lastPreviewUrl).toBeUndefined();
    expect(unobs.lastPreviewTruth).toBe("unobserved");
  });
});

describe("updateProjectVisualQa", () => {
  it("stores QA summary and bumps updatedAt", () => {
    const base = makeRecord("m1");
    const next = updateProjectVisualQa(base, { status: "passed", checkedAt: NOW_B, summary: "0 issues" }, NOW_B);
    expect(next.visualQa).toEqual({ status: "passed", checkedAt: NOW_B, summary: "0 issues" });
    expect(next.updatedAt).toBe(NOW_B);
  });

  it("accepts unknownVisualQaSummary as honest default", () => {
    const base = makeRecord("m1");
    const next = updateProjectVisualQa(base, unknownVisualQaSummary(), NOW_B);
    expect(next.visualQa).toEqual({ status: "unknown" });
  });
});

describe("updateProjectScaffold + updateProjectEditTimeline + updateProjectPublishStatus", () => {
  it("scaffold update is enum-bounded", () => {
    const base = makeRecord("m1");
    const next = updateProjectScaffold(base, "available", NOW_B);
    expect(next.scaffold).toBe("available");
    expect(next.updatedAt).toBe(NOW_B);
  });

  it("edit timeline summary update preserves slim shape", () => {
    const base = makeRecord("m1");
    const next = updateProjectEditTimeline(
      base,
      { totalEvents: 4, lastEventAt: NOW_B, lastSource: "search_replace", lastStatus: "applied", hasRestorablePatch: true },
      NOW_B,
    );
    expect(next.editTimeline.totalEvents).toBe(4);
    expect(next.editTimeline.hasRestorablePatch).toBe(true);
  });

  it("publish update accepts undefined to clear", () => {
    const base = makeRecord("m1", {
      publish: { hasDraft: true, prNumber: 42, prUrl: "https://example/pr/42", lastUpdatedAt: NOW_A },
    });
    const cleared = updateProjectPublishStatus(base, undefined, NOW_B);
    expect(cleared.publish).toBeUndefined();
  });
});

describe("parseProjectRecordIndex tolerance", () => {
  it("returns honest defaults when payload is not an object", () => {
    expect(() => parseProjectRecordIndex(null)).toThrow();
    expect(() => parseProjectRecordIndex(42)).toThrow();
  });

  it("filters individual records that fail validation", () => {
    const corrupt = {
      records: [
        { missionId: "ok", title: "valid", createdAt: NOW_A, updatedAt: NOW_A, scaffold: "available" },
        { missionId: "", title: "no id" },
        { title: "no missionId field" },
        null,
      ],
      updatedAt: NOW_A,
    };
    const parsed = parseProjectRecordIndex(corrupt);
    expect(parsed.records).toHaveLength(1);
    expect(parsed.records[0]?.missionId).toBe("ok");
  });

  it("snaps unknown scaffold value to 'unknown'", () => {
    const payload = {
      records: [{ missionId: "m1", title: "x", createdAt: NOW_A, updatedAt: NOW_A, scaffold: "WAT" }],
      updatedAt: NOW_A,
    };
    const parsed = parseProjectRecordIndex(payload);
    expect(parsed.records[0]?.scaffold).toBe("unknown");
  });

  it("drops malformed visualQa", () => {
    const payload = {
      records: [
        {
          missionId: "m1",
          title: "x",
          createdAt: NOW_A,
          updatedAt: NOW_A,
          scaffold: "available",
          visualQa: { status: "not-a-real-status" },
        },
      ],
      updatedAt: NOW_A,
    };
    expect(parseProjectRecordIndex(payload).records[0]?.visualQa).toBeUndefined();
  });
});

describe("readProjectRecordIndex + writeProjectRecordIndex", () => {
  it("round-trips through MemoryStorage", () => {
    const storage = new MemoryStorage();
    const index = upsertProjectRecord(
      emptyProjectRecordIndex(NOW_A),
      makeRecord("m1", { title: "Persisted App" }),
      NOW_B,
    );
    writeProjectRecordIndex(index, storage);

    const restored = readProjectRecordIndex(NOW_C, storage);
    expect(restored.records).toHaveLength(1);
    expect(restored.records[0]?.title).toBe("Persisted App");
  });

  it("falls back to empty when storage is empty", () => {
    const storage = new MemoryStorage();
    const restored = readProjectRecordIndex(NOW_A, storage);
    expect(restored.records).toEqual([]);
    expect(restored.updatedAt).toBe(NOW_A);
  });

  it("falls back to empty when storage holds invalid JSON", () => {
    const storage = new MemoryStorage();
    storage.setItem(PROJECT_RECORDS_STORAGE_KEY, "{broken");
    const restored = readProjectRecordIndex(NOW_B, storage);
    expect(restored.records).toEqual([]);
    expect(restored.updatedAt).toBe(NOW_B);
  });

  it("does not throw when storage rejects writes", () => {
    const storage: JsonStorageLike = {
      getItem: () => null,
      removeItem: () => undefined,
      setItem: () => {
        throw new Error("quota");
      },
    };
    expect(() => writeProjectRecordIndex(emptyProjectRecordIndex(NOW_A), storage)).not.toThrow();
  });
});
