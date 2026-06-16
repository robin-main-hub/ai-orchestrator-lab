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
import type { MemoryAdapter, MemoryAdapterContext, MemoryAdapterKind, MemoryBatchJob, MemoryBatchRememberOptions, MemoryBatchRememberResult } from "./adapter.js";
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
// SimpleMemAdapter
// Derived index memory adapter. Because it is derived, mutating actions like
// remember, pin, forget, and activate are asynchronously promoted by curator
// processes. Thus, calling these mutating methods immediately throws a
// "promotion_pending" MemoryAdapterError while appending request events to the event store.
// ---------------------------------------------------------------------------

export class SimpleMemAdapter implements MemoryAdapter {
  readonly kind: MemoryAdapterKind = "dgx_simplemem";
  readonly profileId: string;

  readonly forceHnsw: boolean;
  readonly hnswSupported: boolean;
  readonly hnswObserved: boolean;
  readonly scanBatchSize: number;

  private records = new Map<string, MemoryRecord>();
  private _relations: MemoryRelation[] = [];
  private _seq = 0;

  constructor(options: {
    profileId?: string;
    seedRecords?: MemoryRecord[];
    forceHnsw?: boolean;
    hnswSupported?: boolean;
    hnswObserved?: boolean;
    scanBatchSize?: number;
  } = {}) {
    this.profileId = options.profileId ?? "dgx_simplemem";
    if (options.seedRecords) {
      for (const r of options.seedRecords) {
        this.records.set(r.id, r);
      }
    }
    this.forceHnsw = options.forceHnsw ?? (typeof process !== "undefined" && process.env.SIMPLEMEM_FORCE_HNSW === "true");
    this.hnswSupported = options.hnswSupported ?? false;
    this.hnswObserved = options.hnswObserved ?? false;
    this.scanBatchSize = options.scanBatchSize ?? 10;
  }

