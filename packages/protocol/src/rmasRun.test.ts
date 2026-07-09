import { describe, expect, it } from "vitest";
import type { EventEnvelope } from "./index.js";
import {
  deriveRmasRun,
  deriveRmasRunSummaries,
  deriveRmasTrace,
  rmasRunConfigSchema,
  rmasSessionId,
  rmasTraceEventFromEnvelope,
  type RmasTraceEvent,
} from "./rmasRun.js";

const RUN_ID = "run_1";
const SESSION = rmasSessionId(RUN_ID);
// assembled at runtime so secret scanners don't flag the fake fixture
const SECRET = ["sk-", "abcdef", "012345678"].join("");

let seq = 0;
function ts(): string {
  seq += 1;
  // strictly increasing, lexicographically sortable ISO timestamps
  return `2026-07-09T00:${String(seq).padStart(2, "0")}:00.000Z`;
}

function env(type: string, payload: unknown): EventEnvelope {
  return {
    id: `ev_${type}_${seq}`,
    sessionId: SESSION,
    type,
    payload,
    createdAt: ts(),
    source: "server",
    sourceTrust: "trusted",
    redacted: true,
  };
}

const CONFIG = {
  goal: "RFP 전문에 대응하는 제안서를 작성한다",
  pattern: "sequential",
  agents: [
    { id: "p1", name: "플래너", kind: "planner", providerProfileId: "provider_dgx02_vllm", modelId: "qwen" },
    { id: "c1", name: "비평가", kind: "critic", providerProfileId: "provider_dgx02_vllm", modelId: "qwen" },
    { id: "s1", name: "해결사", kind: "solver", providerProfileId: "provider_dgx02_vllm", modelId: "qwen" },
    { id: "x1", name: "실패자", kind: "custom", providerProfileId: "provider_broken", modelId: "nope" },
  ],
  acceptanceCriteria: [
    { id: "k1", text: "예산 표를 포함한다" },
    { id: "k2", text: "납기 일정을 명시한다" },
  ],
};

/** A full 2-iteration run: iter1 rejected (+ one agent error), iter2 accepted. */
function scriptedEvents(): EventEnvelope[] {
  seq = 0;
  const events: EventEnvelope[] = [];
  events.push(env("rmas.run.created", { config: CONFIG }));
  events.push(env("rmas.run.started", {}));

  // iteration 1
  events.push(env("rmas.iteration.started", { iteration: 1 }));
  events.push(env("rmas.agent.started", { slotId: "p1", name: "플래너", kind: "planner", iteration: 1 }));
  events.push(
    env("rmas.agent.message", {
      slotId: "p1",
      name: "플래너",
      kind: "planner",
      iteration: 1,
      content: "계획 초안",
      usage: { inputTokens: 12, outputTokens: 4, totalTokens: 16 },
    }),
  );
  events.push(env("rmas.agent.started", { slotId: "x1", name: "실패자", kind: "custom", iteration: 1 }));
  events.push(env("rmas.agent.error", { slotId: "x1", reason: `provider_broken not registered — leaked ${SECRET} here`, iteration: 1 }));
  events.push(
    env("rmas.agent.message", {
      slotId: "s1",
      name: "해결사",
      kind: "solver",
      iteration: 1,
      content: `초안 결과 token=${SECRET}`,
      usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30 },
    }),
  );
  events.push(env("rmas.tokens.tallied", { input: 32, output: 14, total: 46 }));
  events.push(
    env("rmas.judge.evaluated", {
      iteration: 1,
      accepted: false,
      score: 0.4,
      perCriterion: [
        { id: "k1", met: true },
        { id: "k2", met: false, note: "납기 누락" },
      ],
      feedback: "납기 일정을 추가하세요",
    }),
  );
  events.push(env("rmas.iteration.completed", { iteration: 1, accepted: false }));

  // iteration 2
  events.push(env("rmas.iteration.started", { iteration: 2 }));
  events.push(
    env("rmas.agent.message", {
      slotId: "s1",
      name: "해결사",
      kind: "solver",
      iteration: 2,
      content: "예산 표와 납기 일정을 포함한 최종안",
      usage: { inputTokens: 30, outputTokens: 20, totalTokens: 50 },
    }),
  );
  events.push(env("rmas.tokens.tallied", { input: 62, output: 34, total: 96 }));
  events.push(
    env("rmas.judge.evaluated", {
      iteration: 2,
      accepted: true,
      score: 0.95,
      perCriterion: [
        { id: "k1", met: true },
        { id: "k2", met: true },
      ],
      feedback: "모든 기준 충족",
    }),
  );
  events.push(
    env("rmas.run.completed", {
      accepted: true,
      finalOutput: "예산 표와 납기 일정을 포함한 최종안",
      iterations: 2,
      tokens: { input: 62, output: 34, total: 96 },
    }),
  );
  return events;
}

