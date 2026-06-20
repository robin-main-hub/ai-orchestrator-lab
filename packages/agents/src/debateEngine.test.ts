import { describe, expect, it } from "vitest";
import type {
  AgentProfile,
  AgentRole,
  DebateRound,
  DebateRoundKind,
  ProviderCompletionRequest,
  ProviderCompletionResponse,
} from "@ai-orchestrator/protocol";
import {
  applyDebateCrossLinks,
  buildRoundUserPrompt,
  createDebateRounds,
  debateHadPositionChanges,
  deriveStanceTrajectories,
  inferUtteranceTag,
  pickAgentsForRound,
  runDebateRound,
  tagPolarity,
  type DebateContext,
  type DebateEngineAgentSlot,
  type LlmCompletionFn,
} from "./index";
import type { DebateTag, DebateUtterance } from "@ai-orchestrator/protocol";

function makeProfile(overrides: Partial<AgentProfile> & { role: AgentRole; id: string }): AgentProfile {
  return {
    name: overrides.name ?? overrides.id,
    kind: "virtual",
    soulMode: "summary",
    configSource: "internal",
    enabled: overrides.enabled ?? true,
    permissionLevel: "read_only",
    ...overrides,
  };
}

function makeContext(overrides: Partial<DebateContext> = {}): DebateContext {
  return {
    sessionId: "session_test",
    problem: "어떻게 하면 debate engine을 작게 시작할 수 있는가?",
    conversationSummary: "사용자가 protocol-first 접근을 선호한다.",
    constraints: ["packages/agents는 providers에 의존하지 않는다."],
    openQuestions: ["라운드당 발화자 상한은 몇 명인가?"],
    userPreferences: ["테스트 가능한 인터페이스"],
    memoryTraceIds: [],
    ...overrides,
  };
}

function makeCompleteReturning(content: string): LlmCompletionFn {
  return async (request: ProviderCompletionRequest): Promise<ProviderCompletionResponse> => ({
    id: `resp_${request.id}`,
    requestId: request.id,
    providerProfileId: request.providerProfileId,
    modelId: request.modelId,
    route: request.routePreference,
    status: "succeeded",
    content,
    createdAt: request.createdAt,
  });
}

function makeCompleteFailing(status: "failed" | "fallback_required" = "failed", error = "synthetic"): LlmCompletionFn {
  return async (request: ProviderCompletionRequest): Promise<ProviderCompletionResponse> => ({
    id: `resp_${request.id}`,
    requestId: request.id,
    providerProfileId: request.providerProfileId,
    modelId: request.modelId,
    route: request.routePreference,
    status,
    error,
    createdAt: request.createdAt,
  });
}

function makeCompleteThrowing(message: string): LlmCompletionFn {
  return async () => {
    throw new Error(message);
  };
}

function defaultIdSeq(): () => string {
  let n = 0;
  return () => {
    n += 1;
    return `id${n}`;
  };
}

function defaultNowFrozen(): () => Date {
  return () => new Date("2026-05-25T00:00:00.000Z");
}

function makeSlot(profile: AgentProfile, content: string): DebateEngineAgentSlot {
  return {
    agent: profile,
    complete: makeCompleteReturning(content),
    systemPrompt: `you are ${profile.name}`,
    modelId: "mock-model",
  };
}

