import { describe, expect, it } from "vitest";
import {
  rmasRunConfigSchema,
  type ProviderCompletionRequest,
  type ProviderCompletionResponse,
  type RmasRunConfig,
} from "@ai-orchestrator/protocol";
import type { LlmCompletionFn } from "../debateEngine.js";
import { runGoalLoop, type RmasEmit } from "./goalLoop.js";

const ACCEPT = "```json\n{\"perCriterion\":[{\"id\":\"k1\",\"met\":true}],\"feedback\":\"통과\"}\n```";
const REJECT = "```json\n{\"perCriterion\":[{\"id\":\"k1\",\"met\":false}],\"feedback\":\"수정 필요\"}\n```";
const AGENT_OUTPUT = "후보 산출물";

type Emitted = { type: string; payload: unknown };

function isJudgeRequest(request: ProviderCompletionRequest): boolean {
  return (request.messages[request.messages.length - 1]?.content ?? "").includes("판정");
}

function baseResp(request: ProviderCompletionRequest, content: string): ProviderCompletionResponse {
  return {
    id: `resp_${request.id}`,
    requestId: request.id,
    providerProfileId: request.providerProfileId,
    modelId: request.modelId,
    route: request.routePreference,
    status: "succeeded",
    content,
    usage: { inputTokens: 12, outputTokens: 4, totalTokens: 16 },
    createdAt: request.createdAt,
  };
}

/** Judge completions drain a verdict queue (last value repeats); agents echo a fixed candidate. */
function scripted(verdictQueue: string[]): LlmCompletionFn {
  let j = 0;
  return async (request) => {
    if (isJudgeRequest(request)) {
      const content = verdictQueue[Math.min(j, verdictQueue.length - 1)] ?? REJECT;
      j += 1;
      return baseResp(request, content);
    }
    return baseResp(request, AGENT_OUTPUT);
  };
}

// distillation with a single producer slot = exactly ONE agent call per iteration
// (distiller === producer short-circuits), which keeps token/event math exact.
function makeConfig(overrides: Partial<{ budgets: Partial<RmasRunConfig["budgets"]> }> = {}): RmasRunConfig {
  return rmasRunConfigSchema.parse({
    goal: "목표를 달성하는 산출물을 만든다",
    pattern: "distillation",
    agents: [{ id: "a1", name: "작업자", kind: "producer", providerProfileId: "provider_dgx02_vllm", modelId: "qwen" }],
    acceptanceCriteria: [{ id: "k1", text: "기준을 충족한다" }],
    budgets: overrides.budgets,
  });
}

function makeDeps(complete: LlmCompletionFn, signal: AbortSignal, now?: () => Date) {
  const emitted: Emitted[] = [];
  let idN = 0;
  const emit: RmasEmit = async (event) => {
    emitted.push({ type: event.type, payload: event.payload });
  };
  return {
    emitted,
    deps: {
      runId: "run_1",
      complete,
      emit,
      signal,
      now,
      generateId: () => `id_${(idN += 1)}`,
    },
  };
}

function controlSequence(emitted: Emitted[]): string[] {
  return emitted.filter((e) => !e.type.startsWith("rmas.agent")).map((e) => e.type);
}

