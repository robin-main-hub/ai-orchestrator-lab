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

  it("P1-7: 합의가 β 라운드 지속되면 조기 종료한다", async () => {
    // 라운드마다 2명 이상 발언하도록 여러 역할 슬롯을 주고, 전원 같은 결론 반복
    const conclusion = "캐시를 도입하는 것이 최선이다. 캐시 도입에 찬성한다.";
    const result = await runDebate({
      debateId: "debate_consensus",
      context: CTX,
      initialRounds: createDebateRounds("debate_consensus"),
      slots: [
        slot(profile("c_orch", "지휘", "orchestrator"), conclusion),
        slot(profile("c_arch", "시노부", "architect"), conclusion),
        slot(profile("c_skep", "아스카", "skeptic"), conclusion),
        slot(profile("c_build", "유이", "builder"), conclusion),
      ],
      consensus: { alpha: 2, beta: 2, similarityThreshold: 0.25 },
    });
    expect(result.consensusReached).toBe(true);
    expect(result.stoppedEarly).toBe(true);
    expect(result.consensusConfidence).toBeGreaterThanOrEqual(0.5);
    expect(result.rounds.some((r) => r.status === "pending")).toBe(true);
  });

  it("P1-7: consensus 옵션이 없으면 기존처럼 전 라운드 진행", async () => {
    const a = profile("agent_architect", "시노부", "architect");
    const initial = createDebateRounds("debate_noconsensus");
    const result = await runDebate({
      debateId: "debate_noconsensus",
      context: CTX,
      initialRounds: initial,
      slots: [slot(a, "동일 결론 반복")],
    });
    expect(result.consensusReached).toBeFalsy();
    expect(result.finished).toBe(true);
  });
});

import { withPriorRounds } from "./runDebate.js";
import type { DebateRound } from "@ai-orchestrator/protocol";

function capturingSlot(agent: AgentProfile, content: string, sink: string[]): DebateEngineAgentSlot {
  return {
    agent,
    systemPrompt: `당신은 ${agent.name}입니다.`,
    modelId: `mock-${agent.role}`,
    complete: async (req: ProviderCompletionRequest): Promise<ProviderCompletionResponse> => {
      const userPrompt = [...req.messages].reverse().find((m) => m.role === "user")?.content ?? "";
      sink.push(userPrompt);
      return {
        id: `resp_${req.id}`,
        requestId: req.id,
        providerProfileId: req.providerProfileId,
        modelId: req.modelId,
        route: req.routePreference,
        status: "succeeded",
        content,
        endpoint: "mock://capture",
        createdAt: NOW.toISOString(),
      };
    },
  };
}

describe("withPriorRounds — 이전 라운드 발언 접기 (#2)", () => {
  it("완료된 라운드 발언을 conversationSummary에 붙인다", () => {
    const round = {
      id: "r1",
      title: "1차 제안",
      kind: "initial_proposals",
      status: "completed",
      utterances: [{ id: "u1", agentId: "agent_architect", roundId: "r1", content: "모놀리식 대신 모듈 분리 제안", tags: [], createdAt: NOW.toISOString() }],
    } as unknown as DebateRound;
    const augmented = withPriorRounds(CTX, [round]);
    expect(augmented.conversationSummary).toContain("이전 라운드 발언");
    expect(augmented.conversationSummary).toContain("모듈 분리 제안");
    expect(augmented.conversationSummary).toContain("agent_architect");
  });

  it("발언 없는 라운드는 원본 컨텍스트 그대로", () => {
    const empty = { id: "r0", title: "x", kind: "problem_definition", status: "completed", utterances: [] } as unknown as DebateRound;
    expect(withPriorRounds(CTX, [empty])).toBe(CTX);
  });

  it("end-to-end: 후속 라운드 프롬프트에 이전 발언이 들어간다", async () => {
    const prompts: string[] = [];
    const architect = profile("agent_architect", "시노부", "architect");
    const skeptic = profile("agent_skeptic", "아스카", "skeptic");
    const initial = createDebateRounds("debate_fold");
    const result = await runDebate({
      debateId: "debate_fold",
      context: CTX,
      initialRounds: initial,
      slots: [
        capturingSlot(architect, "SIGNATURE_ARCH_PROPOSAL", prompts),
        capturingSlot(skeptic, "비판합니다", prompts),
      ],
    });
    expect(result.finished).toBe(true);
    // 첫 프롬프트엔 아직 이전 발언 없음, 이후 어딘가엔 1라운드 발언이 접혀 들어감
    expect(prompts[0]).not.toContain("SIGNATURE_ARCH_PROPOSAL");
    expect(prompts.some((p) => p.includes("SIGNATURE_ARCH_PROPOSAL"))).toBe(true);
  });
});