describe("pickAgentsForRound", () => {
  it("invites only roles listed for the round kind, in priority order", () => {
    const slots: DebateEngineAgentSlot[] = [
      makeSlot(makeProfile({ id: "a", role: "architect" }), "x"),
      // executor is NOT in any ROUND_ROLE_PRIORITY entry (intentional)
      makeSlot(makeProfile({ id: "e", role: "executor" }), "x"),
      makeSlot(makeProfile({ id: "o", role: "orchestrator" }), "x"),
      makeSlot(makeProfile({ id: "b", role: "builder" }), "x"),
    ];
    const picked = pickAgentsForRound("coding_packet", slots, 4);
    const roles = picked.map((s) => s.agent.role);
    expect(roles).not.toContain("executor");
    expect(roles[0]).toBe("orchestrator");
    expect(roles).toContain("architect");
    expect(roles).toContain("builder");
  });

  it("caps at the supplied max", () => {
    const slots: DebateEngineAgentSlot[] = [
      makeSlot(makeProfile({ id: "o", role: "orchestrator" }), "x"),
      makeSlot(makeProfile({ id: "a", role: "architect" }), "x"),
      makeSlot(makeProfile({ id: "b", role: "builder" }), "x"),
      makeSlot(makeProfile({ id: "s", role: "skeptic" }), "x"),
      makeSlot(makeProfile({ id: "r", role: "reviewer" }), "x"),
    ];
    const picked = pickAgentsForRound("initial_proposals", slots, 2);
    expect(picked).toHaveLength(2);
  });

  it("hard-caps at 6 even if a caller asks for more", () => {
    const slots: DebateEngineAgentSlot[] = Array.from({ length: 10 }, (_, i) =>
      makeSlot(makeProfile({ id: `o${i}`, role: "orchestrator" }), "x"),
    );
    const picked = pickAgentsForRound("problem_definition", slots, 99);
    expect(picked.length).toBeLessThanOrEqual(6);
  });

  it("skips disabled agents", () => {
    const slots: DebateEngineAgentSlot[] = [
      makeSlot(makeProfile({ id: "off", role: "orchestrator", enabled: false }), "x"),
      makeSlot(makeProfile({ id: "on", role: "orchestrator" }), "x"),
    ];
    const picked = pickAgentsForRound("problem_definition", slots, 4);
    expect(picked.map((s) => s.agent.id)).toEqual(["on"]);
  });

  it("falls back to empty when no eligible role matches", () => {
    const slots: DebateEngineAgentSlot[] = [
      makeSlot(makeProfile({ id: "ext", role: "external" }), "x"),
    ];
    // external is not in any ROUND_ROLE_PRIORITY entry (intentional)
    const picked = pickAgentsForRound("coding_packet", slots, 4);
    expect(picked).toEqual([]);
  });

  it("respects the sorting hierarchy (override, default, canonical, priority, tie-breaker)", () => {
    // 1. Tie-breaker alphabetical sorting:
    const slotsAlphabetical = [
      makeSlot(makeProfile({ id: "agent_skeptic_yohane", role: "skeptic", personaName: "yohane" }), "x"),
      makeSlot(makeProfile({ id: "agent_skeptic_asuka", role: "skeptic", personaName: "asuka" }), "x"),
    ];
    const picked1 = pickAgentsForRound("initial_proposals", slotsAlphabetical, 1);
    expect(picked1[0]!.agent.id).toBe("agent_skeptic_asuka");

    // 2. Priority:
    const slotsPriority = [
      makeSlot(makeProfile({ id: "agent_skeptic_yohane", role: "skeptic", personaName: "yohane", priority: 10 }), "x"),
      makeSlot(makeProfile({ id: "agent_skeptic_asuka", role: "skeptic", personaName: "asuka", priority: 5 }), "x"),
    ];
    const picked2 = pickAgentsForRound("initial_proposals", slotsPriority, 1);
    expect(picked2[0]!.agent.id).toBe("agent_skeptic_yohane");

    // 3. isCanonical:
    const slotsCanonical = [
      makeSlot(makeProfile({ id: "agent_skeptic_yohane", role: "skeptic", personaName: "yohane", priority: 20 }), "x"),
      makeSlot(makeProfile({ id: "agent_skeptic_asuka", role: "skeptic", isCanonical: true, priority: 5 }), "x"),
    ];
    const picked3 = pickAgentsForRound("initial_proposals", slotsCanonical, 1);
    expect(picked3[0]!.agent.id).toBe("agent_skeptic_asuka");

    // 4. isDefault:
    const slotsDefault = [
      makeSlot(makeProfile({ id: "agent_skeptic_yohane", role: "skeptic", personaName: "yohane", isDefault: true, priority: 5 }), "x"),
      makeSlot(makeProfile({ id: "agent_skeptic_asuka", role: "skeptic", isCanonical: true, priority: 20 }), "x"),
    ];
    const picked4 = pickAgentsForRound("initial_proposals", slotsDefault, 1);
    expect(picked4[0]!.agent.id).toBe("agent_skeptic_yohane");

    // 5. User-Explicit Override:
    const slotsOverride = [
      makeSlot(makeProfile({ id: "agent_skeptic_yohane", role: "skeptic", personaName: "yohane", isDefault: true }), "x"),
      makeSlot(makeProfile({ id: "agent_skeptic_asuka", role: "skeptic", personaName: "asuka" }), "x"),
    ];
    const picked5 = pickAgentsForRound("initial_proposals", slotsOverride, 1, {
      activePersonaOverrides: { skeptic: "agent_skeptic_asuka" },
    });
    expect(picked5[0]!.agent.id).toBe("agent_skeptic_asuka");
  });

  it("applies 2-Pass selection (diversity first, then multi-persona expansion)", () => {
    const slots = [
      makeSlot(makeProfile({ id: "agent_architect_1", role: "architect", isCanonical: true }), "x"),
      makeSlot(makeProfile({ id: "agent_architect_2", role: "architect", personaName: "arch2" }), "x"),
      makeSlot(makeProfile({ id: "agent_skeptic_1", role: "skeptic", isCanonical: true }), "x"),
      makeSlot(makeProfile({ id: "agent_skeptic_2", role: "skeptic", personaName: "skeptic2" }), "x"),
    ];

    const pickedNoMulti = pickAgentsForRound("initial_proposals", slots, 3);
    expect(pickedNoMulti.map(s => s.agent.id)).toEqual(["agent_architect_1", "agent_skeptic_1"]);

    const pickedWithArchitectMulti = pickAgentsForRound("initial_proposals", slots, 3, {
      allowMultiPersonaRoles: ["architect"],
    });
    expect(pickedWithArchitectMulti.map(s => s.agent.id)).toEqual(["agent_architect_1", "agent_skeptic_1", "agent_architect_2"]);
  });

  it("round-robins multi-persona expansion across allowed roles", () => {
    const slots = [
      makeSlot(makeProfile({ id: "agent_architect_1", role: "architect", isCanonical: true }), "x"),
      makeSlot(makeProfile({ id: "agent_architect_2", role: "architect", personaName: "arch2", priority: 30 }), "x"),
      makeSlot(makeProfile({ id: "agent_architect_3", role: "architect", personaName: "arch3", priority: 20 }), "x"),
      makeSlot(makeProfile({ id: "agent_skeptic_1", role: "skeptic", isCanonical: true }), "x"),
      makeSlot(makeProfile({ id: "agent_skeptic_2", role: "skeptic", personaName: "skeptic2", priority: 30 }), "x"),
    ];

    const picked = pickAgentsForRound("initial_proposals", slots, 4, {
      allowMultiPersonaRoles: ["architect", "skeptic"],
    });

    expect(picked.map((slot) => slot.agent.id)).toEqual([
      "agent_architect_1",
      "agent_skeptic_1",
      "agent_architect_2",
      "agent_skeptic_2",
    ]);
  });
});

