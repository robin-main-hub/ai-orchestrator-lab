/**
 * DGX server connection health monitor.
 *
 * Tracks the four-state model from issue #5:
 *   online    — server responded within threshold
 *   degraded  — server responded but slowly / with HTTP error
 *   offline   — server unreachable (network error / timeout)
 *   syncing   — server came back online and pending items are being flushed
 *
 * The monitor is fetch-agnostic: pass any Fetch-compatible function (or
 * omit to use globalThis.fetch). This keeps the class usable in both the
 * Node server and the desktop renderer process without coupling to Node's
 * built-in http module.
 */

export type ConnectionStatus = "online" | "degraded" | "offline" | "syncing";

export type ConnectionHealthSnapshot = {
  status: ConnectionStatus;
  /** Round-trip time in ms, or null when the server was unreachable. */
  latencyMs: number | null;
  checkedAt: string;
  /** Items in the local outbox waiting to be synced once the server returns. */
  pendingCount: number;
  errorMessage?: string;
};

export type ConnectionHealthMonitorOptions = {
  /** URL to GET for liveness; a 2xx response counts as healthy. */
  healthUrl: string;
  /** Interval between heartbeat checks in ms. Default 30_000. */
  heartbeatIntervalMs?: number;
  /** Per-check fetch timeout in ms. Default 5_000. */
  timeoutMs?: number;
  /** Latency threshold above which status downgrades to "degraded". Default 2_000 ms. */
  degradedThresholdMs?: number;
  /** Returns how many local items are queued for sync. Default () => 0. */
  pendingCountFn?: () => number;
  /** Time source — override in tests to avoid real Date. */
  now?: () => string;
  /** Fetch implementation — defaults to globalThis.fetch. */
  fetch?: typeof globalThis.fetch;
};

export type StatusChangeListener = (snapshot: ConnectionHealthSnapshot) => void;

const DEFAULT_HEARTBEAT_MS = 30_000;
const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_DEGRADED_THRESHOLD_MS = 2_000;

export class ConnectionHealthMonitor {
  private _snapshot: ConnectionHealthSnapshot;
  private _listeners: StatusChangeListener[] = [];
  private _intervalId: ReturnType<typeof setInterval> | undefined;

  private readonly _healthUrl: string;
  private readonly _heartbeatIntervalMs: number;
  private readonly _timeoutMs: number;
  private readonly _degradedThresholdMs: number;
  private readonly _pendingCountFn: () => number;
  private readonly _now: () => string;
  private readonly _fetch: typeof globalThis.fetch;

  constructor(options: ConnectionHealthMonitorOptions) {
    this._healthUrl = options.healthUrl;
    this._heartbeatIntervalMs = options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_MS;
    this._timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this._degradedThresholdMs = options.degradedThresholdMs ?? DEFAULT_DEGRADED_THRESHOLD_MS;
    this._pendingCountFn = options.pendingCountFn ?? (() => 0);
    this._now = options.now ?? (() => new Date().toISOString());
    this._fetch = options.fetch ?? globalThis.fetch.bind(globalThis);

    this._snapshot = {
      status: "offline",
      latencyMs: null,
      checkedAt: this._now(),
      pendingCount: 0,
    };
  }

  get snapshot(): ConnectionHealthSnapshot {
    return this._snapshot;
  }

  get status(): ConnectionStatus {
    return this._snapshot.status;
  }

  /** Register a listener called whenever the status transitions. Returns an unsubscribe fn. */
  onStatusChange(listener: StatusChangeListener): () => void {
    this._listeners.push(listener);
    return () => {
      this._listeners = this._listeners.filter((l) => l !== listener);
    };
  }

  /** Perform one health check immediately and update the snapshot. */
  async check(): Promise<ConnectionHealthSnapshot> {
    const pendingCount = this._pendingCountFn();
    const previousStatus = this._snapshot.status;
    let status: ConnectionStatus;
    let latencyMs: number | null = null;
    let errorMessage: string | undefined;

    const start = Date.now();
    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), this._timeoutMs);
      const resp = await this._fetch(this._healthUrl, { signal: ac.signal });
      clearTimeout(timer);
      latencyMs = Date.now() - start;

      if (resp.ok) {
        status = latencyMs > this._degradedThresholdMs ? "degraded" : "online";
      } else {
        status = "degraded";
        errorMessage = `HTTP ${resp.status}`;
      }
    } catch (err) {
      status = "offline";
      errorMessage = err instanceof Error ? err.message : String(err);
    }

    // Transition online→syncing when there are pending items to flush
    if (status === "online" && pendingCount > 0 && previousStatus !== "online") {
      status = "syncing";
    }

    const snapshot: ConnectionHealthSnapshot = {
      status,
      latencyMs,
      checkedAt: this._now(),
      pendingCount,
      ...(errorMessage !== undefined && { errorMessage }),
    };

    this._snapshot = snapshot;
    if (previousStatus !== status) {
      for (const listener of this._listeners) {
        listener(snapshot);
      }
    }
    return snapshot;
  }

  /** Start the heartbeat loop. Idempotent. */
  start(): void {
    if (this._intervalId !== undefined) return;
    this._intervalId = setInterval(() => {
      void this.check();
    }, this._heartbeatIntervalMs);
  }

  /** Stop the heartbeat loop. */
  stop(): void {
    if (this._intervalId !== undefined) {
      clearInterval(this._intervalId);
      this._intervalId = undefined;
    }
  }
}