describe("rmasRunConfigSchema", () => {
  it("parses a valid config and applies budget defaults", () => {
    const parsed = rmasRunConfigSchema.safeParse(CONFIG);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.budgets.maxIterations).toBe(6);
      expect(parsed.data.budgets.maxParallel).toBe(3);
      expect(parsed.data.agents[0]!.enabled).toBe(true); // default toggle
    }
  });

  it("rejects an empty agent roster and an unknown pattern", () => {
    expect(rmasRunConfigSchema.safeParse({ ...CONFIG, agents: [] }).success).toBe(false);
    expect(rmasRunConfigSchema.safeParse({ ...CONFIG, pattern: "quorum" }).success).toBe(false);
  });
});

describe("deriveRmasRun", () => {
  it("materializes status, iterations, tokens, and perAgentStatus from the event stream", () => {
    const record = deriveRmasRun(scriptedEvents(), RUN_ID);
    expect(record).toBeDefined();
    expect(record!.status).toBe("completed");
    expect(record!.iterations).toHaveLength(2);
    expect(record!.iterations[0]!.accepted).toBe(false);
    expect(record!.iterations[1]!.accepted).toBe(true);
    expect(record!.iterations[1]!.verdict?.accepted).toBe(true);
    expect(record!.finalOutput).toContain("최종안");
    expect(record!.tokens).toEqual({ input: 62, output: 34, total: 96 });
    // perAgentStatus: p1/s1 spoke → done; x1 errored → error; c1 never touched → idle
    expect(record!.perAgentStatus).toEqual({ p1: "done", c1: "idle", s1: "done", x1: "error" });
    expect(record!.agentErrors).toHaveLength(1);
    expect(record!.agentErrors[0]!.slotId).toBe("x1");
  });

  it("returns undefined when the run was never created", () => {
    expect(deriveRmasRun([], "missing")).toBeUndefined();
  });
});

describe("deriveRmasRunSummaries", () => {
  it("projects one summary row per run", () => {
    const summaries = deriveRmasRunSummaries(scriptedEvents());
    expect(summaries).toHaveLength(1);
    expect(summaries[0]!.runId).toBe(RUN_ID);
    expect(summaries[0]!.status).toBe("completed");
    expect(summaries[0]!.pattern).toBe("sequential");
    expect(summaries[0]!.iterations).toBe(2);
    expect(summaries[0]!.accepted).toBe(true);
    expect(summaries[0]!.tokens.total).toBe(96);
  });
});

describe("snapshot-vs-stream parity", () => {
  it("deriveRmasTrace(record) deep-equals the fold of rmasTraceEventFromEnvelope", () => {
    const events = scriptedEvents();
    const record = deriveRmasRun(events, RUN_ID)!;
    const snapshot = deriveRmasTrace(record);
    const fold = events
      .map((e) => rmasTraceEventFromEnvelope(e))
      .filter((e): e is RmasTraceEvent => e !== null);
    expect(snapshot).toEqual(fold);
    // agent.started + tokens.tallied are live-status/counter channels, not log
    // entries — excluded from BOTH paths.
    expect(snapshot.some((e) => e.type === "rmas.agent.started")).toBe(false);
    expect(snapshot.some((e) => e.type === "rmas.tokens.tallied")).toBe(false);
    expect(snapshot.some((e) => e.type === "rmas.run.completed")).toBe(true);
  });
});

describe("redaction", () => {
  it("masks an injected secret in a message contentPreview", () => {
    const record = deriveRmasRun(scriptedEvents(), RUN_ID)!;
    const trace = deriveRmasTrace(record);
    const solverMsg = trace.find((e) => e.type === "rmas.agent.message" && e.contentPreview?.includes("token="));
    expect(solverMsg).toBeDefined();
    expect(solverMsg!.contentPreview).toContain("[redacted]");
    expect(solverMsg!.contentPreview).not.toContain(SECRET);
    // the agent.error reason is redacted too
    const errEvent = trace.find((e) => e.type === "rmas.agent.error");
    expect(errEvent!.contentPreview).toContain("[redacted]");
    expect(errEvent!.contentPreview).not.toContain(SECRET);
  });
});
