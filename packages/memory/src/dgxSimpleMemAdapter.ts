import type {
  MemoryContextPacket,
  MemoryInput,
  MemoryRecord,
  MemoryRelation,
  MemoryStats,
  RecallQuery,
  RecallResult,
  Reflection,
} from "@ai-orchestrator/protocol";
import type { MemoryAdapter, MemoryAdapterContext, MemoryAdapterKind } from "./adapter.js";
import { MemoryAdapterError } from "./errors.js";

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function tokenize(text: string): string[] {
  return text.toLowerCase().split(/\s+/).filter(Boolean);
}

function stableId(input: string, salt: string): string {
  let h = 0;
  const s = input + salt;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return `dgx_${(h >>> 0).toString(16).padStart(8, "0")}`;
}

function scoreRecord(record: MemoryRecord, queryTokens: string[]): number {
  const haystack = new Set(
    tokenize([record.title, record.content, ...(record.tags ?? [])].join(" ")),
  );
  const overlap = queryTokens.filter((t) => haystack.has(t)).length;
  return (queryTokens.length > 0 ? overlap / queryTokens.length : 0) + (record.pinned ? 0.5 : 0);
}

// ---------------------------------------------------------------------------
// DgxSimpleMemMemoryAdapter
// Derived index memory adapter. Because it is derived, mutating actions like
// remember, pin, forget, and activate are asynchronously promoted by curator
// processes. Thus, calling these mutating methods immediately throws a
// "promotion_pending" MemoryAdapterError while appending request events to the event store.
// ---------------------------------------------------------------------------

export class DgxSimpleMemMemoryAdapter implements MemoryAdapter {
  readonly kind: MemoryAdapterKind = "dgx_simplemem";
  readonly profileId: string;

  private records = new Map<string, MemoryRecord>();
  private _relations: MemoryRelation[] = [];
  private _seq = 0;

  constructor(options: { profileId?: string; seedRecords?: MemoryRecord[] } = {}) {
    this.profileId = options.profileId ?? "dgx_simplemem";
    if (options.seedRecords) {
      for (const r of options.seedRecords) {
        this.records.set(r.id, r);
      }
    }
  }

  async recall(query: RecallQuery, ctx: MemoryAdapterContext): Promise<RecallResult[]> {
    const queryTokens = tokenize(query.query);
    const candidates = Array.from(this.records.values())
      .filter((r) => {
        if (r.tombstonedAt) return false;
        if (query.layers && !query.layers.includes(r.layer)) return false;
        if (query.scopes && r.scope && !query.scopes.includes(r.scope)) return false;
        if (query.kinds && !query.kinds.includes(r.kind ?? "context")) return false;
        if (!query.includeUntrusted && r.trustLevel === "untrusted") return false;
        return true;
      })
      .map((record): RecallResult => ({
        record,
        score: scoreRecord(record, queryTokens),
        usedInDecision: false,
        activationState: record.activationState,
        reason: queryTokens.length > 0 ? "token overlap" : "available fallback memory",
      }))
      .filter((res) => res.score > 0 || queryTokens.length === 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, query.limit ?? 8);

    const now = ctx.now?.() ?? new Date().toISOString();
    await ctx.appendEvent?.({
      id: `dgx_recall_${stableId(query.query, String(this._seq++))}`,
      sessionId: query.sessionId ?? "dgx_simplemem",
      type: "memory.operation",
      payload: {
        kind: "memory_operation",
        operation: "recall",
        recordIds: candidates.map((r) => r.record.id),
      },
      createdAt: now,
      source: "agent",
      sourceTrust: "trusted",
      redacted: false,
    });

    return candidates;
  }

  async remember(input: MemoryInput, ctx: MemoryAdapterContext): Promise<MemoryRecord> {
    const now = ctx.now?.() ?? new Date().toISOString();
    await ctx.appendEvent?.({
      id: `dgx_remember_${stableId(`${input.title}:${input.content}`, String(this._seq++))}`,
      sessionId: input.sessionId ?? "dgx_simplemem",
      type: "memory.archival_write.requested",
      payload: {
        kind: "archival_write_requested",
        input,
      },
      createdAt: now,
      source: "agent",
      sourceTrust: input.trustLevel,
      redacted: false,
    });

    throw new MemoryAdapterError(
      "promotion_pending",
      "Archival write requested. Pending curator promotion.",
    );
  }

  async memoryContext(query: RecallQuery, ctx: MemoryAdapterContext): Promise<MemoryContextPacket> {
    const results = await this.recall(query, ctx);
    const now = ctx.now?.() ?? new Date().toISOString();
    const activeIds: string[] = [];
    const blockedIds: string[] = [];
    for (const r of results) {
      if (r.record.activationState === "quarantined" || r.record.trustLevel === "untrusted") {
        blockedIds.push(r.record.id);
      } else {
        activeIds.push(r.record.id);
      }
    }
    return {
      id: stableId(query.query, now),
      sessionId: query.sessionId ?? "dgx_simplemem",
      query: query.query,
      activeRecordIds: activeIds,
      blockedRecordIds: blockedIds,
      relationIds: [],
      summary: results.map((r) => r.record.title).join("; "),
      createdAt: now,
    };
  }

