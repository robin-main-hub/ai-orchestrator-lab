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

export {
  applyDebateCrossLinks,
  buildRoundUserPrompt,
  debateHadPositionChanges,
  deriveStanceTrajectories,
  inferUtteranceTag,
  pickAgentsForRound,
  runDebateRound,
  tagPolarity,
} from "./debateEngine.js";
export type {
  AgentStancePoint,
  AgentStanceTrajectory,
  DebateAgentError,
  DebateEngineAgentSlot,
  DebateEngineOptions,
  LlmCompletionFn,
  RunDebateRoundParams,
  RunDebateRoundResult,
  StancePolarity,
} from "./debateEngine.js";

export {
  COMPLETION_ONLY_TARGET_ROLES,
  DEFAULT_BLOCKED_TARGETS,
  delegationAuthorityLevel,
  evaluateDelegationPolicy,
  parseDelegateTags,
  runCompanionTurn,
} from "./delegation.js";
export type {
  CompanionTurnInput,
  CompanionTurnOptions,
  CompanionTurnResult,
  DelegationAuthorityLevel,
  DelegationPolicyDecision,
  DelegationTargetEffect,
  DelegateOutcome,
  DelegateTag,
} from "./delegation.js";

export {
  allowedToolsForMissionMode,
  buildPersonaContinuitySystemReminder,
  canMissionModeMutateFiles,
  canMissionModeRunCommands,
  createAgentMissionCapability,
  createHermesPersonaContinuity,
  createMissionWorkerAssignment,
  missionCapabilitiesForProfiles,
  missionCapabilityModeForRole,
  personaSlugForMission,
  requiresMissionSandbox,
} from "./productKernelContracts.js";
export type {
  MissionCapabilityOptions,
} from "./productKernelContracts.js";
export {
  createSandboxPlanFromCodingPacket,
  sandboxRunModeForCapability,
} from "./sandboxPlan.js";
export type {
  SandboxPlanInput,
} from "./sandboxPlan.js";
export {
  DANGEROUS_PATTERN,
  DEFAULT_SAFE_COMMAND_PREFIXES,
  isAutoApprovableCommand,
} from "./safeCommandPolicy.js";
export type { SafeCommandVerdict } from "./safeCommandPolicy.js";

export { RmasTokenMeter } from "./rmas/tokenMeter.js";
export type { RmasTokenSnapshot } from "./rmas/tokenMeter.js";
export { evaluateGoalAcceptance, parseJudgeVerdict } from "./rmas/judge.js";
export type { EvaluateGoalAcceptanceInput, JudgeVerdict } from "./rmas/judge.js";
export { kindToDistinctRole, STRATEGIES } from "./rmas/patterns.js";
export type {
  PatternIterationInput,
  PatternIterationResult,
  PatternStrategy,
  RmasEmit,
  RmasWorkingContext,
} from "./rmas/patterns.js";
export { runGoalLoop } from "./rmas/goalLoop.js";
export type { RmasLoopDeps, RmasLoopOutcome } from "./rmas/goalLoop.js";

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

