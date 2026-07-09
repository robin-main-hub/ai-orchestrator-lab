import { describe, expect, it } from "vitest";
import {
  rmasRunConfigSchema,
  type ProviderCompletionRequest,
  type ProviderCompletionResponse,
  type RmasAgentSlotConfig,
} from "@ai-orchestrator/protocol";
import type { LlmCompletionFn } from "../debateEngine.js";
import {
  kindToDistinctRole,
  STRATEGIES,
  type PatternIterationInput,
  type RmasEmit,
} from "./patterns.js";

function slot(id: string, kind: RmasAgentSlotConfig["kind"]): RmasAgentSlotConfig {
  return { id, name: `${id}-${kind}`, kind, providerProfileId: "provider_dgx02_vllm", modelId: "qwen", systemPrompt: `you are ${kind}`, enabled: true };
}

function makeComplete(content: string): LlmCompletionFn {
  return async (request: ProviderCompletionRequest): Promise<ProviderCompletionResponse> => ({
    id: `resp_${request.id}`,
    requestId: request.id,
    providerProfileId: request.providerProfileId,
    modelId: request.modelId,
    route: request.routePreference,
    status: "succeeded",
    content,
    usage: { inputTokens: 12, outputTokens: 4, totalTokens: 16 },
    createdAt: request.createdAt,
  });
}

type Emitted = { type: string; payload: unknown };

function makeInput(slots: RmasAgentSlotConfig[], complete: LlmCompletionFn): { input: PatternIterationInput; emitted: Emitted[] } {
  const emitted: Emitted[] = [];
  const emit: RmasEmit = async (event) => {
    emitted.push({ type: event.type, payload: event.payload });
  };
  let idN = 0;
  const config = rmasRunConfigSchema.parse({ goal: "목표", pattern: "mixture", agents: [slot("z", "custom")] });
  const input: PatternIterationInput = {
    config,
    sessionId: "rmas_run_1",
    slots,
    workingContext: { goal: "목표", critiques: [] },
    iteration: 1,
    complete,
    emit,
    signal: new AbortController().signal,
    now: () => new Date("2026-07-09T00:00:00.000Z"),
    generateId: () => `id_${(idN += 1)}`,
  };
  return { input, emitted };
}

function count(emitted: Emitted[], type: string): number {
  return emitted.filter((e) => e.type === type).length;
}

describe("kindToDistinctRole", () => {
  it("yields distinct AgentRoles for up to six slots so pickAgentsForRound invites all", () => {
    const slots = [slot("a", "planner"), slot("b", "critic"), slot("c", "solver"), slot("d", "aggregator"), slot("e", "producer"), slot("f", "distiller")];
    const roles = slots.map((s, i) => kindToDistinctRole(s, i));
    expect(new Set(roles).size).toBe(roles.length);
  });
});

describe("STRATEGIES.sequential", () => {
  it("runs Planner→Critic→Solver and returns the solver output", async () => {
    const { input, emitted } = makeInput([slot("p1", "planner"), slot("c1", "critic"), slot("s1", "solver")], makeComplete("산출물"));
    const result = await STRATEGIES.sequential.runIteration(input);
    expect(result.output).toBe("산출물");
    expect(count(emitted, "rmas.agent.started")).toBe(3);
    expect(count(emitted, "rmas.agent.message")).toBe(3);
  });
});

describe("STRATEGIES.mixture", () => {
  it("fans out proposers then merges via the aggregator", async () => {
    const { input, emitted } = makeInput([slot("p1", "planner"), slot("p2", "solver"), slot("agg", "aggregator")], makeComplete("산출물"));
    const result = await STRATEGIES.mixture.runIteration(input);
    expect(result.output).toBe("산출물"); // aggregator content
    expect(count(emitted, "rmas.agent.started")).toBe(3); // 2 proposers + aggregator
    expect(count(emitted, "rmas.agent.message")).toBe(3);
  });

  it("falls back to a deterministic chairman merge when no aggregator is configured", async () => {
    const { input, emitted } = makeInput([slot("p1", "planner"), slot("p2", "solver")], makeComplete("산출물"));
    const result = await STRATEGIES.mixture.runIteration(input);
    expect(result.output.length).toBeGreaterThan(0);
    expect(result.output).toContain("산출물");
    expect(count(emitted, "rmas.agent.message")).toBe(2); // no extra aggregator call
  });
});

describe("STRATEGIES.distillation", () => {
  it("runs a producer→distiller chain and returns the distiller output", async () => {
    const { input, emitted } = makeInput([slot("pr", "producer"), slot("di", "distiller")], makeComplete("정제안"));
    const result = await STRATEGIES.distillation.runIteration(input);
    expect(result.output).toBe("정제안");
    expect(count(emitted, "rmas.agent.started")).toBe(2);
    expect(count(emitted, "rmas.agent.message")).toBe(2);
  });
});

describe("STRATEGIES.deliberation", () => {
  it("invokes the real debate engine and bridges utterances to rmas.agent.message", async () => {
    let calls = 0;
    const counting: LlmCompletionFn = async (request) => {
      calls += 1;
      return {
        id: `resp_${request.id}`,
        requestId: request.id,
        providerProfileId: request.providerProfileId,
        modelId: request.modelId,
        route: request.routePreference,
        status: "succeeded",
        content: "합의된 방향으로 진행합니다 [[tag:agreement]]",
        usage: { inputTokens: 12, outputTokens: 4, totalTokens: 16 },
        createdAt: request.createdAt,
      };
    };
    const { input, emitted } = makeInput([slot("a1", "planner"), slot("a2", "critic"), slot("a3", "solver")], counting);
    const result = await STRATEGIES.deliberation.runIteration(input);
    expect(calls).toBeGreaterThan(0); // runDebate actually ran rounds
    expect(count(emitted, "rmas.agent.message")).toBeGreaterThan(0); // utterances bridged
    expect(result.output.length).toBeGreaterThan(0); // chairman synthesis produced a statement
  });
});
