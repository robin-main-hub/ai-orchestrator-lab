import { describe, it, expect } from "vitest";
import { SimpleMemAdapter } from "./simpleMemAdapter.js";
import { withTrustEnforcement } from "./trustEnforcedAdapter.js";
import { makeContractCtx } from "./contractTestFixtures.js";
import { MemoryAdapterError } from "./errors.js";
import type { EventEnvelope, MemoryRecord } from "@ai-orchestrator/protocol";

describe("SimpleMemAdapter — contract & behavior", () => {
  const seed: MemoryRecord = {
    id: "dgx_seed_001",
    layer: "episode",
    scope: "session",
    kind: "context",
    title: "seed title",
    content: "seed content about apple",
    sourceChannel: "agent",
    trustLevel: "trusted",
    createdAt: new Date().toISOString(),
    pinned: false,
  };

  it("should recall from seed records", async () => {
    const events: EventEnvelope<any>[] = [];
    const adapter = new SimpleMemAdapter({ seedRecords: [seed] });
    const ctx = makeContractCtx({
      appendEvent: async (ev) => {
        events.push(ev);
      },
    });

    const results = await adapter.recall({ query: "apple" }, ctx);
    expect(results).toHaveLength(1);
    expect(results[0]?.record.id).toBe("dgx_seed_001");
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("memory.operation");
    expect(events[0]?.payload.operation).toBe("recall");
    expect(events[0]?.payload.recordIds).toContain("dgx_seed_001");
  });

  it("appends operation scope metadata when provided by the caller", async () => {
    const events: EventEnvelope<any>[] = [];
    const adapter = new SimpleMemAdapter({ seedRecords: [seed] });
    const ctx = makeContractCtx({
      operationScope: {
        agentId: "agent_orchestrator",
        sessionId: "session_main",
        providerProfileId: "provider_mimo_token_openai",
        namespace: "agent:agent_orchestrator/session:session_main/provider:provider_mimo_token_openai",
        recallTraceId: "recall_agent_orchestrator_session_main_provider_mimo_token_openai",
      },
      appendEvent: async (ev) => {
        events.push(ev);
      },
    });

    await adapter.recall({ query: "apple" }, ctx);

    expect(events[0]?.payload.operationScope).toEqual(ctx.operationScope);
  });

  it("remember() throws promotion_pending and appends memory.archival_write.requested event", async () => {
    const events: EventEnvelope<any>[] = [];
    const adapter = new SimpleMemAdapter();
    const ctx = makeContractCtx({
      appendEvent: async (ev) => {
        events.push(ev);
      },
    });

    await expect(
      adapter.remember(
        {
          title: "test write",
          content: "pending write content",
          layer: "episode",
          sourceChannel: "agent",
          trustLevel: "trusted",
        },
        ctx,
      ),
    ).rejects.toThrowError(
      new MemoryAdapterError("promotion_pending", "Archival write requested. Pending curator promotion."),
    );

    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("memory.archival_write.requested");
    expect(events[0]?.payload.kind).toBe("archival_write_requested");
    expect(events[0]?.payload.input.title).toBe("test write");
  });

  it("pin() throws promotion_pending and appends memory.pin.requested event", async () => {
    const events: EventEnvelope<any>[] = [];
    const adapter = new SimpleMemAdapter();
    const ctx = makeContractCtx({
      appendEvent: async (ev) => {
        events.push(ev);
      },
    });

    await expect(adapter.pin("some-record-id", ctx)).rejects.toThrowError(
      new MemoryAdapterError("promotion_pending", "Pin requested. Pending curator promotion.", {
        recordId: "some-record-id",
      }),
    );

    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("memory.pin.requested");
    expect(events[0]?.payload.operation).toBe("pin");
    expect(events[0]?.payload.recordIds).toContain("some-record-id");
  });

  it("forget() throws promotion_pending and appends memory.forget.requested event", async () => {
    const events: EventEnvelope<any>[] = [];
    const adapter = new SimpleMemAdapter();
    const ctx = makeContractCtx({
      appendEvent: async (ev) => {
        events.push(ev);
      },
    });

    await expect(adapter.forget("some-record-id", ctx)).rejects.toThrowError(
      new MemoryAdapterError("promotion_pending", "Forget requested. Pending curator promotion.", {
        recordId: "some-record-id",
      }),
    );

    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("memory.forget.requested");
    expect(events[0]?.payload.operation).toBe("forget");
    expect(events[0]?.payload.recordIds).toContain("some-record-id");
  });

  it("activateMemories() throws promotion_pending and appends memory.activate.requested event", async () => {
    const events: EventEnvelope<any>[] = [];
    const adapter = new SimpleMemAdapter();
    const ctx = makeContractCtx({
      appendEvent: async (ev) => {
        events.push(ev);
      },
    });

    await expect(adapter.activateMemories(["id1", "id2"], ctx)).rejects.toThrowError(
      new MemoryAdapterError("promotion_pending", "Activation requested. Pending curator promotion."),
    );

    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("memory.activate.requested");
    expect(events[0]?.payload.operation).toBe("activate");
    expect(events[0]?.payload.recordIds).toEqual(["id1", "id2"]);
  });

  it("createRelations() successfully returns relations and appends memory.relation.created event", async () => {
    const events: EventEnvelope<any>[] = [];
    const adapter = new SimpleMemAdapter();
    const ctx = makeContractCtx({
      appendEvent: async (ev) => {
        events.push(ev);
      },
    });

    const relations = await adapter.createRelations(["id1", "id2"], ctx);
    expect(relations).toHaveLength(1);
    expect(relations[0]?.fromRecordId).toBe("id1");
    expect(relations[0]?.toRecordId).toBe("id2");

    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("memory.relation.created");
    expect(events[0]?.payload.operation).toBe("createRelations");
    expect(events[0]?.payload.recordIds).toEqual(["id1", "id2"]);
  });

  it("memoryContext() returns correct packet format", async () => {
    const adapter = new SimpleMemAdapter({ seedRecords: [seed] });
    const ctx = makeContractCtx();

    const packet = await adapter.memoryContext({ query: "apple" }, ctx);
    expect(packet.activeRecordIds).toContain("dgx_seed_001");
    expect(packet.summary).toBe("seed title");
  });

  it("stats() returns correct counts", async () => {
    const adapter = new SimpleMemAdapter({ seedRecords: [seed] });
    const stats = await adapter.stats();
    expect(stats.totalRecords).toBe(1);
    expect(stats.pinnedRecords).toBe(0);
  });

  it("reflect() appends reflect event and returns summary", async () => {
    const events: EventEnvelope<any>[] = [];
    const adapter = new SimpleMemAdapter({ seedRecords: [seed] });
    const ctx = makeContractCtx({
      appendEvent: async (ev) => {
        events.push(ev);
      },
    });

    const reflection = await adapter.reflect("dgx_simplemem", ctx);
    expect(reflection.summary).toBe("no active memories");
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("memory.reflect.completed");
  });
});

describe("withTrustEnforcement(SimpleMemAdapter) — integration", () => {
  it("blocks operation when permissionDecision is not allowed", async () => {
    const adapter = withTrustEnforcement(new SimpleMemAdapter());
    const ctx = makeContractCtx({ permissionDecision: "deny" });

    await expect(
      adapter.remember(
        {
          title: "t",
          content: "c",
          layer: "episode",
          sourceChannel: "agent",
          trustLevel: "trusted",
        },
        ctx,
      ),
    ).rejects.toMatchObject({
      category: "permission_denied",
    });
  });

  it("transparently propagates promotion_pending when permitted", async () => {
    const adapter = withTrustEnforcement(new SimpleMemAdapter());
    const ctx = makeContractCtx({ permissionDecision: "allow" });

    await expect(
      adapter.remember(
        {
          title: "t",
          content: "c",
          layer: "episode",
          sourceChannel: "agent",
          trustLevel: "trusted",
        },
        ctx,
      ),
    ).rejects.toThrowError(
      new MemoryAdapterError("promotion_pending", "Archival write requested. Pending curator promotion."),
    );
  });
});