describe("inferUtteranceTag", () => {
  it("uses the explicit [[tag:...]] marker when present", () => {
    expect(inferUtteranceTag("blah blah [[tag:objection]]", "initial_proposals")).toBe("objection");
    expect(inferUtteranceTag("text [[tag:risk]] more", "refinement")).toBe("risk");
  });

  it("falls back to round-kind default when no marker is present", () => {
    expect(inferUtteranceTag("no marker here", "cross_critique")).toBe("objection");
    expect(inferUtteranceTag("no marker", "coding_packet")).toBe("coding_impact");
    expect(inferUtteranceTag("no marker", "final_decision")).toBe("agreement");
  });

  it("is case-insensitive on the marker keyword", () => {
    expect(inferUtteranceTag("X [[TAG:EVIDENCE]]", "initial_proposals")).toBe("evidence");
  });

  it("ignores unknown tag values and falls back", () => {
    expect(inferUtteranceTag("[[tag:nonsense]]", "initial_proposals")).toBe("evidence");
  });
});

describe("buildRoundUserPrompt", () => {
  it("includes round title, kind, problem, and the agent name", () => {
    const rounds = createDebateRounds("debate_x");
    const ctx = makeContext();
    const profile = makeProfile({ id: "a", name: "Architect", role: "architect" });
    const prompt = buildRoundUserPrompt(rounds[0]!, ctx, profile);
    expect(prompt).toContain(rounds[0]!.title);
    expect(prompt).toContain(rounds[0]!.kind);
    expect(prompt).toContain(ctx.problem);
    expect(prompt).toContain("Architect");
    expect(prompt).toContain("architect");
    expect(prompt).toContain("[[tag:");
  });

  it("includes prior utterances when present", () => {
    const rounds = createDebateRounds("debate_y");
    const round: DebateRound = {
      ...rounds[0]!,
      utterances: [
        {
          id: "u1",
          agentId: "agent_x",
          roundId: rounds[0]!.id,
          content: "이전 발언입니다.",
          tags: ["evidence"],
          createdAt: "2026-05-25T00:00:00.000Z",
        },
      ],
    };
    const prompt = buildRoundUserPrompt(round, makeContext(), makeProfile({ id: "a", role: "architect" }));
    expect(prompt).toContain("이전 발언입니다.");
  });

  it("truncates an overlong prior utterance", () => {
    const rounds = createDebateRounds("debate_z");
    const long = "x".repeat(2000);
    const round: DebateRound = {
      ...rounds[0]!,
      utterances: [
        {
          id: "u1",
          agentId: "agent_x",
          roundId: rounds[0]!.id,
          content: long,
          tags: ["evidence"],
          createdAt: "2026-05-25T00:00:00.000Z",
        },
      ],
    };
    const prompt = buildRoundUserPrompt(round, makeContext(), makeProfile({ id: "a", role: "architect" }));
    expect(prompt).toContain("…");
    expect(prompt.length).toBeLessThan(long.length + 1500);
  });
});

