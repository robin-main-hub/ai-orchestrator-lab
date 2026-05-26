import { describe, expect, it } from "vitest";
import type {
  AgentProfile,
  DebateRound,
  ProviderCompletionRequest,
  ProviderCompletionResponse,
} from "@ai-orchestrator/protocol";

import {
  advanceDebateRound,
  buildDebateSummary,
  createDebateRounds,
  type DebateContext,
} from "./index.js";
import {
  runDebateRound,
  type DebateEngineAgentSlot,
  type LlmCompletionFn,
} from "./debateEngine.js";

/**
 * End-to-end pipeline test: runDebateRound × N → advanceDebateRound × N
 * → buildDebateSummary. Verifies the engine output feeds into the
 * summary builder without any shape mismatch, and that round status
 * transitions propagate correctly through the summary.
 *
 * No LLM is called — slots use scripted completion functions whose
 * content includes the `[[tag:...]]` markers parsed by inferUtteranceTag.
 */

const DEBATE_ID = "debate_e2e_001";
const SESSION_ID = "session_e2e_001";
const FIXED_NOW = new Date("2026-05-26T07:00:00.000Z");
let counter = 0;
const fixedIdGen = () => `e2e_${++counter}`;

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

/**
 * Build a completion function that returns a scripted message for a
 * given round kind. The returned content includes a `[[tag:...]]`
 * marker so the engine assigns a deterministic tag.
 */
function scriptedComplete(scripts: Record<string, string>): LlmCompletionFn {
  return async (request: ProviderCompletionRequest): Promise<ProviderCompletionResponse> => {
    const userMsg = request.messages.find((m) => m.role === "user")?.content ?? "";
    const roundKindMatch = userMsg.match(/이 라운드의 목표|문제 정의|1차 제안|상호 비판|오케스트레이터 요약|보완 라운드|최종 결정|코딩 전달 패킷/);
    void roundKindMatch;
    // Pick by modelId tag (we encode round kind in modelId for the test)
    const content = scripts[request.modelId] ?? "기본 응답 [[tag:agreement]]";
    return {
      id: `resp_${request.id}`,
      requestId: request.id,
      providerProfileId: request.providerProfileId,
      modelId: request.modelId,
      route: request.routePreference,
      status: "succeeded",
      content,
      endpoint: "mock://e2e",
      createdAt: FIXED_NOW.toISOString(),
    };
  };
}

function slot(agent: AgentProfile, scripts: Record<string, string>): DebateEngineAgentSlot {
  return {
    agent,
    complete: scriptedComplete(scripts),
    systemPrompt: `당신은 ${agent.name} (${agent.role})입니다.`,
    modelId: `mock-${agent.role}`,
  };
}

