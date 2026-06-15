import type { MemoryAdapter, MemoryAdapterContext } from "./adapter.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MemoryContractCase {
    label: string;
  run: (adapter: MemoryAdapter, ctx: MemoryAdapterContext) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Context factory
// ---------------------------------------------------------------------------

export function makeContractCtx(
  overrides?: Partial<MemoryAdapterContext>,
): MemoryAdapterContext {
  return {
    permissionDecision: "allowed" as any,
    callerTrustLevel: "trusted" as any,
    ...overrides,
};
}

// ---------------------------------------------------------------------------
// Standard contract cases — every MemoryAdapter implementation must pass
// ---------------------------------------------------------------------------

export const STANDARD_CONTRACT_CASES: MemoryContractCase[] = [
{
    label: "recall on empty store returns empty array",
    async run(adapter, ctx) {
      const results = await adapter.recall({ query: "anything" }, ctx);
      if (!Array.isArray(results)) throw new Error("expected array");
      if (results.length !== 0) throw new Error(`expected 0 results, got ${results.length}`);
},
},
{
    label: "remember returns a MemoryRecord with an id",
    async run(adapter, ctx) {
      const record = await adapter.remember(
{
          title: "test record",
          content: "hello world",
          layer: "episode",
          sourceChannel: "agent" as any,
          trustLevel: "trusted" as any,
},
        ctx,
      );
      if (!record.id) throw new Error("expected id on record");
      if (record.content !== "hello world") throw new Error("content mismatch");
},
},
{
    label: "recall finds remembered content by keyword",
    async run(adapter, ctx) {
      await adapter.remember(
{
          title: "fox story",
          content: "the quick brown fox",
          layer: "episode",
          sourceChannel: "agent" as any,
          trustLevel: "trusted" as any,
},
        ctx,
      );
      const results = await adapter.recall({ query: "fox" }, ctx);
      const found = results.some((r) => r.record.content.includes("fox"));
      if (!found) throw new Error("remembered content not recalled");
},
},
{
    label: "pin marks record as pinned",
    async run(adapter, ctx) {
      const record = await adapter.remember(
{
          title: "pin me",
          content: "pin this record",
          layer: "episode",
          sourceChannel: "agent" as any,
          trustLevel: "trusted" as any,
},
        ctx,
      );
      await adapter.pin(record.id, ctx);
      const results = await adapter.recall({ query: "pin this" }, ctx);
      const found = results.find((r) => r.record.id === record.id);
      if (!found) throw new Error("pinned record not found in recall");
      if (!found.record.pinned) throw new Error("record.pinned should be true");
},
},
{
    label: "forget tombstones record so it no longer appears in recall",
    async run(adapter, ctx) {
      const record = await adapter.remember(
{
          title: "forget me",
          content: "forget this record please",
          layer: "episode",
          sourceChannel: "agent" as any,
          trustLevel: "trusted" as any,
},
        ctx,
      );
      await adapter.forget(record.id, ctx);
      const results = await adapter.recall({ query: "forget this" }, ctx);
      const found = results.find((r) => r.record.id === record.id);
      if (found) throw new Error("forgotten record should not appear in recall");
},
},
{
    label: "stats reflect remembered records",
    async run(adapter, ctx) {
      const before = await adapter.stats(ctx);
      await adapter.remember(
{
          title: "stat test",
          content: "testing stats",
          layer: "episode",
          sourceChannel: "agent" as any,
          trustLevel: "trusted" as any,
},
        ctx,
      );
      const after = await adapter.stats(ctx);
      if (after.totalRecords <= before.totalRecords) {
        throw new Error("totalRecords did not increase after remember");
}
},
},
{
    label: "activateMemories sets activationState to active",
    async run(adapter, ctx) {
      const record = await adapter.remember(
{
          title: "activate me",
          content: "needs activation",
          layer: "episode",
          sourceChannel: "agent" as any,
          trustLevel: "trusted" as any,
},
        ctx,
      );
      await adapter.activateMemories([record.id], ctx);
      const results = await adapter.recall({ query: "needs activation" }, ctx);
      const found = results.find((r) => r.record.id === record.id);
      if (!found) throw new Error("activated record not found in recall");
      if (found.record.activationState !== "active") {
        throw new Error(`expected activationState "active", got "${found.record.activationState}"`);
}
},
},
{
    label: "createRelations returns MemoryRelation array",
    async run(adapter, ctx) {
      const a = await adapter.remember(
{ title: "a", content: "record a", layer: "episode", sourceChannel: "agent", trustLevel: "trusted" as any },
        ctx,
      );
      const b = await adapter.remember(
{ title: "b", content: "record b", layer: "episode", sourceChannel: "agent", trustLevel: "trusted" as any },
        ctx,
      );
      const relations = await adapter.createRelations([a.id, b.id], ctx);
      if (!Array.isArray(relations)) throw new Error("expected array from createRelations");
      if (relations.length === 0) throw new Error("expected at least one relation");
      const rel = relations[0]!;
      if (!rel.id || !rel.fromRecordId || !rel.toRecordId) {
        throw new Error("relation missing required fields");
}
},
},
  {
    label: "memoryContext returns packet with records and totalTokenEstimate",
    async run(adapter, ctx) {
      await adapter.remember(
        {
          title: "context test",
          content: "this is content for the context packet",
          layer: "episode",
          sourceChannel: "agent" as any,
          trustLevel: "trusted" as any,
        },
        ctx,
      );
      const packet = await adapter.memoryContext({ query: "context" }, ctx);
      if (!packet.id) throw new Error("packet missing id");
      if (!Array.isArray(packet.activeRecordIds)) {
        throw new Error("packet.activeRecordIds must be an array");
      }
      if (!Array.isArray(packet.blockedRecordIds)) {
        throw new Error("packet.blockedRecordIds must be an array");
      }
      if (typeof packet.summary !== "string") {
        throw new Error("packet.summary must be a string");
      }
      if (typeof packet.createdAt !== "string") {
        throw new Error("packet.createdAt must be a string");
      }
    },
  },
  {
    label: "recall respects limit parameter (cap at requested count)",
    async run(adapter, ctx) {
      for (const i of [1, 2, 3, 4, 5]) {
        await adapter.remember(
          {
            title: `limit-test-${i}`,
            content: `limit testing record number ${i} carries the limit keyword`,
            layer: "episode",
            sourceChannel: "agent" as any,
          trustLevel: "trusted" as any,
          },
          ctx,
        );
      }
      const results = await adapter.recall({ query: "limit", limit: 2 }, ctx);
      if (results.length > 2) {
        throw new Error(`expected at most 2 results, got ${results.length}`);
      }
    },
  },
  {
    label: "forget is idempotent (second call does not throw)",
    async run(adapter, ctx) {
      const record = await adapter.remember(
        {
          title: "idem-forget",
          content: "idempotent forget target",
          layer: "episode",
          sourceChannel: "agent" as any,
          trustLevel: "trusted" as any,
        },
        ctx,
      );
      await adapter.forget(record.id, ctx);
      // Second call must not throw
      await adapter.forget(record.id, ctx);
    },
  },
  {
    label: "activateMemories with empty array is a no-op",
    async run(adapter, ctx) {
      // Must not throw on empty input
      await adapter.activateMemories([], ctx);
    },
  },
  {
    label: "pin then forget tombstones a pinned record",
    async run(adapter, ctx) {
      const record = await adapter.remember(
        {
          title: "pinned-then-forgotten",
          content: "pin-forget interaction test record",
          layer: "episode",
          sourceChannel: "agent" as any,
          trustLevel: "trusted" as any,
        },
        ctx,
      );
      await adapter.pin(record.id, ctx);
      await adapter.forget(record.id, ctx);
      const results = await adapter.recall({ query: "pin-forget interaction" }, ctx);
      const found = results.find((r) => r.record.id === record.id);
      if (found) {
        throw new Error("pinned record should still be tombstoned by forget");
      }
    },
  },
  {
    label: "recall results carry score and usedInDecision flag",
    async run(adapter, ctx) {
      await adapter.remember(
        {
          title: "score-test",
          content: "score and usedInDecision flag presence check",
          layer: "episode",
          sourceChannel: "agent" as any,
          trustLevel: "trusted" as any,
        },
        ctx,
      );
      const results = await adapter.recall({ query: "usedInDecision flag presence" }, ctx);
      if (results.length === 0) throw new Error("expected at least one result");
      const r = results[0]!;
      if (typeof r.score !== "number") throw new Error("result.score must be a number");
      if (typeof r.usedInDecision !== "boolean") {
        throw new Error("result.usedInDecision must be a boolean");
      }
    },
  },
];