describe("runDebateRound", () => {
  function freshRound(kind: DebateRoundKind = "problem_definition"): DebateRound {
    const rounds = createDebateRounds("debate_run");
    const found = rounds.find((r) => r.kind === kind);
    if (!found) throw new Error(`no round of kind ${kind}`);
    return found;
  }

  it("collects one utterance per invited agent on the happy path", async () => {
    const slots: DebateEngineAgentSlot[] = [
      makeSlot(makeProfile({ id: "o", role: "orchestrator" }), "오케스트레이터의 응답"),
      makeSlot(makeProfile({ id: "a", role: "architect" }), "아키텍트의 응답 [[tag:evidence]]"),
      makeSlot(makeProfile({ id: "s", role: "skeptic" }), "스켑틱 [[tag:objection]]"),
    ];
    const result = await runDebateRound({
      debateId: "debate_run",
      round: freshRound("problem_definition"),
      context: makeContext(),
      slots,
      options: { now: defaultNowFrozen(), generateId: defaultIdSeq() },
    });
    expect(result.agentErrors).toEqual([]);
    expect(result.utterances).toHaveLength(3);
    const byAgent = new Map(result.utterances.map((u) => [u.agentId, u]));
    expect(byAgent.get("a")!.tags[0]).toBe("evidence");
    expect(byAgent.get("s")!.tags[0]).toBe("objection");
    // orchestrator had no marker, uses round-kind default
    expect(byAgent.get("o")!.tags[0]).toBe("evidence");
  });

  it("isolates a single throwing adapter without blocking the others", async () => {
    const slots: DebateEngineAgentSlot[] = [
      makeSlot(makeProfile({ id: "o", role: "orchestrator" }), "ok"),
      {
        agent: makeProfile({ id: "a", role: "architect" }),
        complete: makeCompleteThrowing("boom"),
        systemPrompt: "x",
        modelId: "mock",
      },
      makeSlot(makeProfile({ id: "s", role: "skeptic" }), "ok2"),
    ];
    const result = await runDebateRound({
      debateId: "debate_run",
      round: freshRound("problem_definition"),
      context: makeContext(),
      slots,
      options: { generateId: defaultIdSeq() },
    });
    expect(result.utterances).toHaveLength(2);
    expect(result.agentErrors).toEqual([{ agentId: "a", reason: "boom" }]);
  });

  it("records a failed-status response as agentError rather than utterance", async () => {
    const slots: DebateEngineAgentSlot[] = [
      {
        agent: makeProfile({ id: "o", role: "orchestrator" }),
        complete: makeCompleteFailing("failed", "rate-limited"),
        systemPrompt: "x",
        modelId: "mock",
      },
      makeSlot(makeProfile({ id: "a", role: "architect" }), "ok"),
    ];
    const result = await runDebateRound({
      debateId: "debate_run",
      round: freshRound("problem_definition"),
      context: makeContext(),
      slots,
      options: { generateId: defaultIdSeq() },
    });
    expect(result.utterances.map((u) => u.agentId)).toEqual(["a"]);
    expect(result.agentErrors).toEqual([{ agentId: "o", reason: "rate-limited" }]);
  });

  it("records a fallback_required response as an agentError too", async () => {
    const slots: DebateEngineAgentSlot[] = [
      {
        agent: makeProfile({ id: "o", role: "orchestrator" }),
        complete: makeCompleteFailing("fallback_required", "primary down"),
        systemPrompt: "x",
        modelId: "mock",
      },
    ];
    const result = await runDebateRound({
      debateId: "debate_run",
      round: freshRound("problem_definition"),
      context: makeContext(),
      slots,
      options: { generateId: defaultIdSeq() },
    });
    expect(result.utterances).toEqual([]);
    expect(result.agentErrors[0]!.reason).toBe("primary down");
  });

  it("forwards modelId, sessionId, and routePreference into the request", async () => {
    let seen: ProviderCompletionRequest | undefined;
    const slots: DebateEngineAgentSlot[] = [
      {
        agent: makeProfile({ id: "o", role: "orchestrator", providerProfileId: "prov_x" }),
        complete: async (req) => {
          seen = req;
          return {
            id: "x",
            requestId: req.id,
            providerProfileId: req.providerProfileId,
            modelId: req.modelId,
            route: req.routePreference,
            status: "succeeded",
            content: "ok",
            createdAt: req.createdAt,
          };
        },
        systemPrompt: "system here",
        modelId: "claude-sonnet-x",
      },
    ];
    await runDebateRound({
      debateId: "debate_run",
      round: freshRound("problem_definition"),
      context: makeContext({ sessionId: "session_xyz" }),
      slots,
      options: { routePreference: "direct_provider", generateId: defaultIdSeq() },
    });
    expect(seen).toBeDefined();
    expect(seen!.sessionId).toBe("session_xyz");
    expect(seen!.modelId).toBe("claude-sonnet-x");
    expect(seen!.routePreference).toBe("direct_provider");
    expect(seen!.providerProfileId).toBe("prov_x");
    expect(seen!.source).toBe("agent");
    // first message is the system prompt
    expect(seen!.messages[0]!.role).toBe("system");
    expect(seen!.messages[0]!.content).toBe("system here");
    // second message contains the round user prompt
    expect(seen!.messages[1]!.role).toBe("user");
    expect(seen!.messages[1]!.content).toContain("문제 정의");
  });

  it("respects maxUtterancesPerRound", async () => {
    const slots: DebateEngineAgentSlot[] = [
      makeSlot(makeProfile({ id: "o", role: "orchestrator" }), "ok"),
      makeSlot(makeProfile({ id: "a", role: "architect" }), "ok"),
      makeSlot(makeProfile({ id: "s", role: "skeptic" }), "ok"),
    ];
    const result = await runDebateRound({
      debateId: "debate_run",
      round: freshRound("problem_definition"),
      context: makeContext(),
      slots,
      options: { maxUtterancesPerRound: 2, generateId: defaultIdSeq() },
    });
    expect(result.utterances).toHaveLength(2);
  });

  it("forwards timeoutMs to the adapter context", async () => {
    let seenTimeout: number | undefined;
    const slots: DebateEngineAgentSlot[] = [
      {
        agent: makeProfile({ id: "o", role: "orchestrator" }),
        complete: async (req, ctx) => {
          seenTimeout = ctx.timeoutMs;
          return {
            id: "x",
            requestId: req.id,
            providerProfileId: req.providerProfileId,
            modelId: req.modelId,
            route: req.routePreference,
            status: "succeeded",
            content: "ok",
            createdAt: req.createdAt,
          };
        },
        systemPrompt: "x",
        modelId: "mock",
      },
    ];
    await runDebateRound({
      debateId: "debate_run",
      round: freshRound("problem_definition"),
      context: makeContext(),
      slots,
      options: { perAgentTimeoutMs: 1234, generateId: defaultIdSeq() },
    });
    expect(seenTimeout).toBe(1234);
  });

  it("calls resolveSecret when provided", async () => {
    let resolved = false;
    const slots: DebateEngineAgentSlot[] = [
      {
        agent: makeProfile({ id: "o", role: "orchestrator" }),
        complete: async (req, ctx) => {
          await ctx.resolveSecret();
          return {
            id: "x",
            requestId: req.id,
            providerProfileId: req.providerProfileId,
            modelId: req.modelId,
            route: req.routePreference,
            status: "succeeded",
            content: "ok",
            createdAt: req.createdAt,
          };
        },
        systemPrompt: "x",
        modelId: "mock",
        resolveSecret: async () => {
          resolved = true;
          return "tok";
        },
      },
    ];
    await runDebateRound({
      debateId: "debate_run",
      round: freshRound("problem_definition"),
      context: makeContext(),
      slots,
      options: { generateId: defaultIdSeq() },
    });
    expect(resolved).toBe(true);
  });
});

