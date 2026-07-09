import { rmasSessionId, type RmasAgentSlotConfig, type RmasRunConfig } from "@ai-orchestrator/protocol";
import type { LlmCompletionFn } from "../debateEngine.js";
import { RmasTokenMeter } from "./tokenMeter.js";
import { evaluateGoalAcceptance } from "./judge.js";
import { STRATEGIES, type RmasEmit, type RmasWorkingContext } from "./patterns.js";

/**
 * The pure iterative goal loop — the core new piece. Mock-testable, no server
 * deps: it drives agent→agent through the chosen pattern strategy, judges each
 * candidate, and stops when a judge accepts or a hard budget trips (iterations
 * / tokens / wall-clock) or the abort signal fires. All state is emitted as
 * events via `deps.emit`; the loop owns no persistence and no clock beyond the
 * injected `now`. The server wraps this with a controller that binds `emit` to
 * the event store and `complete` to the DGX proxy, and arms a wall-clock timer
 * that calls `signal`'s abort.
 */

export type { RmasEmit } from "./patterns.js";

export type RmasLoopDeps = {
  /**
   * Identifies the run — used to namespace provider requests
   * (`sessionId = rmas_<runId>`) so proxy-side events correlate to the run.
   * (Deviation from the design's RmasLoopDeps, which omitted it: the strategies
   * and judge need a sessionId to build ProviderCompletionRequests.)
   */
  runId: string;
  /** server injects a proxy-bound fn; tests inject a scripted fn */
  complete: LlmCompletionFn;
  /** persists event + (via the store hook) streams it */
  emit: RmasEmit;
  /** stop button / wall-clock deadline */
  signal: AbortSignal;
  now?: () => Date;
  generateId?: () => string;
};

export type RmasLoopOutcome = {
  status: "completed" | "exhausted" | "stopped";
  accepted: boolean;
  finalOutput?: string;
  tokens: { input: number; output: number; total: number };
  iterations: number;
};

function createDefaultIdGenerator(): () => string {
  let counter = 0;
  return () => {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
    counter += 1;
    return `rmas_${counter}_${Math.random().toString(36).slice(2)}`;
  };
}

/** §2 default: judgeSlotId, else first enabled `critic`, else last enabled slot. */
function pickJudgeSlot(config: RmasRunConfig): RmasAgentSlotConfig | undefined {
  const enabled = config.agents.filter((agent) => agent.enabled);
  if (config.judgeSlotId) {
    const byId = enabled.find((agent) => agent.id === config.judgeSlotId);
    if (byId) return byId;
  }
  return enabled.find((agent) => agent.kind === "critic") ?? enabled[enabled.length - 1];
}

export async function runGoalLoop(config: RmasRunConfig, deps: RmasLoopDeps): Promise<RmasLoopOutcome> {
  const now = deps.now ?? (() => new Date());
  const generateId = deps.generateId ?? createDefaultIdGenerator();
  const sessionId = rmasSessionId(deps.runId);
  const meter = new RmasTokenMeter(deps.complete);
  const strategy = STRATEGIES[config.pattern];
  const judgeSlot = pickJudgeSlot(config);
  const enabledSlots = config.agents.filter((agent) => agent.enabled);
  const deadline = now().getTime() + config.budgets.wallClockMs;
  const workingContext: RmasWorkingContext = { goal: config.goal, critiques: [] };
  let best: string | undefined;

  await deps.emit({ type: "rmas.run.started", payload: {} });

  for (let iteration = 1; iteration <= config.budgets.maxIterations; iteration += 1) {
    // Budget guards, checked in order (§4.1).
    if (deps.signal.aborted) {
      await deps.emit({ type: "rmas.run.stopped", payload: { by: "user" } });
      return { status: "stopped", accepted: false, finalOutput: best, tokens: meter.snapshot(), iterations: iteration - 1 };
    }
    if (meter.snapshot().total >= config.budgets.maxTotalTokens) {
      await deps.emit({ type: "rmas.run.exhausted", payload: { reason: "max_tokens", bestOutput: best, tokens: meter.snapshot() } });
      return { status: "exhausted", accepted: false, finalOutput: best, tokens: meter.snapshot(), iterations: iteration - 1 };
    }
    if (now().getTime() >= deadline) {
      await deps.emit({ type: "rmas.run.exhausted", payload: { reason: "wall_clock", bestOutput: best, tokens: meter.snapshot() } });
      return { status: "exhausted", accepted: false, finalOutput: best, tokens: meter.snapshot(), iterations: iteration - 1 };
    }

    await deps.emit({ type: "rmas.iteration.started", payload: { iteration } });

    // The strategy emits rmas.agent.started / rmas.agent.message / rmas.agent.error
    // per call. `complete` is metered so tokens accrue uniformly.
    const { output: candidate } = await strategy.runIteration({
      config,
      sessionId,
      slots: enabledSlots,
      workingContext,
      iteration,
      complete: meter.wrap,
      emit: deps.emit,
      signal: deps.signal,
      now,
      generateId,
    });
    best = candidate;

    await deps.emit({ type: "rmas.tokens.tallied", payload: meter.snapshot() });

    const verdict = judgeSlot
      ? await evaluateGoalAcceptance({
          sessionId,
          goal: config.goal,
          criteria: config.acceptanceCriteria,
          candidate,
          judgeSlot,
          iteration,
          complete: meter.wrap,
          emit: deps.emit,
          signal: deps.signal,
          now,
          generateId,
        })
      : { accepted: false, perCriterion: [], feedback: "심판 슬롯이 없어 판정할 수 없습니다" };

    if (verdict.accepted) {
      await deps.emit({
        type: "rmas.run.completed",
        payload: { accepted: true, finalOutput: candidate, iterations: iteration, tokens: meter.snapshot() },
      });
      return { status: "completed", accepted: true, finalOutput: candidate, tokens: meter.snapshot(), iterations: iteration };
    }

    await deps.emit({ type: "rmas.iteration.completed", payload: { iteration, accepted: false } });
    workingContext.priorOutput = candidate;
    workingContext.critiques.push(verdict.feedback);
  }

  // iteration budget exhausted
  await deps.emit({ type: "rmas.run.exhausted", payload: { reason: "max_iterations", bestOutput: best, tokens: meter.snapshot() } });
  return { status: "exhausted", accepted: false, finalOutput: best, tokens: meter.snapshot(), iterations: config.budgets.maxIterations };
}
