import type {
  AgentProfile,
  DebateRound,
  DebateRoundKind,
  DebateTag,
  DebateUtterance,
  ProviderCompletionMessage,
  ProviderCompletionRequest,
  ProviderCompletionResponse,
  ProviderCompletionRoute,
} from "@ai-orchestrator/protocol";

import type { DebateContext } from "./index";

/**
 * Minimal adapter-call surface the engine needs. Matches the shape of
 * `LlmAdapter.complete` from @ai-orchestrator/providers, but we accept a
 * plain function so packages/agents stays free of the providers
 * dependency. Callers pass `adapter.complete.bind(adapter)`.
 */
export type LlmCompletionFn = (
  request: ProviderCompletionRequest,
  ctx: {
    resolveSecret(): Promise<string | undefined>;
    abortSignal?: AbortSignal;
    timeoutMs?: number;
  },
) => Promise<ProviderCompletionResponse>;

export type DebateEngineAgentSlot = {
  agent: AgentProfile;
  /**
   * Function that performs one completion call. Usually
   * `adapter.complete.bind(adapter)`. Tests can pass a plain async fn.
   */
  complete: LlmCompletionFn;
  /**
   * Caller assembles the system prompt — could be a plain role
   * description, or the full persona + SAFETY.md output from the
   * persona loader once it ships. The engine does NOT load persona
   * files; it only assembles the user-facing round prompt.
   */
  systemPrompt: string;
  modelId: string;
  /**
   * Optional credential resolver. Defaults to () => undefined so mock
   * adapters and local Ollama can ignore it.
   */
  resolveSecret?: () => Promise<string | undefined>;
};

export type DebateEngineOptions = {
  /** Cap utterances per round. Default 4, hard max 6 (review-board Q#10). */
  maxUtterancesPerRound?: number;
  /** Per-agent completion timeout in ms. Default 60_000. */
  perAgentTimeoutMs?: number;
  /** Route preference forwarded into every ProviderCompletionRequest. */
  routePreference?: ProviderCompletionRoute;
  /** Time source override (testing). */
  now?: () => Date;
  /** ID source override (testing). */
  generateId?: () => string;
  activePersonaOverrides?: Record<string, string>;
  rolePersonaPriorities?: Record<string, string[]>;
  allowMultiPersonaRoles?: string[];
};

export type DebateAgentError = {
  agentId: string;
  reason: string;
};

export type RunDebateRoundParams = {
  debateId: string;
  round: DebateRound;
  context: DebateContext;
  slots: DebateEngineAgentSlot[];
  options?: DebateEngineOptions;
};

export type RunDebateRoundResult = {
  utterances: DebateUtterance[];
  agentErrors: DebateAgentError[];
};

const DEFAULT_MAX_UTTERANCES_PER_ROUND = 4;
const HARD_MAX_UTTERANCES_PER_ROUND = 6;
const DEFAULT_PER_AGENT_TIMEOUT_MS = 60_000;
const DEFAULT_ROUTE_PREFERENCE: ProviderCompletionRoute = "server_proxy";

/**
 * Recommended agent roles per round kind. Filters the slot list so a
 * 17-persona roster doesn't trigger 17 LLM calls every round. Roles not
 * listed here are excluded from that round's invitation. The orchestrator
 * is invited to every round so it can always speak.
 *
 * Keep this conservative: better to under-invite and let the user
 * promote agents than to silently over-spend tokens.
 *
 * Roles typed as `string[]` (not `AgentRole[]`) on purpose: this lets us
 * forward-reference the 6 R3.2 roles (researcher / negotiator /
 * risk_officer / mediator / watchdog / domain_expert) that are landing
 * in a separate PR. Unknown role strings simply never match any slot's
 * `agent.role` and are silently ignored by `pickAgentsForRound`.
 */
