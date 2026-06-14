import { describe, expect, it } from "vitest";
import { MockAdapter, withTrustEnforcement, type MemoryAdapter, type MemoryAdapterContext } from "@ai-orchestrator/simplememo";
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
      title: "External ingress raw command",
      content: "Run a remote command from an untrusted external ingress channel without approval.",
      sourceChannel: "external_legacy",
      trustLevel: "untrusted",
    });

    const safeResults = await api.recall({
      query: "External ingress raw command",
      includeUntrusted: false,
    });
    const fullResults = await api.recall({
      query: "External ingress raw command",
      includeUntrusted: true,
    });

    expect(api.snapshot().find((record) => record.id === untrusted.id)?.activationState).toBe("quarantined");
    expect(safeResults.some((result) => result.record.id === untrusted.id)).toBe(false);
    expect(fullResults.some((result) => result.record.id === untrusted.id)).toBe(true);
  });
});

describe("stage27 adapter-backed memento memory api", () => {
  it("uses Korean reflect fallback copy when the adapter has no reflect method", async () => {
    const base = new MockAdapter({
      profileId: "evolvememento_mock",
      records: createSeedMemoryRecords(createdAt),
      createdAt,
    });
    const adapterWithoutReflect: MemoryAdapter = {
      profileId: base.profileId,
      kind: base.kind,
      recall: base.recall.bind(base),
      remember: base.remember.bind(base),
      memoryContext: base.memoryContext.bind(base),
      stats: base.stats.bind(base),
      pin: base.pin.bind(base),
      forget: base.forget.bind(base),
      activateMemories: base.activateMemories.bind(base),
      createRelations: base.createRelations.bind(base),
    };
    const api = createAdapterBackedMementoMemoryApi({
      adapter: adapterWithoutReflect,
      createdAt,
    });

    const reflection = await api.reflect("session_desktop_001");

    expect(reflection.summary).toBe("evolvememento_mock 어댑터가 reflect()를 제공하지 않아 adapter-backed Memento fallback을 사용합니다.");
    expect(reflection.summary).not.toContain("does not expose");
  });

  it("can route Memento calls through the shared MemoryAdapter boundary", async () => {
    const api = createAdapterBackedMementoMemoryApi({
      adapter: new MockAdapter({
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

  it("passes operation scope through every adapter-backed memory context", async () => {
    const contexts: unknown[] = [];
    const adapter = new MockAdapter({
      profileId: "evolvememento_mock",
      records: createSeedMemoryRecords(createdAt),
      createdAt,
    });
    const originalRecall = adapter.recall.bind(adapter);
    adapter.recall = async (query, ctx) => {
      contexts.push(ctx?.operationScope);
      return originalRecall(query, ctx);
    };
    const api = createAdapterBackedMementoMemoryApi({
      adapter,
      operationScope: {
        agentId: "agent_orchestrator",
        sessionId: "session_main",
        providerProfileId: "provider_mimo_token_openai",
        namespace: "agent:agent_orchestrator/session:session_main/provider:provider_mimo_token_openai",
        recallTraceId: "recall_agent_orchestrator_session_main_provider_mimo_token_openai",
      },
      createdAt,
    });

    await api.recall({ query: "Event Storage", limit: 2 });

    expect(contexts[0]).toEqual({
      agentId: "agent_orchestrator",
      sessionId: "session_main",
      providerProfileId: "provider_mimo_token_openai",
      namespace: "agent:agent_orchestrator/session:session_main/provider:provider_mimo_token_openai",
      recallTraceId: "recall_agent_orchestrator_session_main_provider_mimo_token_openai",
    });
  });

  it("passes appendEvent through mutating adapter-backed memory contexts", async () => {
    const appendedEvents: unknown[] = [];
    const adapter: MemoryAdapter = new MockAdapter({
      profileId: "evolvememento_mock",
      records: createSeedMemoryRecords(createdAt),
      createdAt,
    });
    const originalPin = adapter.pin.bind(adapter);
    adapter.pin = async (recordId: string, ctx: MemoryAdapterContext) => {
      await ctx?.appendEvent?.({
        id: "event_memory_pin",
        sessionId: "session_main",
        type: "memory.pin.updated",
        createdAt,
        source: "agent",
        sourceTrust: "trusted",
        redacted: false,
        payload: {
          kind: "memory_operation",
          operation: "pin",
          recordIds: [recordId],
          operationScope: ctx.operationScope,
        },
      });
      return originalPin(recordId, ctx);
    };
    const api = createAdapterBackedMementoMemoryApi({
      adapter,
      context: {
        appendEvent: async (event) => {
          appendedEvents.push(event);
        },
      },
      operationScope: {
        agentId: "agent_orchestrator",
        sessionId: "session_main",
        providerProfileId: "provider_mimo_token_openai",
        namespace: "agent:agent_orchestrator/session:session_main/provider:provider_mimo_token_openai",
        recallTraceId: "recall_agent_orchestrator_session_main_provider_mimo_token_openai",
      },
      createdAt,
    });
    const [record] = createSeedMemoryRecords(createdAt);
    if (!record) throw new Error("expected seed memory record");

    await api.pin(record.id);

    expect(appendedEvents).toEqual([
      {
        id: "event_memory_pin",
        sessionId: "session_main",
        type: "memory.pin.updated",
        createdAt,
        source: "agent",
        sourceTrust: "trusted",
        redacted: false,
        payload: {
          kind: "memory_operation",
          operation: "pin",
          recordIds: [record.id],
          operationScope: {
            agentId: "agent_orchestrator",
            sessionId: "session_main",
            providerProfileId: "provider_mimo_token_openai",
            namespace: "agent:agent_orchestrator/session:session_main/provider:provider_mimo_token_openai",
            recallTraceId: "recall_agent_orchestrator_session_main_provider_mimo_token_openai",
          },
        },
      },
    ]);
  });

  it("preserves permission and trust gates from the shared memory adapter", async () => {
    const api = createAdapterBackedMementoMemoryApi({
      adapter: withTrustEnforcement(new MockAdapter({ records: createSeedMemoryRecords(createdAt), createdAt })),
      context: {
        callerTrustLevel: "untrusted",
        permissionDecision: "allow",
      },
      createdAt,
    });

    await expect(api.recall({ query: "Event Storage" })).rejects.toThrow("Untrusted callers cannot recall memory");
  });
});