// The four stance/cross-link pure helpers below are 0-ref in this suite:
// tagPolarity, deriveStanceTrajectories, debateHadPositionChanges, and
// applyDebateCrossLinks. They turn a flat utterance log into the "did anyone
// actually change their mind?" signal (parallel-monologue detection) and wire
// [[accept/reject/ref:X]] markers into the schema's acceptedBy/rejectedBy/
// parentUtteranceId fields. Pin the mapping, flip-counting/neutral-skip, summary
// text, self-citation exclusion, most-recent-first resolution, and parent-once.
function makeUtterance(
  overrides: Partial<DebateUtterance> & { id: string; agentId: string },
): DebateUtterance {
  return {
    roundId: "round1",
    content: "",
    tags: ["evidence"],
    createdAt: "2026-05-25T00:00:00.000Z",
    ...overrides,
  };
}

function makeRound(
  id: string,
  utterances: DebateUtterance[],
  overrides: Partial<DebateRound> = {},
): DebateRound {
  return {
    id,
    debateId: "debate1",
    kind: "cross_critique",
    title: id,
    status: "completed",
    utterances,
    ...overrides,
  };
}

describe("debateEngine — stance trajectories & cross-link markers (0-ref pure helpers)", () => {
  it("tagPolarity maps each DebateTag to a stance: agreement→support, objection/risk→oppose, evidence/coding_impact→neutral", () => {
    const expected: Record<DebateTag, ReturnType<typeof tagPolarity>> = {
      agreement: "support",
      objection: "oppose",
      risk: "oppose",
      evidence: "neutral",
      coding_impact: "neutral",
    };
    for (const tag of Object.keys(expected) as DebateTag[]) {
      expect(tagPolarity(tag)).toBe(expected[tag]);
    }
  });

  it("deriveStanceTrajectories groups by agent in encounter order, skips neutral points, and counts decisive flips", () => {
    const rounds = [
      makeRound("r1", [
        makeUtterance({ id: "a1", agentId: "agentA", tags: ["agreement"] }), // support
        makeUtterance({ id: "b1", agentId: "agentB", tags: ["agreement"] }), // support
      ]),
      makeRound("r2", [
        makeUtterance({ id: "a2", agentId: "agentA", tags: ["evidence"] }), // neutral → skipped
        makeUtterance({ id: "b2", agentId: "agentB", tags: ["objection"] }), // oppose → flip
      ]),
      makeRound("r3", [
        makeUtterance({ id: "a3", agentId: "agentA", tags: ["agreement"] }), // support, no flip
      ]),
    ];

    const trajectories = deriveStanceTrajectories(rounds);
    expect(trajectories.map((t) => t.agentId)).toEqual(["agentA", "agentB"]);

    const a = trajectories[0]!;
    expect(a.points).toHaveLength(3);
    expect(a.points[1]!.polarity).toBe("neutral"); // the evidence point is kept but does not reset lastDecisive
    expect(a.points.every((p) => p.changed === false)).toBe(true);
    expect(a.changeCount).toBe(0);
    expect(a.finalPolarity).toBe("support");
    expect(a.summary).toBe("일관된 지지");

    const b = trajectories[1]!;
    expect(b.points[0]!.changed).toBe(false);
    expect(b.points[1]!.changed).toBe(true); // support→oppose is the decisive flip
    expect(b.changeCount).toBe(1);
    expect(b.finalPolarity).toBe("oppose");
    expect(b.summary).toBe("1회 입장 변화 → 최종 반대");
  });

  it("deriveStanceTrajectories defaults empty tags to evidence(neutral) and reports 입장 표명 없음 for all-neutral agents", () => {
    const rounds = [
      makeRound("r1", [
        makeUtterance({ id: "n1", agentId: "ghost", tags: [] }), // empty → evidence default
        makeUtterance({ id: "n2", agentId: "ghost", tags: ["coding_impact"] }), // neutral
      ]),
    ];
    const t = deriveStanceTrajectories(rounds)[0]!;
    expect(t.points[0]!.tag).toBe("evidence");
    expect(t.points.every((p) => p.polarity === "neutral")).toBe(true);
    expect(t.changeCount).toBe(0);
    expect(t.finalPolarity).toBe("neutral");
    expect(t.summary).toBe("입장 표명 없음");
  });

  it("debateHadPositionChanges is false for parallel monologue and true once any agent flips polarity", () => {
    const stable = [
      makeRound("r1", [
        makeUtterance({ id: "s1", agentId: "x", tags: ["agreement"] }),
        makeUtterance({ id: "s2", agentId: "x", tags: ["agreement"] }),
      ]),
    ];
    expect(debateHadPositionChanges(stable)).toBe(false);

    const flipped = [
      makeRound("r1", [
        makeUtterance({ id: "f1", agentId: "x", tags: ["agreement"] }),
        makeUtterance({ id: "f2", agentId: "x", tags: ["objection"] }),
      ]),
    ];
    expect(debateHadPositionChanges(flipped)).toBe(true);
  });

  it("applyDebateCrossLinks records accept/reject citers on the target, excludes self-citation, and passes unmarked utterances through by identity", () => {
    const uPlain = makeUtterance({ id: "u_plain", agentId: "watcher", content: "마커 없음" });
    const rounds = [
      makeRound("r1", [makeUtterance({ id: "u_alpha", agentId: "architect_alpha", content: "초안 제시" })]),
      makeRound("r2", [
        makeUtterance({ id: "u_beta", agentId: "reviewer_beta", content: "[[accept:alpha]] 좋다" }),
        makeUtterance({ id: "u_gamma", agentId: "skeptic_gamma", content: "[[reject:alpha]] 위험" }),
        makeUtterance({ id: "u_self", agentId: "architect_alpha", content: "[[accept:alpha]] 자기인용" }),
        uPlain,
      ]),
    ];

    const result = applyDebateCrossLinks(rounds);
    const byId = new Map(result.flatMap((r) => r.utterances).map((u) => [u.id, u]));

    expect(byId.get("u_alpha")!.acceptedBy).toEqual(["reviewer_beta"]); // self never added
    expect(byId.get("u_alpha")!.acceptedBy).not.toContain("architect_alpha");
    expect(byId.get("u_alpha")!.rejectedBy).toEqual(["skeptic_gamma"]);
    expect(byId.get("u_beta")!.parentUtteranceId).toBe("u_alpha"); // critique points back to the criticized
    expect(byId.get("u_gamma")!.parentUtteranceId).toBe("u_alpha");
    expect(byId.get("u_self")!.parentUtteranceId).toBeUndefined(); // self-citation resolves to nothing
    expect(byId.get("u_plain")).toBe(uPlain); // unmarked utterance returned by reference
  });

  it("applyDebateCrossLinks resolves ref markers to the most-recent matching prior utterance and sets parentUtteranceId only once", () => {
    const rounds = [
      makeRound("r1", [
        makeUtterance({ id: "uA1", agentId: "alpha_one", content: "첫번째" }),
        makeUtterance({ id: "uA2", agentId: "alpha_two", content: "두번째" }),
      ]),
      makeRound("r2", [
        makeUtterance({ id: "uRef", agentId: "ref_agent", content: "[[ref:alpha]]" }),
        makeUtterance({ id: "uOnce", agentId: "once_agent", content: "[[ref:one]] [[ref:two]]" }),
      ]),
    ];

    const result = applyDebateCrossLinks(rounds);
    const byId = new Map(result.flatMap((r) => r.utterances).map((u) => [u.id, u]));

    expect(byId.get("uRef")!.parentUtteranceId).toBe("uA2"); // both match "alpha"; most recent wins
    expect(byId.get("uA2")!.acceptedBy).toBeUndefined(); // ref does not record a citer
    expect(byId.get("uA2")!.rejectedBy).toBeUndefined();
    expect(byId.get("uOnce")!.parentUtteranceId).toBe("uA1"); // first ref token (one) wins; second never overwrites
  });
});

