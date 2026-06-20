import { describe, expect, it } from "vitest";
import type { AgentProfile, CodingPacket, DebateRound } from "@ai-orchestrator/protocol";
import {
  advanceDebateRound,
  assertSafeCodingPacket,
  blockDebateRound,
  createCodingPacketDraft,
  createDebateRounds,
  createMockUtterance,
  defaultAgentProfiles,
  getActiveDebateRound,
  validateCodingPacketSafety,
  type DebateContext,
} from "./index";

const NULL_CHAR = String.fromCharCode(0);

function basePacket(overrides: Partial<CodingPacket> = {}): CodingPacket {
  return {
    goal: "goal",
    context: ["ctx"],
    decisions: ["d1"],
    rejectedOptions: ["r1"],
    constraints: ["c1"],
    filesToInspect: ["packages/agents/src/index.ts"],
    implementationPlan: ["step 1"],
    verificationPlan: ["pnpm test"],
    reviewerNotes: ["note 1"],
    ...overrides,
  };
}

describe("debate round lifecycle", () => {
  it("seeds the first round as running and the rest as pending", () => {
    const rounds = createDebateRounds("debate_a");
    expect(rounds).toHaveLength(7);
    expect(rounds[0]!.status).toBe("running");
    expect(rounds.slice(1).every((round) => round.status === "pending")).toBe(true);
  });

  it("getActiveDebateRound returns the currently running round", () => {
    const rounds = createDebateRounds("debate_b");
    expect(getActiveDebateRound(rounds)?.id).toBe(rounds[0]!.id);
  });

  it("returns undefined when no round is running", () => {
    const rounds = createDebateRounds("debate_c").map((round) => ({ ...round, status: "pending" as const }));
    expect(getActiveDebateRound(rounds)).toBeUndefined();
  });

  it("advances from a running round to the next pending round", () => {
    const rounds = createDebateRounds("debate_d");
    const result = advanceDebateRound(rounds, rounds[0]!.id);
    expect(result.finished).toBe(false);
    expect(result.nextRunningRoundId).toBe(rounds[1]!.id);
    expect(result.rounds[0]!.status).toBe("completed");
    expect(result.rounds[1]!.status).toBe("running");
  });

  it("marks finished when the last round completes", () => {
    let rounds = createDebateRounds("debate_e");
    for (let index = 0; index < 7; index += 1) {
      const active = getActiveDebateRound(rounds);
      expect(active).toBeDefined();
      const result = advanceDebateRound(rounds, active!.id);
      rounds = result.rounds;
      if (index === 6) {
        expect(result.finished).toBe(true);
        expect(result.nextRunningRoundId).toBeUndefined();
      } else {
        expect(result.finished).toBe(false);
        expect(result.nextRunningRoundId).toBeDefined();
      }
    }
    expect(rounds.every((round) => round.status === "completed")).toBe(true);
  });

  it("throws when advancing an unknown round id", () => {
    const rounds = createDebateRounds("debate_f");
    expect(() => advanceDebateRound(rounds, "missing")).toThrow(/not found/);
  });

  it("throws when re-advancing a completed round", () => {
    const rounds = createDebateRounds("debate_g");
    const first = advanceDebateRound(rounds, rounds[0]!.id);
    expect(() => advanceDebateRound(first.rounds, rounds[0]!.id)).toThrow(/already completed/);
  });

  it("throws when advancing a pending round out of order", () => {
    const rounds = createDebateRounds("debate_pending");
    expect(() => advanceDebateRound(rounds, rounds[2]!.id)).toThrow(/not running/);
  });

  it("throws when advancing a blocked round", () => {
    const rounds = createDebateRounds("debate_h");
    const blocked = blockDebateRound(rounds, rounds[0]!.id);
    expect(() => advanceDebateRound(blocked, rounds[0]!.id)).toThrow(/blocked/);
  });

  it("blockDebateRound marks the round blocked", () => {
    const rounds = createDebateRounds("debate_i");
    const blocked = blockDebateRound(rounds, rounds[2]!.id);
    expect(blocked[2]!.status).toBe("blocked");
  });

  it("blockDebateRound refuses an already completed round", () => {
    const rounds = createDebateRounds("debate_j");
    const advanced = advanceDebateRound(rounds, rounds[0]!.id).rounds;
    expect(() => blockDebateRound(advanced, rounds[0]!.id)).toThrow(/completed/);
  });

  it("blockDebateRound refuses an unknown round id", () => {
    const rounds = createDebateRounds("debate_k");
    expect(() => blockDebateRound(rounds, "missing")).toThrow(/not found/);
  });

  it("skips already completed rounds when picking the next pending", () => {
    const rounds: DebateRound[] = createDebateRounds("debate_l").map((round, index) => {
      if (index === 0) return { ...round, status: "running" as const };
      if (index === 1) return { ...round, status: "completed" as const };
      return round;
    });
    const result = advanceDebateRound(rounds, rounds[0]!.id);
    expect(result.nextRunningRoundId).toBe(rounds[2]!.id);
  });
});

