export type MemoryAdapterErrorCategory =
  | "permission_denied"
  | "trust_violation"
  | "not_found"
  | "stale_revision"
  | "backend_unavailable"
  | "backend_timeout"
  | "schema_mismatch"
  | "quota_exceeded"
  | "redaction_required"
  | "promotion_pending"
  | "unknown";

export type MemoryAdapterErrorMeta = {
  recordId?: string;
  backendStatus?: number;
  retryAfterSec?: number;
  providerRawSnippet?: string;
};

export class MemoryAdapterError extends Error {
  override readonly name = "MemoryAdapterError";

  constructor(
    readonly category: MemoryAdapterErrorCategory,
    message: string,
    readonly meta?: MemoryAdapterErrorMeta,
  ) {
    super(message);
  }
}

export function isMemoryAdapterError(error: unknown): error is MemoryAdapterError {
  return error instanceof MemoryAdapterError;
}
