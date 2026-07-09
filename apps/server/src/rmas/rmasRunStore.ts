import {
  deriveRmasRun,
  deriveRmasRunSummaries,
  rmasRunConfigSchema,
  rmasSessionId,
  type EventEnvelope,
  type RmasRunConfig,
  type RmasRunEventType,
  type RmasRunRecord,
  type RmasRunStatus,
  type RmasRunSummary,
} from "@ai-orchestrator/protocol";

/**
 * RMAS run store — a thin assembly layer over the existing EventStorage, the
 * exact mirror of `createMissionStore`. Storage is append-only `rmas.*` events
 * (config lives in the `rmas.run.created` payload — no second store); reads
 * re-materialize the view from events each time, so `GET /rmas/runs` survives a
 * server restart. All I/O is injected (loadEvents/appendEvents) so the store is
 * pure-testable with no cycle back into index.ts.
 *
 * Honesty/durability invariants kept from the mission store:
 *   - EventStorage is the single source of truth; the store only derives.
 *   - the append path fires `onEventsCommitted` AFTER a successful commit so the
 *     trace bus streams exactly what was persisted (no divergence).
 *   - the observation hook is best-effort — a broadcast failure never rolls back
 *     an already-committed event.
 */

export type RmasEventInput = {
  type: RmasRunEventType | string;
  payload: unknown;
  /** falls back to the store clock when omitted */
  createdAt?: string;
};

export type RmasRunStore = {
  /** create a run: generate a runId, emit `rmas.run.created` (config source of truth). */
  create: (config: RmasRunConfig) => Promise<RmasRunRecord>;
  /** summary rows for the history endpoint, newest first. */
  list: () => Promise<RmasRunSummary[]>;
  /** full materialized reattach snapshot, or undefined if the run never existed. */
  get: (runId: string) => Promise<RmasRunRecord | undefined>;
  /** append one `rmas.*` event to a run (used by the controller's emit closure). */
  appendEvent: (runId: string, event: RmasEventInput) => Promise<void>;
  /**
   * Server-boot reconciliation: any run whose latest state is non-terminal
   * (queued/running) gets an `rmas.run.interrupted{server_restart}` appended, so
   * a lost in-memory controller never leaves a zombie "running" run. Returns the
   * runIds that were reconciled. We never auto-resume (double-spend risk).
   */
  reconcileInterrupted: () => Promise<string[]>;
};

export type RmasRunStoreDeps = {
  loadEvents: () => Promise<ReadonlyArray<EventEnvelope>>;
  /** append envelopes to event storage (dedup/idempotency guaranteed by storage). */
  appendEvents: (sessionId: string, envelopes: EventEnvelope[]) => Promise<void>;
  /**
   * Observation hook fired right after a successful commit (L1). The RMAS trace
   * bus broadcasts here. Side-effect only — must not append new events (loop
   * guard). A throw is swallowed (broadcast is best-effort); the commit stands.
   */
  onEventsCommitted?: (runId: string, envelopes: ReadonlyArray<EventEnvelope>) => void | Promise<void>;
  now?: () => string;
  /** unique runId generator (tests inject a deterministic one). */
  generateRunId?: () => string;
};

/** Statuses that mean the run has reached a terminal event — never reconciled. */
const TERMINAL_STATUSES: ReadonlySet<RmasRunStatus> = new Set<RmasRunStatus>([
  "completed",
  "exhausted",
  "stopped",
  "interrupted",
]);

function createDefaultRunIdGenerator(): () => string {
  let counter = 0;
  return () => {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return `run_${crypto.randomUUID()}`;
    }
    counter += 1;
    return `run_${Date.now()}_${counter}_${Math.random().toString(36).slice(2)}`;
  };
}

export function createRmasRunStore(deps: RmasRunStoreDeps): RmasRunStore {
  const now = deps.now ?? (() => new Date().toISOString());
  const generateRunId = deps.generateRunId ?? createDefaultRunIdGenerator();

  /**
   * Monotonic per-store sequence for envelope ids. Incremented synchronously at
   * call time, so ids stay unique even when several `appendEvent`s interleave
   * across awaits (e.g. the Mixture pattern's `Promise.all` fan-out emits
   * concurrently). Every rmas.* event is distinct — dedup is not relied upon.
   */
  let seq = 0;

  function envelope(runId: string, type: string, payload: unknown, createdAt: string): EventEnvelope {
    return {
      id: `event_${type.replaceAll(".", "_")}_${runId}_${seq++}`,
      sessionId: rmasSessionId(runId),
      type,
      payload,
      createdAt,
      source: "server",
      sourceTrust: "trusted",
      redacted: true,
    };
  }

  /**
   * Single append gate — commit to storage, then fire the observation hook so
   * the trace stream flows from one place. Hook failures are swallowed (logged)
   * since the append itself has already committed.
   */
  async function commit(runId: string, envelopes: EventEnvelope[]): Promise<void> {
    if (envelopes.length === 0) return;
    await deps.appendEvents(rmasSessionId(runId), envelopes);
    if (deps.onEventsCommitted) {
      try {
        await deps.onEventsCommitted(runId, envelopes);
      } catch (error) {
        console.warn(
          `[rmas-store] onEventsCommitted hook failed for ${runId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  async function get(runId: string): Promise<RmasRunRecord | undefined> {
    return deriveRmasRun(await deps.loadEvents(), runId);
  }

  return {
    get,

    async list() {
      return deriveRmasRunSummaries(await deps.loadEvents());
    },

    async create(config) {
      // Double-validate — the route parses too, but the store owns the invariant
      // that only a valid config is ever persisted as the source of truth.
      const parsed = rmasRunConfigSchema.parse(config);
      const runId = generateRunId();
      const createdAt = now();
      await commit(runId, [envelope(runId, "rmas.run.created", { config: parsed }, createdAt)]);
      const record = await get(runId);
      if (!record) {
        throw new Error(`rmas run ${runId} did not materialize after create`);
      }
      return record;
    },

    async appendEvent(runId, event) {
      const createdAt = event.createdAt ?? now();
      await commit(runId, [envelope(runId, event.type, event.payload, createdAt)]);
    },

    async reconcileInterrupted() {
      const summaries = await deriveRmasRunSummaries(await deps.loadEvents());
      const reconciled: string[] = [];
      for (const summary of summaries) {
        if (TERMINAL_STATUSES.has(summary.status)) continue;
        await commit(summary.runId, [
          envelope(summary.runId, "rmas.run.interrupted", { reason: "server_restart" }, now()),
        ]);
        reconciled.push(summary.runId);
      }
      return reconciled;
    },
  };
}
