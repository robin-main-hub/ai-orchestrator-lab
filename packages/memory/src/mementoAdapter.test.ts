import { describe, expect, it } from "vitest";
import { MementoMcpAdapter } from "./mementoAdapter";
import type { MemoryAdapterContext } from "./adapter";
import type { MemoryRecord } from "@ai-orchestrator/protocol";

const AT = "2026-05-26T01:00:00.000Z";

function makeCtx(overrides: Partial<MemoryAdapterContext> = {}): MemoryAdapterContext {
  return {
    permissionDecision: "allow" as any,
    callerTrustLevel: "trusted",
    now: () => AT,
    ...overrides,
  };
}

function makeRecord(id: string, title: string, content: string, extra: Partial<MemoryRecord> = {}): MemoryRecord {
  return {
    id,
    layer: "project_memory",
    scope: "project",
    kind: "context",
    title,
    content,
    sourceChannel: "agent",
    trustLevel: "trusted",
    tags: [],
    activationState: "suggested",
    createdAt: AT,
    pinned: false,
    ...extra,
  };
}

describe("MementoMcpAdapter — recall", () => {
  it("recalls from local cache when policy is local_cache and record is seeded locally", async () => {
    const adapter = new MementoMcpAdapter({
      policy: "local_cache",
      seedRecords: [makeRecord("r1", "debate plan", "토론 전략 메모")],
    });
    const results = await adapter.recall({ query: "debate plan" }, makeCtx());
    expect(results.length).toBe(1);
    expect(results[0]?.record.id).toBe("r1");
    expect(adapter.traces.get("r1")?.source).toBe("local_cache");
    expect(adapter.traces.get("r1")?.hitLocal).toBe(true);
  });

  it("falls back to dgx_central on local cache-miss with policy local_cache", async () => {
    const adapter = new MementoMcpAdapter({
      policy: "local_cache",
      remoteRecords: [makeRecord("r2", "architecture decision", "아키텍처 결정 기록")],
    });
    const results = await adapter.recall({ query: "architecture decision" }, makeCtx());
    expect(results.length).toBe(1);
    expect(adapter.traces.get("r2")?.source).toBe("dgx_central");
    expect(adapter.traces.get("r2")?.hitLocal).toBe(false);
    // After a cache-miss, the record should be written back into local cache
    expect(adapter["localRecords"].has("r2")).toBe(true);
  });

  it("only uses session memory when policy is session_only", async () => {
    const adapter = new MementoMcpAdapter({
      policy: "session_only",
      seedRecords: [makeRecord("local1", "local memory", "세션 내 기억")],
      remoteRecords: [makeRecord("remote1", "remote memory", "원격 기억")],
    });
    const results = await adapter.recall({ query: "memory" }, makeCtx());
    const ids = results.map((r) => r.record.id);
    expect(ids).toContain("local1");
    expect(ids).not.toContain("remote1");
    expect(adapter.traces.get("local1")?.source).toBe("session_memory");
  });

  it("does not return tombstoned records", async () => {
    const adapter = new MementoMcpAdapter({
      policy: "local_cache",
      seedRecords: [makeRecord("r3", "old decision", "old", { tombstonedAt: AT })],
    });
    const results = await adapter.recall({ query: "old decision" }, makeCtx());
    expect(results).toHaveLength(0);
  });
});

describe("MementoMcpAdapter — remember + policy write-through", () => {
  it("stores to both local and remote for local_cache policy", async () => {
    const adapter = new MementoMcpAdapter({ policy: "local_cache" });
    const record = await adapter.remember(
      {
        layer: "project_memory",
        title: "new decision",
        content: "새로운 아키텍처 결정",
        sourceChannel: "agent",
        trustLevel: "trusted",
        tags: ["arch"],
      },
      makeCtx(),
    );
    expect(record.id).toBeDefined();
    expect(adapter["localRecords"].has(record.id)).toBe(true);
    expect(adapter["remoteRecords"].has(record.id)).toBe(true);
  });

  it("stores only to local for session_only policy", async () => {
    const adapter = new MementoMcpAdapter({ policy: "session_only" });
    const record = await adapter.remember(
      { layer: "episode", title: "temp note", content: "임시 메모", sourceChannel: "agent", trustLevel: "trusted", tags: [] },
      makeCtx(),
    );
    expect(adapter["localRecords"].has(record.id)).toBe(true);
    expect(adapter["remoteRecords"].has(record.id)).toBe(false);
  });
});

describe("MementoMcpAdapter — pin, forget, activate", () => {
  it("pin marks record as pinned in local store", async () => {
    const r = makeRecord("p1", "pinned", "중요 메모");
    const adapter = new MementoMcpAdapter({ policy: "local_cache", seedRecords: [r] });
    await adapter.pin("p1", makeCtx());
    expect(adapter["localRecords"].get("p1")?.pinned).toBe(true);
    expect(adapter["pinnedIds"].has("p1")).toBe(true);
  });

  it("forget tombstones record in local and remote", async () => {
    const r = makeRecord("f1", "to delete", "삭제 대상");
    const adapter = new MementoMcpAdapter({
      policy: "local_cache",
      seedRecords: [r],
      remoteRecords: [r],
    });
    await adapter.forget("f1", makeCtx());
    expect(adapter["localRecords"].get("f1")?.tombstonedAt).toBe(AT);
    expect(adapter["remoteRecords"].get("f1")?.tombstonedAt).toBe(AT);
  });

  it("activateMemories transitions activationState to active", async () => {
    const r = makeRecord("a1", "memory", "기억", { activationState: "suggested" });
    const adapter = new MementoMcpAdapter({ seedRecords: [r] });
    await adapter.activateMemories(["a1"], makeCtx());
    expect(adapter["localRecords"].get("a1")?.activationState).toBe("active");
  });
});

describe("MementoMcpAdapter — stats", () => {
  it("counts records correctly per policy", async () => {
    const adapter = new MementoMcpAdapter({
      policy: "local_cache",
      seedRecords: [
        makeRecord("s1", "a", "a"),
        makeRecord("s2", "b", "b", { tombstonedAt: AT }),
      ],
      remoteRecords: [makeRecord("s3", "c", "c")],
    });
    const stats = await adapter.stats(makeCtx());
    expect(stats.totalRecords).toBe(3); // s1, s2, s3
    expect(stats.activeRecords).toBe(1); // s1 only (s2 tombstoned)
    expect(stats.health).toBeDefined();
    const cache = adapter.cacheStats();
    expect(cache.localCacheSize).toBe(2);
    expect(cache.remoteCacheSize).toBe(1);
    expect(cache.policy).toBe("local_cache");
  });
});

describe("MementoMcpAdapter — reflect", () => {
  it("returns summaryPoints from session records", async () => {
    const adapter = new MementoMcpAdapter({
      seedRecords: [
        makeRecord("r1", "plan A", "계획 A", { sessionId: "sess-1" }),
        makeRecord("r2", "plan B", "계획 B", { sessionId: "sess-1" }),
        makeRecord("r3", "unrelated", "무관", { sessionId: "sess-2" }),
      ],
    });
    const reflection = await adapter.reflect("sess-1", makeCtx());
    expect(reflection.sessionId).toBe("sess-1");
    expect(reflection.summary.length).toBeGreaterThan(0);
    expect(reflection.summary).toContain("plan A");
    expect(reflection.summary).toContain("plan B");
    expect(reflection.summary).not.toContain("unrelated");
    expect(Array.isArray(reflection.decisions)).toBe(true);
    expect(Array.isArray(reflection.risks)).toBe(true);
  });
});
