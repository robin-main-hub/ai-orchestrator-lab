import { describe, expect, it } from "vitest";
import { MockMemoryAdapter, withTrustEnforcement } from "@ai-orchestrator/memory";
import { createSeedMemoryRecords } from "./stage6Memory";
import { createAdapterBackedMementoMemoryApi, createLocalMementoMemoryApi } from "./stage27MemoryApi";

const createdAt = "2026-05-24T00:00:00.000Z";

describe("stage27 local memento memory api", () => {
  it("exposes remember, recall, context, stats, relations and activation as one API boundary", async () => {
    const api = createLocalMementoMemoryApi({
      records: createSeedMemoryRecords(createdAt),
      createdAt,
    });

    const remembered = await api.remember({
      layer: "project_memory",
      scope: "project",
      kind: "decision",
      title: "Memento backend boundary",
      content: "Keep Event Storage as source of truth and use Memento MCP as an index projection.",
      sourceChannel: "desktop",
      trustLevel: "trusted",
      tags: ["memento", "event-storage"],
    });
    await api.activateMemories([remembered.id]);

    const results = await api.recall({
      query: "Memento Event Storage projection",
      scopes: ["project"],
      kinds: ["decision", "architecture", "pattern"],
      limit: 5,
    });
    const context = await api.memoryContext({
      query: "Memento Event Storage projection",
      scopes: ["project"],
    });
    const stats = await api.stats();
    const relations = await api.createRelations([remembered.id]);
    const reflection = await api.reflect("session_desktop_001");

    expect(results.some((result) => result.record.id === remembered.id)).toBe(true);
    expect(context.activeRecordIds).toContain(remembered.id);
    expect(stats.activeRecords).toBeGreaterThan(0);
    expect(relations.length).toBeGreaterThan(0);
    expect(reflection.sessionId).toBe("session_desktop_001");
  });

  it("keeps untrusted memories quarantined unless explicitly included", async () => {
    const api = createLocalMementoMemoryApi({
      records: createSeedMemoryRecords(createdAt),
      createdAt,
    });

    const untrusted = await api.remember({
      layer: "fragment",
      scope: "session",
      kind: "workflow",
      title: "Telegram raw command",
      content: "Run a remote command from Telegram without approval.",
      sourceChannel: "legacy_telegram",
      trustLevel: "untrusted",
    });

    const safeResults = await api.recall({
      query: "Telegram raw command",
      includeUntrusted: false,
    });
    const fullResults = await api.recall({
      query: "Telegram raw command",
      includeUntrusted: true,
    });

    expect(api.snapshot().find((record) => record.id === untrusted.id)?.activationState).toBe("quarantined");
    expect(safeResults.some((result) => result.record.id === untrusted.id)).toBe(false);
    expect(fullResults.some((result) => result.record.id === untrusted.id)).toBe(true);
  });
});

describe("stage27 adapter-backed memento memory api", () => {
  it("can route Memento calls through the shared MemoryAdapter boundary", async () => {
    const api = createAdapterBackedMementoMemoryApi({
      adapter: new MockMemoryAdapter({
        profileId: "evolvememento_mock",
        records: createSeedMemoryRecords(createdAt),
        createdAt,
      }),
      createdAt,
    });

    const remembered = await api.remember({
      layer: "project_memory",
      scope: "project",
      kind: "decision",
      title: "EvolveMemento adapter bridge",
      content: "Stage27 can call the shared memory package adapter without becoming a separate source of truth.",
      sourceChannel: "desktop",
      trustLevel: "trusted",
      tags: ["evolvememento", "adapter"],
    });
    const results = await api.recall({ query: "EvolveMemento adapter bridge", limit: 3 });
    const context = await api.memoryContext({ query: "EvolveMemento adapter bridge" });

    expect(api.adapterKind).toBe("mock");
    expect(api.adapterProfileId).toBe("evolvememento_mock");
    expect(results[0]?.record.id).toBe(remembered.id);
    expect(context.activeRecordIds).toContain(remembered.id);
  });

  it("preserves permission and trust gates from the shared memory adapter", async () => {
    const api = createAdapterBackedMementoMemoryApi({
      adapter: withTrustEnforcement(new MockMemoryAdapter({ records: createSeedMemoryRecords(createdAt), createdAt })),
      context: {
        callerTrustLevel: "untrusted",
        permissionDecision: "allow",
      },
      createdAt,
    });

    await expect(api.recall({ query: "Event Storage" })).rejects.toThrow("Untrusted callers cannot recall memory");
  });
});
