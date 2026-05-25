import type {
  AgentProfile,
  CodingPacket,
  DebateRound,
  DebateRoundKind,
  DebateUtterance,
} from "@ai-orchestrator/protocol";

export {
  buildPersonaPromptFragment,
  createInMemoryPersonaSource,
  inferModeFromConfigSource,
  loadPersona,
  personaNameForProfile,
  PersonaFragmentMissingError,
} from "./personaLoader.js";
export type {
  LoadedPersona,
  PersonaFileSource,
  PersonaFragment,
  PersonaFragmentSource,
  PersonaPromptOptions,
  PersonaSourceMode,
} from "./personaLoader.js";

export type DebateContext = {
  sessionId: string;
  problem: string;
  conversationSummary: string;
  constraints: string[];
  openQuestions: string[];
  userPreferences: string[];
  memoryTraceIds: string[];
};

export const debateRoundTemplates: Array<{ kind: DebateRoundKind; title: string }> = [
  { kind: "problem_definition", title: "문제 정의" },
  { kind: "initial_proposals", title: "1차 제안" },
  { kind: "cross_critique", title: "상호 비판" },
  { kind: "orchestrator_summary", title: "오케스트레이터 요약" },
  { kind: "refinement", title: "보완 라운드" },
  { kind: "final_decision", title: "최종 결정" },
  { kind: "coding_packet", title: "코딩 전달 패킷" },
];

export function createDebateRounds(debateId: string): DebateRound[] {
  return debateRoundTemplates.map((template, index) => ({
    id: `${debateId}_round_${index + 1}`,
    debateId,
    kind: template.kind,
    title: template.title,
    status: index === 0 ? "running" : "pending",
    utterances: [],
  }));
}

export function createMockUtterance(params: {
  agent: AgentProfile;
  roundId: string;
  content: string;
  tag: DebateUtterance["tags"][number];
}): DebateUtterance {
  return {
    id: `utterance_${crypto.randomUUID()}`,
    agentId: params.agent.id,
    roundId: params.roundId,
    content: params.content,
    tags: [params.tag],
    createdAt: new Date().toISOString(),
  };
}

export type DebateRoundAdvanceResult = {
  rounds: DebateRound[];
  finished: boolean;
  nextRunningRoundId?: string;
};

export function getActiveDebateRound(rounds: DebateRound[]): DebateRound | undefined {
  return rounds.find((round) => round.status === "running");
}

export function advanceDebateRound(
  rounds: DebateRound[],
  completedRoundId: string,
): DebateRoundAdvanceResult {
  const targetIndex = rounds.findIndex((round) => round.id === completedRoundId);
  if (targetIndex === -1) {
    throw new Error(`debate round not found: ${completedRoundId}`);
  }

  const target = rounds[targetIndex]!;
  if (target.status === "completed") {
    throw new Error(`debate round already completed: ${completedRoundId}`);
  }
  if (target.status === "blocked") {
    throw new Error(`debate round is blocked, cannot advance: ${completedRoundId}`);
  }
  if (target.status !== "running") {
    throw new Error(`debate round is not running, cannot advance: ${completedRoundId}`);
  }

  const next = rounds.map((round, index): DebateRound => {
    if (index === targetIndex) {
      return { ...round, status: "completed" };
    }
    return round;
  });

  const nextPendingIndex = next.findIndex(
    (round, index) => index > targetIndex && round.status === "pending",
  );

  if (nextPendingIndex === -1) {
    return { rounds: next, finished: true };
  }

  const activated = next.map((round, index): DebateRound => {
    if (index === nextPendingIndex) {
      return { ...round, status: "running" };
    }
    return round;
  });

  return {
    rounds: activated,
    finished: false,
    nextRunningRoundId: activated[nextPendingIndex]!.id,
  };
}

export function blockDebateRound(rounds: DebateRound[], roundId: string): DebateRound[] {
  const targetIndex = rounds.findIndex((round) => round.id === roundId);
  if (targetIndex === -1) {
    throw new Error(`debate round not found: ${roundId}`);
  }
  const target = rounds[targetIndex]!;
  if (target.status === "completed") {
    throw new Error(`cannot block completed round: ${roundId}`);
  }
  return rounds.map((round, index): DebateRound => {
    if (index === targetIndex) {
      return { ...round, status: "blocked" };
    }
    return round;
  });
}

