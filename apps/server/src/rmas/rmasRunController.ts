import { runGoalLoop, type LlmCompletionFn, type RmasLoopDeps } from "@ai-orchestrator/agents";
import type { RmasRunConfig } from "@ai-orchestrator/protocol";
import type { RmasEventInput } from "./rmasRunStore.js";

/**
 * RMAS run controller — the in-memory lifecycle owner for background goal loops.
 * The pure loop (`runGoalLoop`, packages/agents) drives agent→agent and emits
 * every state change as an event; this controller binds that loop to the running
 * server: it owns the AbortController per run, arms the wall-clock timer, gates
 * concurrency (single GPU host), and — critically — wraps the loop so an
 * unexpected throw still produces a terminal event (the loop deliberately does
 * NOT catch completion rejections).
 *
 * The controller never awaits the loop: `start` fires it and returns, so
 * `POST /rmas/runs` responds immediately with a runId and the client reattaches
 * via snapshot + SSE.
 */

export type RmasRunController = {
  /** fire the loop for an already-created run; does NOT await it. */
  start: (runId: string, config: RmasRunConfig) => void;
  /** abort a live run; returns whether a live handle existed. */
  stop: (runId: string) => boolean;
  isRunning: (runId: string) => boolean;
  runningCount: () => number;
};

export type RmasRunControllerDeps = {
  /**
   * The metered proxy completion fn. In index.ts this is bound to
   * `createDgxProviderCompletionResponse`, threading `ctx.abortSignal` so
   * in-flight calls cancel on stop/wall-clock. Tests inject a scripted fn.
   */
  complete: LlmCompletionFn;
  /** persist one event for a run (= store.appendEvent). The loop's emit path. */
  appendEvent: (runId: string, event: RmasEventInput) => Promise<void>;
  /** concurrent-run cap (env RMAS_MAX_CONCURRENT_RUNS, default 1 — GPU contention). */
  maxConcurrent: number;
  now?: () => Date;
  /** optional observation hook for loop rejections (logging/metrics). */
  onLoopError?: (runId: string, error: unknown) => void;
};

/** Thrown by `start` if invoked while already at capacity (route double-guard). */
export class RmasAtCapacityError extends Error {
  constructor(public readonly maxConcurrent: number) {
    super(`rmas controller at capacity (${maxConcurrent} concurrent runs)`);
    this.name = "RmasAtCapacityError";
  }
}

type AbortReason = "user" | "wall_clock";

type RunHandle = {
  abort: AbortController;
  wallClockTimer: ReturnType<typeof setTimeout>;
  promise: Promise<void>;
  /** why the controller aborted, if it did — used by the terminal safety net. */
  abortReason?: AbortReason;
};

export function createRmasRunController(deps: RmasRunControllerDeps): RmasRunController {
  const now = deps.now ?? (() => new Date());
  const handles = new Map<string, RunHandle>();

  function cleanup(runId: string, handle: RunHandle): void {
    clearTimeout(handle.wallClockTimer);
    // only delete if the map still points at THIS handle (avoid clobbering a
    // fast restart of the same runId — belt-and-suspenders, not expected).
    if (handles.get(runId) === handle) {
      handles.delete(runId);
    }
  }

  return {
    isRunning: (runId) => handles.has(runId),
    runningCount: () => handles.size,

    start(runId, config) {
      if (handles.has(runId)) return; // idempotent — already running
      if (handles.size >= deps.maxConcurrent) {
        // The route rejects with 429 before calling; this is the safety net.
        throw new RmasAtCapacityError(deps.maxConcurrent);
      }

      const abort = new AbortController();
      const wallClockTimer = setTimeout(() => {
        const current = handles.get(runId);
        if (current && !current.abort.signal.aborted) {
          current.abortReason = "wall_clock";
          current.abort.abort();
        }
      }, config.budgets.wallClockMs);
      // Never keep the event loop alive just for the wall-clock timer.
      if (typeof wallClockTimer === "object" && typeof (wallClockTimer as { unref?: () => void }).unref === "function") {
        (wallClockTimer as { unref: () => void }).unref();
      }

      const loopDeps: RmasLoopDeps = {
        runId,
        complete: deps.complete,
        emit: (event) => deps.appendEvent(runId, event),
        signal: abort.signal,
        now,
      };

      const handle: RunHandle = { abort, wallClockTimer, promise: Promise.resolve() };
      handles.set(runId, handle);

      handle.promise = (async () => {
        try {
          await runGoalLoop(config, loopDeps);
        } catch (error) {
          deps.onLoopError?.(runId, error);
          // The loop does not catch completion rejections, so a throw means it
          // exited WITHOUT emitting a terminal event. Emit one so the run never
          // hangs in a non-terminal state (reattach snapshot would show "running"
          // forever otherwise).
          try {
            if (abort.signal.aborted) {
              // A stop()/wall-clock abort cut an in-flight completion. Record a
              // clean user-stop terminal — `rmas.run.stopped` carries no token
              // field, so it never clobbers the last `rmas.tokens.tallied`.
              await deps.appendEvent(runId, { type: "rmas.run.stopped", payload: { by: "user" } });
            } else {
              // Unexpected throw: there is no `run.failed` type; record the run as
              // interrupted (only allowed reason is server_restart).
              await deps.appendEvent(runId, {
                type: "rmas.run.interrupted",
                payload: { reason: "server_restart" },
              });
            }
          } catch (emitError) {
            console.warn(
              `[rmas-controller] failed to emit terminal event for ${runId}: ${emitError instanceof Error ? emitError.message : String(emitError)}`,
            );
          }
        } finally {
          cleanup(runId, handle);
        }
      })();
    },

    stop(runId) {
      const handle = handles.get(runId);
      if (!handle) return false;
      handle.abortReason = "user";
      handle.abort.abort();
      clearTimeout(handle.wallClockTimer);
      return true;
    },
  };
}
