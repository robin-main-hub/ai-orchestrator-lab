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
import type { MemoryAdapter, MemoryAdapterContext } from "./adapter.js";
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

const SECRET_LIKE_PATTERNS: ReadonlyArray<RegExp> = [
  /\bsk-[A-Za-z0-9_-]{16,}\b/,
  /\b(?:claude|anthropic|grok|xai|deepseek|ghp|gho|ghs|ghr|ghu|glpat|pat)[-_][A-Za-z0-9_-]{16,}\b/i,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}\b/i,
  /\b(?:API_KEY|AUTH_TOKEN|SECRET|TOKEN|PASSWORD|PRIVATE_KEY)\s*[:=]\s*[^"'\s,}]{4,}/i,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];

function assertNoSecret(text: string): void {
  for (const pattern of SECRET_LIKE_PATTERNS) {
    if (pattern.test(text)) {
      throw new MemoryAdapterError(
        "redaction_required",
        "Memory content contains sensitive secrets and has been blocked."
      );
    }
  }
}

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
      assertNoSecret(input.title);
      assertNoSecret(input.content);
      if ((ctx.callerTrustLevel === "untrusted" || input.trustLevel === "untrusted") && !resolvedPolicy.allowUntrustedWrite) {
        throw fail(ctx, new MemoryAdapterError("trust_violation", "Untrusted memories require curator promotion."));
      }
      return inner.remember(input, ctx);
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
    injectRecord: inner.injectRecord
      ? (record) => inner.injectRecord!(record)
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