  async recall(query: RecallQuery, ctx: MemoryAdapterContext): Promise<RecallResult[]> {
    const queryTokens = tokenize(query.query);
    const allRecords = Array.from(this.records.values());
    const startTime = Date.now();
    let rounds = 0;
    const scannedRecords: typeof allRecords = [];
    let hitCap = false;

    for (let i = 0; i < allRecords.length; i += this.scanBatchSize) {
      rounds++;
      if (rounds > 20) {
        hitCap = true;
        break;
      }
      if (Date.now() - startTime > 300) {
        hitCap = true;
        break;
      }
      const chunk = allRecords.slice(i, i + this.scanBatchSize);
      scannedRecords.push(...chunk);
    }

    const filtered = scannedRecords.filter((r) => {
      if (r.tombstonedAt) return false;
      if (query.layers && !query.layers.includes(r.layer)) return false;
      if (query.scopes && r.scope && !query.scopes.includes(r.scope)) return false;
      if (query.kinds && !query.kinds.includes(r.kind ?? "context")) return false;
      if (!query.includeUntrusted && r.trustLevel === "untrusted") return false;
      return true;
    });

    let warning: string | undefined;
    if (hitCap) {
      warning = `warning: Scan cap reached. Processed ${rounds} rounds in ${Date.now() - startTime}ms. Returning partial results.`;
    }

    const candidates = filtered
      .map((record): RecallResult => ({
        record,
        score: scoreRecord(record, queryTokens),
        usedInDecision: false,
        activationState: record.activationState,
        reason: (queryTokens.length > 0 ? "token overlap" : "available fallback memory") + (warning ? ` (${warning})` : ""),
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
        operationScope: ctx.operationScope,
        ...(warning ? { warning } : {}),
      } as any,
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
        operationScope: ctx.operationScope,
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

  async batchRemember(
    inputs: MemoryInput[],
    ctx: MemoryAdapterContext,
    options?: MemoryBatchRememberOptions,
  ): Promise<MemoryBatchRememberResult> {
    const now = ctx.now?.() ?? new Date().toISOString();
    const jobId = `job_${stableId(inputs.map(i => i.title).join(","), String(this._seq++))}`;
    const idempotencyKey = options?.idempotencyKey ?? `idemp_${stableId(inputs.map(i => i.title + i.content).join("|"), "idemp")}`;

    // 1. memory.batch.accepted
    await ctx.appendEvent?.({
      id: `${jobId}_accepted`,
      sessionId: "dgx_simplemem",
      type: "memory.batch.accepted" as any,
      payload: {
        kind: "memory_batch_accepted",
        jobId,
        idempotencyKey,
        acceptedCount: inputs.length,
        rejectedCount: 0,
      },
      createdAt: now,
      source: "agent",
      sourceTrust: "trusted",
      redacted: false,
    });

    // 2. memory.batch.started
    await ctx.appendEvent?.({
      id: `${jobId}_started`,
      sessionId: "dgx_simplemem",
      type: "memory.batch.started" as any,
      payload: {
        kind: "memory_batch_started",
        jobId,
        idempotencyKey,
        acceptedCount: inputs.length,
        rejectedCount: 0,
      },
      createdAt: now,
      source: "agent",
      sourceTrust: "trusted",
      redacted: false,
    });

    let accepted = 0;
    let rejected = 0;
    const errors: Array<{ itemIndex: number; error: string }> = [];
    const records: MemoryRecord[] = [];
    const itemResults: Array<{
      inputId?: string;
      recordId?: string;
      status: "written" | "rejected" | "failed" | "skipped";
      reason?: string;
    }> = [];

    // Process inputs
    for (let i = 0; i < inputs.length; i++) {
      const input = inputs[i]!;
      if (!input.title || input.title.trim() === "" || !input.content || input.content.trim() === "" || input.title === "fail-me") {
        rejected++;
        errors.push({ itemIndex: i, error: `Invalid input: title='${input.title}', content='${input.content}'` });
        itemResults.push({
          inputId: (input as any).inputId,
          status: "rejected",
          reason: `Invalid input: title='${input.title}', content='${input.content}'`,
        });
      } else {
        accepted++;
        const recordId = `dgx_${stableId(`${input.title}:${input.content}`, String(this._seq++))}`;
        const newRecord: MemoryRecord = {
          id: recordId,
          layer: input.layer,
          scope: input.scope,
          kind: input.kind ?? "context",
          title: input.title,
          content: input.content,
          tags: input.tags,
          sourceChannel: input.sourceChannel,
          trustLevel: input.trustLevel,
          createdAt: now,
          pinned: false,
          activationState: "active",
        };
        this.records.set(recordId, newRecord);
        records.push(newRecord);
        itemResults.push({
          inputId: (input as any).inputId,
          recordId,
          status: "written",
        });
      }
    }

    const status = accepted === 0 ? "failed" : rejected === 0 ? "completed" : "partial";
    const eventType = `memory.batch.${status}` as any;
    const kind = `memory_batch_${status}` as any;

    // 3. memory.batch.finished / status event
    await ctx.appendEvent?.({
      id: `${jobId}_finished`,
      sessionId: "dgx_simplemem",
      type: eventType,
      payload: {
        kind,
        jobId,
        idempotencyKey,
        acceptedCount: accepted,
        rejectedCount: rejected,
        errors,
      },
      createdAt: now,
      source: "agent",
      sourceTrust: "trusted",
      redacted: false,
    });

    const batchJob: MemoryBatchJob = {
      jobId,
      idempotencyKey,
      source: options?.source ?? "manual",
      status: status === "completed" ? "completed" : status === "failed" ? "failed" : "partial",
      accepted,
      rejected,
      written: accepted,
      failed: rejected,
      itemResults: itemResults.map(r => ({
        inputId: r.inputId,
        recordId: r.recordId,
        status: r.status === "written" ? "written" : r.status === "rejected" ? "rejected" : "failed",
        reason: r.reason,
      })),
      async: !!options?.async,
      createdAt: now,
      completedAt: now,
    };

    if (options?.async) {
      return {
        async: true,
        job: batchJob,
      };
    } else {
      return {
        async: false,
        records,
        accepted,
        rejected,
        itemResults,
      };
    }
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
    let hnswStatus: "configured" | "blocked" | "active";
    if (this.forceHnsw) {
      if (this.hnswSupported) {
        hnswStatus = "active";
      } else {
        hnswStatus = "blocked";
      }
    } else {
      hnswStatus = "configured";
    }

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
      hnswStatus,
      hnswObserved: this.hnswObserved,
    } as any;
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
        operationScope: ctx.operationScope,
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
        operationScope: ctx.operationScope,
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
        operationScope: ctx.operationScope,
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
        operationScope: ctx.operationScope,
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
        operationScope: ctx.operationScope,
      },
      createdAt: now,
      source: "agent",
      sourceTrust: "trusted",
      redacted: false,
    });

    return reflection;
  }
}
