import { describe, expect, it } from "vitest";
import type {
  AgentProfile,
  ProviderCompletionRequest,
  ProviderCompletionResponse,
} from "@ai-orchestrator/protocol";

import {
  createDebateRounds,
  type DebateContext,
} from "./index.js";
import { runDebate } from "./runDebate.js";
import type { DebateEngineAgentSlot, LlmCompletionFn } from "./debateEngine.js";

const NOW = new Date("2026-05-26T08:00:00.000Z");
let idCounter = 0;
const idGen = () => `e2e_${++idCounter}`;

function profile(id: string, name: string, role: AgentProfile["role"]): AgentProfile {
  return {
    id,
    name,
    kind: "virtual",
    role,
    soulMode: "summary",
    configSource: "internal",
    enabled: true,
    permissionLevel: "read_only",
  };
}

function scripted(content: string): LlmCompletionFn {
  return async (req: ProviderCompletionRequest): Promise<ProviderCompletionResponse> => ({
    id: `resp_${req.id}`,
    requestId: req.id,
    providerProfileId: req.providerProfileId,
    modelId: req.modelId,
    route: req.routePreference,
    status: "succeeded",
    content,
    endpoint: "mock://run-debate",
    createdAt: NOW.toISOString(),
  });
}

function slot(agent: AgentProfile, content: string): DebateEngineAgentSlot {
  return {
    agent,
    complete: scripted(content),
    systemPrompt: `당신은 ${agent.name} (${agent.role})입니다.`,
    modelId: `mock-${agent.role}`,
  };
}

const CTX: DebateContext = {
  sessionId: "sess_runDebate",
  problem: "runDebate orchestration sanity test",
  conversationSummary: "minimal scripted slots",
  constraints: [],
  openQuestions: [],
  userPreferences: [],
  memoryTraceIds: [],
};

describe("runDebate orchestration", () => {
  it("runs every round in order until finished and returns per-round results", async () => {
    idCounter = 0;
    const initial = createDebateRounds("debate_runall");
    const slots = [
      slot(profile("a_orch", "Orch", "orchestrator"), "orchestrator 응답 [[tag:evidence]]"),
      slot(profile("a_arch", "Arch", "architect"), "architect 응답 [[tag:coding_impact]]"),
    ];

    const result = await runDebate({
      debateId: "debate_runall",
      initialRounds: initial,
      context: CTX,
      slots,
      engineOptions: { now: () => NOW, generateId: idGen },
    });

    expect(result.finished).toBe(true);
    expect(result.stoppedEarly).toBe(false);
    expect(result.rounds.every((r) => r.status === "completed")).toBe(true);
    expect(result.roundResults.length).toBe(initial.length);
    // every round should have at least one utterance
    expect(result.rounds.every((r) => r.utterances.length > 0)).toBe(true);
  });

  it("respects shouldStop and leaves remaining rounds pending", async () => {
    idCounter = 0;
    const initial = createDebateRounds("debate_stop");
    const slots = [
      slot(profile("a_orch", "Orch", "orchestrator"), "응답 [[tag:agreement]]"),
    ];

    const result = await runDebate({
      debateId: "debate_stop",
      initialRounds: initial,
      context: CTX,
      slots,
      engineOptions: { now: () => NOW, generateId: idGen },
      // Stop after the very first completed round
      shouldStop: ({ completedRound }) => completedRound.kind === "problem_definition",
    });

    expect(result.stoppedEarly).toBe(true);
    expect(result.finished).toBe(false);
    expect(result.roundResults.length).toBe(1);
    // first round completed, rest still pending
    const statuses = result.rounds.map((r) => r.status);
    expect(statuses[0]).toBe("completed");
    expect(statuses.slice(1).every((s) => s === "pending")).toBe(true);
  });

  it("propagates per-round agent errors via roundResults without aborting the debate", async () => {
    idCounter = 0;
    const initial = createDebateRounds("debate_err");
    const failingComplete: LlmCompletionFn = async () => {
      throw new Error("scripted failure");
    };

    const slots: DebateEngineAgentSlot[] = [
      {
        agent: profile("a_orch", "Orch", "orchestrator"),
        complete: failingComplete,
        systemPrompt: "X",
        modelId: "mock-orchestrator",
      },
      slot(profile("a_arch", "Arch", "architect"), "정상 응답 [[tag:evidence]]"),
    ];

    const result = await runDebate({
      debateId: "debate_err",
      initialRounds: initial,
      context: CTX,
      slots,
      engineOptions: { now: () => NOW, generateId: idGen },
    });

    expect(result.finished).toBe(true);
    // every round should have recorded the orchestrator failure
    for (const rr of result.roundResults) {
      const errIds = rr.result.agentErrors.map((e) => e.agentId);
      expect(errIds).toContain("a_orch");
    }
    // architect should still produce utterances in at least some rounds (not all
    // round kinds invite the architect role, e.g. orchestrator_summary excludes it).
    expect(result.rounds.some((r) => r.utterances.some((u) => u.agentId === "a_arch"))).toBe(true);
  });

  it("auto-promotes the first pending round to running before executing", async () => {
    idCounter = 0;
    const baseRounds = createDebateRounds("debate_pending");
    // Force round 0 to "pending" — runDebate should promote it.
    const initial = baseRounds.map((r, i) =>
      i === 0 ? { ...r, status: "pending" as const } : r,
    );
    const slots = [
      slot(profile("a_orch", "Orch", "orchestrator"), "응답 [[tag:evidence]]"),
    ];

    const result = await runDebate({
      debateId: "debate_pending",
      initialRounds: initial,
      context: CTX,
      slots,
      engineOptions: { now: () => NOW, generateId: idGen },
    });

    expect(result.finished).toBe(true);
    expect(result.roundResults.length).toBe(initial.length);
  });

  it("returns finished=false stoppedEarly=false when no round is in running state and none can be promoted", async () => {
    idCounter = 0;
    const baseRounds = createDebateRounds("debate_blocked");
    // All rounds blocked → loop should exit immediately, nothing executed
    const initial = baseRounds.map((r) => ({ ...r, status: "blocked" as const }));
    const slots = [slot(profile("a_orch", "Orch", "orchestrator"), "x [[tag:evidence]]")];

    const result = await runDebate({
      debateId: "debate_blocked",
      initialRounds: initial,
      context: CTX,
      slots,
      engineOptions: { now: () => NOW, generateId: idGen },
    });

    expect(result.finished).toBe(false);
    expect(result.stoppedEarly).toBe(false);
    expect(result.roundResults.length).toBe(0);
  });
});