export type CodingPacketSafetyResult = {
  safe: boolean;
  violations: string[];
  sanitized: CodingPacket;
};

const MAX_PACKET_LIST_LENGTH = 100;
const MAX_PACKET_PATH_LENGTH = 512;
const MAX_PACKET_TEXT_LENGTH = 4000;

const PATH_TRAVERSAL_PATTERN = /(^|[\\/])\.\.(?:[\\/]|$)/;
const ABSOLUTE_PATH_PATTERN = /^(?:[a-zA-Z]:[\\/]|[\\/])/;
const NULL_CHARACTER = String.fromCharCode(0);

function isUnsafeRelativePath(path: string): string | undefined {
  if (typeof path !== "string") return "non-string entry";
  if (path.length === 0) return "empty path";
  if (path.length > MAX_PACKET_PATH_LENGTH) return `path exceeds ${MAX_PACKET_PATH_LENGTH} chars`;
  if (path.includes(NULL_CHARACTER)) return "null byte in path";
  if (ABSOLUTE_PATH_PATTERN.test(path)) return "absolute path";
  if (PATH_TRAVERSAL_PATTERN.test(path)) return "parent-directory traversal";
  return undefined;
}

function isUnsafeText(value: string): string | undefined {
  if (typeof value !== "string") return "non-string entry";
  if (value.length === 0) return "empty entry";
  if (value.length > MAX_PACKET_TEXT_LENGTH) return `entry exceeds ${MAX_PACKET_TEXT_LENGTH} chars`;
  if (value.includes(NULL_CHARACTER)) return "null byte";
  return undefined;
}

export function validateCodingPacketSafety(packet: CodingPacket): CodingPacketSafetyResult {
  const violations: string[] = [];

  const sanitizePathList = (label: string, values: string[]): string[] => {
    if (values.length > MAX_PACKET_LIST_LENGTH) {
      violations.push(`${label}: list exceeds ${MAX_PACKET_LIST_LENGTH} entries (kept first ${MAX_PACKET_LIST_LENGTH})`);
    }
    const truncated = values.slice(0, MAX_PACKET_LIST_LENGTH);
    return truncated.filter((value, index) => {
      const reason = isUnsafeRelativePath(value);
      if (reason) {
        violations.push(`${label}[${index}]: ${reason}`);
        return false;
      }
      return true;
    });
  };

  const sanitizeTextList = (label: string, values: string[]): string[] => {
    if (values.length > MAX_PACKET_LIST_LENGTH) {
      violations.push(`${label}: list exceeds ${MAX_PACKET_LIST_LENGTH} entries (kept first ${MAX_PACKET_LIST_LENGTH})`);
    }
    const truncated = values.slice(0, MAX_PACKET_LIST_LENGTH);
    return truncated.filter((value, index) => {
      const reason = isUnsafeText(value);
      if (reason) {
        violations.push(`${label}[${index}]: ${reason}`);
        return false;
      }
      return true;
    });
  };

  const goalReason = isUnsafeText(packet.goal);
  if (goalReason) {
    violations.push(`goal: ${goalReason}`);
  }

  const sanitized: CodingPacket = {
    goal: goalReason ? "" : packet.goal,
    context: sanitizeTextList("context", packet.context),
    decisions: sanitizeTextList("decisions", packet.decisions),
    rejectedOptions: sanitizeTextList("rejectedOptions", packet.rejectedOptions),
    constraints: sanitizeTextList("constraints", packet.constraints),
    filesToInspect: sanitizePathList("filesToInspect", packet.filesToInspect),
    implementationPlan: sanitizeTextList("implementationPlan", packet.implementationPlan),
    verificationPlan: sanitizeTextList("verificationPlan", packet.verificationPlan),
    reviewerNotes: sanitizeTextList("reviewerNotes", packet.reviewerNotes),
  };

  return {
    safe: violations.length === 0,
    violations,
    sanitized,
  };
}

