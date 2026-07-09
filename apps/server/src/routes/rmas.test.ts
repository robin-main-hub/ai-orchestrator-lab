import { describe, expect, it } from "vitest";
import type { IncomingMessage } from "node:http";
import type { EventEnvelope, RmasRunConfig } from "@ai-orchestrator/protocol";
import { createRmasRunStore, type RmasRunStore } from "../rmas/rmasRunStore.js";
import type { RmasRunController } from "../rmas/rmasRunController.js";
import { RmasAtCapacityError } from "../rmas/rmasRunController.js";
import { handleRmasRoute } from "./rmas.js";

const VALID_CONFIG: RmasRunConfig = {
  goal: "목표를 달성하는 산출물을 만든다",
  pattern: "sequential",
  agents: [
    { id: "a1", name: "플래너", kind: "planner", providerProfileId: "provider_dgx02_vllm", modelId: "qwen", systemPrompt: "", enabled: true },
    { id: "a2", name: "비평가", kind: "critic", providerProfileId: "provider_dgx02_vllm", modelId: "qwen", systemPrompt: "", enabled: true },
  ],
  budgets: { maxIterations: 6, maxTotalTokens: 300000, wallClockMs: 1800000, maxParallel: 3 },
  acceptanceCriteria: [{ id: "k1", text: "기준을 충족한다" }],
};

function memoryStore(): { store: RmasRunStore; events: EventEnvelope[] } {
  const events: EventEnvelope[] = [];
  let n = 0;
  const store = createRmasRunStore({
    loadEvents: async () => [...events],
    appendEvents: async (_sessionId, envelopes) => {
      for (const e of envelopes) if (!events.some((x) => x.id === e.id)) events.push(e);
    },
    now: () => `2026-07-09T00:00:0${n}.000Z`,
    generateRunId: () => `run_${(n += 1)}`,
  });
  return { store, events };
}

function fakeController(overrides: { runningCount?: number; startThrows?: boolean; stopReturns?: boolean } = {}) {
  const starts: Array<{ runId: string; config: RmasRunConfig }> = [];
  const stops: string[] = [];
  const controller: RmasRunController = {
    start: (runId, config) => {
      if (overrides.startThrows) throw new RmasAtCapacityError(1);
      starts.push({ runId, config });
    },
    stop: (runId) => {
      stops.push(runId);
      return overrides.stopReturns ?? true;
    },
    isRunning: () => false,
    runningCount: () => overrides.runningCount ?? 0,
  };
  return { controller, starts, stops };
}

class TooLarge extends Error {
  constructor(public readonly limit: number) {
    super("too large");
  }
}

function harness(opts: {
  store: RmasRunStore;
  controller: RmasRunController;
  pathname: string;
  method: string;
  body?: unknown;
  bodyThrows?: unknown;
  maxConcurrent?: number;
}) {
  const responses: Array<{ status: number; payload: unknown }> = [];
  return {
    responses,
    run: () =>
      handleRmasRoute({
        store: opts.store,
        controller: opts.controller,
        maxConcurrent: opts.maxConcurrent ?? 1,
        request: {} as IncomingMessage,
        pathname: opts.pathname,
        method: opts.method,
        readJsonBody: async () => {
          if (opts.bodyThrows) throw opts.bodyThrows;
          return opts.body;
        },
        isRequestBodyTooLargeError: (error): error is { limit: number } => error instanceof TooLarge,
        respondJson: (status, payload) => responses.push({ status, payload }),
      }),
  };
}