function generateUUID(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function createMockUtterance(params: {
  agent: AgentProfile;
  roundId: string;
  content: string;
  tag: DebateUtterance["tags"][number];
}): DebateUtterance {
  return {
    id: `utterance_${generateUUID()}`,
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
    name: "Skeptic",
    kind: "virtual",
    role: "skeptic",
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
    id: "agent_external",
    name: "External",
    kind: "real",
    role: "external",
    // Misato — external channel operator. Read-only default; promotions
    // happen through explicit per-request permission decisions.
    soulMode: "retrieved",
    configSource: "markdown",
    enabled: false,
    permissionLevel: "read_only",
  },
  {
    id: "agent_auditor",
    name: "가사이 유노",
    kind: "virtual",
    role: "auditor",
    personaName: "yuno",
    // Yuno — independent yandere auditor. Read-only by design.
    // configSource stays "internal" by default per the virtual-personas
    // invariant; flip to "markdown" + loadPersona when promoting Yuno
    // into an active audit round.
    soulMode: "retrieved",
    configSource: "internal",
    enabled: false,
    permissionLevel: "read_only",
  },
  // ─── R3.1: second skeptic via personaName override ──────────────────
  {
    id: "agent_skeptic_yohane",
    name: "Yohane",
    kind: "virtual",
    role: "skeptic",
    // Same role as the canonical skeptic (Asuka). The personaName
    // override points the persona loader at agents/yohane/ instead of
    // agents/skeptic/, so the two skeptics speak in distinct voices
    // (Asuka = adversarial QA; Yohane = first-principles inversion /
    // idea bank).
    personaName: "yohane",
    soulMode: "summary",
    configSource: "internal",
    enabled: false,
    permissionLevel: "read_only",
  },
  // ─── R3.2: six new roles (gap-analysis flagged) ────────────────────
  {
    id: "agent_researcher",
    name: "Researcher",
    kind: "virtual",
    role: "researcher",
    // Maomao — active external info gathering, trust-classified output.
    soulMode: "retrieved",
    configSource: "internal",
    enabled: false,
    permissionLevel: "read_only",
  },
  {
    id: "agent_negotiator",
    name: "Negotiator",
    kind: "virtual",
    role: "negotiator",
    // Sparkle (花火) — sales / 협상 advisor. Applies user's 협상 3원칙
    // through the 5-막 framework.
    soulMode: "summary",
    configSource: "internal",
    enabled: false,
    permissionLevel: "read_only",
  },
  {
    id: "agent_risk_officer",
    name: "Risk Officer",
    kind: "virtual",
    role: "risk_officer",
    // C.C. — worst-case quantification, 5-step Quantitative Risk Algorithm.
    soulMode: "summary",
    configSource: "internal",
    enabled: false,
    permissionLevel: "read_only",
  },
  {
    id: "agent_mediator",
    name: "Mediator",
    kind: "virtual",
    role: "mediator",
    // Robin — synthesizes conflicting agent opinions into one draft.
    soulMode: "summary",
    configSource: "internal",
    enabled: false,
    permissionLevel: "read_only",
  },
  {
    id: "agent_watchdog",
    name: "Watchdog",
    kind: "virtual",
    role: "watchdog",
    // Frieren — long-term drift / anomaly detection over session history.
    soulMode: "summary",
    configSource: "internal",
    enabled: false,
    permissionLevel: "read_only",
  },
  {
    id: "agent_domain_expert",
    name: "Domain Expert",
    kind: "virtual",
    role: "domain_expert",
    // Herta — load-time domain knowledge injection (HTV/B2B/etc.).
    soulMode: "retrieved",
    configSource: "internal",
    enabled: false,
    permissionLevel: "read_only",
  },
  // ─── Companion (전속 비서 / 만능 character) ──────────────────────────
  {
    id: "agent_kurumi",
    name: "쿠루미",
    // kind: "real" because she is the user's primary day-to-day
    // assistant in conversation mode (Misato follows the same pattern
    // for the same reason). Her configSource is "markdown" so the full
    // character files (AGENTS.md + SOUL.md + IDENTITY.md + USER.md)
    // load via personaLoader at prompt-assembly time — embedded summary
    // is too thin to preserve the character voice.
    kind: "real",
    role: "companion",
    personaName: "kurumi",
    soulMode: "full",
    configSource: "markdown",
    enabled: true,
    // write_files grants the permission level — actual file writes
    // still go through the F2 permission gate + user confirm. Channel:
    // her own AGENTS.md says "AGENTS.md·SOUL.md 변경은 오빠에게 건의
    // 후 반영", which the permission gate enforces at runtime.
    permissionLevel: "write_files",
  },
  {
    id: "agent_executor",
    name: "Executor",
    kind: "real",
    role: "executor",
    soulMode: "summary",
    configSource: "internal",
    enabled: false,
    permissionLevel: "run_safe_commands",
  },
];

export { buildAgentSystemPrompt, estimateTokens, soulModeToPersonaSourceMode } from './soulInjection.js';
export type { SoulInjectionReport } from './soulInjection.js';
export { buildDebateSummary, countTagDistribution } from './debateSummary.js';
export type { DebateSummaryOptions, TagDistribution } from './debateSummary.js';
export {
  textSimilarity,
  clusterResponses,
  detectConsensus,
  classifyInterruptPriority,
  shouldInterrupt,
} from './debateConsensus.js';
export type {
  ResponseCluster,
  ConsensusState,
  ConsensusResult,
  InterruptPriority,
} from './debateConsensus.js';

export { extractCodingPacketFromDebate } from "./codingPacketFromDebate.js";
export type { ExtractCodingPacketOptions } from "./codingPacketFromDebate.js";

export {
  synthesizeChairmanDecision,
  chairmanDecisionToNotes,
  withChairmanSynthesis,
} from "./chairmanSynthesis.js";
export type {
  ChairmanDecision,
  ChairmanAdoptedPoint,
  ChairmanContestedPoint,
  ChairmanSynthesisOptions,
  ConsensusLevel,
} from "./chairmanSynthesis.js";

export { runDebate } from "./runDebate.js";
export type { RunDebateParams, RunDebateResult } from "./runDebate.js";

export {
  buildLorebookFragment,
  characterBookToLorebook,
  DEFAULT_LOREBOOK_TENANT,
  isLorebook,
  scanLorebooks,
  SHARED_LOREBOOK_TENANT,
} from "./lorebook.js";
export type {
  CharacterBook,
  CharacterBookEntry,
  Lorebook,
  LorebookEntry,
  LorebookMatch,
  LorebookScanOptions,
} from "./lorebook.js";

export {
  characterCardToPersonaFiles,
  personaFilesToCharacterCard,
  normalizeCharacterCard,
  extractMarkdownSection,
  soulEssence,
  personaSlug,
} from "./characterCard.js";
export type {
  CharacterCardV1,
  CharacterCardV2,
  CharacterCardV2Data,
  PersonaFiles,
} from "./characterCard.js";
