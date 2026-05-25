import type {
  AgentProfile,
  ProviderCompletionMessage,
  ProviderCompletionRequest,
  ProviderCompletionResponse,
  ProviderCompletionRoute,
} from "@ai-orchestrator/protocol";

import type { DebateContext } from "./index";
import type { DebateEngineAgentSlot, LlmCompletionFn } from "./debateEngine";

/**
 * Companion delegation MVP — depth=1 single-hop.
 *
 * Lets a "companion" (or any caller) issue a delegation in its raw LLM
 * response by emitting an inline tag:
 *
 *   <delegate to="researcher">2024 HTV 시장 규모 한 줄로</delegate>
 *
 * The engine parses these tags, invokes the target agent's adapter once,
 * collects the responses, and lets the caller produce a final follow-up
 * turn that incorporates the sub-agent results in its own voice.
 *
 * Depth invariants (intentional, MVP):
 *   - The sub-agent's response is NOT re-parsed for further `<delegate>`
 *     tags. Sub-agents cannot chain-delegate.
 *   - The caller's follow-up response is also NOT re-parsed. One round
 *     of "delegate → follow-up" total. If the follow-up tries to
 *     delegate again it just becomes literal text in the final output.
 *
 * Security defaults:
 *   - executor / external / auditor are in `DEFAULT_BLOCKED_TARGETS`.
 *     - executor: real command execution requires explicit approval.
 *     - external: sending to outside channels needs ingress/egress guard.
 *     - auditor: independent compliance role — must not be summoned by
 *       the agent it might be auditing.
 *   - Callers can pass a custom `blockedTargets` list.
 *   - The companion CANNOT delegate to itself (loop guard).
 *
 * The parser is deliberately strict: only ASCII attribute name `to`,
 * only role/persona identifiers `[a-zA-Z_][a-zA-Z0-9_-]*` for the
 * value, no nested `<delegate>` (innermost wins). This keeps the
 * grammar small enough that no markdown / HTML library is needed.
 */

const DELEGATE_TAG_PATTERN =
  /<delegate\s+to="([a-zA-Z_][a-zA-Z0-9_-]*)"\s*>([\s\S]*?)<\/delegate>/g;

export const DEFAULT_BLOCKED_TARGETS: ReadonlySet<string> = new Set([
  "executor",
  "external",
  "auditor",
]);

/** A single parsed delegate tag inside a caller's raw response. */
export type DelegateTag = {
  /** Value of the `to` attribute — role name or personaName. */
  target: string;
  /** Body of the tag (the task description the caller wrote). */
  prompt: string;
  /** Original `<delegate ...>...</delegate>` substring, for source-mapping. */
  raw: string;
  /** Index of the first character of `raw` in the source string. */
  startIndex: number;
  /** Index past the last character of `raw` in the source string. */
  endIndex: number;
};

export function parseDelegateTags(content: string): DelegateTag[] {
  const tags: DelegateTag[] = [];
  // RegExp.exec with /g maintains lastIndex across calls — reset by reassigning.
  const pattern = new RegExp(DELEGATE_TAG_PATTERN.source, "g");
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    tags.push({
      target: match[1]!,
      prompt: match[2]!.trim(),
      raw: match[0]!,
      startIndex: match.index,
      endIndex: match.index + match[0]!.length,
    });
  }
  return tags;
}

export type DelegateOutcome =
  | { kind: "succeeded"; tag: DelegateTag; targetAgentId: string; response: string }
  | { kind: "blocked"; tag: DelegateTag; reason: string }
  | { kind: "unknown_target"; tag: DelegateTag }
  | { kind: "self_delegation"; tag: DelegateTag }
  | { kind: "failed"; tag: DelegateTag; targetAgentId: string; reason: string };

export type CompanionTurnOptions = {
  /** Cap on number of delegations resolved per turn. Defaults to 4. */
  maxDelegatesPerTurn?: number;
  /** Override the default blocked targets (executor/external/auditor). */
  blockedTargets?: ReadonlySet<string>;
  /** Per-call timeout forwarded to every adapter call. Default 60_000 ms. */
  perAgentTimeoutMs?: number;
  /** Route preference for the underlying ProviderCompletionRequest. */
  routePreference?: ProviderCompletionRoute;
  /** Time / id sources for deterministic tests. */
  now?: () => Date;
  generateId?: () => string;
};

