import type {
  EventEnvelope,
  MemoryAPI,
  MemoryContextPacket,
  MemoryInput,
  MemoryRecord,
  MemoryRelation,
  MemoryStats,
  PermissionDecision,
  ProviderTrustLevel,
  RecallQuery,
  RecallResult,
  Reflection,
} from "@ai-orchestrator/protocol";
import type { MemoryAdapterError } from "./errors";

export type MemoryAdapterKind = "local_heuristic" | "memento_mcp" | "dgx_simplemem" | "mock";

export type MemoryEventPayload =
  | {
      kind: "archival_write_requested";
      input: MemoryInput;
    }
  | {
      kind: "memory_adapter_error";
      category: string;
      message: string;
    }
  | {
      kind: "memory_operation";
      operation: string;
      recordIds?: string[];
    };

export type MemoryAdapterContext = {
  permissionDecision: PermissionDecision;
  callerTrustLevel: ProviderTrustLevel;
  appendEvent?: (event: EventEnvelope<MemoryEventPayload>) => Promise<void>;
  abortSignal?: AbortSignal;
  timeoutMs?: number;
  onAdapterError?: (error: MemoryAdapterError) => void;
  now?: () => string;
};

export interface MemoryAdapter {
  readonly profileId: string;
  readonly kind: MemoryAdapterKind;
  recall(query: RecallQuery, ctx: MemoryAdapterContext): Promise<RecallResult[]>;
  remember(input: MemoryInput, ctx: MemoryAdapterContext): Promise<MemoryRecord>;
  memoryContext(query: RecallQuery, ctx: MemoryAdapterContext): Promise<MemoryContextPacket>;
  stats(ctx: MemoryAdapterContext): Promise<MemoryStats>;
  pin(recordId: string, ctx: MemoryAdapterContext): Promise<void>;
  forget(recordId: string, ctx: MemoryAdapterContext): Promise<void>;
  activateMemories(recordIds: string[], ctx: MemoryAdapterContext): Promise<void>;
  createRelations(recordIds: string[], ctx: MemoryAdapterContext): Promise<MemoryRelation[]>;
  reflect?(sessionId: string, ctx: MemoryAdapterContext): Promise<Reflection>;
}

export class MemoryApiAdapter implements MemoryAdapter {
  readonly kind: MemoryAdapterKind;

  constructor(
    readonly profileId: string,
    private readonly api: MemoryAPI,
    kind: MemoryAdapterKind = "local_heuristic",
  ) {
    this.kind = kind;
  }

  recall(query: RecallQuery): Promise<RecallResult[]> {
    return this.api.recall(query);
  }

  remember(input: MemoryInput): Promise<MemoryRecord> {
    return this.api.remember(input);
  }

  memoryContext(query: RecallQuery): Promise<MemoryContextPacket> {
    return this.api.memoryContext(query);
  }

  stats(): Promise<MemoryStats> {
    return this.api.stats();
  }

  pin(recordId: string): Promise<void> {
    return this.api.pin(recordId);
  }

  forget(recordId: string): Promise<void> {
    return this.api.forget(recordId);
  }

  activateMemories(recordIds: string[]): Promise<void> {
    return this.api.activateMemories(recordIds);
  }

  createRelations(recordIds: string[]): Promise<MemoryRelation[]> {
    return this.api.createRelations(recordIds);
  }

  reflect(sessionId: string): Promise<Reflection> {
    return this.api.reflect(sessionId);
  }
}
