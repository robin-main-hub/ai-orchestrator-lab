import { describe, expect, it } from "vitest";
import type {
  AgentProfile,
  AgentRole,
  ProviderCompletionRequest,
  ProviderCompletionResponse,
} from "@ai-orchestrator/protocol";
import {
  DEFAULT_BLOCKED_TARGETS,
  parseDelegateTags,
  runCompanionTurn,
  type CompanionTurnInput,
  type DebateEngineAgentSlot,
  type DelegateOutcome,
  type DebateContext,
  type LlmCompletionFn,
} from "./index";

function makeProfile(overrides: Partial<AgentProfile> & { role: AgentRole; id: string }): AgentProfile {
  return {
    name: overrides.name ?? overrides.id,
    kind: "virtual",
    soulMode: "summary",
    configSource: "internal",
    enabled: true,
    permissionLevel: "read_only",
    ...overrides,
  };
}

function makeContext(overrides: Partial<DebateContext> = {}): DebateContext {
  return {
    sessionId: "session_delegation_test",
    problem: "test",
    conversationSummary: "",
    constraints: [],
    openQuestions: [],
    userPreferences: [],
    memoryTraceIds: [],
    ...overrides,
  };
}

function returningOnce(...responses: string[]): LlmCompletionFn {
  let i = 0;
  return async (req: ProviderCompletionRequest): Promise<ProviderCompletionResponse> => {
    const content = responses[i] ?? responses[responses.length - 1]!;
    i += 1;
    return {
      id: `resp_${req.id}`,
      requestId: req.id,
      providerProfileId: req.providerProfileId,
      modelId: req.modelId,
      route: req.routePreference,
      status: "succeeded",
      content,
      createdAt: req.createdAt,
    };
  };
}

function makeSlot(
  profile: AgentProfile,
  complete: LlmCompletionFn,
  systemPrompt = `you are ${profile.name}`,
): DebateEngineAgentSlot {
  return { agent: profile, complete, systemPrompt, modelId: "mock" };
}

describe("parseDelegateTags", () => {
  it("extracts a single tag with target + body", () => {
    const tags = parseDelegateTags(`머리말 <delegate to="researcher">2024 시장 규모</delegate> 꼬리`);
    expect(tags).toHaveLength(1);
    expect(tags[0]!.target).toBe("researcher");
    expect(tags[0]!.prompt).toBe("2024 시장 규모");
  });

  it("extracts multiple tags in order", () => {
    const tags = parseDelegateTags(
      `<delegate to="researcher">a</delegate><delegate to="negotiator">b</delegate>`,
    );
    expect(tags.map((t) => t.target)).toEqual(["researcher", "negotiator"]);
  });

  it("trims body whitespace", () => {
    const tags = parseDelegateTags(`<delegate to="x">\n  inside  \n</delegate>`);
    expect(tags[0]!.prompt).toBe("inside");
  });

  it("returns empty array on no tags", () => {
    expect(parseDelegateTags("그냥 일반 텍스트")).toEqual([]);
  });

  it("ignores malformed tags (missing quotes / unknown attr)", () => {
    // No quotes around value — rejected.
    expect(parseDelegateTags(`<delegate to=researcher>x</delegate>`)).toEqual([]);
    // Different attribute name — rejected.
    expect(parseDelegateTags(`<delegate target="x">y</delegate>`)).toEqual([]);
  });

  it("records source-mapping indices", () => {
    const source = `pre <delegate to="x">y</delegate> post`;
    const tags = parseDelegateTags(source);
    expect(tags[0]!.startIndex).toBe(4);
    expect(source.slice(tags[0]!.startIndex, tags[0]!.endIndex)).toBe(tags[0]!.raw);
  });
});

describe("DEFAULT_BLOCKED_TARGETS", () => {
  it("blocks executor / external / auditor by default", () => {
    expect(DEFAULT_BLOCKED_TARGETS.has("executor")).toBe(true);
    expect(DEFAULT_BLOCKED_TARGETS.has("external")).toBe(true);
    expect(DEFAULT_BLOCKED_TARGETS.has("auditor")).toBe(true);
  });

  it("does NOT block researcher / negotiator / etc.", () => {
    expect(DEFAULT_BLOCKED_TARGETS.has("researcher")).toBe(false);
    expect(DEFAULT_BLOCKED_TARGETS.has("negotiator")).toBe(false);
    expect(DEFAULT_BLOCKED_TARGETS.has("companion")).toBe(false);
  });
});

