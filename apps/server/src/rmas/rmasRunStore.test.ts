import { describe, expect, it } from "vitest";
import { rmasRunConfigSchema, type EventEnvelope, type RmasRunConfig } from "@ai-orchestrator/protocol";
import { createRmasRunStore } from "./rmasRunStore";

function memoryDeps() {
  const events: EventEnvelope[] = [];
  const committed: Array<{ runId: string; types: string[] }> = [];
  let runN = 0;
  return {
    events,
    committed,
    deps: {
      loadEvents: async () => [...events],
      appendEvents: async (_sessionId: string, envelopes: EventEnvelope[]) => {
        for (const envelope of envelopes) {
          if (!events.some((existing) => existing.id === envelope.id)) events.push(envelope);
        }
      },
      onEventsCommitted: (runId: string, envelopes: ReadonlyArray<EventEnvelope>) => {
        committed.push({ runId, types: envelopes.map((e) => e.type) });
      },
      // strictly increasing clock so newest-first ordering is unambiguous
      now: () => `2026-07-09T00:00:0${runN}.000Z`,
      generateRunId: () => `run_${(runN += 1)}`,
    },
  };
}

function config(overrides: Partial<RmasRunConfig> = {}): RmasRunConfig {
  return rmasRunConfigSchema.parse({
    goal: "목표를 달성하는 산출물을 만든다",
    pattern: "sequential",
    agents: [
      { id: "a1", name: "플래너", kind: "planner", providerProfileId: "provider_dgx02_vllm", modelId: "qwen" },
      { id: "a2", name: "비평가", kind: "critic", providerProfileId: "provider_dgx02_vllm", modelId: "qwen" },
    ],
    acceptanceCriteria: [{ id: "k1", text: "기준을 충족한다" }],
    ...overrides,
  });
}

describe("createRmasRunStore", () => {
  it("create → materialize round-trip: persists rmas.run.created with the config as source of truth", async () => {
    const { deps, events } = memoryDeps();
    const store = createRmasRunStore(deps);

    const record = await store.create(config());

    expect(record.runId).toBe("run_1");
    expect(record.status).toBe("queued");
    expect(record.config.pattern).toBe("sequential");
    expect(record.perAgentStatus).toEqual({ a1: "idle", a2: "idle" });
    // exactly one persisted event, namespaced by sessionId rmas_<runId>
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("rmas.run.created");
    expect(events[0]!.sessionId).toBe("rmas_run_1");
    expect(events[0]!.source).toBe("server");
    expect(events[0]!.sourceTrust).toBe("trusted");
    expect(events[0]!.redacted).toBe(true);

    const fetched = await store.get("run_1");
    expect(fetched?.config.goal).toBe(record.config.goal);
  });

  it("fires onEventsCommitted with the full envelopes (sessionId is load-bearing for the bus)", async () => {
    const { deps, committed } = memoryDeps();
    const store = createRmasRunStore(deps);

    await store.create(config());
    expect(committed).toHaveLength(1);
    expect(committed[0]!.runId).toBe("run_1");
    expect(committed[0]!.types).toEqual(["rmas.run.created"]);
  });

  it("appendEvent gives every event a unique id even under interleaved (concurrent) emits", async () => {
    const { deps, events } = memoryDeps();
    const store = createRmasRunStore(deps);
    await store.create(config());

    // simulate the Mixture Promise.all fan-out: many concurrent appends
    await Promise.all([
      store.appendEvent("run_1", { type: "rmas.agent.started", payload: { slotId: "a1", name: "P", kind: "planner", iteration: 1 } }),
      store.appendEvent("run_1", { type: "rmas.agent.started", payload: { slotId: "a2", name: "C", kind: "critic", iteration: 1 } }),
      store.appendEvent("run_1", { type: "rmas.tokens.tallied", payload: { input: 1, output: 1, total: 2 } }),
    ]);

    const ids = events.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length); // all unique → none dropped by dedup
    expect(events).toHaveLength(4);
  });

  it("list returns summaries newest-first", async () => {
    const { deps } = memoryDeps();
    const store = createRmasRunStore(deps);
    await store.create(config());
    await store.create(config({ pattern: "mixture" }));

    const summaries = await store.list();
    expect(summaries.map((s) => s.runId)).toEqual(["run_2", "run_1"]);
    expect(summaries[0]!.pattern).toBe("mixture");
    expect(summaries.every((s) => s.status === "queued")).toBe(true);
  });

  it("reconcileInterrupted marks a non-terminal run and leaves a terminal run untouched", async () => {
    const { deps } = memoryDeps();
    const store = createRmasRunStore(deps);

    // run_1: started but never finished (running → non-terminal)
    await store.create(config());
    await store.appendEvent("run_1", { type: "rmas.run.started", payload: {} });

    // run_2: completed (terminal → must NOT be reconciled)
    await store.create(config());
    await store.appendEvent("run_2", { type: "rmas.run.started", payload: {} });
    await store.appendEvent("run_2", {
      type: "rmas.run.completed",
      payload: { accepted: true, finalOutput: "done", iterations: 1, tokens: { input: 1, output: 1, total: 2 } },
    });

    const reconciled = await store.reconcileInterrupted();
    expect(reconciled).toEqual(["run_1"]);

    const r1 = await store.get("run_1");
    const r2 = await store.get("run_2");
    expect(r1?.status).toBe("interrupted");
    expect(r2?.status).toBe("completed");
  });

  it("does not throw when the observation hook throws (broadcast is best-effort)", async () => {
    const events: EventEnvelope[] = [];
    const store = createRmasRunStore({
      loadEvents: async () => [...events],
      appendEvents: async (_sessionId, envelopes) => {
        for (const e of envelopes) events.push(e);
      },
      onEventsCommitted: () => {
        throw new Error("subscriber blew up");
      },
      now: () => "2026-07-09T00:00:00.000Z",
      generateRunId: () => "run_x",
    });
    await expect(store.create(config())).resolves.toBeDefined();
  });
});
