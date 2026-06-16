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
  MemoryBatchJob,
  MemoryBatchRememberOptions,
} from "@ai-orchestrator/protocol";
export type { MemoryBatchJob, MemoryBatchRememberOptions };
import type { MemoryAdapterError } from "./errors";

export type MemoryAdapterKind = "local_heuristic" | "memento_mcp" | "dgx_simplemem" | "mock";

export type MemoryOperationScope = {
  agentId: string;
  sessionId: string;
  providerProfileId: string;
  namespace: string;
  recallTraceId: string;
};

export type MemoryBatchRememberResult =
  | {
      async: false;
      records: MemoryRecord[];
      accepted: number;
      rejected: number;
      itemResults: Array<{
        inputId?: string;
        recordId?: string;
        status: "written" | "rejected" | "failed" | "skipped";
        reason?: string;
      }>;
    }
  | {
      async: true;
      job: MemoryBatchJob;
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
      warning?: string;
    }
  | {
      kind: "memory_batch_accepted" | "memory_batch_started" | "memory_batch_completed" | "memory_batch_failed" | "memory_batch_partial";
      jobId: string;
      idempotencyKey: string;
      acceptedCount: number;
      rejectedCount: number;
      errors?: Array<{ itemIndex: number; error: string }>;
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

export interface MemoryAdapter {
  readonly profileId: string;
  readonly kind: MemoryAdapterKind;
  recall(query: RecallQuery, ctx: MemoryAdapterContext): Promise<RecallResult[]>;
  remember(input: MemoryInput, ctx: MemoryAdapterContext): Promise<MemoryRecord>;
  batchRemember?(
    inputs: MemoryInput[],
    ctx: MemoryAdapterContext,
    options?: MemoryBatchRememberOptions,
  ): Promise<MemoryBatchRememberResult>;
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
  batchRemember?: (
    inputs: MemoryInput[],
    ctx: MemoryAdapterContext,
    options?: MemoryBatchRememberOptions,
  ) => Promise<MemoryBatchRememberResult>;

  constructor(
    readonly profileId: string,
    private readonly api: MemoryAPI,
    kind: MemoryAdapterKind = "local_heuristic",
  ) {
    this.kind = kind;
    if ((this.api as any).batchRemember) {
      this.batchRemember = async (inputs, ctx, options) => {
        return (this.api as any).batchRemember(inputs, options);
      };
    }
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