export type CompanionTurnInput = {
  /** Caller slot (typically a companion such as 채아린). */
  caller: DebateEngineAgentSlot;
  /** Conversation context — feeds into the caller's initial prompt. */
  context: DebateContext;
  /**
   * Lookup for delegation targets. Key is the `to` attribute value
   * (role name OR personaName), value is the adapter slot to call.
   * Multiple keys MAY point to the same slot — e.g. a researcher
   * slot can be registered under both `"researcher"` and `"maomao"`.
   */
  targets: Map<string, DebateEngineAgentSlot>;
  /** User-facing prompt the companion is responding to. */
  userMessage: string;
  options?: CompanionTurnOptions;
};

export type CompanionTurnResult = {
  /** Final text to show the user — produced by the caller's follow-up turn. */
  finalContent: string;
  /** The caller's first raw response (before delegations were resolved). */
  initialContent: string;
  /** One entry per parsed `<delegate>` tag. */
  delegations: DelegateOutcome[];
  /** True when the caller's initial response contained no delegate tags. */
  shortCircuited: boolean;
};

const DEFAULT_MAX_DELEGATES = 4;
const DEFAULT_PER_AGENT_TIMEOUT_MS = 60_000;
const DEFAULT_ROUTE: ProviderCompletionRoute = "server_proxy";
const DEFAULT_NOW = (): Date => new Date();
const DEFAULT_GENERATE_ID = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

/**
 * Run a companion turn end-to-end:
 *   1. Call the caller's adapter with `userMessage`.
 *   2. Parse `<delegate>` tags in the response.
 *   3. For each tag (up to `maxDelegatesPerTurn`), invoke the target
 *      slot's adapter once.
 *   4. Hand the caller a follow-up turn with the sub-agent results
 *      appended, so it can produce a final response in its own voice.
 *   5. Return the final content + full audit trail.
 *
 * The caller's adapter is called at most twice (initial + follow-up).
 * Each invited sub-agent is called at most once. No tag in the
 * follow-up triggers further delegation.
 */
