import type {
  AgentProfile,
  AgentRole,
  DebateRound,
  DebateUtterance,
  ProviderCompletionRequest,
  RmasAgentSlotConfig,
  RmasPattern,
  RmasRunConfig,
  RmasRunEventType,
  RmasSlotKind,
} from "@ai-orchestrator/protocol";
import type { DebateContext } from "../index.js";
import { createDebateRounds } from "../index.js";
import type { DebateEngineAgentSlot, LlmCompletionFn } from "../debateEngine.js";
import { runDebate } from "../runDebate.js";
import { synthesizeChairmanDecision } from "../chairmanSynthesis.js";

/**
 * The four RMAS patterns as composable strategies over the same completion-fn
 * boundary. Each `runIteration` runs one pass of the goal loop and returns a
 * single candidate output; the outer loop (goalLoop.ts) owns iteration,
 * budgets, and the judge. Every model call goes through the shared `callSlot`
 * helper, which emits `rmas.agent.started` before and `rmas.agent.message`
 * after (or `rmas.agent.error` on a non-`succeeded` status) — so the trace and
 * live status dots are uniform across patterns.
 */

/** Persists an event (and, via the store hook, streams it). Defined here so
 * judge.ts and goalLoop.ts share one emit type without a cycle. */
export type RmasEmit = (input: {
  type: RmasRunEventType;
  payload: unknown;
  createdAt?: string;
}) => Promise<void>;

export type RmasWorkingContext = {
  goal: string;
  priorOutput?: string;
  critiques: string[];
};

export type PatternIterationInput = {
  config: RmasRunConfig;
  /** sessionId for the provider requests (= rmas_<runId>). */
  sessionId: string;
  slots: RmasAgentSlotConfig[]; // enabled only
  workingContext: RmasWorkingContext;
  iteration: number;
  complete: LlmCompletionFn; // metered
  emit: RmasEmit;
  signal: AbortSignal;
  now: () => Date;
  generateId: () => string;
};

export type PatternIterationResult = { output: string };
export type PatternStrategy = {
  id: RmasPattern;
  runIteration(input: PatternIterationInput): Promise<PatternIterationResult>;
};

// ── Shared slot call ──────────────────────────────────────────────────────────

/** Build + run one completion for a slot, emitting started/message|error. */
async function callSlot(
  slot: RmasAgentSlotConfig,
  userPrompt: string,
  input: PatternIterationInput,
): Promise<{ content: string; ok: boolean }> {
  const request: ProviderCompletionRequest = {
    id: input.generateId(),
    sessionId: input.sessionId,
    providerProfileId: slot.providerProfileId,
    modelId: slot.modelId,
    messages: [
      { role: "system", content: slot.systemPrompt },
      { role: "user", content: userPrompt },
    ],
    source: "agent",
    routePreference: "server_proxy",
    createdAt: input.now().toISOString(),
  };

  await input.emit({
    type: "rmas.agent.started",
    payload: { slotId: slot.id, name: slot.name, kind: slot.kind, iteration: input.iteration },
  });

  const response = await input.complete(request, {
    resolveSecret: async () => undefined,
    abortSignal: input.signal,
  });

  if (response.status !== "succeeded") {
    await input.emit({
      type: "rmas.agent.error",
      payload: {
        slotId: slot.id,
        reason: response.error ?? `status ${response.status}`,
        name: slot.name,
        iteration: input.iteration,
      },
    });
    return { content: "", ok: false };
  }

  const content = response.content ?? "";
  await input.emit({
    type: "rmas.agent.message",
    payload: {
      slotId: slot.id,
      name: slot.name,
      kind: slot.kind,
      iteration: input.iteration,
      content,
      usage: response.usage,
    },
  });
  return { content, ok: true };
}

// ── Role mapping for the Deliberation bridge ──────────────────────────────────

const DISTINCT_ROLES: AgentRole[] = ["architect", "skeptic", "builder", "reviewer", "mediator", "verifier"];

/**
 * Map an RMAS slot to a DISTINCT `AgentRole` (cycling by index) so
 * `pickAgentsForRound` invites every slot to a debate round rather than
 * de-duping by role. All six roles appear in `ROUND_ROLE_PRIORITY`.
 */
export function kindToDistinctRole(_slot: RmasAgentSlotConfig, index: number): AgentRole {
  return DISTINCT_ROLES[index % DISTINCT_ROLES.length]!;
}

// ── Prompt helpers ────────────────────────────────────────────────────────────

function critiqueBlock(critiques: string[]): string {
  if (critiques.length === 0) return "";
  return `\n\n## 지난 반복의 심판 피드백\n${critiques.map((c) => `- ${c}`).join("\n")}`;
}

function goalPrompt(context: RmasWorkingContext): string {
  return `## 목표\n${context.goal}${critiqueBlock(context.critiques)}`;
}

// ── Strategies ────────────────────────────────────────────────────────────────

// Sequential — Planner → Critic → Solver, one call each per iteration.
const sequential: PatternStrategy = {
  id: "sequential",
  async runIteration(input) {
    const { slots } = input;
    const planner = slots.find((s) => s.kind === "planner") ?? slots[0];
    if (!planner) return { output: "" };
    const critic = slots.find((s) => s.kind === "critic") ?? slots[1];
    const solver = slots.find((s) => s.kind === "solver") ?? slots[2] ?? slots[slots.length - 1] ?? planner;

    const plan = await callSlot(planner, `${goalPrompt(input.workingContext)}\n\n계획을 세우세요.`, input);
    const critique = critic
      ? await callSlot(critic, `## 목표\n${input.workingContext.goal}\n\n## 계획\n${plan.content}\n\n계획을 비평하세요.`, input)
      : { content: "", ok: true };
    const result = await callSlot(
      solver,
      `## 목표\n${input.workingContext.goal}\n\n## 계획\n${plan.content}\n\n## 비평\n${critique.content}\n\n최종 산출물을 작성하세요.`,
      input,
    );
    return { output: result.content };
  },
};