// withPriorRounds' 600-char per-utterance truncation and its multi-round /
// summary-prefix folding are unpinned (the tests above only fold a single short
// utterance), and runDebate's consensus branch is only seen when it *fires* or
// is *absent* — never the "option present, threaded every round, but never
// reached" path. Pin those, self-consistent (derived from the rounds/context).
describe("runDebate — withPriorRounds truncation/prefix + consensus-present-but-never-reached", () => {
  const mkRound = (id: string, title: string, utterances: DebateRound["utterances"]): DebateRound =>
    ({ id, debateId: "d1", kind: "initial_proposals", title, status: "completed", utterances } as unknown as DebateRound);
  const mkUtt = (agentId: string, content: string) =>
    ({ id: `u_${agentId}`, agentId, roundId: "r", content, tags: [], createdAt: NOW.toISOString() }) as unknown as DebateRound["utterances"][number];

  it("folds each prior utterance truncated to (max 600) chars: 600 stays, 601 becomes slice(0,599)+…", () => {
    const exactly600 = "a".repeat(600);
    const over601 = "z".repeat(700);
    const augmented = withPriorRounds(CTX, [
      mkRound("r1", "긴 라운드", [mkUtt("agent_a", exactly600), mkUtt("agent_b", over601)]),
    ]);
    expect(augmented.conversationSummary).toContain(exactly600); // ==600 ⇒ not truncated
    expect(augmented.conversationSummary).toContain(`${"z".repeat(599)}…`); // >600 ⇒ slice(0,599)+…
    expect(augmented.conversationSummary).not.toContain("z".repeat(600)); // no 600-run survives
  });

  it("preserves the original conversationSummary as a prefix and emits a ### header per spoken round, skipping empty ones", () => {
    const augmented = withPriorRounds(CTX, [
      mkRound("r1", "첫 제안", [mkUtt("agent_a", "제안 하나")]),
      mkRound("r2", "빈 라운드", []), // no utterances → not folded
      mkRound("r3", "둘째 제안", [mkUtt("agent_b", "제안 둘")]),
    ]);
    expect(augmented.conversationSummary.startsWith(CTX.conversationSummary)).toBe(true);
    expect(augmented.conversationSummary).toContain("### 첫 제안");
    expect(augmented.conversationSummary).toContain("### 둘째 제안");
    expect(augmented.conversationSummary).not.toContain("### 빈 라운드"); // empty round contributes no header
  });

  it("consensus option present but unreachable (alpha too high) runs all rounds: finished, not stoppedEarly, consensusReached=false, confidence 0", async () => {
    idCounter = 0;
    const initial = createDebateRounds("debate_no_reach");
    const result = await runDebate({
      debateId: "debate_no_reach",
      context: CTX,
      initialRounds: initial,
      slots: [slot(profile("a_orch", "Orch", "orchestrator"), "응답 [[tag:evidence]]")],
      engineOptions: { now: () => NOW, generateId: idGen },
      consensus: { alpha: 99, beta: 2, similarityThreshold: 0.25 }, // alpha unreachable ⇒ never a majority
    });
    expect(result.finished).toBe(true);
    expect(result.stoppedEarly).toBe(false);
    expect(result.consensusReached).toBe(false);
    expect(result.consensusConfidence).toBe(0); // never set ⇒ initial 0
    expect(result.rounds.every((r) => r.status === "completed")).toBe(true);
  });
});
