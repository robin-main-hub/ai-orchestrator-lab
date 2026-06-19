import { describe, expect, it } from "vitest";
import type { RuntimeSnapshot } from "@ai-orchestrator/protocol";
import { classifyRuntimeStatus, projectRuntimeHealth } from "./runtimeHealthProjection";

const FIXED_NOW = Date.parse("2026-06-19T00:00:00.000Z");

function makeSnapshot(overrides: Partial<RuntimeSnapshot> = {}): RuntimeSnapshot {
  return {
    status: "online",
    dgxStatus: "online",
    localModelStatus: "online",
    memorySyncStatus: "online",
    runtimeNodes: [],
    localModels: [],
    syncTopology: {
      authorityLabel: "dgx-02",
      offlineWritePolicy: "append_local_outbox_when_offline",
      conflictPolicy: "dgx02_authority_wins",
      clients: [],
    },
    updatedAt: "2026-06-19T00:00:00.000Z",
    ...overrides,
  } as RuntimeSnapshot;
}

describe("classifyRuntimeStatus", () => {
  it("recognizes the real RuntimeStatus enum", () => {
    expect(classifyRuntimeStatus("online")).toBe("healthy");
    expect(classifyRuntimeStatus("syncing")).toBe("healthy");
    expect(classifyRuntimeStatus("degraded")).toBe("degraded");
    expect(classifyRuntimeStatus("offline")).toBe("offline");
  });

  it("never reports unrecognized or missing status as healthy", () => {
    expect(classifyRuntimeStatus(undefined)).toBe("unknown");
    expect(classifyRuntimeStatus("")).toBe("unknown");
    expect(classifyRuntimeStatus("totally-made-up")).toBe("unknown");
  });
});

describe("projectRuntimeHealth", () => {
  it("returns unknown (not healthy) when no snapshot is present", () => {
    const result = projectRuntimeHealth(undefined);
    expect(result.level).toBe("unknown");
    expect(result.subsystems).toHaveLength(0);
  });

  it("classifies a fully online snapshot as healthy", () => {
    const result = projectRuntimeHealth(makeSnapshot(), { now: FIXED_NOW });
    expect(result.level).toBe("healthy");
    expect(result.reasons).toEqual([]);
    expect(result.stale).toBe(false);
  });

  it("propagates a degraded subsystem instead of hiding it (G1)", () => {
    const result = projectRuntimeHealth(makeSnapshot({ dgxStatus: "degraded" }), { now: FIXED_NOW });
    expect(result.level).toBe("degraded");
    expect(result.reasons).toContain("DGX degraded");
  });

  it("does not let a healthy DGX hide a failing memory sync (G2 subsystem masking)", () => {
    const result = projectRuntimeHealth(
      makeSnapshot({ dgxStatus: "online", localModelStatus: "online", memorySyncStatus: "offline" }),
      { now: FIXED_NOW },
    );
    expect(result.level).toBe("offline");
    expect(result.reasons).toContain("기억 offline");
    expect(result.subsystems.find((s) => s.key === "memory")?.level).toBe("offline");
  });

  it("rolls up worst-of across multiple unhealthy subsystems", () => {
    const result = projectRuntimeHealth(
      makeSnapshot({ dgxStatus: "degraded", localModelStatus: "offline", memorySyncStatus: "degraded" }),
      { now: FIXED_NOW },
    );
    expect(result.level).toBe("offline");
  });

  it("treats a recorded recentError as a failure signal", () => {
    const result = projectRuntimeHealth(makeSnapshot({ recentError: "boot crash" }), { now: FIXED_NOW });
    expect(result.level).toBe("offline");
    expect(result.reasons).toContain("최근 오류 기록 있음");
    // raw error text is never echoed into reasons.
    expect(result.reasons.some((r) => r.includes("boot crash"))).toBe(false);
  });

  it("flags a stale snapshot and downgrades healthy to degraded (G3)", () => {
    const result = projectRuntimeHealth(makeSnapshot({ updatedAt: "2026-06-18T00:00:00.000Z" }), {
      now: FIXED_NOW,
      stalenessThresholdMs: 60_000,
    });
    expect(result.stale).toBe(true);
    expect(result.level).toBe("degraded");
    expect(result.reasons).toContain("스냅샷 정보 지연(stale)");
  });

  it("treats an unparseable updatedAt as stale when a clock is supplied", () => {
    const result = projectRuntimeHealth(makeSnapshot({ updatedAt: "not-a-date" }), { now: FIXED_NOW });
    expect(result.stale).toBe(true);
  });

  it("does not flag staleness when no clock is supplied", () => {
    const result = projectRuntimeHealth(makeSnapshot({ updatedAt: "1999-01-01T00:00:00.000Z" }));
    expect(result.stale).toBe(false);
  });

  it("does not downgrade an already-offline level because of staleness", () => {
    const result = projectRuntimeHealth(
      makeSnapshot({ memorySyncStatus: "offline", updatedAt: "2026-06-18T00:00:00.000Z" }),
      { now: FIXED_NOW, stalenessThresholdMs: 60_000 },
    );
    expect(result.stale).toBe(true);
    expect(result.level).toBe("offline");
  });

  it("classifies unrecognized subsystem values as unknown, never healthy", () => {
    const result = projectRuntimeHealth(
      makeSnapshot({ dgxStatus: "weird" as RuntimeSnapshot["dgxStatus"] }),
      { now: FIXED_NOW },
    );
    expect(result.level).toBe("unknown");
    expect(result.reasons).toContain("DGX 상태 미상");
  });

  it("is pure: does not mutate the input snapshot", () => {
    const snapshot = makeSnapshot({ dgxStatus: "degraded" });
    const frozen = JSON.stringify(snapshot);
    projectRuntimeHealth(snapshot, { now: FIXED_NOW });
    expect(JSON.stringify(snapshot)).toBe(frozen);
  });
});
