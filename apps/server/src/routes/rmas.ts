import type { IncomingMessage } from "node:http";
import { rmasRunConfigSchema, type RmasRunConfig } from "@ai-orchestrator/protocol";
import type { RmasRunStore } from "../rmas/rmasRunStore.js";
import { RmasAtCapacityError, type RmasRunController } from "../rmas/rmasRunController.js";

/**
 * RMAS routes — the same DI idiom as `handleMissionRoute`. A thin parallel stack
 * next to /missions; the SSE stream (`GET /rmas/runs/:id/trace/stream`) is wired
 * directly in index.ts (it needs the sseSessionRegistry + rmasTraceBus), exactly
 * as the mission trace stream is.
 *
 *   POST /rmas/runs            start a run (validate config; 429 at capacity)
 *   GET  /rmas/runs            summary list (history panel)
 *   GET  /rmas/runs/:id        full materialized record (reattach snapshot)
 *   POST /rmas/runs/:id/stop   request a stop (idempotent)
 *
 * Auth: every /rmas path sits behind the single top-level `requireAuth()` gate
 * in index.ts (Bearer token OR HMAC signature), identical to /missions — there
 * is no per-route auth here.
 */
export type RmasRouteDependencies = {
  store: RmasRunStore;
  controller: RmasRunController;
  /** concurrent-run cap — the 429 gate (env RMAS_MAX_CONCURRENT_RUNS, default 1). */
  maxConcurrent: number;
  request: IncomingMessage;
  pathname: string;
  method?: string;
  readJsonBody: (request: IncomingMessage) => Promise<unknown>;
  isRequestBodyTooLargeError: (error: unknown) => error is { limit: number };
  respondJson: (statusCode: number, payload: unknown) => void;
};

const RMAS_RUN_PATH = /^\/rmas\/runs\/([^/]+)$/;
const RMAS_RUN_STOP_PATH = /^\/rmas\/runs\/([^/]+)\/stop$/;

export async function handleRmasRoute({
  store,
  controller,
  maxConcurrent,
  request,
  pathname,
  method,
  readJsonBody,
  isRequestBodyTooLargeError,
  respondJson,
}: RmasRouteDependencies): Promise<boolean> {
  if (pathname === "/rmas/runs" && method === "POST") {
    let config: RmasRunConfig;
    try {
      config = rmasRunConfigSchema.parse(await readJsonBody(request));
    } catch (error) {
      if (isRequestBodyTooLargeError(error)) {
        respondJson(413, { error: "payload_too_large", limit: error.limit });
        return true;
      }
      respondJson(400, {
        error: "invalid_rmas_run_config",
        message: error instanceof Error ? error.message : String(error),
      });
      return true;
    }

    // Capacity gate BEFORE create — single GPU host, so a busy controller rejects
    // with 429 rather than persisting a run that can never start.
    if (controller.runningCount() >= maxConcurrent) {
      respondJson(429, { error: "rmas_at_capacity", maxConcurrent });
      return true;
    }

    try {
      const run = await store.create(config);
      // Fire the background loop (does NOT await). The RmasAtCapacityError catch
      // is a belt-and-suspenders guard against a race with a concurrent start.
      try {
        controller.start(run.runId, config);
      } catch (error) {
        if (error instanceof RmasAtCapacityError) {
          respondJson(429, { error: "rmas_at_capacity", maxConcurrent });
          return true;
        }
        throw error;
      }
      respondJson(201, { runId: run.runId, run });
    } catch (error) {
      respondJson(500, {
        error: "rmas_run_start_failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
    return true;
  }

  if (pathname === "/rmas/runs" && method === "GET") {
    respondJson(200, { runs: await store.list() });
    return true;
  }

  const stopMatch = RMAS_RUN_STOP_PATH.exec(pathname);
  if (stopMatch && method === "POST") {
    const runId = decodeURIComponent(stopMatch[1]!);
    const existing = await store.get(runId);
    if (!existing) {
      respondJson(404, { error: "rmas_run_not_found", runId });
      return true;
    }
    // Idempotent: aborts a live handle if present; the terminal event is emitted
    // asynchronously by the loop/controller, so the returned record may still
    // read "running" until the abort propagates.
    const stopRequested = controller.stop(runId);
    respondJson(200, { stopRequested, run: existing });
    return true;
  }

  const runMatch = RMAS_RUN_PATH.exec(pathname);
  if (runMatch && method === "GET") {
    const runId = decodeURIComponent(runMatch[1]!);
    const run = await store.get(runId);
    if (!run) {
      respondJson(404, { error: "rmas_run_not_found", runId });
      return true;
    }
    respondJson(200, { run });
    return true;
  }

  return false;
}