// Deliberation — reuse the debate engine, bridge utterances to agent.message.
const deliberation: PatternStrategy = {
  id: "deliberation",
  async runIteration(input) {
    const debateId = input.generateId();
    const debateSlots: DebateEngineAgentSlot[] = input.slots.map((slot, index) => {
      const agent: AgentProfile = {
        id: slot.id,
        name: slot.name,
        role: kindToDistinctRole(slot, index),
        kind: "virtual",
        soulMode: "off",
        configSource: "off",
        enabled: true,
      };
      return { agent, complete: input.complete, systemPrompt: slot.systemPrompt, modelId: slot.modelId };
    });

    const context: DebateContext = {
      sessionId: input.sessionId,
      problem: input.workingContext.goal,
      conversationSummary: input.workingContext.critiques.join("\n"),
      constraints: [],
      openQuestions: [],
      userPreferences: [],
      memoryTraceIds: [],
    };

    const result = await runDebate({
      debateId,
      initialRounds: createDebateRounds(debateId),
      context,
      slots: debateSlots,
      engineOptions: { now: input.now, generateId: input.generateId },
      consensus: { beta: 2, similarityThreshold: 0.5 },
    });

    // Bridge each debate utterance to an rmas.agent.message so the RMAS trace
    // shows the deliberation. Metering already happened inside runDebate via
    // the metered `complete`.
    for (const round of result.rounds) {
      for (const utterance of round.utterances) {
        const slot = input.slots.find((s) => s.id === utterance.agentId);
        await input.emit({
          type: "rmas.agent.message",
          payload: {
            slotId: utterance.agentId,
            name: slot?.name ?? utterance.agentId,
            kind: (slot?.kind ?? "custom") satisfies RmasSlotKind,
            iteration: input.iteration,
            content: utterance.content,
          },
        });
      }
    }

    const decision = synthesizeChairmanDecision(context, result.rounds);
    const output = [decision.statement, ...decision.adopted.map((a) => `- ${a.point}`)].join("\n");
    return { output };
  },
};

// Mixture — N parallel proposals (capped at maxParallel) → aggregator merge.
const mixture: PatternStrategy = {
  id: "mixture",
  async runIteration(input) {
    const aggregator = input.slots.find((s) => s.kind === "aggregator");
    const proposers = input.slots.filter((s) => s.kind !== "aggregator").slice(0, input.config.budgets.maxParallel);
    const active = proposers.length > 0 ? proposers : input.slots.slice(0, input.config.budgets.maxParallel);

    const proposals = await Promise.all(
      active.map((slot) => callSlot(slot, `${goalPrompt(input.workingContext)}\n\n제안을 작성하세요.`, input)),
    );
    const labeled = proposals
      .map((p, i) => ({ slot: active[i]!, content: p.content }))
      .filter((p) => p.content.length > 0);

    if (aggregator) {
      const merged = await callSlot(
        aggregator,
        `## 목표\n${input.workingContext.goal}\n\n## 제안들\n${labeled
          .map((p) => `### ${p.slot.name}\n${p.content}`)
          .join("\n\n")}\n\n위 제안들을 하나로 통합하세요.`,
        input,
      );
      return { output: merged.content };
    }

    // No aggregator configured → deterministic chairman merge over synthetic
    // utterances (no extra model call).
    const roundId = input.generateId();
    const utterances: DebateUtterance[] = labeled.map((p) => ({
      id: input.generateId(),
      agentId: p.slot.id,
      roundId,
      content: p.content,
      tags: ["agreement"],
      createdAt: input.now().toISOString(),
    }));
    const round: DebateRound = {
      id: roundId,
      debateId: input.sessionId,
      kind: "initial_proposals",
      title: "제안",
      status: "completed",
      utterances,
    };
    const context: DebateContext = {
      sessionId: input.sessionId,
      problem: input.workingContext.goal,
      conversationSummary: "",
      constraints: [],
      openQuestions: [],
      userPreferences: [],
      memoryTraceIds: [],
    };
    const decision = synthesizeChairmanDecision(context, [round]);
    const output = [decision.statement, ...decision.adopted.map((a) => `- ${a.point}`)].join("\n");
    return { output };
  },
};

// Distillation — large model produces, small model distills.
const distillation: PatternStrategy = {
  id: "distillation",
  async runIteration(input) {
    const { slots } = input;
    const producer = slots.find((s) => s.kind === "producer") ?? slots[0];
    if (!producer) return { output: "" };
    const distiller = slots.find((s) => s.kind === "distiller") ?? slots[slots.length - 1] ?? producer;

    const draft = await callSlot(producer, `${goalPrompt(input.workingContext)}\n\n철저한 초안을 작성하세요.`, input);
    if (distiller === producer) return { output: draft.content };
    const final = await callSlot(
      distiller,
      `## 목표\n${input.workingContext.goal}\n\n## 초안\n${draft.content}\n\n위 초안을 압축·정제해 최종안을 작성하세요.`,
      input,
    );
    return { output: final.content };
  },
};

export const STRATEGIES: Record<RmasPattern, PatternStrategy> = {
  sequential,
  deliberation,
  mixture,
  distillation,
};
