import type {
  MemoryContextPacket,
  MemoryInput,
  MemoryRecord,
  MemoryRelation,
  MemoryStats,
  RecallQuery,
  RecallResult,
  Reflection,
  MemoryScope,
} from "@ai-orchestrator/protocol";
import type { MemoryAdapter, MemoryAdapterContext, MemoryAdapterKind } from "./adapter";
import { MemoryAdapterError } from "./errors";

// ──────────────────────────────────────────────
// Public types
// ──────────────────────────────────────────────

/** Where a recalled memory was actually served from. */
export type RecallSource = "dgx_central" | "local_cache" | "session_memory";

/**
 * Cache / routing policy for the MementoMcpAdapter.
 *
 * - `dgx_central`:  All reads/writes go to the DGX central memory store.
 * - `local_cache`:  Reads are served from a local in-process cache first;
 *                   on cache-miss the adapter falls back to DGX central and
 *                   writes the result back into the local cache.
 * - `session_only`: Purely ephemeral — nothing is persisted beyond the current
 *                   process.  Useful for untrusted providers or short-lived
 *                   debate sessions.
 */
export type MementoPolicy = "dgx_central" | "local_cache" | "session_only";

/**
 * Audit trail attached to each `RecallResult` describing exactly which
 * memory store was hit and under which policy.
 */
export type RecallTrace = {
  recordId: string;
  score: number;
  source: RecallSource;
  policy: MementoPolicy;
  hitLocal: boolean;
  retrievedAt: string;
};

export type MementoMcpAdapterOptions = {
  profileId?: string;
  policy?: MementoPolicy;
  /** Seed records for local / session store (used in tests). */
  seedRecords?: MemoryRecord[];
  /** Simulated DGX remote records (used in tests). */
  remoteRecords?: MemoryRecord[];
  now?: () => string;
};

// ──────────────────────────────────────────────
// Adapter implementation
// ──────────────────────────────────────────────

export class MementoMcpAdapter implements MemoryAdapter {
  readonly profileId: string;
  readonly kind: MemoryAdapterKind = "memento_mcp";
  readonly policy: MementoPolicy;

  private localRecords: Map<string, MemoryRecord>;
  private remoteRecords: Map<string, MemoryRecord>;
  private pinnedIds: Set<string>;
  private readonly nowFn: () => string;

  /**
   * Attached traces from the most recent `recall` call, keyed by recordId.
   * Consumers can inspect `adapter.traces` immediately after recall to see
   * which store each result was served from.
   */
  traces: Map<string, RecallTrace> = new Map();

  constructor(options: MementoMcpAdapterOptions = {}) {
    this.profileId = options.profileId ?? "memento_mcp";
    this.policy = options.policy ?? "local_cache";
    this.nowFn = options.now ?? (() => new Date().toISOString());
    this.localRecords = new Map((options.seedRecords ?? []).map((r) => [r.id, r]));
    this.remoteRecords = new Map((options.remoteRecords ?? []).map((r) => [r.id, r]));
    this.pinnedIds = new Set();
  }

  async recall(query: RecallQuery, ctx: MemoryAdapterContext): Promise<RecallResult[]> {
    const results: RecallResult[] = [];
    this.traces = new Map();

    const candidates = this.collectCandidates(query);
    const limit = query.limit ?? 8;
    const queryTokens = tokenize(query.query);

    for (const { record, source } of candidates) {
      const hitLocal = source !== "dgx_central";
      const score = scoreRecord(record, queryTokens);
      if (score === 0 && queryTokens.length > 0) continue;

      const trace: RecallTrace = {
        recordId: record.id,
        score,
        source,
        policy: this.policy,
        hitLocal,
        retrievedAt: this.nowFn(),
      };
      this.traces.set(record.id, trace);

      results.push({
        record,
        score,
        usedInDecision: false,
        activationState: record.activationState,
        reason: buildReason(trace),
      });

      if (this.policy === "local_cache" && source === "dgx_central") {
        this.localRecords.set(record.id, record);
      }
    }

    const sorted = results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    await ctx.appendEvent?.({
      id: `memento_recall_${stableId(`${this.policy}:${query.query}`)}`,
      sessionId: query.sessionId ?? "memento_mcp",
      type: "memory.operation",
      payload: {
        kind: "memory_operation",
        operation: "recall",
        recordIds: sorted.map((r) => r.record.id),
      },
      createdAt: ctx.now?.() ?? this.nowFn(),
      source: "agent",
      sourceTrust: "trusted",
      redacted: false,
    });

    return sorted;
  }