const ROUND_ROLE_PRIORITY: Record<DebateRoundKind, string[]> = {
  problem_definition: [
    "orchestrator",
    "companion",
    "architect",
    "researcher",
    "domain_expert",
    "skeptic",
  ],
  initial_proposals: [
    "orchestrator",
    "companion",
    "architect",
    "builder",
    "skeptic",
    "negotiator",
    "domain_expert",
  ],
  cross_critique: [
    "orchestrator",
    "companion",
    "skeptic",
    "reviewer",
    "auditor",
    "risk_officer",
    "watchdog",
  ],
  orchestrator_summary: ["orchestrator", "companion", "mediator", "memory_curator"],
  refinement: [
    "orchestrator",
    "companion",
    "architect",
    "builder",
    "reviewer",
    "mediator",
    "risk_officer",
  ],
  final_decision: [
    "orchestrator",
    "companion",
    "architect",
    "reviewer",
    "auditor",
    "verifier",
  ],
  coding_packet: [
    "orchestrator",
    "companion",
    "architect",
    "builder",
    "reviewer",
    "verifier",
  ],
};

/**
 * Heuristic default tag per round kind, applied when an agent does not
 * declare its own tag via the `[[tag:...]]` marker.
 */
const ROUND_DEFAULT_TAG: Record<DebateRoundKind, DebateTag> = {
  problem_definition: "evidence",
  initial_proposals: "evidence",
  cross_critique: "objection",
  orchestrator_summary: "agreement",
  refinement: "coding_impact",
  final_decision: "agreement",
  coding_packet: "coding_impact",
};

const TAG_MARKER_PATTERN = /\[\[tag:(agreement|objection|evidence|risk|coding_impact)\]\]/i;

const ROUND_INSTRUCTION: Record<DebateRoundKind, string> = {
  problem_definition:
    "이 라운드의 목표는 문제 자체를 한 문단으로 명확히 정의하는 것이다. 가정과 모호한 부분을 짚고, 사용자 의도를 한 줄로 다시 적어달라.",
  initial_proposals:
    "이 라운드의 목표는 1차 제안을 내놓는 것이다. 한 가지 구체적인 접근을 제시하고 핵심 근거 2~3개를 붙여라.",
  cross_critique:
    "이 라운드의 목표는 다른 에이전트의 제안을 비판하는 것이다. 동의/반대/근거/리스크 중 하나를 명시하고, 어떤 발언에 대한 비판인지 분명히 인용하라. 특정 에이전트의 제안을 수용하면 `[[accept:역할]]`, 거부하면 `[[reject:역할]]`을 발언에 포함하라(예: [[reject:architect]]).",
  orchestrator_summary:
    "이 라운드의 목표는 지금까지의 합의/불일치/미결 항목을 짧게 요약하는 것이다. 정렬되지 않은 결정은 명시적으로 ‘미결’로 남겨라.",
  refinement:
    "이 라운드의 목표는 보완안을 내놓는 것이다. 직전 비판을 흡수해 1차 제안을 어떻게 고칠지 차분히 적어라. 첫 줄에 본인 입장이 바뀌었는지 명시하라('입장 유지' 또는 '입장 변경: …'). 코딩 영향(파일/스키마/모듈)이 있다면 함께 기록하라.",
  final_decision:
    "이 라운드의 목표는 단일 결정을 내리는 것이다. 채택안과 그 근거, 거부된 옵션과 그 이유를 분리해 적어라.",
  coding_packet:
    "이 라운드의 목표는 코딩 전달 패킷의 초안을 만드는 것이다. 목표/맥락/결정/거부된 옵션/제약/검토할 파일/구현 계획/검증 계획/리뷰어 노트를 짧게 적어라. 절대 경로나 상위 디렉터리 이동(`..`)은 사용하지 말 것.",
};

