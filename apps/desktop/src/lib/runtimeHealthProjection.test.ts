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

// Characterization tests for the previously-uncovered severity-ordering and
// staleness-boundary branches (no behavior change). The existing suite pins the
// G1/G2/G3 honesty guards but leaves these subtler interactions unpinned: that
// `unknown` (severity 1) never masks a real degraded/offline fault, that the
// stale -> degraded downgrade applies ONLY to a `healthy` rollup (an `unknown`
// rollup stays unknown), the DEFAULT 5-minute staleness threshold and its
// strict `>` boundary, recentError+stale reason ordering, and the dgx/local/
// memory subsystem ordering with raw passthrough. All pure, clock injected.
describe("runtimeHealthProjection — severity & staleness boundary characterization", () => {
  it("does not let an unknown subsystem mask a coexisting degraded fault", () => {
    const result = projectRuntimeHealth(
      makeSnapshot({ dgxStatus: "weird" as RuntimeSnapshot["dgxStatus"], memorySyncStatus: "degraded" }),
      { now: FIXED_NOW },
    );

    expect(result.level).toBe("degraded");
    expect(result.reasons).toContain("DGX 상태 미상");
    expect(result.reasons).toContain("기억 degraded");
  });

  it("keeps an unknown rollup unknown under staleness (downgrade only fires on healthy)", () => {
    const result = projectRuntimeHealth(
      makeSnapshot({ dgxStatus: "weird" as RuntimeSnapshot["dgxStatus"], updatedAt: "2026-06-18T00:00:00.000Z" }),
      { now: FIXED_NOW, stalenessThresholdMs: 60_000 },
    );

    expect(result.stale).toBe(true);
    expect(result.level).toBe("unknown");
    expect(result.reasons).toContain("DGX 상태 미상");
    expect(result.reasons).toContain("스냅샷 정보 지연(stale)");
  });

  it("uses the default 5-minute threshold to flag a snapshot just past it", () => {
    const result = projectRuntimeHealth(
      makeSnapshot({ updatedAt: new Date(FIXED_NOW - (5 * 60_000 + 1_000)).toISOString() }),
      { now: FIXED_NOW },
    );

    expect(result.stale).toBe(true);
    expect(result.level).toBe("degraded");
  });

  it("treats a snapshot exactly at the default threshold as fresh (strict > boundary)", () => {
    const result = projectRuntimeHealth(
      makeSnapshot({ updatedAt: new Date(FIXED_NOW - 5 * 60_000).toISOString() }),
      { now: FIXED_NOW },
    );

    expect(result.stale).toBe(false);
    expect(result.level).toBe("healthy");
  });

  it("orders recentError before staleness in reasons and keeps the level offline", () => {
    const result = projectRuntimeHealth(
      makeSnapshot({ recentError: "disk full", updatedAt: "2026-06-18T00:00:00.000Z" }),
      { now: FIXED_NOW, stalenessThresholdMs: 60_000 },
    );

    expect(result.level).toBe("offline");
    expect(result.stale).toBe(true);
    expect(result.reasons).toEqual(["최근 오류 기록 있음", "스냅샷 정보 지연(stale)"]);
  });

  it("preserves dgx/local/memory subsystem order with raw passthrough and matching reason order", () => {
    const result = projectRuntimeHealth(
      makeSnapshot({ dgxStatus: "degraded", memorySyncStatus: "offline" }),
      { now: FIXED_NOW },
    );

    expect(result.subsystems.map((s) => s.key)).toEqual(["dgx", "local", "memory"]);
    expect(result.subsystems.map((s) => s.raw)).toEqual(["degraded", "online", "offline"]);
    expect(result.reasons).toEqual(["DGX degraded", "기억 offline"]);
    expect(result.level).toBe("offline");
  });
});
