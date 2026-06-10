import type { IncomingMessage } from "node:http";

/**
 * Per-client failed-auth rate limiter — the basic anti-brute-force layer for
 * the public surface. Sliding window per client key: after `maxFailures`
 * failed auth attempts within `windowMs`, further requests from that client
 * get 429 until the window expires. A successful auth clears the counter.
 *
 * Client key: behind the Cloudflare tunnel the socket address is the tunnel,
 * so `cf-connecting-ip` (set authoritatively by Cloudflare) is preferred and
 * falls back to the socket address for direct LAN access. A LAN caller could
 * spoof the header to rotate buckets — accepted for this threat model (the
 * public surface always goes through Cloudflare; LAN is semi-trusted), and
 * memory stays bounded by `maxClients` regardless.
 *
 * Pure and clock-injectable, so it is fully unit-tested.
 */
export class AuthRateLimiter {
  readonly maxFailures: number;
  readonly windowMs: number;
  readonly maxClients: number;
  private readonly nowFn: () => number;
  private readonly failures = new Map<string, { count: number; windowStart: number }>();

  constructor(options: { maxFailures?: number; windowMs?: number; maxClients?: number; now?: () => number } = {}) {
    this.maxFailures = options.maxFailures ?? 10;
    this.windowMs = options.windowMs ?? 60_000;
    this.maxClients = options.maxClients ?? 10_000;
    this.nowFn = options.now ?? (() => Date.now());
  }

  isBlocked(clientKey: string): boolean {
    const entry = this.failures.get(clientKey);
    if (!entry) return false;
    if (this.nowFn() - entry.windowStart >= this.windowMs) {
      this.failures.delete(clientKey);
      return false;
    }
    return entry.count >= this.maxFailures;
  }

  recordFailure(clientKey: string): void {
    const now = this.nowFn();
    const entry = this.failures.get(clientKey);
    if (entry && now - entry.windowStart < this.windowMs) {
      entry.count += 1;
      return;
    }
    if (!entry && this.failures.size >= this.maxClients) {
      this.pruneExpired(now);
      if (this.failures.size >= this.maxClients) {
        // Still full of live entries: evict the oldest window. Slightly weakens
        // the limit under mass-distributed attack, but keeps memory bounded.
        let oldestKey: string | undefined;
        let oldestStart = Infinity;
        for (const [key, value] of this.failures) {
          if (value.windowStart < oldestStart) {
            oldestStart = value.windowStart;
            oldestKey = key;
          }
        }
        if (oldestKey !== undefined) this.failures.delete(oldestKey);
      }
    }
    this.failures.set(clientKey, { count: 1, windowStart: now });
  }

  recordSuccess(clientKey: string): void {
    this.failures.delete(clientKey);
  }

  /** number of tracked clients (test/diagnostics) */
  trackedClients(): number {
    return this.failures.size;
  }

  private pruneExpired(now: number): void {
    for (const [key, value] of this.failures) {
      if (now - value.windowStart >= this.windowMs) {
        this.failures.delete(key);
      }
    }
  }
}

export function resolveClientKey(request: Pick<IncomingMessage, "headers" | "socket">): string {
  const cfHeader = request.headers["cf-connecting-ip"];
  if (typeof cfHeader === "string" && cfHeader.trim()) {
    return cfHeader.trim();
  }
  return request.socket?.remoteAddress ?? "unknown";
}