describe("handleRmasRoute", () => {
  it("POST /rmas/runs valid → 201 with runId, persists config, fires the loop", async () => {
    const { store } = memoryStore();
    const { controller, starts } = fakeController();
    const h = harness({ store, controller, pathname: "/rmas/runs", method: "POST", body: VALID_CONFIG });
    const handled = await h.run();

    expect(handled).toBe(true);
    expect(h.responses[0]!.status).toBe(201);
    const payload = h.responses[0]!.payload as { runId: string; run: { config: RmasRunConfig } };
    expect(payload.runId).toBe("run_1");
    expect(payload.run.config.pattern).toBe("sequential");
    expect(starts).toHaveLength(1);
    expect(starts[0]!.runId).toBe("run_1");
  });

  it("POST /rmas/runs invalid body → 400", async () => {
    const { store } = memoryStore();
    const { controller, starts } = fakeController();
    const h = harness({ store, controller, pathname: "/rmas/runs", method: "POST", body: { pattern: "sequential" } });
    await h.run();
    expect(h.responses[0]!.status).toBe(400);
    expect((h.responses[0]!.payload as { error: string }).error).toBe("invalid_rmas_run_config");
    expect(starts).toHaveLength(0);
  });

  it("POST /rmas/runs oversize body → 413", async () => {
    const { store } = memoryStore();
    const { controller } = fakeController();
    const h = harness({ store, controller, pathname: "/rmas/runs", method: "POST", bodyThrows: new TooLarge(1024) });
    await h.run();
    expect(h.responses[0]!.status).toBe(413);
    expect((h.responses[0]!.payload as { limit: number }).limit).toBe(1024);
  });

  it("POST /rmas/runs at capacity → 429 and does NOT create a run", async () => {
    const { store, events } = memoryStore();
    const { controller, starts } = fakeController({ runningCount: 1 });
    const h = harness({ store, controller, pathname: "/rmas/runs", method: "POST", body: VALID_CONFIG, maxConcurrent: 1 });
    await h.run();
    expect(h.responses[0]!.status).toBe(429);
    expect((h.responses[0]!.payload as { error: string }).error).toBe("rmas_at_capacity");
    expect(starts).toHaveLength(0);
    expect(events).toHaveLength(0); // no rmas.run.created persisted
  });

  it("GET /rmas/runs → 200 with summary list", async () => {
    const { store } = memoryStore();
    await store.create(VALID_CONFIG);
    const { controller } = fakeController();
    const h = harness({ store, controller, pathname: "/rmas/runs", method: "GET" });
    await h.run();
    expect(h.responses[0]!.status).toBe(200);
    expect((h.responses[0]!.payload as { runs: unknown[] }).runs).toHaveLength(1);
  });

  it("GET /rmas/runs/:id → 200 for a known run, 404 for unknown", async () => {
    const { store } = memoryStore();
    const created = await store.create(VALID_CONFIG);
    const { controller } = fakeController();

    const ok = harness({ store, controller, pathname: `/rmas/runs/${created.runId}`, method: "GET" });
    await ok.run();
    expect(ok.responses[0]!.status).toBe(200);
    expect((ok.responses[0]!.payload as { run: { runId: string } }).run.runId).toBe(created.runId);

    const missing = harness({ store, controller, pathname: "/rmas/runs/nope", method: "GET" });
    await missing.run();
    expect(missing.responses[0]!.status).toBe(404);
  });

  it("POST /rmas/runs/:id/stop → 200 idempotent, 404 for unknown run", async () => {
    const { store } = memoryStore();
    const created = await store.create(VALID_CONFIG);
    const { controller, stops } = fakeController({ stopReturns: false });

    const ok = harness({ store, controller, pathname: `/rmas/runs/${created.runId}/stop`, method: "POST" });
    await ok.run();
    expect(ok.responses[0]!.status).toBe(200);
    expect((ok.responses[0]!.payload as { stopRequested: boolean }).stopRequested).toBe(false);
    expect(stops).toEqual([created.runId]);

    const missing = harness({ store, controller, pathname: "/rmas/runs/nope/stop", method: "POST" });
    await missing.run();
    expect(missing.responses[0]!.status).toBe(404);
  });

  it("returns false (not handled) for an unrelated path", async () => {
    const { store } = memoryStore();
    const { controller } = fakeController();
    const h = harness({ store, controller, pathname: "/missions", method: "GET" });
    expect(await h.run()).toBe(false);
    expect(h.responses).toHaveLength(0);
  });
});
