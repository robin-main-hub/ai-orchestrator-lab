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

export type MemoryOperationScope = {
  agentId: string;
  sessionId: string;
  providerProfileId: string;
  namespace: string;
  recallTraceId: string;
};

export type MemoryEventPayload =
  | {
      kind: "archival_write_requested";
      input: MemoryInput;
      operationScope?: MemoryOperationScope;
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
      operationScope?: MemoryOperationScope;
    };

export type MemoryAdapterContext = {
  permissionDecision: PermissionDecision;
  callerTrustLevel: ProviderTrustLevel;
  appendEvent?: (event: EventEnvelope<MemoryEventPayload>) => Promise<void>;
  abortSignal?: AbortSignal;
  timeoutMs?: number;
  onAdapterError?: (error: MemoryAdapterError) => void;
  operationScope?: MemoryOperationScope;
  now?: () => string;
};

/**
 * Optional batch-remember capability (generic evidence ingest path, #538).
 * Adapters that do not implement it leave the method undefined; callers must guard.
 * async:true returns a job ledger handle; async:false returns written records.
 */
export type MemoryBatchRememberOptions = {
  async?: boolean;
  source?: string;
};

export type MemoryBatchRememberJob = {
  jobId: string;
  status: string;
  written?: number;
};

export type MemoryBatchRememberResult =
  | { async: true; job: MemoryBatchRememberJob }
  | { async: false; records: MemoryRecord[] };

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
  /** Optional batch write (generic evidence ingest). Callers must guard for undefined. */
  batchRemember?(
    inputs: MemoryInput[],
    ctx: MemoryAdapterContext,
    options?: MemoryBatchRememberOptions,
  ): Promise<MemoryBatchRememberResult>;
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

export { SimpleMemAdapter } from "./simpleMemAdapter.js";
