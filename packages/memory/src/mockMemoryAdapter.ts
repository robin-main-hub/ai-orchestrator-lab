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
import type { MemoryAdapter, MemoryAdapterContext } from "./adapter";
import { MemoryAdapterError } from "./errors.js";

export type MockMemoryAdapterOptions = {
  profileId?: string;
  records?: MemoryRecord[];
  createdAt?: string;
};

export class MockMemoryAdapter implements MemoryAdapter {
  readonly profileId: string;
  readonly kind = "mock" as const;
  private records: MemoryRecord[];
  private readonly createdAt: string;

  constructor(options: MockMemoryAdapterOptions = {}) {
    this.profileId = options.profileId ?? "mock_memory";
    this.records = [...(options.records ?? [])];
    this.createdAt = options.createdAt ?? "2026-05-25T00:00:00.000Z";
  }

  async recall(query: RecallQuery, _ctx?: MemoryAdapterContext): Promise<RecallResult[]> {
    const queryTokens = tokenize(query.query);
    const results = this.records
      .filter((record) => !record.tombstonedAt)
      .filter((record) => (query.layers ? query.layers.includes(record.layer) : true))
      .filter((record) => (query.scopes ? query.scopes.includes(record.scope ?? inferScope(record)) : true))
      .filter((record) => (query.kinds ? query.kinds.includes(record.kind ?? "context") : true))
      .filter((record) => (query.includeUntrusted ? true : record.trustLevel !== "untrusted"))
      .map((record): RecallResult => {
        const haystack = tokenize([record.title, record.content, ...(record.tags ?? [])].join(" "));
        const overlap = queryTokens.filter((token) => haystack.includes(token)).length;
        const score = overlap + (record.pinned ? 0.5 : 0);
        return {
          record,
          score,
          usedInDecision: false,
          activationState: record.activationState,
          reason: overlap > 0 ? "token overlap" : "available fallback memory",
        };
      })
      .filter((result) => result.score > 0 || queryTokens.length === 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, query.limit ?? 8);

    return results;
  }

  async remember(input: MemoryInput, ctx: MemoryAdapterContext): Promise<MemoryRecord> {
    const record: MemoryRecord = {
      id: `mock_memory_${stableId(`${input.title}:${input.content}`, ctx.now?.() ?? this.createdAt)}`,
      layer: input.layer,
      scope: input.scope ?? inferScope({ layer: input.layer }),
      kind: input.kind ?? "context",
      title: input.title,
      content: input.content,
      sourceChannel: input.sourceChannel,
      trustLevel: input.trustLevel,
      projectId: input.projectId,
      sessionId: input.sessionId,
      tags: input.tags ?? [],
      activationState: input.trustLevel === "untrusted" ? "quarantined" : "suggested",
      createdAt: ctx.now?.() ?? this.createdAt,
      pinned: false,
    };
    this.records = [record, ...this.records.filter((candidate) => candidate.id !== record.id)];
    await ctx.appendEvent?.({
      id: `${record.id}_event`,
      sessionId: input.sessionId ?? "memory_adapter",
      type: "memory.archival_write.requested",
      payload: { kind: "archival_write_requested", input },
      createdAt: record.createdAt,
      source: "agent",
      sourceTrust: input.trustLevel,
      redacted: false,
    });
    return record;
  }

  async memoryContext(query: RecallQuery, ctx: MemoryAdapterContext): Promise<MemoryContextPacket> {
    const results = await this.recall(query, ctx);
    return {
      id: `mock_context_${stableId(query.query, this.createdAt)}`,
      sessionId: query.sessionId ?? "memory_adapter",
      query: query.query,
      activeRecordIds: results.map((result) => result.record.id),
      blockedRecordIds: [],
      relationIds: [],
      summary: results.map((result) => result.record.title).join("; "),
      createdAt: this.createdAt,
    };
  }

  async stats(): Promise<MemoryStats> {
    const activeRecords = this.records.filter((record) => !record.tombstonedAt);
    return {
      totalRecords: activeRecords.length,
      activeRecords: activeRecords.filter((record) => record.activationState === "active").length,
      pinnedRecords: activeRecords.filter((record) => record.pinned).length,
      quarantinedRecords: activeRecords.filter((record) => record.activationState === "quarantined").length,
      relationCount: 0,
      duplicateCandidates: 0,
      contradictionCandidates: 0,
      staleCandidates: 0,
      health: "good",
    };
  }

  async pin(recordId: string): Promise<void> {
    this.records = this.records.map((record) => (record.id === recordId ? { ...record, pinned: true } : record));
  }

  async forget(recordId: string): Promise<void> {
    const found = this.records.some((record) => record.id === recordId);
    if (!found) {
      throw new MemoryAdapterError("not_found", `Memory record ${recordId} does not exist.`, { recordId });
    }
    this.records = this.records.map((record) =>
      record.id === recordId ? { ...record, tombstonedAt: this.createdAt } : record,
    );
  }

  async activateMemories(recordIds: string[]): Promise<void> {
    this.records = this.records.map((record) =>
      recordIds.includes(record.id) ? { ...record, activationState: "active" } : record,
    );
  }

  async createRelations(recordIds: string[]): Promise<MemoryRelation[]> {
    return recordIds.slice(1).map((recordId, index) => ({
      id: `mock_relation_${index}_${recordIds[0]}_${recordId}`,
      fromRecordId: recordIds[0] as string,
      toRecordId: recordId,
      kind: "related",
      confidence: 0.4,
      reason: "mock relation fixture",
      createdAt: this.createdAt,
    }));
  }

  async reflect(sessionId: string): Promise<Reflection> {
    return {
      sessionId,
      summary: "Mock memory adapter reflection.",
      decisions: [],
      risks: [],
      createdAt: this.createdAt,
    };
  }

  snapshot(): MemoryRecord[] {
    return [...this.records];
  }
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.replace(/[^\p{L}\p{N}_-]/gu, ""))
    .filter(Boolean);
}

function inferScope(record: Pick<MemoryRecord, "layer">): NonNullable<MemoryRecord["scope"]> {
  if (record.layer === "user_memory") {
    return "global";
  }
  if (record.layer === "episode" || record.layer === "fragment") {
    return "session";
  }
  return "project";
}

function stableId(value: string, salt: string) {
  let hash = 0;
  for (const char of `${value}:${salt}`) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash.toString(16);
}
