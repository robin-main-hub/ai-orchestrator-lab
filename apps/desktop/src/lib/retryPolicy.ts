/**
 * Exponential-backoff retry for provider completions (item 11).
 *
 * Policy: only transient failures are retried — network drops, timeouts,
 * rate limits (429), upstream 5xx/overload. A permission-required error is
 * NEVER retried: it means a human approval is pending and retrying would
 * spam the approval queue. Anything unrecognized is treated as permanent.
 */

export type BackoffRetryOptions = {
  /** total attempts including the first one. Default 3. */
  maxAttempts?: number;
  /** first backoff delay; doubles each retry. Default 500ms. */
  baseDelayMs?: number;
  /** backoff ceiling. Default 8000ms. */
  maxDelayMs?: number;
  /** override the transient-error predicate (defaults to isRetryableProviderError) */
  isRetryable?: (error: unknown) => boolean;
  /** observe each retry (telemetry / appendEvent) */
  onRetry?: (info: { attempt: number; delayMs: number; error: unknown }) => void;
  /** injectable for tests */
  sleep?: (ms: number) => Promise<void>;
  /** injectable jitter source in [0,1). Defaults to Math.random. */
  random?: () => number;
};

const TRANSIENT_MESSAGE_PATTERN =
  /network|timed?[ _-]?out|fetch failed|failed to fetch|econn|socket|rate.?limit|too many requests|overloaded|temporarily unavailable|\b429\b|\b(5\d{2})\b/i;

/**
 * Checked BEFORE the transient pattern: auth problems are never transient.
 * Retrying a failed-auth 429 (server-side brute-force lockout) only extends
 * the lockout window — the client must fix credentials, not retry.
 */
const NON_RETRYABLE_MESSAGE_PATTERN =
  /too_many_failed_auth|auth.?attempts|unauthorized|credential|invalid.?(api.?key|token|signature)|\b401\b|\b403\b/i;

/** Errors that must never be retried, matched by class name to avoid a runtime import cycle. */
const NON_RETRYABLE_ERROR_NAMES = new Set(["ProviderCompletionPermissionRequiredError", "AbortError"]);

export function isRetryableProviderError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (NON_RETRYABLE_ERROR_NAMES.has(error.name)) return false;
  if (NON_RETRYABLE_MESSAGE_PATTERN.test(error.message)) return false;

  const status = (error as { status?: unknown }).status;
  if (typeof status === "number") {
    return status === 429 || status >= 500;
  }
  const category = (error as { category?: unknown }).category;
  if (typeof category === "string") {
    return category === "network" || category === "rate_limit" || category === "provider";
  }
  return TRANSIENT_MESSAGE_PATTERN.test(error.message);
}

export function computeBackoffDelayMs(
  attempt: number,
  options: { baseDelayMs?: number; maxDelayMs?: number; random?: () => number } = {},
): number {
  const base = options.baseDelayMs ?? 500;
  const ceiling = options.maxDelayMs ?? 8000;
  const random = options.random ?? Math.random;
  const exponential = Math.min(ceiling, base * 2 ** attempt);
  // full jitter keeps concurrent retries from synchronizing
  return Math.round(exponential / 2 + random() * (exponential / 2));
}

export async function withBackoffRetry<T>(
  fn: (attempt: number) => Promise<T>,
  options: BackoffRetryOptions = {},
): Promise<T> {
  const maxAttempts = Math.max(1, options.maxAttempts ?? 3);
  const isRetryable = options.isRetryable ?? isRetryableProviderError;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      const isLastAttempt = attempt === maxAttempts - 1;
      if (isLastAttempt || !isRetryable(error)) {
        throw error;
      }
      const delayMs = computeBackoffDelayMs(attempt, options);
      options.onRetry?.({ attempt: attempt + 1, delayMs, error });
      await sleep(delayMs);
    }
  }
  throw lastError;
}