function compareAgents(
  a: AgentProfile,
  b: AgentProfile,
  role: string,
  activePersonaOverrides?: Record<string, string>,
  rolePersonaPriorities?: Record<string, string[]>,
): number {
  // 1. User-Explicit Override
  if (activePersonaOverrides && activePersonaOverrides[role]) {
    const overrideId = activePersonaOverrides[role];
    if (a.id === overrideId && b.id !== overrideId) return -1;
    if (b.id === overrideId && a.id !== overrideId) return 1;
  }

  // 2. rolePersonaPriorities
  if (rolePersonaPriorities && rolePersonaPriorities[role]) {
    const priorityList = rolePersonaPriorities[role];
    const indexA = priorityList.indexOf(a.id);
    const indexB = priorityList.indexOf(b.id);
    if (indexA !== -1 && indexB !== -1) {
      return indexA - indexB;
    }
    if (indexA !== -1) return -1;
    if (indexB !== -1) return 1;
  }

  // 3. isDefault
  const defaultA = a.isDefault === true;
  const defaultB = b.isDefault === true;
  if (defaultA && !defaultB) return -1;
  if (defaultB && !defaultA) return 1;

  // 4. isCanonical
  const canonicalA = a.isCanonical === true || !a.personaName;
  const canonicalB = b.isCanonical === true || !b.personaName;
  if (canonicalA && !canonicalB) return -1;
  if (canonicalB && !canonicalA) return 1;

  // 5. priority
  const prioA = a.priority ?? 0;
  const prioB = b.priority ?? 0;
  if (prioA !== prioB) {
    return prioB - prioA; // Descending (higher priority first)
  }

  // 6. Tie-breaker (Alphabetical by id)
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

/**
 * Pick which agents are invited to this round. Filters by recommended
 * role list and caps at `max` slots, preserving the priority order from
 * ROUND_ROLE_PRIORITY. The orchestrator is always considered first.
 */
export function pickAgentsForRound(
  kind: DebateRoundKind,
  slots: DebateEngineAgentSlot[],
  max: number,
  options?: {
    activePersonaOverrides?: Record<string, string>;
    rolePersonaPriorities?: Record<string, string[]>;
    allowMultiPersonaRoles?: string[];
  },
): DebateEngineAgentSlot[] {
  const cap = Math.max(1, Math.min(HARD_MAX_UTTERANCES_PER_ROUND, max));
  const priority = ROUND_ROLE_PRIORITY[kind];
  
  const eligibleByRole = new Map<string, DebateEngineAgentSlot[]>();
  for (const slot of slots) {
    if (!slot.agent.enabled) continue;
    const bucket = eligibleByRole.get(slot.agent.role) ?? [];
    bucket.push(slot);
    eligibleByRole.set(slot.agent.role, bucket);
  }

  // Sort candidates within each role bucket based on deterministic hierarchy
  for (const [role, bucket] of eligibleByRole.entries()) {
    bucket.sort((a, b) => compareAgents(
      a.agent,
      b.agent,
      role,
      options?.activePersonaOverrides,
      options?.rolePersonaPriorities
    ));
  }

  const selected: DebateEngineAgentSlot[] = [];
  const selectedIds = new Set<string>();

  // Pass 1: Select the top sorted candidate for each role in priority order
  for (const role of priority) {
    const bucket = eligibleByRole.get(role);
    if (bucket && bucket.length > 0) {
      const topSlot = bucket[0]!;
      if (!selectedIds.has(topSlot.agent.id) && selected.length < cap) {
        selected.push(topSlot);
        selectedIds.add(topSlot.agent.id);
      }
    }
  }

  // Pass 2: Select subsequent personas for allowed roles in round-robin
  // order, so one role cannot consume all remaining seats before another
  // allowed multi-persona role gets its second persona.
  if (selected.length < cap && options?.allowMultiPersonaRoles) {
    const multiRoles = new Set(options.allowMultiPersonaRoles);
    const allowedBuckets = priority
      .filter((role) => multiRoles.has(role))
      .map((role) => eligibleByRole.get(role) ?? [])
      .filter((bucket) => bucket.length > 1);
    const maxBucketLength = Math.max(0, ...allowedBuckets.map((bucket) => bucket.length));

    for (let index = 1; index < maxBucketLength && selected.length < cap; index += 1) {
      for (const bucket of allowedBuckets) {
        if (selected.length >= cap) break;
        const slot = bucket[index];
        if (!slot || selectedIds.has(slot.agent.id)) continue;
        selected.push(slot);
        selectedIds.add(slot.agent.id);
      }
    }
  }

  return selected;
}

/**
 * Assemble the per-agent user prompt for this round. Combines the
 * round instruction, the debate context (problem + conversation summary
 * + constraints + open questions + user preferences), any utterances
 * already emitted in this round, and a one-line nudge to the agent.
 */
export function buildRoundUserPrompt(
  round: DebateRound,
  context: DebateContext,
  agent: AgentProfile,
): string {
  const lines: string[] = [];
  lines.push(`# 라운드: ${round.title} (${round.kind})`);
  lines.push("");
  lines.push(ROUND_INSTRUCTION[round.kind]);
  lines.push("");
  lines.push("## 문제");
  lines.push(context.problem);
  lines.push("");
  if (context.conversationSummary) {
    lines.push("## 대화 요약");
    lines.push(context.conversationSummary);
    lines.push("");
  }
  if (context.constraints.length > 0) {
    lines.push("## 제약");
    for (const c of context.constraints) lines.push(`- ${c}`);
    lines.push("");
  }
  if (context.openQuestions.length > 0) {
    lines.push("## 미결 질문");
    for (const q of context.openQuestions) lines.push(`- ${q}`);
    lines.push("");
  }
  if (context.userPreferences.length > 0) {
    lines.push("## 사용자 선호");
    for (const p of context.userPreferences) lines.push(`- ${p}`);
    lines.push("");
  }
  if (round.utterances.length > 0) {
    lines.push("## 이 라운드 직전 발언");
    for (const u of round.utterances) {
      lines.push(`- (${u.agentId}) ${truncateForPrompt(u.content, 600)}`);
    }
    lines.push("");
  }
  lines.push(
    `## ${agent.name} (${agent.role}) 에게 요청`,
  );
  lines.push(
    "응답 마지막 줄에 `[[tag:agreement|objection|evidence|risk|coding_impact]]` 중 하나를 적어 본인 발언의 성격을 분류하라.",
  );
  return lines.join("\n");
}

function truncateForPrompt(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

export function inferUtteranceTag(content: string, kind: DebateRoundKind): DebateTag {
  const match = content.match(TAG_MARKER_PATTERN);
  if (match) {
    return match[1]!.toLowerCase() as DebateTag;
  }
  return ROUND_DEFAULT_TAG[kind];
}

const DEFAULT_NOW = (): Date => new Date();
const DEFAULT_GENERATE_ID = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

/**
 * Run one debate round: invite an appropriate subset of agents, call
 * each agent's adapter once, collect utterances. Failures are isolated
 * — a single agent's error never blocks the others.
 *
 * The caller is responsible for:
 *  - persisting the returned utterances
 *  - transitioning the round status (use advanceDebateRound from index.ts)
 *  - assembling each slot's systemPrompt (typically persona + SAFETY.md)
 */
export async function runDebateRound(
  params: RunDebateRoundParams,
): Promise<RunDebateRoundResult> {
  const opts = params.options ?? {};
  const max = opts.maxUtterancesPerRound ?? DEFAULT_MAX_UTTERANCES_PER_ROUND;
  const timeoutMs = opts.perAgentTimeoutMs ?? DEFAULT_PER_AGENT_TIMEOUT_MS;
  const route = opts.routePreference ?? DEFAULT_ROUTE_PREFERENCE;
  const now = opts.now ?? DEFAULT_NOW;
  const generateId = opts.generateId ?? DEFAULT_GENERATE_ID;

  const invited = pickAgentsForRound(params.round.kind, params.slots, max, {
    activePersonaOverrides: opts.activePersonaOverrides,
    rolePersonaPriorities: opts.rolePersonaPriorities,
    allowMultiPersonaRoles: opts.allowMultiPersonaRoles,
  });
  const utterances: DebateUtterance[] = [];
  const agentErrors: DebateAgentError[] = [];

  // Run in parallel — each agent is independent. Errors caught per slot.
  const tasks = invited.map(async (slot): Promise<void> => {
    const requestId = `req_${params.round.id}_${slot.agent.id}_${generateId()}`;
    const messages: ProviderCompletionMessage[] = [
      { role: "system", content: slot.systemPrompt },
      {
        role: "user",
        content: buildRoundUserPrompt(params.round, params.context, slot.agent),
      },
    ];
    const request: ProviderCompletionRequest = {
      id: requestId,
      sessionId: params.context.sessionId,
      providerProfileId: slot.agent.providerProfileId ?? slot.agent.id,
      modelId: slot.modelId,
      messages,
      // "agent" — debate rounds originate from an agent-driven flow,
      // not user-initiated. matches eventSourceSchema in protocol.
      source: "agent",
      routePreference: route,
      createdAt: now().toISOString(),
    };

    try {
      const response = await slot.complete(request, {
        resolveSecret: slot.resolveSecret ?? (async () => undefined),
        timeoutMs,
      });
      if (response.status !== "succeeded" || !response.content) {
        agentErrors.push({
          agentId: slot.agent.id,
          reason: response.error ?? `status=${response.status}`,
        });
        return;
      }
      const tag = inferUtteranceTag(response.content, params.round.kind);
      utterances.push({
        id: `utt_${params.round.id}_${slot.agent.id}_${generateId()}`,
        agentId: slot.agent.id,
        roundId: params.round.id,
        content: response.content,
        tags: [tag],
        createdAt: now().toISOString(),
      });
    } catch (err) {
      agentErrors.push({
        agentId: slot.agent.id,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  });

  await Promise.all(tasks);

  return { utterances, agentErrors };
}

// ── 패치 5: 입장(stance) 추적 + 라운드 간 입장 변화 ──

/** 태그를 입장 극성으로 — 토론이 수렴 중인지 발산 중인지 읽는다 */
export type StancePolarity = "support" | "oppose" | "neutral";

export function tagPolarity(tag: DebateTag): StancePolarity {
  switch (tag) {
    case "agreement":
      return "support";
    case "objection":
    case "risk":
      return "oppose";
    case "evidence":
    case "coding_impact":
    default:
      return "neutral";
  }
}

export type AgentStancePoint = {
  roundId: string;
  roundKind: DebateRoundKind;
  tag: DebateTag;
  polarity: StancePolarity;
};

export type AgentStanceTrajectory = {
  agentId: string;
  points: AgentStancePoint[];
  /** 입장 극성이 라운드 사이에 바뀐 횟수 (support↔oppose 등) */
  changeCount: number;
  /** 마지막 유효 입장 */
  finalPolarity: StancePolarity;
  /** 사람이 읽을 한 줄 요약 */
  summary: string;
};

/**
 * 라운드 전체에서 에이전트별 입장 궤적을 도출(순수). 같은 에이전트의 발언을
 * 라운드 순서대로 모아 극성 변화를 센다. 토론이 진짜 reasoning인지(입장이
 * 비판 후 바뀌는지) parallel monologue인지(아무도 안 바뀜) 드러낸다.
 */
export function deriveStanceTrajectories(rounds: DebateRound[]): AgentStanceTrajectory[] {
  const byAgent = new Map<string, AgentStancePoint[]>();
  for (const round of rounds) {
    for (const utterance of round.utterances) {
      const tag = (utterance.tags?.[0] as DebateTag | undefined) ?? "evidence";
      const point: AgentStancePoint = {
        roundId: round.id,
        roundKind: round.kind,
        tag,
        polarity: tagPolarity(tag),
      };
      const existing = byAgent.get(utterance.agentId);
      if (existing) existing.push(point);
      else byAgent.set(utterance.agentId, [point]);
    }
  }

  const trajectories: AgentStanceTrajectory[] = [];
  for (const [agentId, points] of byAgent) {
    let changeCount = 0;
    let lastDecisive: StancePolarity | null = null;
    for (const point of points) {
      if (point.polarity === "neutral") continue;
      if (lastDecisive !== null && lastDecisive !== point.polarity) changeCount += 1;
      lastDecisive = point.polarity;
    }
    const finalPolarity = lastDecisive ?? "neutral";
    const summary =
      changeCount === 0
        ? finalPolarity === "neutral"
          ? "입장 표명 없음"
          : `일관된 ${finalPolarity === "support" ? "지지" : "반대"}`
        : `${changeCount}회 입장 변화 → 최종 ${finalPolarity === "support" ? "지지" : finalPolarity === "oppose" ? "반대" : "중립"}`;
    trajectories.push({ agentId, points, changeCount, finalPolarity, summary });
  }
  return trajectories;
}

/** 토론이 실제로 입장을 바꾸며 진행됐는지 (parallel-monologue 탐지) */
export function debateHadPositionChanges(rounds: DebateRound[]): boolean {
  return deriveStanceTrajectories(rounds).some((trajectory) => trajectory.changeCount > 0);
}

// ── 패치 3: 상호 인용 링크 (accept/reject/ref 마커 → 스키마 필드) ──

const ACCEPT_MARKER = /\[\[accept:([^\]]+)\]\]/gi;
const REJECT_MARKER = /\[\[reject:([^\]]+)\]\]/gi;
const REF_MARKER = /\[\[ref:([^\]]+)\]\]/gi;

function resolveTargetUtterance(
  token: string,
  priorUtterances: DebateUtterance[],
  selfAgentId: string,
): DebateUtterance | undefined {
  const needle = token.trim().toLowerCase();
  if (!needle) return undefined;
  // 가장 최근 발언부터, 본인 제외, agentId가 토큰을 포함하거나 역할 일치
  for (let i = priorUtterances.length - 1; i >= 0; i -= 1) {
    const candidate = priorUtterances[i]!;
    if (candidate.agentId === selfAgentId) continue;
    const id = candidate.agentId.toLowerCase();
    if (id === needle || id.includes(needle) || id.endsWith(`_${needle}`)) return candidate;
  }
  return undefined;
}

function collectMarkers(content: string, re: RegExp): string[] {
  const out: string[] = [];
  re.lastIndex = 0;
  for (let match = re.exec(content); match; match = re.exec(content)) {
    out.push(match[1]!);
  }
  return out;
}

/**
 * 라운드 전체 발언에 상호 인용 링크를 적용(순수). 각 발언의
 * [[accept:X]]/[[reject:X]]/[[ref:X]] 마커를 직전 발언으로 해석해 대상 발언의
 * acceptedBy/rejectedBy에 인용자 agentId를 추가하고, 비판 발언엔 parentUtteranceId를
 * 단다. chairmanSynthesis의 confidence가 이 신호로 비로소 0.5에서 벗어난다.
 */
export function applyDebateCrossLinks(rounds: DebateRound[]): DebateRound[] {
  // 발언을 시간순으로 펼쳐 누적 — 대상 해석은 "지금까지 나온 발언" 기준
  const flat: DebateUtterance[] = [];
  const acceptedBy = new Map<string, Set<string>>();
  const rejectedBy = new Map<string, Set<string>>();
  const parentOf = new Map<string, string>();

  for (const round of rounds) {
    for (const utterance of round.utterances) {
      const accepts = collectMarkers(utterance.content, ACCEPT_MARKER);
      const rejects = collectMarkers(utterance.content, REJECT_MARKER);
      const refs = collectMarkers(utterance.content, REF_MARKER);

      for (const token of accepts) {
        const target = resolveTargetUtterance(token, flat, utterance.agentId);
        if (target) {
          if (!acceptedBy.has(target.id)) acceptedBy.set(target.id, new Set());
          acceptedBy.get(target.id)!.add(utterance.agentId);
          if (!parentOf.has(utterance.id)) parentOf.set(utterance.id, target.id);
        }
      }
      for (const token of rejects) {
        const target = resolveTargetUtterance(token, flat, utterance.agentId);
        if (target) {
          if (!rejectedBy.has(target.id)) rejectedBy.set(target.id, new Set());
          rejectedBy.get(target.id)!.add(utterance.agentId);
          if (!parentOf.has(utterance.id)) parentOf.set(utterance.id, target.id);
        }
      }
      for (const token of refs) {
        const target = resolveTargetUtterance(token, flat, utterance.agentId);
        if (target && !parentOf.has(utterance.id)) parentOf.set(utterance.id, target.id);
      }
      flat.push(utterance);
    }
  }

  return rounds.map((round) => ({
    ...round,
    utterances: round.utterances.map((utterance) => {
      const accepted = acceptedBy.get(utterance.id);
      const rejected = rejectedBy.get(utterance.id);
      const parent = parentOf.get(utterance.id);
      if (!accepted && !rejected && !parent) return utterance;
      return {
        ...utterance,
        ...(accepted ? { acceptedBy: [...accepted] } : {}),
        ...(rejected ? { rejectedBy: [...rejected] } : {}),
        ...(parent ? { parentUtteranceId: parent } : {}),
      };
    }),
  }));
}
