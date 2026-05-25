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
    "이 라운드의 목표는 다른 에이전트의 제안을 비판하는 것이다. 동의/반대/근거/리스크 중 하나를 명시하고, 어떤 발언에 대한 비판인지 분명히 인용하라.",
  orchestrator_summary:
    "이 라운드의 목표는 지금까지의 합의/불일치/미결 항목을 짧게 요약하는 것이다. 정렬되지 않은 결정은 명시적으로 ‘미결’로 남겨라.",
  refinement:
    "이 라운드의 목표는 보완안을 내놓는 것이다. 직전 비판을 흡수해 1차 제안을 어떻게 고칠지 차분히 적고, 코딩 영향(파일/스키마/모듈)이 있다면 함께 기록하라.",
  final_decision:
    "이 라운드의 목표는 단일 결정을 내리는 것이다. 채택안과 그 근거, 거부된 옵션과 그 이유를 분리해 적어라.",
  coding_packet:
    "이 라운드의 목표는 코딩 전달 패킷의 초안을 만드는 것이다. 목표/맥락/결정/거부된 옵션/제약/검토할 파일/구현 계획/검증 계획/리뷰어 노트를 짧게 적어라. 절대 경로나 상위 디렉터리 이동(`..`)은 사용하지 말 것.",
};

/**
 * Pick which agents are invited to this round. Filters by recommended
 * role list and caps at `max` slots, preserving the priority order from
 * ROUND_ROLE_PRIORITY. The orchestrator is always considered first.
 */
export function pickAgentsForRound(
  kind: DebateRoundKind,
  slots: DebateEngineAgentSlot[],
  max: number,
): DebateEngineAgentSlot[] {
  const cap = Math.max(1, Math.min(HARD_MAX_UTTERANCES_PER_ROUND, max));
  const priority = ROUND_ROLE_PRIORITY[kind];
  // Keyed by string so future AgentRole additions (R3.2) work without
  // a code change here — see ROUND_ROLE_PRIORITY note.
  const eligibleByRole = new Map<string, DebateEngineAgentSlot[]>();
  for (const slot of slots) {
    if (!slot.agent.enabled) continue;
    const bucket = eligibleByRole.get(slot.agent.role) ?? [];
    bucket.push(slot);
    eligibleByRole.set(slot.agent.role, bucket);
  }
  const selected: DebateEngineAgentSlot[] = [];
  for (const role of priority) {
    const bucket = eligibleByRole.get(role);
    if (!bucket) continue;
    for (const slot of bucket) {
      if (selected.length >= cap) break;
      selected.push(slot);
    }
    if (selected.length >= cap) break;
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

  const invited = pickAgentsForRound(params.round.kind, params.slots, max);
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