  async remember(input: MemoryInput, ctx: MemoryAdapterContext): Promise<MemoryRecord> {
    const now = ctx.now?.() ?? this.nowFn();
    const record: MemoryRecord = {
      id: `memento_${stableId(`${input.title}:${input.content}:${now}`)}`,
      layer: input.layer,
      scope: input.scope ?? inferScope(input.layer),
      kind: input.kind ?? "context",
      title: input.title,
      content: input.content,
      sourceChannel: input.sourceChannel,
      trustLevel: input.trustLevel,
      projectId: input.projectId,
      sessionId: input.sessionId,
      tags: input.tags ?? [],
      activationState: input.trustLevel === "untrusted" ? "quarantined" : "suggested",
      createdAt: now,
      pinned: false,
    };

    if (this.policy === "session_only") {
      this.localRecords.set(record.id, record);
    } else {
      // Write-through: local cache + remote
      this.localRecords.set(record.id, record);
      this.remoteRecords.set(record.id, record);
    }

    await ctx.appendEvent?.({
      id: `memento_remember_${record.id}`,
      sessionId: input.sessionId ?? "memento_mcp",
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

    return record;
  }

  async memoryContext(query: RecallQuery, ctx: MemoryAdapterContext): Promise<MemoryContextPacket> {
    const results = await this.recall(query, ctx);
    const now = ctx.now?.() ?? this.nowFn();
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
      id: `memento_ctx_${stableId(`${query.query}:${now}`)}`,
      sessionId: query.sessionId ?? "memento_mcp",
      query: query.query,
      activeRecordIds: activeIds,
      blockedRecordIds: blockedIds,
      relationIds: [],
      summary: results.map((r) => r.record.title).join("; "),
      createdAt: now,
    };
  }

  async stats(_ctx: MemoryAdapterContext): Promise<MemoryStats> {
    const local = Array.from(this.localRecords.values());
    const remote = Array.from(this.remoteRecords.values());
    const allIds = new Set([...local.map((r) => r.id), ...remote.map((r) => r.id)]);
    const active = local.filter((r) => !r.tombstonedAt && r.activationState !== "quarantined").length;
    const quarantined = local.filter((r) => r.activationState === "quarantined").length;
    return {
      totalRecords: allIds.size,
      activeRecords: active,
      pinnedRecords: this.pinnedIds.size,
      quarantinedRecords: quarantined,
      relationCount: 0,
      duplicateCandidates: 0,
      contradictionCandidates: 0,
      staleCandidates: 0,
      health: quarantined > active ? "needs_review" : quarantined > 0 ? "watch" : "good",
    };
  }

  /**
   * Memento-specific cache metadata. Not part of the MemoryAdapter
   * contract — exposed for inspectors/diagnostics that need to see
   * which records are in the local cache vs. only on the remote DGX
   * central store.
   */
  cacheStats(): { localCacheSize: number; remoteCacheSize: number; policy: MementoPolicy } {
    return {
      localCacheSize: this.localRecords.size,
      remoteCacheSize: this.policy !== "session_only" ? this.remoteRecords.size : 0,
      policy: this.policy,
    };
  }

  async pin(recordId: string, _ctx: MemoryAdapterContext): Promise<void> {
    this.pinnedIds.add(recordId);
    const local = this.localRecords.get(recordId);
    if (local) {
      this.localRecords.set(recordId, { ...local, pinned: true });
    }
    const remote = this.remoteRecords.get(recordId);
    if (remote) {
      this.remoteRecords.set(recordId, { ...remote, pinned: true });
    }
  }

  async forget(recordId: string, ctx: MemoryAdapterContext): Promise<void> {
    const now = ctx.now?.() ?? this.nowFn();
    const tombstone = (r: MemoryRecord) => ({ ...r, tombstonedAt: now });
    const local = this.localRecords.get(recordId);
    if (local) {
      this.localRecords.set(recordId, tombstone(local));
    }
    if (this.policy !== "session_only") {
      const remote = this.remoteRecords.get(recordId);
      if (remote) {
        this.remoteRecords.set(recordId, tombstone(remote));
      }
    }
  }

  async activateMemories(recordIds: string[], _ctx: MemoryAdapterContext): Promise<void> {
    for (const id of recordIds) {
      const local = this.localRecords.get(id);
      if (local) {
        this.localRecords.set(id, { ...local, activationState: "active" });
      }
      // Also update remote so dgx_central-only records can be activated.
      const remote = this.remoteRecords.get(id);
      if (remote) {
        this.remoteRecords.set(id, { ...remote, activationState: "active" });
      }
    }
  }

  async createRelations(recordIds: string[], _ctx: MemoryAdapterContext): Promise<MemoryRelation[]> {
    const now = this.nowFn();
    return recordIds.slice(0, -1).map((id, idx) => ({
      id: `relation_${stableId(`${id}:${recordIds[idx + 1]}`)}`,
      fromRecordId: id,
      toRecordId: recordIds[idx + 1] ?? id,
      kind: "related" as const,
      confidence: 0.5,
      reason: "auto-linked by createRelations",
      createdAt: now,
    }));
  }

  async reflect(sessionId: string, _ctx: MemoryAdapterContext): Promise<Reflection> {
    const sessionRecords = Array.from(this.localRecords.values()).filter(
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
    return {
      sessionId,
      summary: summaryLines.join("; "),
      decisions,
      risks,
      createdAt: this.nowFn(),
    };
  }

  // ── Internal helpers ────────────────────────

  private collectCandidates(query: RecallQuery): Array<{ record: MemoryRecord; source: RecallSource }> {
    const seen = new Set<string>();
    const out: Array<{ record: MemoryRecord; source: RecallSource }> = [];

    const add = (r: MemoryRecord, source: RecallSource) => {
      if (seen.has(r.id) || r.tombstonedAt) return;
      if (query.layers && !query.layers.includes(r.layer)) return;
      if (query.scopes && !query.scopes.includes(r.scope ?? inferScope(r.layer))) return;
      if (query.kinds && !query.kinds.includes(r.kind ?? "context")) return;
      if (!query.includeUntrusted && r.trustLevel === "untrusted") return;
      seen.add(r.id);
      out.push({ record: r, source });
    };

    if (this.policy === "session_only") {
      for (const r of this.localRecords.values()) add(r, "session_memory");
      return out;
    }

    if (this.policy === "local_cache") {
      for (const r of this.localRecords.values()) add(r, "local_cache");
    }

    // dgx_central or local_cache fallback: include remote
    for (const r of this.remoteRecords.values()) {
      add(r, "dgx_central");
    }

    return out;
  }
}

// ──────────────────────────────────────────────
// Private utilities
// ──────────────────────────────────────────────

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s,.:;!?(){}\[\]"']+/)
    .filter((t) => t.length > 1);
}

function scoreRecord(record: MemoryRecord, queryTokens: string[]): number {
  if (queryTokens.length === 0) return 0.1;
  const haystack = tokenize([record.title, record.content, ...(record.tags ?? [])].join(" "));
  const overlap = queryTokens.filter((t) => haystack.includes(t)).length;
  return overlap + (record.pinned ? 0.3 : 0);
}

function buildReason(trace: RecallTrace): string {
  if (trace.hitLocal) {
    return `served from ${trace.source} (policy: ${trace.policy})`;
  }
  return `served from dgx_central (cache-miss, policy: ${trace.policy})`;
}

function inferScope(layer: string): MemoryScope {
  if (layer === "project_memory") return "project";
  if (layer === "user_memory") return "global";
  return "session";
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function stableId(value: string): string {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash.toString(16);
}