describe("runGoalLoop", () => {
  it("(a) accepts on iteration 2 → completed, 2 iterations, correct event sequence", async () => {
    const { emitted, deps } = makeDeps(scripted([REJECT, ACCEPT]), new AbortController().signal);
    const outcome = await runGoalLoop(makeConfig(), deps);
    expect(outcome.status).toBe("completed");
    expect(outcome.accepted).toBe(true);
    expect(outcome.iterations).toBe(2);
    expect(outcome.finalOutput).toBe(AGENT_OUTPUT);
    expect(controlSequence(emitted)).toEqual([
      "rmas.run.started",
      "rmas.iteration.started",
      "rmas.tokens.tallied",
      "rmas.judge.evaluated",
      "rmas.iteration.completed",
      "rmas.iteration.started",
      "rmas.tokens.tallied",
      "rmas.judge.evaluated",
      "rmas.run.completed",
    ]);
  });

  it("(b) never accepts → exhausted{max_iterations}", async () => {
    const { emitted, deps } = makeDeps(scripted([REJECT]), new AbortController().signal);
    const outcome = await runGoalLoop(makeConfig({ budgets: { maxIterations: 3 } }), deps);
    expect(outcome.status).toBe("exhausted");
    expect(outcome.iterations).toBe(3);
    const last = emitted[emitted.length - 1]!;
    expect(last.type).toBe("rmas.run.exhausted");
    expect((last.payload as { reason: string }).reason).toBe("max_iterations");
  });

  it("(c) token usage crossing the cap → exhausted{max_tokens}", async () => {
    const { emitted, deps } = makeDeps(scripted([REJECT]), new AbortController().signal);
    // iter1 spends 32 tokens (agent 16 + judge 16); cap 20 trips at iter2 pre-check.
    const outcome = await runGoalLoop(makeConfig({ budgets: { maxTotalTokens: 20 } }), deps);
    expect(outcome.status).toBe("exhausted");
    expect(outcome.iterations).toBe(1);
    const last = emitted[emitted.length - 1]!;
    expect(last.type).toBe("rmas.run.exhausted");
    expect((last.payload as { reason: string }).reason).toBe("max_tokens");
  });

  it("(d) wall-clock deadline passed → exhausted{wall_clock}", async () => {
    let clockMs = 0;
    const now = () => new Date(clockMs);
    // completion advances the clock so the deadline (start + 5000) is passed after iter1
    const complete: LlmCompletionFn = async (request) => {
      clockMs += 3000;
      return baseResp(request, isJudgeRequest(request) ? REJECT : AGENT_OUTPUT);
    };
    const { emitted, deps } = makeDeps(complete, new AbortController().signal, now);
    const outcome = await runGoalLoop(makeConfig({ budgets: { wallClockMs: 5000 } }), deps);
    expect(outcome.status).toBe("exhausted");
    expect(outcome.iterations).toBe(1);
    const last = emitted[emitted.length - 1]!;
    expect(last.type).toBe("rmas.run.exhausted");
    expect((last.payload as { reason: string }).reason).toBe("wall_clock");
  });

  it("(e1) abort before the loop → stopped, 0 iterations", async () => {
    const controller = new AbortController();
    controller.abort();
    const { emitted, deps } = makeDeps(scripted([ACCEPT]), controller.signal);
    const outcome = await runGoalLoop(makeConfig(), deps);
    expect(outcome.status).toBe("stopped");
    expect(outcome.iterations).toBe(0);
    expect(controlSequence(emitted)).toEqual(["rmas.run.started", "rmas.run.stopped"]);
  });

  it("(e2) abort mid-loop → stopped after the in-flight iteration", async () => {
    const controller = new AbortController();
    let judgeCalls = 0;
    const complete: LlmCompletionFn = async (request) => {
      if (isJudgeRequest(request)) {
        judgeCalls += 1;
        if (judgeCalls === 1) controller.abort();
        return baseResp(request, REJECT);
      }
      return baseResp(request, AGENT_OUTPUT);
    };
    const { emitted, deps } = makeDeps(complete, controller.signal);
    const outcome = await runGoalLoop(makeConfig({ budgets: { maxIterations: 5 } }), deps);
    expect(outcome.status).toBe("stopped");
    expect(outcome.iterations).toBe(1);
    expect(emitted[emitted.length - 1]!.type).toBe("rmas.run.stopped");
  });

  it("(f) malformed judge output → loop continues (revise), never throws", async () => {
    const garbage: LlmCompletionFn = async (request) =>
      baseResp(request, isJudgeRequest(request) ? "그냥 산문 판단, JSON 코드펜스 없음" : AGENT_OUTPUT);
    const { emitted, deps } = makeDeps(garbage, new AbortController().signal);
    const outcome = await runGoalLoop(makeConfig({ budgets: { maxIterations: 2 } }), deps);
    expect(outcome.status).toBe("exhausted");
    expect(outcome.iterations).toBe(2);
    expect(emitted.filter((e) => e.type === "rmas.judge.evaluated")).toHaveLength(2);
  });
});