// The "sorting hierarchy" test above walks compareAgents steps 1 (override),
// 3 (isDefault), 4 (isCanonical), 5 (priority) and 6 (alphabetical) — but never
// step 2, `rolePersonaPriorities`. That tier is wired all the way through
// pickAgentsForRound's options yet no test feeds it, so its three arms — both ids
// in the list (return indexA-indexB), exactly one in the list (the listed id
// wins), and neither in the list (fall through to the lower tiers) — are unpinned.
// Pin them, self-consistent (the list is made to FIGHT the priority tier so the
// win can only come from step 2, never from step 5).
describe("debateEngine — pickAgentsForRound honors rolePersonaPriorities (compareAgents step 2)", () => {
  // arch_a would win on priority (99 > 1); the rolePersonaPriorities list is the
  // only thing that can flip the pick, so every assertion isolates step 2.
  const archA = () => makeSlot(makeProfile({ id: "agent_arch_a", role: "architect", personaName: "a", priority: 99 }), "x");
  const archB = () => makeSlot(makeProfile({ id: "agent_arch_b", role: "architect", personaName: "b", priority: 1 }), "x");

  it("baseline (no list): the higher-priority persona wins via step 5", () => {
    const picked = pickAgentsForRound("initial_proposals", [archA(), archB()], 1);
    expect(picked[0]!.agent.id).toBe("agent_arch_a"); // priority 99 beats 1
  });

  it("both ids in the list: order follows the list index, overriding the priority tier", () => {
    const picked = pickAgentsForRound("initial_proposals", [archA(), archB()], 1, {
      rolePersonaPriorities: { architect: ["agent_arch_b", "agent_arch_a"] }, // b first
    });
    expect(picked[0]!.agent.id).toBe("agent_arch_b"); // index 0 < index 1 ⇒ b, despite a's higher priority
  });

  it("exactly one id in the list: the listed persona wins even with lower priority", () => {
    const picked = pickAgentsForRound("initial_proposals", [archA(), archB()], 1, {
      rolePersonaPriorities: { architect: ["agent_arch_b"] }, // only b listed
    });
    expect(picked[0]!.agent.id).toBe("agent_arch_b"); // in-list (-1) beats not-in-list, regardless of priority
  });

  it("neither id in the list: step 2 is a no-op and the pick falls through to the priority tier", () => {
    const picked = pickAgentsForRound("initial_proposals", [archA(), archB()], 1, {
      rolePersonaPriorities: { architect: ["agent_arch_ghost"] }, // neither real id listed
    });
    expect(picked[0]!.agent.id).toBe("agent_arch_a"); // both indexes -1 ⇒ fall through ⇒ priority 99 wins
  });
});