export function assertSafeCodingPacket(packet: CodingPacket): CodingPacket {
  const result = validateCodingPacketSafety(packet);
  if (!result.safe) {
    throw new Error(`unsafe coding packet: ${result.violations.join("; ")}`);
  }
  return result.sanitized;
}

export function createCodingPacketDraft(context: DebateContext): CodingPacket {
  return {
    goal: context.problem,
    context: [
      context.conversationSummary,
      ...context.userPreferences.map((preference) => `사용자 선호: ${preference}`),
    ],
    decisions: ["초기 구현은 protocol-first monorepo skeleton으로 제한한다."],
    rejectedOptions: ["실제 모델 호출을 첫 커밋에 포함하지 않는다."],
    constraints: context.constraints,
    filesToInspect: [
      "packages/protocol/src/index.ts",
      "apps/desktop/src/App.tsx",
      "packages/providers/src/index.ts",
    ],
    implementationPlan: [
      "workspace 구조를 만든다.",
      "공통 타입과 Zod 스키마를 추가한다.",
      "Orchestrator Board UI 골격을 구현한다.",
      "provider/runtime/server는 stub으로 연결한다.",
    ],
    verificationPlan: ["pnpm typecheck", "pnpm test", "pnpm build"],
    reviewerNotes: [
      "API 키 원문은 저장하지 않는다.",
      "터미널 슬롯은 실제 명령 실행 없이 permission state만 표시한다.",
    ],
  };
}

/**
 * Built-in agent profile seed. Covers the 6 virtual roles that ship with
 * `agents/<role>/SOUL.md` + `AGENTS.md` (orchestrator + the 5 debate
 * personas from PR #48) plus one disabled real-executor stub.
 *
 * All virtual entries default to `configSource: "internal"` so the
 * embedded persona summary is used at runtime. Callers that want to
 * inject the full SOUL/AGENTS markdown should flip `configSource` to
 * `"markdown"` per profile and run the result through `loadPersona()`
 * (see `./personaLoader.ts`).
 *
 * The `executor` profile stays disabled by default — it requires
 * `run_safe_commands` permission which is gated by the F2 evaluator
 * (`docs/29-permission-engine-spec.md`).
 */
