import type {
  ProviderCompletionRequest,
  RmasAcceptanceCriterion,
  RmasAgentSlotConfig,
} from "@ai-orchestrator/protocol";
import type { LlmCompletionFn } from "../debateEngine.js";
import type { RmasEmit } from "./patterns.js";

/**
 * The judge — one completion call (the `judgeSlotId` slot, default the `critic`
 * kind). Handed the goal, acceptance criteria, and the candidate, it must
 * answer criterion-by-criterion. Because models return text, we require a
 * fenced JSON block and parse DEFENSIVELY — `parseJudgeVerdict` NEVER throws;
 * on any parse/validation failure it returns a "revise" verdict (accepted
 * false, raw text as feedback) so the loop keeps going and never crashes.
 *
 * Honesty invariant: a run only reports "goal achieved" from a recorded accept
 * verdict with criteria coverage (accept requires ALL criteria met).
 */

export type JudgeVerdict = {
  accepted: boolean;
  score?: number;
  perCriterion: Array<{ id: string; met: boolean; note?: string }>;
  feedback: string;
};

type RawVerdict = {
  accepted?: boolean;
  score?: number;
  perCriterion?: Array<{ id: string; met: boolean; note?: string }>;
  feedback?: string;
};

/**
 * Hand-rolled structural validation — packages/agents intentionally does NOT
 * depend on zod (it stays free of the heavy validation/provider deps), so we
 * coerce the parsed JSON with plain type guards. Returns undefined if the value
 * is not an object.
 */
function coerceRawVerdict(value: unknown): RawVerdict | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const object = value as Record<string, unknown>;
  const out: RawVerdict = {};
  if (typeof object.accepted === "boolean") out.accepted = object.accepted;
  if (typeof object.score === "number") out.score = object.score;
  if (typeof object.feedback === "string") out.feedback = object.feedback;
  if (Array.isArray(object.perCriterion)) {
    const items: Array<{ id: string; met: boolean; note?: string }> = [];
    for (const item of object.perCriterion) {
      if (typeof item !== "object" || item === null) continue;
      const record = item as Record<string, unknown>;
      if (typeof record.id === "string" && typeof record.met === "boolean") {
        items.push({ id: record.id, met: record.met, note: typeof record.note === "string" ? record.note : undefined });
      }
    }
    out.perCriterion = items;
  }
  return out;
}

/** Pull the first fenced code block (```json preferred) out of model text. */
function extractJsonBlock(text: string): string | undefined {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i) ?? text.match(/```\s*([\s\S]*?)```/);
  if (fenced && fenced[1]) return fenced[1].trim();
  return undefined;
}

/**
 * Parse a judge response into a verdict. Acceptance rule (§4.3):
 *   - with criteria: accepted = every criterion met (criterion-by-criterion);
 *   - no criteria: accepted = the holistic `accepted` flag.
 * Never throws — malformed/absent JSON yields a revise verdict.
 */
export function parseJudgeVerdict(text: string, criteria: RmasAcceptanceCriterion[]): JudgeVerdict {
  const rawBlock = extractJsonBlock(text);
  let parsedObject: unknown;
  if (rawBlock !== undefined) {
    try {
      parsedObject = JSON.parse(rawBlock);
    } catch {
      parsedObject = undefined;
    }
  }
  const data = parsedObject === undefined ? undefined : coerceRawVerdict(parsedObject);
  if (!data) {
    // revise fallback — loop keeps going, never crashes
    return { accepted: false, perCriterion: [], feedback: text };
  }

  if (criteria.length > 0) {
    const perCriterion = criteria.map((criterion) => {
      const found = data.perCriterion?.find((p) => p.id === criterion.id);
      return { id: criterion.id, met: found?.met ?? false, note: found?.note };
    });
    return {
      accepted: perCriterion.every((p) => p.met),
      score: data.score,
      perCriterion,
      feedback: data.feedback ?? "",
    };
  }

  return {
    accepted: data.accepted ?? false,
    score: data.score,
    perCriterion: data.perCriterion ?? [],
    feedback: data.feedback ?? text,
  };
}

function judgeSystemPrompt(slot: RmasAgentSlotConfig): string {
  if (slot.systemPrompt.trim().length > 0) return slot.systemPrompt;
  return "당신은 엄격한 심판입니다. 각 수용기준을 하나씩 met/unmet으로 판정하세요.";
}

function judgeUserPrompt(goal: string, criteria: RmasAcceptanceCriterion[], candidate: string): string {
  const criteriaBlock =
    criteria.length > 0
      ? criteria.map((c) => `- (${c.id}) ${c.text}`).join("\n")
      : "(명시적 수용기준 없음 — 목표 달성 여부를 종합적으로 판정)";
  const shape =
    criteria.length > 0
      ? `{"perCriterion":[{"id":"<기준 id>","met":true|false,"note":"<사유>"}],"score":0..1,"feedback":"<총평>"}`
      : `{"accepted":true|false,"score":0..1,"feedback":"<총평>"}`;
  return [
    "## 목표",
    goal,
    "",
    "## 수용기준",
    criteriaBlock,
    "",
    "## 후보 산출물",
    candidate,
    "",
    "위 후보가 목표/기준을 충족하는지 판정하고, 아래 형태의 JSON을 ```json 코드펜스로 감싸 답하세요.",
    "```json",
    shape,
    "```",
  ].join("\n");
}

export type EvaluateGoalAcceptanceInput = {
  sessionId: string;
  goal: string;
  criteria: RmasAcceptanceCriterion[];
  candidate: string;
  judgeSlot: RmasAgentSlotConfig;
  iteration: number;
  complete: LlmCompletionFn;
  emit: RmasEmit;
  signal: AbortSignal;
  now: () => Date;
  generateId: () => string;
};

/**
 * Run one metered judge completion, parse defensively, emit
 * `rmas.judge.evaluated`, and return the verdict. On a failed provider call the
 * candidate is treated as not-yet-accepted (revise) with the provider error as
 * feedback — honest, and the loop continues.
 */
export async function evaluateGoalAcceptance(input: EvaluateGoalAcceptanceInput): Promise<JudgeVerdict> {
  const request: ProviderCompletionRequest = {
    id: input.generateId(),
    sessionId: input.sessionId,
    providerProfileId: input.judgeSlot.providerProfileId,
    modelId: input.judgeSlot.modelId,
    messages: [
      { role: "system", content: judgeSystemPrompt(input.judgeSlot) },
      { role: "user", content: judgeUserPrompt(input.goal, input.criteria, input.candidate) },
    ],
    source: "agent",
    routePreference: "server_proxy",
    createdAt: input.now().toISOString(),
  };

  const response = await input.complete(request, {
    resolveSecret: async () => undefined,
    abortSignal: input.signal,
  });

  const verdict =
    response.status === "succeeded"
      ? parseJudgeVerdict(response.content ?? "", input.criteria)
      : { accepted: false, perCriterion: [], feedback: response.error ?? `judge status ${response.status}` };

  await input.emit({
    type: "rmas.judge.evaluated",
    payload: {
      iteration: input.iteration,
      accepted: verdict.accepted,
      score: verdict.score,
      perCriterion: verdict.perCriterion,
      feedback: verdict.feedback,
    },
  });

  return verdict;
}