describe("runCompanionTurn — short-circuit (no tags)", () => {
  it("returns initial content as-is when no <delegate> tags", async () => {
    const caller = makeSlot(
      makeProfile({ id: "agent_chaerin", role: "companion", personaName: "chae_arin" }),
      returningOnce("오빠~ 그냥 내가 답할 수 있어! ♡"),
    );
    const input: CompanionTurnInput = {
      caller,
      context: makeContext(),
      targets: new Map(),
      userMessage: "안녕?",
    };
    const result = await runCompanionTurn(input);
    expect(result.shortCircuited).toBe(true);
    expect(result.finalContent).toContain("오빠~");
    expect(result.delegations).toEqual([]);
  });
});

describe("runCompanionTurn — single happy-path delegation", () => {
  it("calls target adapter once and produces a follow-up final answer", async () => {
    const caller = makeSlot(
      makeProfile({ id: "agent_chaerin", role: "companion", personaName: "chae_arin" }),
      returningOnce(
        `오빠~ 잠깐만, 마오마오한테 물어볼게~ <delegate to="researcher">2024 HTV 시장 규모</delegate>`,
        `오빠~ 마오마오가 알아봤어! 2024년 HTV 시장은 ~~ 라네! ♡`,
      ),
    );
    const researcherSlot = makeSlot(
      makeProfile({ id: "agent_researcher", role: "researcher" }),
      returningOnce("2024년 HTV 시장 규모는 약 $4.2B."),
    );
    const result = await runCompanionTurn({
      caller,
      context: makeContext(),
      targets: new Map([["researcher", researcherSlot]]),
      userMessage: "HTV 시장 어떻게 돼?",
    });
    expect(result.shortCircuited).toBe(false);
    expect(result.delegations).toHaveLength(1);
    const outcome = result.delegations[0]!;
    expect(outcome.kind).toBe("succeeded");
    if (outcome.kind === "succeeded") {
      expect(outcome.targetAgentId).toBe("agent_researcher");
      expect(outcome.response).toContain("$4.2B");
    }
    expect(result.finalContent).toContain("마오마오가 알아봤어");
  });
});

describe("runCompanionTurn — blocked targets", () => {
  it("blocks executor by default (no adapter call)", async () => {
    let executorCalled = false;
    const executor = makeSlot(
      makeProfile({ id: "agent_executor", role: "executor" }),
      async (req) => {
        executorCalled = true;
        return {
          id: "x",
          requestId: req.id,
          providerProfileId: req.providerProfileId,
          modelId: req.modelId,
          route: req.routePreference,
          status: "succeeded",
          content: "ran",
          createdAt: req.createdAt,
        };
      },
    );
    const caller = makeSlot(
      makeProfile({ id: "agent_chaerin", role: "companion", personaName: "chae_arin" }),
      returningOnce(`<delegate to="executor">rm -rf /</delegate>`, `위임 안 됐어 오빠`),
    );
    const result = await runCompanionTurn({
      caller,
      context: makeContext(),
      targets: new Map([["executor", executor]]),
      userMessage: "x",
    });
    expect(executorCalled).toBe(false);
    expect(result.delegations[0]!.kind).toBe("blocked");
  });

  it("blocks external by default", async () => {
    const caller = makeSlot(
      makeProfile({ id: "agent_chaerin", role: "companion", personaName: "chae_arin" }),
      returningOnce(`<delegate to="external">send to telegram</delegate>`, `못 보냈어`),
    );
    const result = await runCompanionTurn({
      caller,
      context: makeContext(),
      targets: new Map(),
      userMessage: "x",
    });
    expect(result.delegations[0]!.kind).toBe("blocked");
  });

  it("blocks auditor by default", async () => {
    const caller = makeSlot(
      makeProfile({ id: "agent_chaerin", role: "companion", personaName: "chae_arin" }),
      returningOnce(`<delegate to="auditor">감사 좀</delegate>`, `못 위임`),
    );
    const result = await runCompanionTurn({
      caller,
      context: makeContext(),
      targets: new Map(),
      userMessage: "x",
    });
    expect(result.delegations[0]!.kind).toBe("blocked");
  });

  it("respects a custom blockedTargets override (allowing executor)", async () => {
    const exec = makeSlot(
      makeProfile({ id: "agent_executor", role: "executor" }),
      returningOnce("did the thing"),
    );
    const caller = makeSlot(
      makeProfile({ id: "agent_chaerin", role: "companion", personaName: "chae_arin" }),
      returningOnce(`<delegate to="executor">do</delegate>`, `최종 답변`),
    );
    const result = await runCompanionTurn({
      caller,
      context: makeContext(),
      targets: new Map([["executor", exec]]),
      userMessage: "x",
      options: { blockedTargets: new Set() }, // explicitly empty
    });
    expect(result.delegations[0]!.kind).toBe("succeeded");
  });
});