describe("debate engine + summary end-to-end pipeline", () => {
  it("runs problem_definition + initial_proposals + cross_critique then summarizes", async () => {
    counter = 0;
    const rounds = createDebateRounds(DEBATE_ID);
    const context: DebateContext = {
      sessionId: SESSION_ID,
      problem: "AI Orchestrator Lab의 conversation parity 우선순위 결정",
      conversationSummary: "v0 디자인 기준 정렬 필요. 좌측 rail, TerminalDock 노출 정리.",
      constraints: ["Codex 영역(apps/desktop) 미접촉", "providers/memory/agents 영역만 작업"],
      openQuestions: ["v0 conversation에 EvolveMemento 노출 여부"],
      userPreferences: ["테스트 통과 후에만 머지"],
      memoryTraceIds: [],
    };

    const slots: DebateEngineAgentSlot[] = [
      slot(profile("a_orch", "Orchestrator", "orchestrator"), {
        "mock-orchestrator":
          "문제는 v0 conversation parity로 좁힌다. [[tag:evidence]]",
      }),
      slot(profile("a_arch", "Architect", "architect"), {
        "mock-architect":
          "좌측 rail은 v0 기본에 없으므로 collapsed default가 맞다. [[tag:coding_impact]]",
      }),
      slot(profile("a_skep", "Skeptic", "skeptic"), {
        "mock-skeptic":
          "EvolveMemento 기본 노출은 v0와 다르다. 숨김으로 가야 한다. [[tag:objection]]",
      }),
      slot(profile("a_rev", "Reviewer", "reviewer"), {
        "mock-reviewer":
          "각 patch에 audit 항목을 붙여야 한다. [[tag:risk]]",
      }),
    ];

    // ── Round 1: problem_definition ─────────────────
    const r1Result = await runDebateRound({
      debateId: DEBATE_ID,
      round: rounds[0]!,
      context,
      slots,
      options: {
        now: () => FIXED_NOW,
        generateId: fixedIdGen,
        maxUtterancesPerRound: 4,
      },
    });
    expect(r1Result.utterances.length).toBeGreaterThan(0);
    expect(r1Result.agentErrors).toEqual([]);

    rounds[0] = { ...rounds[0]!, utterances: r1Result.utterances };
    const after1 = advanceDebateRound(rounds, rounds[0]!.id);
    expect(after1.finished).toBe(false);
    expect(after1.nextRunningRoundId).toBe(rounds[1]!.id);

    // ── Round 2: initial_proposals ──────────────────
    const r2Result = await runDebateRound({
      debateId: DEBATE_ID,
      round: after1.rounds[1]!,
      context,
      slots,
      options: { now: () => FIXED_NOW, generateId: fixedIdGen },
    });
    expect(r2Result.utterances.length).toBeGreaterThan(0);
    const r2Rounds = after1.rounds.map((r, i) =>
      i === 1 ? { ...r, utterances: r2Result.utterances } : r,
    );
    const after2 = advanceDebateRound(r2Rounds, r2Rounds[1]!.id);
    expect(after2.nextRunningRoundId).toBe(r2Rounds[2]!.id);

    // ── Round 3: cross_critique ─────────────────────
    const r3Result = await runDebateRound({
      debateId: DEBATE_ID,
      round: after2.rounds[2]!,
      context,
      slots,
      options: { now: () => FIXED_NOW, generateId: fixedIdGen },
    });
    expect(r3Result.utterances.length).toBeGreaterThan(0);

    const finalRounds: DebateRound[] = after2.rounds.map((r, i) =>
      i === 2 ? { ...r, utterances: r3Result.utterances, status: "completed" } : r,
    );

    // ── Summary ─────────────────────────────────────
    const summary = buildDebateSummary(context, finalRounds);

    expect(summary).toContain("# 토론 요약");
    expect(summary).toContain("conversation parity 우선순위 결정");
    expect(summary).toContain("문제 정의");
    expect(summary).toContain("1차 제안");
    expect(summary).toContain("상호 비판");
    // pending rounds should show as status notes
    expect(summary).toContain("*pending*");
    // tag distribution table
    expect(summary).toContain("## 의견 분포");
    // agent ids should appear
    expect(summary).toMatch(/a_orch|a_arch|a_skep|a_rev/);
  });

  it("propagates agent failures as agentErrors without blocking other utterances", async () => {
    counter = 0;
    const rounds = createDebateRounds(DEBATE_ID);
    const context: DebateContext = {
      sessionId: SESSION_ID,
      problem: "장애 격리 테스트",
      conversationSummary: "",
      constraints: [],
      openQuestions: [],
      userPreferences: [],
      memoryTraceIds: [],
    };

    const failingComplete: LlmCompletionFn = async () => {
      throw new Error("scripted failure");
    };
    const okComplete = scriptedComplete({ "mock-architect": "정상 응답 [[tag:evidence]]" });

    const slots: DebateEngineAgentSlot[] = [
      {
        agent: profile("a_orch", "Orchestrator", "orchestrator"),
        complete: failingComplete,
        systemPrompt: "X",
        modelId: "mock-orchestrator",
      },
      {
        agent: profile("a_arch", "Architect", "architect"),
        complete: okComplete,
        systemPrompt: "X",
        modelId: "mock-architect",
      },
    ];

    const result = await runDebateRound({
      debateId: DEBATE_ID,
      round: rounds[0]!,
      context,
      slots,
      options: { now: () => FIXED_NOW, generateId: fixedIdGen },
    });

    expect(result.agentErrors.map((e) => e.agentId)).toContain("a_orch");
    expect(result.utterances.map((u) => u.agentId)).toContain("a_arch");
    expect(result.utterances.map((u) => u.agentId)).not.toContain("a_orch");
  });

  it("buildDebateSummary on engine output respects pending status for unrun rounds", async () => {
    counter = 0;
    const rounds = createDebateRounds(DEBATE_ID);
    const context: DebateContext = {
      sessionId: SESSION_ID,
      problem: "pending propagation 테스트",
      conversationSummary: "",
      constraints: [],
      openQuestions: [],
      userPreferences: [],
      memoryTraceIds: [],
    };

    const slots: DebateEngineAgentSlot[] = [
      slot(profile("a_orch", "Orchestrator", "orchestrator"), {
        "mock-orchestrator": "라운드 1 응답 [[tag:agreement]]",
      }),
    ];

    const r1 = await runDebateRound({
      debateId: DEBATE_ID,
      round: rounds[0]!,
      context,
      slots,
      options: { now: () => FIXED_NOW, generateId: fixedIdGen },
    });
    const updated: DebateRound[] = rounds.map((r, i) =>
      i === 0 ? { ...r, utterances: r1.utterances, status: "completed" } : r,
    );

    const summary = buildDebateSummary(context, updated);
    // only round 1 should have utterances; others should show pending
    const pendingCount = (summary.match(/\*pending\*/g) ?? []).length;
    expect(pendingCount).toBe(rounds.length - 1);
  });
});