export async function runCompanionTurn(
  input: CompanionTurnInput,
): Promise<CompanionTurnResult> {
  const opts = input.options ?? {};
  const maxDelegates = Math.max(0, opts.maxDelegatesPerTurn ?? DEFAULT_MAX_DELEGATES);
  const blocked = opts.blockedTargets ?? DEFAULT_BLOCKED_TARGETS;
  const timeoutMs = opts.perAgentTimeoutMs ?? DEFAULT_PER_AGENT_TIMEOUT_MS;
  const route = opts.routePreference ?? DEFAULT_ROUTE;
  const now = opts.now ?? DEFAULT_NOW;
  const generateId = opts.generateId ?? DEFAULT_GENERATE_ID;

  const initialContent = await callAdapter({
    slot: input.caller,
    sessionId: input.context.sessionId,
    messages: [
      { role: "system", content: input.caller.systemPrompt },
      { role: "user", content: input.userMessage },
    ],
    requestIdSuffix: `companion_initial_${generateId()}`,
    route,
    timeoutMs,
    now,
  });

  const parsed = parseDelegateTags(initialContent);
  if (parsed.length === 0) {
    return {
      finalContent: initialContent,
      initialContent,
      delegations: [],
      shortCircuited: true,
    };
  }

  // Resolve up to maxDelegates tags. Excess tags are recorded as
  // blocked with reason `"max_delegates_exceeded"` so the audit trail
  // shows what was skipped (rather than silently dropping).
  const outcomes: DelegateOutcome[] = [];
  const callerPersonaName = input.caller.agent.personaName ?? input.caller.agent.role;

  for (let i = 0; i < parsed.length; i += 1) {
    const tag = parsed[i]!;
    if (i >= maxDelegates) {
      outcomes.push({ kind: "blocked", tag, reason: "max_delegates_exceeded" });
      continue;
    }
    if (blocked.has(tag.target)) {
      outcomes.push({ kind: "blocked", tag, reason: `target "${tag.target}" is in blocked list` });
      continue;
    }
    // Loop guard: caller cannot delegate to itself by either role or personaName.
    if (tag.target === input.caller.agent.role || tag.target === callerPersonaName) {
      outcomes.push({ kind: "self_delegation", tag });
      continue;
    }
    const targetSlot = input.targets.get(tag.target);
    if (!targetSlot) {
      outcomes.push({ kind: "unknown_target", tag });
      continue;
    }

    try {
      const response = await callAdapter({
        slot: targetSlot,
        sessionId: input.context.sessionId,
        messages: [
          { role: "system", content: targetSlot.systemPrompt },
          { role: "user", content: buildSubAgentPrompt(input.caller.agent, tag.prompt) },
        ],
        requestIdSuffix: `companion_delegate_${tag.target}_${generateId()}`,
        route,
        timeoutMs,
        now,
      });
      outcomes.push({
        kind: "succeeded",
        tag,
        targetAgentId: targetSlot.agent.id,
        response,
      });
    } catch (err) {
      outcomes.push({
        kind: "failed",
        tag,
        targetAgentId: targetSlot.agent.id,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Follow-up turn: caller sees initial response + sub-agent results,
  // produces a final answer in its own voice. Note we feed the original
  // initial response back as `role: "assistant"` so the LLM treats it
  // as its own prior turn (anti-amnesia + delegate context preserved).
  const followUpUser = buildCompanionFollowUpPrompt(outcomes, input.userMessage);
  const finalContent = await callAdapter({
    slot: input.caller,
    sessionId: input.context.sessionId,
    messages: [
      { role: "system", content: input.caller.systemPrompt },
      { role: "user", content: input.userMessage },
      { role: "assistant", content: initialContent },
      { role: "user", content: followUpUser },
    ],
    requestIdSuffix: `companion_followup_${generateId()}`,
    route,
    timeoutMs,
    now,
  });

  return {
    finalContent,
    initialContent,
    delegations: outcomes,
    shortCircuited: false,
  };
}

function buildSubAgentPrompt(caller: AgentProfile, taskPrompt: string): string {
  const callerLabel = caller.personaName ?? caller.role;
  return [
    `[Delegated by ${callerLabel} (${caller.role})]`,
    "",
    taskPrompt,
    "",
    "Respond in your own voice and role. The companion will re-package your output for the user — speak as the specialist you are, not as the companion.",
    "Do not include `<delegate>` tags in your response (depth=1 only).",
  ].join("\n");
}

function buildCompanionFollowUpPrompt(outcomes: DelegateOutcome[], userMessage: string): string {
  const lines: string[] = [];
  lines.push(
    "위에서 너가 위임한 sub-agent들의 결과가 도착했어. 이제 사용자에게 최종 응답을 너의 목소리로 정리해서 줘.",
  );
  lines.push("");
  lines.push("## Sub-agent 결과");
  for (const outcome of outcomes) {
    lines.push("");
    lines.push(`### → ${outcome.tag.target}`);
    lines.push(`Task: ${truncate(outcome.tag.prompt, 400)}`);
    switch (outcome.kind) {
      case "succeeded":
        lines.push("Status: succeeded");
        lines.push("");
        lines.push(truncate(outcome.response, 2000));
        break;
      case "blocked":
        lines.push(`Status: blocked (${outcome.reason})`);
        break;
      case "unknown_target":
        lines.push("Status: unknown_target (해당 target이 등록되지 않음)");
        break;
      case "self_delegation":
        lines.push("Status: self_delegation (자기 자신에게는 위임 불가)");
        break;
      case "failed":
        lines.push(`Status: failed (${outcome.reason})`);
        break;
    }
  }
  lines.push("");
  lines.push("## 사용자에게 최종 응답");
  lines.push(
    "위 결과들을 종합해서 사용자가 처음 물어본 질문에 답해줘. 응답에는 `<delegate>` 태그를 절대 다시 쓰지 마 — 한 턴에 한 사이클만 허용돼.",
  );
  lines.push("");
  lines.push(`사용자 원본 질문: ${userMessage}`);
  return lines.join("\n");
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

async function callAdapter(params: {
  slot: DebateEngineAgentSlot;
  sessionId: string;
  messages: ProviderCompletionMessage[];
  requestIdSuffix: string;
  route: ProviderCompletionRoute;
  timeoutMs: number;
  now: () => Date;
}): Promise<string> {
  const { slot, sessionId, messages, requestIdSuffix, route, timeoutMs, now } = params;
  const complete: LlmCompletionFn = slot.complete;
  const request: ProviderCompletionRequest = {
    id: `req_${requestIdSuffix}`,
    sessionId,
    providerProfileId: slot.agent.providerProfileId ?? slot.agent.id,
    modelId: slot.modelId,
    messages,
    source: "agent",
    routePreference: route,
    createdAt: now().toISOString(),
  };
  const response: ProviderCompletionResponse = await complete(request, {
    resolveSecret: slot.resolveSecret ?? (async () => undefined),
    timeoutMs,
  });
  if (response.status !== "succeeded" || !response.content) {
    throw new Error(response.error ?? `adapter status=${response.status}`);
  }
  return response.content;
}
