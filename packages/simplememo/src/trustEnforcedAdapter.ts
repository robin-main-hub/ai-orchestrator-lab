import type {
  MemoryContextPacket,
  MemoryInput,
  MemoryRecord,
  MemoryRelation,
  MemoryStats,
  RecallQuery,
  RecallResult,
  Reflection,
  MemoryBatchRememberOptions,
} from "@ai-orchestrator/protocol";
import type { MemoryAdapter, MemoryAdapterContext, MemoryBatchRememberResult } from "./adapter";
import { MemoryAdapterError } from "./errors.js";

export type TrustPolicy = {
  allowUntrustedRecall?: boolean;
  allowUntrustedWrite?: boolean;
  requireAllowDecision?: boolean;
};

const defaultTrustPolicy: Required<TrustPolicy> = {
  allowUntrustedRecall: false,
  allowUntrustedWrite: false,
  requireAllowDecision: true,
};

export function withTrustEnforcement(inner: MemoryAdapter, policy: TrustPolicy = {}): MemoryAdapter {
  const resolvedPolicy = { ...defaultTrustPolicy, ...policy };

  return {
    profileId: inner.profileId,
    kind: inner.kind,
    async recall(query, ctx) {
      assertPermission(ctx, resolvedPolicy, "recall");
      if (ctx.callerTrustLevel === "untrusted" && !resolvedPolicy.allowUntrustedRecall) {
        throw fail(ctx, new MemoryAdapterError("trust_violation", "Untrusted callers cannot recall memory."));
      }
      return inner.recall(query, ctx);
    },
    async remember(input, ctx) {
      assertPermission(ctx, resolvedPolicy, "remember");
      if ((ctx.callerTrustLevel === "untrusted" || input.trustLevel === "untrusted") && !resolvedPolicy.allowUntrustedWrite) {
        throw fail(ctx, new MemoryAdapterError("trust_violation", "Untrusted memories require curator promotion."));
      }
      return inner.remember(input, ctx);
    },
    async batchRemember(inputs, ctx, options) {
      assertPermission(ctx, resolvedPolicy, "batchRemember");
      if (
        (ctx.callerTrustLevel === "untrusted" || inputs.some((input) => input.trustLevel === "untrusted")) &&
        !resolvedPolicy.allowUntrustedWrite
      ) {
        throw fail(ctx, new MemoryAdapterError("trust_violation", "Untrusted memories require curator promotion."));
      }
      return inner.batchRemember
        ? inner.batchRemember(inputs, ctx, options)
        : fallbackBatchRemember(inner, inputs, ctx, options);
    },
    async memoryContext(query, ctx) {
      assertPermission(ctx, resolvedPolicy, "memoryContext");
      return inner.memoryContext(query, ctx);
    },
    async stats(ctx) {
      assertPermission(ctx, resolvedPolicy, "stats");
      return inner.stats(ctx);
    },
    async pin(recordId, ctx) {
      assertPermission(ctx, resolvedPolicy, "pin");
      return inner.pin(recordId, ctx);
    },
    async forget(recordId, ctx) {
      assertPermission(ctx, resolvedPolicy, "forget");
      return inner.forget(recordId, ctx);
    },
    async activateMemories(recordIds, ctx) {
      assertPermission(ctx, resolvedPolicy, "activateMemories");
      return inner.activateMemories(recordIds, ctx);
    },
    async createRelations(recordIds, ctx) {
      assertPermission(ctx, resolvedPolicy, "createRelations");
      return inner.createRelations(recordIds, ctx);
    },
    reflect: inner.reflect
      ? async (sessionId, ctx) => {
          assertPermission(ctx, resolvedPolicy, "reflect");
          return inner.reflect?.(sessionId, ctx) as Promise<Reflection>;
        }
      : undefined,
  } satisfies MemoryAdapter;
}

function assertPermission(ctx: MemoryAdapterContext, policy: Required<TrustPolicy>, operation: string) {
  if (!policy.requireAllowDecision || ctx.permissionDecision === "allow") {
    return;
  }
  throw fail(ctx, new MemoryAdapterError("permission_denied", `Memory ${operation} requires an allow decision.`));
}

function fail(ctx: MemoryAdapterContext, error: MemoryAdapterError): MemoryAdapterError {
  ctx.onAdapterError?.(error);
  return error;
}

async function fallbackBatchRemember(
  inner: MemoryAdapter,
  inputs: MemoryInput[],
  ctx: MemoryAdapterContext,
  options?: MemoryBatchRememberOptions,
): Promise<MemoryBatchRememberResult> {
  const records: MemoryRecord[] = [];
  const itemResults: Array<{
    inputId?: string;
    recordId?: string;
    status: "written" | "rejected" | "failed" | "skipped";
    reason?: string;
  }> = [];
  let accepted = 0;
  let rejected = 0;

  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i]!;
    try {
      const rec = await inner.remember(input, ctx);
      records.push(rec);
      accepted++;
      itemResults.push({
        inputId: (input as any).inputId,
        recordId: rec.id,
        status: "written",
      });
    } catch (err: any) {
      rejected++;
      itemResults.push({
        inputId: (input as any).inputId,
        status: "failed",
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (options?.async) {
    const jobId = `job_fallback_${Date.now()}`;
    return {
      async: true,
      job: {
        jobId,
        idempotencyKey: options?.idempotencyKey ?? `idemp_${jobId}`,
        source: options?.source ?? "manual",
        status: accepted === 0 ? "failed" : rejected === 0 ? "completed" : "partial",
        accepted,
        rejected,
        written: accepted,
        failed: rejected,
        itemResults: itemResults.map((r) => ({
          inputId: r.inputId,
          recordId: r.recordId,
          status: r.status === "written" ? ("written" as const) : r.status === "rejected" ? ("rejected" as const) : ("failed" as const),
          reason: r.reason,
        })),
        async: true,
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      },
    };
  }

  return {
    async: false,
    records,
    accepted,
    rejected,
    itemResults,
  };
}

export type TrustEnforcedAdapterSurface = Pick<
  MemoryAdapter,
  | "recall"
  | "remember"
  | "memoryContext"
  | "stats"
  | "pin"
  | "forget"
  | "activateMemories"
  | "createRelations"
>;

export type TrustEnforcedAdapterReturn =
  | Promise<RecallResult[]>
  | Promise<MemoryRecord>
  | Promise<MemoryContextPacket>
  | Promise<MemoryStats>
  | Promise<void>
  | Promise<MemoryRelation[]>;