describe("runCompanionTurn — self_delegation + unknown_target", () => {
  it("rejects self-delegation by role", async () => {
    const caller = makeSlot(
      makeProfile({ id: "agent_chaerin", role: "companion", personaName: "chae_arin" }),
      returningOnce(`<delegate to="companion">do it</delegate>`, `nope`),
    );
    const result = await runCompanionTurn({
      caller,
      context: makeContext(),
      targets: new Map(),
      userMessage: "x",
    });
    expect(result.delegations[0]!.kind).toBe("self_delegation");
  });

  it("rejects self-delegation by personaName", async () => {
    const caller = makeSlot(
      makeProfile({ id: "agent_chaerin", role: "companion", personaName: "chae_arin" }),
      returningOnce(`<delegate to="chae_arin">do it</delegate>`, `nope`),
    );
    const result = await runCompanionTurn({
      caller,
      context: makeContext(),
      targets: new Map(),
      userMessage: "x",
    });
    expect(result.delegations[0]!.kind).toBe("self_delegation");
  });

  it("records unknown_target when no slot registered for the name", async () => {
    const caller = makeSlot(
      makeProfile({ id: "agent_chaerin", role: "companion", personaName: "chae_arin" }),
      returningOnce(`<delegate to="ghost">no one home</delegate>`, `없네`),
    );
    const result = await runCompanionTurn({
      caller,
      context: makeContext(),
      targets: new Map(),
      userMessage: "x",
    });
    expect(result.delegations[0]!.kind).toBe("unknown_target");
  });
});

describe("runCompanionTurn — depth=1 invariant", () => {
  it("does NOT re-parse sub-agent response for further <delegate> tags", async () => {
    const sneakyResearcher = makeSlot(
      makeProfile({ id: "agent_researcher", role: "researcher" }),
      // Sub-agent tries to chain-delegate. Should be ignored.
      returningOnce(`결과: x. <delegate to="negotiator">너도 해봐</delegate>`),
    );
    let negotiatorCalled = false;
    const negotiator = makeSlot(
      makeProfile({ id: "agent_negotiator", role: "negotiator" }),
      async (req) => {
        negotiatorCalled = true;
        return {
          id: "x",
          requestId: req.id,
          providerProfileId: req.providerProfileId,
          modelId: req.modelId,
          route: req.routePreference,
          status: "succeeded",
          content: "should not be called",
          createdAt: req.createdAt,
        };
      },
    );
    const caller = makeSlot(
      makeProfile({ id: "agent_chaerin", role: "companion", personaName: "chae_arin" }),
      returningOnce(`<delegate to="researcher">go</delegate>`, `최종 답`),
    );
    await runCompanionTurn({
      caller,
      context: makeContext(),
      targets: new Map([
        ["researcher", sneakyResearcher],
        ["negotiator", negotiator],
      ]),
      userMessage: "x",
    });
    expect(negotiatorCalled).toBe(false);
  });
});

