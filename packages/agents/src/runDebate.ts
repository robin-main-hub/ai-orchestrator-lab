/**
 * Orchestration helper that runs an entire debate end-to-end.
 *
 * Combines `runDebateRound` (engine.ts) and `advanceDebateRound`
 * (index.ts) into a single call. Walks the round list in order, runs
 * each round, transitions status, and accumulates per-round results.
 *
 * Stops early if a round throws synchronously, if `options.shouldStop`
 * returns true after a round, or if `advanceDebateRound` reports
 * `finished: true`.
 *
 * Pure orchestration — does not own persistence. Callers decide what to
 * do with `RunDebateResult.rounds` (final round list with utterances
 * stitched in) and `RunDebateResult.roundResults` (per-round engine
 * output including agentErrors).
 */
import type { DebateRound } from "@ai-orchestrator/protocol";

import {
  advanceDebateRound,
  type DebateContext,
} from "./index.js";
import {
  runDebateRound,
  type DebateEngineAgentSlot,
  type DebateEngineOptions,
  type RunDebateRoundResult,
} from "./debateEngine.js";

export type RunDebateParams = {
  debateId: string;
  initialRounds: DebateRound[];
  context: DebateContext;
  slots: DebateEngineAgentSlot[];
  engineOptions?: DebateEngineOptions;
  /**
   * Optional early-stop hook. Called after each round completes with
   * the round's engine result and the updated round list. Return true
   * to stop the debate (remaining rounds are left in their current
   * status).
   */
  shouldStop?: (params: {
    completedRound: DebateRound;
    result: RunDebateRoundResult;
    rounds: DebateRound[];
  }) => boolean;
};

export type RunDebateResult = {
  /** Final round list with utterances stitched in and statuses updated. */
  rounds: DebateRound[];
  /** Engine result for each round actually executed (in order). */
  roundResults: Array<{ roundId: string; result: RunDebateRoundResult }>;
  /** True if all rounds reached completed status. */
  finished: boolean;
  /** True if shouldStop returned true; rounds beyond that stayed pending. */
  stoppedEarly: boolean;
};

export async function runDebate(params: RunDebateParams): Promise<RunDebateResult> {
  const { debateId, context, slots, engineOptions, shouldStop } = params;

  // The initial round list must have round 0 in "running" status so the
  // engine has something to execute. We mirror the createDebateRounds
  // contract: index 0 = running, others = pending.
  let rounds = params.initialRounds.map((round, idx): DebateRound => {
    if (idx === 0 && round.status === "pending") {
      return { ...round, status: "running" };
    }
    return round;
  });

  const roundResults: Array<{ roundId: string; result: RunDebateRoundResult }> = [];
  let stoppedEarly = false;
  let finished = false;

  while (true) {
    const currentIndex = rounds.findIndex((r) => r.status === "running");
    if (currentIndex === -1) {
      // No running round → either everything completed or all stuck.
      finished = rounds.every((r) => r.status === "completed");
      break;
    }

    const currentRound = rounds[currentIndex]!;
    // Fold completed prior rounds' utterances into the context so later-round
    // agents actually react to what was already said (cross_critique /
    // refinement rounds instruct "cite which utterance you criticize", but
    // without this the prompt only carried the static conversation summary).
    const roundContext = withPriorRounds(context, rounds.slice(0, currentIndex));
    const result = await runDebateRound({
      debateId,
      round: currentRound,
      context: roundContext,
      slots,
      options: engineOptions,
    });

    // Stitch utterances into the round
    rounds = rounds.map((r, idx): DebateRound =>
      idx === currentIndex ? { ...r, utterances: result.utterances } : r,
    );
    const stitchedRound = rounds[currentIndex]!;
    roundResults.push({ roundId: stitchedRound.id, result });

    // Optional early-stop
    if (shouldStop?.({ completedRound: stitchedRound, result, rounds })) {
      // Mark current as completed so the snapshot is coherent
      rounds = rounds.map((r, idx): DebateRound =>
        idx === currentIndex ? { ...r, status: "completed" } : r,
      );
      stoppedEarly = true;
      break;
    }

    // Transition status via the existing advance helper
    const advance = advanceDebateRound(rounds, stitchedRound.id);
    rounds = advance.rounds;
    if (advance.finished) {
      finished = true;
      break;
    }
  }

  return { rounds, roundResults, finished, stoppedEarly };
}

/**
 * Append completed prior rounds' utterances to the debate context's
 * conversationSummary so each round's prompt (buildRoundUserPrompt) carries
 * what was already said. Pure — returns the original context when there is
 * nothing to fold so the no-prior-rounds prompt is unchanged.
 */
export function withPriorRounds(context: DebateContext, priorRounds: DebateRound[]): DebateContext {
  const spoken = priorRounds.filter((round) => round.utterances.length > 0);
  if (spoken.length === 0) return context;
  const block: string[] = ["", "## 이전 라운드 발언"];
  for (const round of spoken) {
    block.push(`### ${round.title}`);
    for (const utterance of round.utterances) {
      const text = utterance.content.length > 600 ? `${utterance.content.slice(0, 599)}…` : utterance.content;
      block.push(`- (${utterance.agentId}) ${text}`);
    }
  }
  return {
    ...context,
    conversationSummary: `${context.conversationSummary}${block.join("\n")}`,
  };
}
