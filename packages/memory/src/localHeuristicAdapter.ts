import type {
    MemoryContextPacket,
    MemoryInput,
    MemoryRecord,
    MemoryRelation,
    MemoryStats,
    RecallQuery,
    RecallResult,
} from "@ai-orchestrator/protocol";
import type { MemoryAdapter, MemoryAdapterContext } from "./adapter.js";
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
    return `lh_${(h >>> 0).toString(16).padStart(8, "0")}`;
}

function scoreRecord(record: MemoryRecord, queryTokens: string[]): number {
    const haystack = new Set(
          tokenize([record.title, record.content, ...(record.tags ?? [])].join(" ")),
        );
    const overlap = queryTokens.filter((t) => haystack.has(t)).length;
    return (queryTokens.length > 0 ? overlap / queryTokens.length : 0) + (record.pinned ? 0.5 : 0);
}

// ---------------------------------------------------------------------------
// LocalHeuristicAdapter
// In-memory adapter for local / offline use. Scores by token overlap + pin
// bonus. Suitable for MacBook offline fallback and unit tests that need a
// lightweight but non-trivial scorer.
// ---------------------------------------------------------------------------

export class LocalHeuristicAdapter implements MemoryAdapter {
    readonly kind = "local_heuristic" as const;
    readonly profileId: string;

  private records = new Map<string, MemoryRecord>();
    private _relations: MemoryRelation[] = [];
    private _seq = 0;

  constructor(profileId = "local_heuristic") {
        this.profileId = profileId;
  }

  async recall(query: RecallQuery, _ctx: MemoryAdapterContext): Promise<RecallResult[]> {
        const queryTokens = tokenize(query.query);
        return Array.from(this.records.values())
          .filter((r) => {
                    if (r.tombstonedAt) return false;
                    if (query.layers && !query.layers.includes(r.layer)) return false;
                    if (query.scopes && !query.scopes.includes(r.scope)) return false;
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
  }

  async remember(input: MemoryInput, ctx: MemoryAdapterContext): Promise<MemoryRecord> {
        const now = ctx.now?.() ?? new Date().toISOString();
        const id = stableId(`${input.title}:${input.content}`, String(this._seq++));
        const record: MemoryRecord = {
                id,
                layer: input.layer,
                scope: input.scope ?? input.layer,
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
        this.records.set(id, record);
        return record;
  }

  async memoryContext(query: RecallQuery, ctx: MemoryAdapterContext): Promise<MemoryContextPacket> {
        const results = await this.recall(query, ctx);
        const now = ctx.now?.() ?? new Date().toISOString();
        return {
                id: stableId(query.query, now),
                sessionId: query.sessionId ?? "local_heuristic",
                query: query.query,
                activeRecordIds: results.map((r) => r.record.id),
                blockedRecordIds: [],
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

  async pin(recordId: string, _ctx?: MemoryAdapterContext): Promise<void> {
        const r = this.records.get(recordId);
        if (!r) {
                throw new MemoryAdapterError(
                          "not_found",
                          `Memory record ${recordId} does not exist.`,
                  { recordId },
                        );
        }
        this.records.set(recordId, { ...r, pinned: true });
  }

  async forget(recordId: string, ctx?: MemoryAdapterContext): Promise<void> {
        const r = this.records.get(recordId);
        if (!r) {
                throw new MemoryAdapterError(
                          "not_found",
                          `Memory record ${recordId} does not exist.`,
                  { recordId },
                        );
        }
        this.records.set(recordId, {
                ...r,
                tombstonedAt: ctx?.now?.() ?? new Date().toISOString(),
        });
  }

  async activateMemories(recordIds: string[], _ctx?: MemoryAdapterContext): Promise<void> {
        for (const id of recordIds) {
                const r = this.records.get(id);
                if (r) this.records.set(id, { ...r, activationState: "active" });
        }
  }

  async createRelations(recordIds: string[], _ctx?: MemoryAdapterContext): Promise<MemoryRelation[]> {
        const newRelations = recordIds.slice(1).map((toId, idx): MemoryRelation => ({
                id: stableId(`${recordIds[0]}_${toId}`, String(idx)),
                fromRecordId: recordIds[0] as string,
                toRecordId: toId,
                kind: "related",
        }));
        this._relations.push(...newRelations);
        return newRelations;
  }
}