describe("validateCodingPacketSafety", () => {
  it("accepts a normal packet", () => {
    const result = validateCodingPacketSafety(basePacket());
    expect(result.safe).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it("rejects parent-directory traversal in filesToInspect", () => {
    const result = validateCodingPacketSafety(
      basePacket({ filesToInspect: ["../../etc/passwd"] }),
    );
    expect(result.safe).toBe(false);
    expect(result.sanitized.filesToInspect).toEqual([]);
    expect(result.violations.join(" ")).toMatch(/traversal/);
  });

  it("rejects unix absolute paths", () => {
    const result = validateCodingPacketSafety(
      basePacket({ filesToInspect: ["/etc/passwd"] }),
    );
    expect(result.safe).toBe(false);
    expect(result.violations.join(" ")).toMatch(/absolute/);
  });

  it("rejects windows absolute paths", () => {
    const result = validateCodingPacketSafety(
      basePacket({ filesToInspect: ["C:\\Windows\\System32\\config"] }),
    );
    expect(result.safe).toBe(false);
    expect(result.violations.join(" ")).toMatch(/absolute/);
  });

  it("rejects paths containing null bytes", () => {
    const result = validateCodingPacketSafety(
      basePacket({ filesToInspect: [`packages/agents/src/index.ts${NULL_CHAR}.bak`] }),
    );
    expect(result.safe).toBe(false);
    expect(result.violations.join(" ")).toMatch(/null byte/);
  });

  it("rejects empty file entries", () => {
    const result = validateCodingPacketSafety(
      basePacket({ filesToInspect: [""] }),
    );
    expect(result.safe).toBe(false);
    expect(result.violations.join(" ")).toMatch(/empty/);
  });

  it("rejects overlong plan entries", () => {
    const result = validateCodingPacketSafety(
      basePacket({ implementationPlan: ["x".repeat(4001)] }),
    );
    expect(result.safe).toBe(false);
    expect(result.violations.join(" ")).toMatch(/exceeds 4000/);
  });

  it("truncates lists longer than 100 and records a violation", () => {
    const longList = Array.from({ length: 150 }, (_, index) => `file-${index}.ts`);
    const result = validateCodingPacketSafety(
      basePacket({ filesToInspect: longList }),
    );
    expect(result.safe).toBe(false);
    expect(result.sanitized.filesToInspect).toHaveLength(100);
    expect(result.violations.join(" ")).toMatch(/exceeds 100/);
  });

  it("keeps safe siblings when one entry is unsafe", () => {
    const result = validateCodingPacketSafety(
      basePacket({
        filesToInspect: ["packages/protocol/src/index.ts", "../../escape"],
      }),
    );
    expect(result.safe).toBe(false);
    expect(result.sanitized.filesToInspect).toEqual(["packages/protocol/src/index.ts"]);
  });
});

describe("validateCodingPacketSafety — goal", () => {
  it("rejects an empty goal", () => {
    const result = validateCodingPacketSafety(basePacket({ goal: "" }));
    expect(result.safe).toBe(false);
    expect(result.sanitized.goal).toBe("");
    expect(result.violations.join(" ")).toMatch(/goal:.*empty/);
  });

  it("rejects a goal containing a null byte", () => {
    const result = validateCodingPacketSafety(
      basePacket({ goal: `valid goal${NULL_CHAR}smuggled` }),
    );
    expect(result.safe).toBe(false);
    expect(result.sanitized.goal).toBe("");
    expect(result.violations.join(" ")).toMatch(/goal:.*null byte/);
  });

  it("rejects an overlong goal", () => {
    const result = validateCodingPacketSafety(
      basePacket({ goal: "x".repeat(4001) }),
    );
    expect(result.safe).toBe(false);
    expect(result.sanitized.goal).toBe("");
    expect(result.violations.join(" ")).toMatch(/goal:.*exceeds 4000/);
  });

  it("keeps a safe goal as-is", () => {
    const result = validateCodingPacketSafety(basePacket({ goal: "ship vertical slice" }));
    expect(result.safe).toBe(true);
    expect(result.sanitized.goal).toBe("ship vertical slice");
  });
});

describe("assertSafeCodingPacket", () => {
  it("returns the sanitized packet when safe", () => {
    const sanitized = assertSafeCodingPacket(basePacket());
    expect(sanitized.goal).toBe("goal");
  });

  it("throws when unsafe", () => {
    expect(() =>
      assertSafeCodingPacket(basePacket({ filesToInspect: ["/etc/passwd"] })),
    ).toThrow(/unsafe coding packet/);
  });

  it("throws when goal is unsafe", () => {
    expect(() =>
      assertSafeCodingPacket(basePacket({ goal: "" })),
    ).toThrow(/unsafe coding packet/);
  });
});

describe("defaultAgentProfiles", () => {
  it("ships 18 profiles: 10 core + Yohane + 6 R3.2 + kurumi (companion)", () => {
    expect(defaultAgentProfiles).toHaveLength(18);
  });

  it("covers every persona that has a SOUL.md directory under agents/", () => {
    // Each defaultAgentProfile has a matching agents/<role>/ markdown
    // directory (or agents/<personaName>/ when overridden — e.g. Yohane,
    // kurumi). Regression guard: if someone removes one of these the
    // test fails with a specific role name, not a vague "missing item".
    const roles = defaultAgentProfiles.map((p) => p.role);
    expect(roles).toContain("orchestrator");
    expect(roles).toContain("architect");
    expect(roles).toContain("reviewer");
    expect(roles).toContain("skeptic");
    expect(roles).toContain("verifier");
    expect(roles).toContain("memory_curator");
    expect(roles).toContain("builder");
    expect(roles).toContain("external");
    expect(roles).toContain("auditor");
    expect(roles).toContain("executor");
    // R3.2 expansion
    expect(roles).toContain("researcher");
    expect(roles).toContain("negotiator");
    expect(roles).toContain("risk_officer");
    expect(roles).toContain("mediator");
    expect(roles).toContain("watchdog");
    expect(roles).toContain("domain_expert");
    // R3.3 companion (만능 캐릭터)
    expect(roles).toContain("companion");
  });

  it("uses personaName override only when needed (Yohane + kurumi today)", () => {
    // R3.1 personaName invariant: every personaName must point at an
    // agents/<personaName>/ directory; profiles without an override
    // fall back to agents/<role>/. Today two profiles use the override:
    //   - Yohane (second skeptic) → agents/yohane/
    //   - 쿠루미 (companion) → agents/kurumi/
    const overrides = defaultAgentProfiles
      .map((p) => p.personaName)
      .filter((name): name is string => Boolean(name));
    expect(overrides).toContain("yohane");
    expect(overrides).toContain("kurumi");
  });

  it("kurumi (companion) is the user's primary assistant — enabled, real, markdown-loaded", () => {
    const kurumi = defaultAgentProfiles.find((p) => p.personaName === "kurumi");
    expect(kurumi).toBeDefined();
    expect(kurumi!.role).toBe("companion");
    expect(kurumi!.kind).toBe("real");
    expect(kurumi!.configSource).toBe("markdown");
    expect(kurumi!.enabled).toBe(true);
    expect(kurumi!.soulMode).toBe("full");
    // write_files unlocks self-editing of her own SOUL/AGENTS/IDENTITY/USER
    // files. Actual file mutations still go through the F2 permission
    // gate + user confirm; the level just authorizes the request.
    expect(kurumi!.permissionLevel).toBe("write_files");
  });

  it("keeps the executor disabled by default (requires F2 permission gate)", () => {
    const executor = defaultAgentProfiles.find((p) => p.role === "executor");
    expect(executor).toBeDefined();
    expect(executor!.enabled).toBe(false);
    expect(executor!.permissionLevel).toBe("run_safe_commands");
  });

  it("all virtual personas have unique ids", () => {
    const ids = defaultAgentProfiles.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("default configSource is internal for the virtual personas (embedded summary, not file load)", () => {
    // Callers that want the full SOUL/AGENTS markdown should flip
    // `configSource: "markdown"` per profile and run loadPersona.
    const virtuals = defaultAgentProfiles.filter((p) => p.kind === "virtual");
    for (const profile of virtuals) {
      expect(profile.configSource).toBe("internal");
    }
  });
});

// The safety suite above only ever crosses the *unsafe* side of each cap (4001
// text, 150-entry list) and never the path-specific 512-char cap; the strict
// `>` comparisons (so a regression to `>=` would falsely reject the exact
// boundary) are unpinned. createCodingPacketDraft and createMockUtterance are
// both 0-ref in the test tree. Pin them, self-consistent (derived from the
// documented caps / the seed context).
describe("validateCodingPacketSafety — path-length cap + strict boundary tripwires", () => {
  it("enforces the path-specific 512-char cap (distinct from the 4000-char text cap)", () => {
    const ok = validateCodingPacketSafety(basePacket({ filesToInspect: ["a".repeat(512)] }));
    expect(ok.safe).toBe(true); // exactly 512 ⇒ kept
    const tooLong = validateCodingPacketSafety(basePacket({ filesToInspect: ["a".repeat(513)] }));
    expect(tooLong.safe).toBe(false);
    expect(tooLong.violations.join(" ")).toMatch(/path exceeds 512/);
    expect(tooLong.sanitized.filesToInspect).toEqual([]);
  });

  it("accepts the exact boundaries: a 100-entry list, a 4000-char text entry, a 512-char path — none trip the strict > checks", () => {
    const hundred = Array.from({ length: 100 }, (_, i) => `file-${i}.ts`);
    const result = validateCodingPacketSafety(
      basePacket({
        filesToInspect: ["a".repeat(512)],
        implementationPlan: ["x".repeat(4000)],
        context: hundred,
      }),
    );
    expect(result.safe).toBe(true);
    expect(result.violations).toEqual([]);
    expect(result.sanitized.context).toHaveLength(100); // not truncated
  });
});

describe("createCodingPacketDraft — seed packet is itself safe", () => {
  const ctx: DebateContext = {
    sessionId: "s_draft",
    problem: "초기 스켈레톤을 만든다",
    conversationSummary: "대화 요약",
    constraints: ["protocol-first"],
    openQuestions: [],
    userPreferences: ["테스트 우선", "작은 PR"],
    memoryTraceIds: [],
  };

  it("seeds goal/context/constraints from the DebateContext", () => {
    const draft = createCodingPacketDraft(ctx);
    expect(draft.goal).toBe("초기 스켈레톤을 만든다");
    expect(draft.context[0]).toBe("대화 요약"); // conversationSummary first
    expect(draft.context).toContain("사용자 선호: 테스트 우선"); // each preference prefixed
    expect(draft.context).toContain("사용자 선호: 작은 PR");
    expect(draft.constraints).toEqual(["protocol-first"]); // passthrough
  });

  it("produces a packet that passes the safety validator unchanged (relative paths, no traversal)", () => {
    const result = validateCodingPacketSafety(createCodingPacketDraft(ctx));
    expect(result.safe).toBe(true);
    expect(result.violations).toEqual([]);
    expect(() => assertSafeCodingPacket(createCodingPacketDraft(ctx))).not.toThrow();
  });
});

describe("createMockUtterance", () => {
  const agent: AgentProfile = {
    id: "agent_mock",
    name: "Mock",
    kind: "virtual",
    role: "architect",
    soulMode: "summary",
    configSource: "internal",
    enabled: true,
    permissionLevel: "read_only",
  };

  it("stamps a utterance_-prefixed id, single-tag array, and passes content/round/agent through", () => {
    const u = createMockUtterance({ agent, roundId: "r1", content: "초안 발언", tag: "evidence" });
    expect(u.id.startsWith("utterance_")).toBe(true);
    expect(u.agentId).toBe("agent_mock"); // from agent.id, not the profile object
    expect(u.roundId).toBe("r1");
    expect(u.content).toBe("초안 발언");
    expect(u.tags).toEqual(["evidence"]); // exactly the one tag, wrapped in an array
    expect(() => new Date(u.createdAt).toISOString()).not.toThrow(); // ISO timestamp
  });
});

// Every path-rule test above feeds the unsafe string to filesToInspect — the one
// list routed through sanitizePathList. The complementary least-privilege fact is
// never pinned: the OTHER eight lists go through sanitizeTextList, whose
// isUnsafeText applies NO traversal/absolute-path rules. So a "../" or
// "/etc/passwd" string is unsafe as a FILE PATH yet perfectly safe as PROSE — the
// path checks are scoped to exactly where a path is consumed, not applied
// blanket-wide (which would falsely reject legitimate prose that happens to
// mention a path). Pin the asymmetry, self-consistent (same strings, opposite
// verdicts depending solely on the field they land in).
describe("validateCodingPacketSafety — path rules are scoped to filesToInspect, not text lists", () => {
  it("permits path-shaped strings inside text lists (traversal/absolute are not prose violations)", () => {
    const result = validateCodingPacketSafety(
      basePacket({
        decisions: ["../../etc/passwd 를 읽지 말 것"], // traversal substring, but it is prose
        context: ["/etc/passwd 같은 절대경로는 금지한다"], // absolute-looking, but prose
        reviewerNotes: ["C:\\Windows 경로를 하드코딩하지 말 것"], // windows-absolute substring, prose
      }),
    );
    expect(result.safe).toBe(true); // text lists do not run path checks
    expect(result.violations).toEqual([]);
    expect(result.sanitized.decisions).toEqual(["../../etc/passwd 를 읽지 말 것"]); // kept verbatim
    expect(result.sanitized.context).toEqual(["/etc/passwd 같은 절대경로는 금지한다"]);
  });

  it("rejects the very same traversal/absolute strings the instant they appear in filesToInspect", () => {
    const traversal = validateCodingPacketSafety(basePacket({ filesToInspect: ["../../etc/passwd"] }));
    expect(traversal.safe).toBe(false);
    expect(traversal.violations.join(" ")).toMatch(/traversal/);

    const absolute = validateCodingPacketSafety(basePacket({ filesToInspect: ["/etc/passwd"] }));
    expect(absolute.safe).toBe(false);
    expect(absolute.violations.join(" ")).toMatch(/absolute/);
  });
});