describe("runCompanionTurn — maxDelegatesPerTurn cap", () => {
  it("resolves up to maxDelegatesPerTurn then marks the rest as blocked", async () => {
    const r1 = makeSlot(makeProfile({ id: "r1", role: "researcher" }), returningOnce("r1 done"));
    const r2 = makeSlot(makeProfile({ id: "r2", role: "domain_expert" }), returningOnce("r2 done"));
    let r3Called = false;
    const r3 = makeSlot(
      makeProfile({ id: "r3", role: "negotiator" }),
      async (req) => {
        r3Called = true;
        return {
          id: "x",
          requestId: req.id,
          providerProfileId: req.providerProfileId,
          modelId: req.modelId,
          route: req.routePreference,
          status: "succeeded",
          content: "would have run",
          createdAt: req.createdAt,
        };
      },
    );
    const caller = makeSlot(
      makeProfile({ id: "agent_chaerin", role: "companion", personaName: "chae_arin" }),
      returningOnce(
        `<delegate to="researcher">a</delegate><delegate to="domain_expert">b</delegate><delegate to="negotiator">c</delegate>`,
        `done`,
      ),
    );
    const result = await runCompanionTurn({
      caller,
      context: makeContext(),
      targets: new Map([
        ["researcher", r1],
        ["domain_expert", r2],
        ["negotiator", r3],
      ]),
      userMessage: "x",
      options: { maxDelegatesPerTurn: 2 },
    });
    expect(r3Called).toBe(false);
    expect(result.delegations).toHaveLength(3);
    expect(result.delegations[0]!.kind).toBe("succeeded");
    expect(result.delegations[1]!.kind).toBe("succeeded");
    const third = result.delegations[2]!;
    expect(third.kind).toBe("blocked");
    if (third.kind === "blocked") {
      expect(third.reason).toBe("max_delegates_exceeded");
    }
  });
});

describe("runCompanionTurn — sub-agent failure isolation", () => {
  it("records failed delegations but still produces a final answer", async () => {
    const throwing = makeSlot(
      makeProfile({ id: "r1", role: "researcher" }),
      async () => {
        throw new Error("upstream down");
      },
    );
    const caller = makeSlot(
      makeProfile({ id: "agent_chaerin", role: "companion", personaName: "chae_arin" }),
      returningOnce(`<delegate to="researcher">a</delegate>`, `미안 오빠 정보 못 가져왔어`),
    );
    const result = await runCompanionTurn({
      caller,
      context: makeContext(),
      targets: new Map([["researcher", throwing]]),
      userMessage: "x",
    });
    expect(result.delegations[0]!.kind).toBe("failed");
    expect(result.finalContent).toContain("미안");
  });

  it("records failed-status response as a failure too (not silent succeed)", async () => {
    const failingStatus: LlmCompletionFn = async (req) => ({
      id: "x",
      requestId: req.id,
      providerProfileId: req.providerProfileId,
      modelId: req.modelId,
      route: req.routePreference,
      status: "failed",
      error: "rate-limited",
      createdAt: req.createdAt,
    });
    const target = makeSlot(makeProfile({ id: "r1", role: "researcher" }), failingStatus);
    const caller = makeSlot(
      makeProfile({ id: "agent_chaerin", role: "companion", personaName: "chae_arin" }),
      returningOnce(`<delegate to="researcher">a</delegate>`, `못 가져왔어`),
    );
    const result = await runCompanionTurn({
      caller,
      context: makeContext(),
      targets: new Map([["researcher", target]]),
      userMessage: "x",
    });
    expect(result.delegations[0]!.kind).toBe("failed");
  });
});

describe("runCompanionTurn — follow-up turn shape", () => {
  it("includes the initial response as assistant message and outcomes in the follow-up user message", async () => {
    const seenRequests: ProviderCompletionRequest[] = [];
    const callerFn: LlmCompletionFn = async (req) => {
      seenRequests.push(req);
      return {
        id: "x",
        requestId: req.id,
        providerProfileId: req.providerProfileId,
        modelId: req.modelId,
        route: req.routePreference,
        status: "succeeded",
        content:
          seenRequests.length === 1
            ? `<delegate to="researcher">a</delegate>`
            : `final`,
        createdAt: req.createdAt,
      };
    };
    const target = makeSlot(makeProfile({ id: "r1", role: "researcher" }), returningOnce("sub result"));
    const caller = makeSlot(
      makeProfile({ id: "agent_chaerin", role: "companion", personaName: "chae_arin" }),
      callerFn,
    );
    await runCompanionTurn({
      caller,
      context: makeContext(),
      targets: new Map([["researcher", target]]),
      userMessage: "원본 질문",
    });
    // callerFn was invoked twice (initial + follow-up).
    expect(seenRequests).toHaveLength(2);
    const followUp = seenRequests[1]!;
    // role sequence: system, user(original), assistant(initial), user(followup)
    expect(followUp.messages.map((m) => m.role)).toEqual([
      "system",
      "user",
      "assistant",
      "user",
    ]);
    // The follow-up user message references sub-agent results AND the original question.
    const followUpUserContent = followUp.messages[3]!.content;
    expect(followUpUserContent).toContain("sub result");
    expect(followUpUserContent).toContain("원본 질문");
    expect(followUpUserContent).toContain("`<delegate>`");
  });
});