  async stats(_ctx?: MemoryAdapterContext): Promise<MemoryStats> {
    const active = Array.from(this.records.values()).filter((r) => !r.tombstonedAt);
    return {
      totalRecords: active.length,
      activeRecords: active.filter((r) => r.activationState === "active").length,
      pinnedRecords: active.filter((r) => r.pinned).length,
      quarantinedRecords: active.filter((r) => r.activationState === "quarantined").length,
      relationCount: this._relations.length,
      duplicateCandidates: 0,
      contradictionCandidates: 0,
      staleCandidates: 0,
      health: "good",
    };
  }

  async pin(recordId: string, ctx: MemoryAdapterContext): Promise<void> {
    const now = ctx.now?.() ?? new Date().toISOString();
    await ctx.appendEvent?.({
      id: `dgx_pin_${recordId}_${now}`,
      sessionId: "dgx_simplemem",
      type: "memory.pin.requested",
      payload: {
        kind: "memory_operation",
        operation: "pin",
        recordIds: [recordId],
      },
      createdAt: now,
      source: "agent",
      sourceTrust: "trusted",
      redacted: false,
    });
    throw new MemoryAdapterError(
      "promotion_pending",
      "Pin requested. Pending curator promotion.",
      { recordId },
    );
  }

  async forget(recordId: string, ctx: MemoryAdapterContext): Promise<void> {
    const now = ctx.now?.() ?? new Date().toISOString();
    await ctx.appendEvent?.({
      id: `dgx_forget_${recordId}_${now}`,
      sessionId: "dgx_simplemem",
      type: "memory.forget.requested",
      payload: {
        kind: "memory_operation",
        operation: "forget",
        recordIds: [recordId],
      },
      createdAt: now,
      source: "agent",
      sourceTrust: "trusted",
      redacted: false,
    });
    throw new MemoryAdapterError(
      "promotion_pending",
      "Forget requested. Pending curator promotion.",
      { recordId },
    );
  }

  async activateMemories(recordIds: string[], ctx: MemoryAdapterContext): Promise<void> {
    const now = ctx.now?.() ?? new Date().toISOString();
    await ctx.appendEvent?.({
      id: `dgx_activate_${stableId(recordIds.join(","), String(this._seq++))}`,
      sessionId: "dgx_simplemem",
      type: "memory.activate.requested",
      payload: {
        kind: "memory_operation",
        operation: "activate",
        recordIds,
      },
      createdAt: now,
      source: "agent",
      sourceTrust: "trusted",
      redacted: false,
    });
    throw new MemoryAdapterError(
      "promotion_pending",
      "Activation requested. Pending curator promotion.",
    );
  }

  async createRelations(recordIds: string[], ctx: MemoryAdapterContext): Promise<MemoryRelation[]> {
    const now = ctx.now?.() ?? new Date().toISOString();
    const newRelations = recordIds.slice(1).map((toId, idx): MemoryRelation => ({
      id: stableId(`${recordIds[0]}_${toId}`, String(idx)),
      fromRecordId: recordIds[0] as string,
      toRecordId: toId,
      kind: "related",
      confidence: 0.5,
      reason: "auto-linked by createRelations",
      createdAt: now,
    }));
    this._relations.push(...newRelations);

    await ctx.appendEvent?.({
      id: `dgx_relation_${stableId(recordIds.join(","), String(this._seq++))}`,
      sessionId: "dgx_simplemem",
      type: "memory.relation.created",
      payload: {
        kind: "memory_operation",
        operation: "createRelations",
        recordIds,
      },
      createdAt: now,
      source: "agent",
      sourceTrust: "trusted",
      redacted: false,
    });

    return newRelations;
  }

  async reflect(sessionId: string, ctx: MemoryAdapterContext): Promise<Reflection> {
    const now = ctx.now?.() ?? new Date().toISOString();
    const sessionRecords = Array.from(this.records.values()).filter(
      (r) => r.sessionId === sessionId && !r.tombstonedAt,
    );
    const summaryLines = sessionRecords.slice(0, 5).map((r) => `[${r.layer}] ${r.title}`);
    const risks = sessionRecords
      .filter((r) => r.trustLevel === "untrusted" || r.activationState === "quarantined")
      .slice(0, 5)
      .map((r) => `untrusted/quarantined: ${r.title}`);
    const decisions = sessionRecords
      .filter((r) => r.pinned)
      .slice(0, 5)
      .map((r) => r.title);

    const reflection: Reflection = {
      sessionId,
      summary: summaryLines.join("; ") || "no active memories",
      decisions,
      risks,
      createdAt: now,
    };

    await ctx.appendEvent?.({
      id: `dgx_reflect_${sessionId}_${now}`,
      sessionId,
      type: "memory.reflect.completed",
      payload: {
        kind: "memory_operation",
        operation: "reflect",
      },
      createdAt: now,
      source: "agent",
      sourceTrust: "trusted",
      redacted: false,
    });

    return reflection;
  }
}