export const defaultAgentProfiles: AgentProfile[] = [
  {
    id: "agent_orchestrator",
    name: "Orchestrator",
    kind: "virtual",
    role: "orchestrator",
    soulMode: "summary",
    configSource: "internal",
    enabled: true,
    permissionLevel: "read_only",
  },
  {
    id: "agent_architect",
    name: "Architect",
    kind: "virtual",
    role: "architect",
    soulMode: "summary",
    configSource: "internal",
    enabled: true,
    permissionLevel: "read_only",
  },
  {
    id: "agent_reviewer",
    name: "Reviewer",
    kind: "virtual",
    role: "reviewer",
    soulMode: "retrieved",
    configSource: "internal",
    enabled: true,
    permissionLevel: "read_only",
  },
  {
    id: "agent_skeptic",
    name: "Skeptic (Asuka)",
    kind: "virtual",
    role: "skeptic",
    soulMode: "summary",
    configSource: "internal",
    enabled: true,
    permissionLevel: "read_only",
    // personaName 미지정 → loader 가 default 로 role ("skeptic") 사용
    // → agents/skeptic/ (Asuka) 로 lookup.
  },
  {
    id: "agent_skeptic_yohane",
    name: "Idea Bank (Yohane)",
    kind: "virtual",
    role: "skeptic",
    // Same role as Asuka, different perspective:
    // - Asuka: within-paradigm aggressive challenge ("이게 잘못됐다, 더 강하게")
    // - Yohane: cross-paradigm 가정 inversion ("이 paradigm 이 필요한가? 본질만 남기고 뒤집자")
    // Two-layer skeptic coverage. personaName override below routes
    // loader to agents/yohane/ instead of the default agents/skeptic/.
    personaName: "yohane",
    soulMode: "summary",
    configSource: "internal",
    enabled: true,
    permissionLevel: "read_only",
  },
  {
    id: "agent_verifier",
    name: "Verifier",
    kind: "virtual",
    role: "verifier",
    soulMode: "summary",
    configSource: "internal",
    enabled: true,
    permissionLevel: "read_only",
  },
  {
    id: "agent_memory_curator",
    name: "Memory Curator",
    kind: "virtual",
    role: "memory_curator",
    // memory_curator works with the recall layer but its own prompt only
    // needs the small SOUL summary — heavy recall happens through the
    // MemoryAdapter (docs/32), not through the persona prompt itself.
    soulMode: "summary",
    configSource: "internal",
    enabled: true,
    permissionLevel: "read_only",
  },
  {
    id: "agent_builder",
    name: "Builder",
    kind: "virtual",
    role: "builder",
    // Builder is a creative-energy persona (Yui Hirasawa) — small SOUL
    // summary is enough; concrete artifact construction happens through
    // Coding Packet → Executor handoff, not through the Builder prompt
    // weight itself.
    soulMode: "summary",
    configSource: "internal",
    enabled: true,
    permissionLevel: "read_only",
  },
  {
    id: "agent_external_misato",
    name: "External Operations (Misato)",
    kind: "virtual",
    role: "external",
    // External role for crisis response + multi-agent coordination during
    // execution + external-channel (ingress) acknowledgement. Misato's
    // Casual ↔ Commander Mode duality maps onto idle ↔ crisis swarm
    // states. Persona prompt only needs the small SOUL summary.
    soulMode: "summary",
    configSource: "internal",
    enabled: true,
    permissionLevel: "read_only",
  },
  {
    id: "agent_auditor_sora",
    name: "Compliance Sentinel (Sora)",
    kind: "virtual",
    role: "auditor",
    // Auditor is intentionally an outlier in the swarm — independent
    // oversight that doesn't depend on peer agents' self-reports.
    // Sora's quiet intensity + dedication maps onto independent audit
    // duty when the focus is redirected from possessive obsession
    // (declined earlier) toward truth-serving the user/Orchestrator
    // directly. Reports outside the normal peer-collaboration channels
    // — 오빠 (user, Korean office-familiar address) / Orchestrator 직보.
    soulMode: "summary",
    configSource: "internal",
    enabled: true,
    permissionLevel: "read_only",
  },
  // R3.2 — 6 new role personas filling gap-analysis flagged slots
  {
    id: "agent_researcher_maomao",
    name: "Researcher (Maomao)",
    kind: "virtual",
    role: "researcher",
    soulMode: "summary",
    configSource: "internal",
    enabled: true,
    permissionLevel: "read_only",
  },
  {
    id: "agent_negotiator_sparkle",
    name: "Negotiator (Sparkle)",
    kind: "virtual",
    role: "negotiator",
    soulMode: "summary",
    configSource: "internal",
    enabled: true,
    permissionLevel: "read_only",
  },
  {
    id: "agent_risk_officer_cc",
    name: "Risk Officer (C.C.)",
    kind: "virtual",
    role: "risk_officer",
    soulMode: "summary",
    configSource: "internal",
    enabled: true,
    permissionLevel: "read_only",
  },
  {
    id: "agent_mediator_robin",
    name: "Mediator (Robin)",
    kind: "virtual",
    role: "mediator",
    soulMode: "summary",
    configSource: "internal",
    enabled: true,
    permissionLevel: "read_only",
  },
  {
    id: "agent_watchdog_frieren",
    name: "Watchdog (Frieren)",
    kind: "virtual",
    role: "watchdog",
    soulMode: "summary",
    configSource: "internal",
    enabled: true,
    permissionLevel: "read_only",
  },
  {
    id: "agent_domain_expert_herta",
    name: "Domain Expert (Herta)",
    kind: "virtual",
    role: "domain_expert",
    soulMode: "summary",
    configSource: "internal",
    enabled: true,
    permissionLevel: "read_only",
  },
  {
    id: "agent_executor",
    name: "Executor",
    kind: "real",
    role: "executor",
    soulMode: "off",
    configSource: "off",
    enabled: false,
    permissionLevel: "run_safe_commands",
  },
];
