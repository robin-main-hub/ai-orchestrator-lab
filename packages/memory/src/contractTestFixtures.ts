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
          layer: "session",
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
          layer: "session",
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
          layer: "session",
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
          layer: "session",
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
          layer: "session",
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
          layer: "session",
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
{ title: "a", content: "record a", layer: "session", trustLevel: "trusted" as any },
        ctx,
      );
      const b = await adapter.remember(
{ title: "b", content: "record b", layer: "session", trustLevel: "trusted" as any },
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
];
