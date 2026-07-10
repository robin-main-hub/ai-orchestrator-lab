import type { CodingPacket } from "@ai-orchestrator/protocol";
import {
  classifyPaneOutput,
  decideNextStep,
  type LoopDecision,
  type PaneOutcome,
} from "./closedLoopExecution";

/**
 * Closed-loop controller: drives a CodingPacket's verification plan one step at
 * a time by reading captured pane output and deciding the next dispatch.
 *
 * Split in two layers, both here:
 *   - reduceClosedLoop(): pure reducer. (state, captureOutput) -> next state +
 *     decision + the command to dispatch next (if any). No I/O, fully testable.
 *   - runClosedLoop(): async driver that performs the I/O (capture / dispatch /
 *     escalate) through *injected* effects, so the same loop runs against the
 *     real DGX server in production and against fakes in tests.
 *
 * The driver never talks to tmux directly. Every dispatch it performs is the
 * caller-supplied `dispatch` effect, which in the runtime is wired to the
 * existing /tmux/dispatch + /approvals/replay path — so the loop is subject to
 * the same permission/approval/redaction gates as a human-initiated dispatch
 * and cannot bypass them.
 */

export type LoopStatus = "running" | "completed" | "failed" | "awaiting_human" | "cancelled";

export type LoopState = {
  verificationPlan: string[];
  /** index of the verification step currently being worked (0-based) */
  stepIndex: number;
  /** verification steps confirmed passing */
  verificationPassed: number;
  /** consecutive captures with no forward progress */
  consecutiveNoProgress: number;
  status: LoopStatus;
  maxNoProgress: number;
};

export type ReduceResult = {
  state: LoopState;
  decision: LoopDecision;
  outcome: PaneOutcome;
  /** command to dispatch next, present only when decision.action === "dispatch_next" */
  nextCommand?: string;
};

const DEFAULT_MAX_NO_PROGRESS = 3;

export function createInitialLoopState(
  verificationPlan: string[],
  options: { maxNoProgress?: number } = {},
): LoopState {
  const maxNoProgress = options.maxNoProgress ?? DEFAULT_MAX_NO_PROGRESS;
  const plan = verificationPlan.filter((step) => step.trim().length > 0);
  return {
    verificationPlan: plan,
    stepIndex: 0,
    verificationPassed: 0,
    consecutiveNoProgress: 0,
    // Nothing to verify -> already complete; the caller decides whether to run.
    status: plan.length === 0 ? "completed" : "running",
    maxNoProgress,
  };
}

export function createLoopStateFromPacket(
  packet: CodingPacket,
  options: { maxNoProgress?: number } = {},
): LoopState {
  return createInitialLoopState(packet.verificationPlan, options);
}

/** The verification step the loop is currently driving. */
export function currentCommand(state: LoopState): string | undefined {
  return state.verificationPlan[state.stepIndex];
}

/**
 * Pure transition: given the current loop state and the latest captured pane
 * output, classify the outcome, decide the next action, and compute the next
 * state. Only call while `state.status === "running"`.
 */
export function reduceClosedLoop(state: LoopState, captureOutput: string): ReduceResult {
  const outcome = classifyPaneOutput(captureOutput);
  const total = state.verificationPlan.length;

  // If this capture shows the current step completed, treat that step as passing
  // when deciding (so the final step's completion resolves to "complete").
  const effectivePassed = outcome === "completed" ? state.stepIndex + 1 : state.verificationPassed;

  const decision = decideNextStep({
    slotStatus: "running",
    outcome,
    verificationPassed: effectivePassed,
    verificationTotal: total,
    consecutiveNoProgress: state.consecutiveNoProgress,
    maxNoProgress: state.maxNoProgress,
  });

  switch (decision.action) {
    case "complete":
      return {
        state: { ...state, status: "completed", verificationPassed: total, consecutiveNoProgress: 0 },
        decision,
        outcome,
      };
    case "fail":
      return { state: { ...state, status: "failed" }, decision, outcome };
    case "escalate_approval":
      return { state: { ...state, status: "awaiting_human" }, decision, outcome };
    case "dispatch_next": {
      if (outcome === "completed") {
        // Current step passed; advance to the next verification step.
        const nextIndex = state.stepIndex + 1;
        return {
          state: {
            ...state,
            stepIndex: nextIndex,
            verificationPassed: nextIndex,
            consecutiveNoProgress: 0,
          },
          decision,
          outcome,
          nextCommand: state.verificationPlan[nextIndex],
        };
      }
      // awaiting_input: worker is idle on the current step; re-issue it.
      return {
        state: { ...state, consecutiveNoProgress: 0 },
        decision,
        outcome,
        nextCommand: currentCommand(state),
      };
    }
    case "await_capture":
    default:
      return {
        state: { ...state, consecutiveNoProgress: state.consecutiveNoProgress + 1 },
        decision,
        outcome,
      };
  }
}

export type ClosedLoopEffects = {
  /** Dispatch a verification-step command (wired to /tmux/dispatch + replay in the runtime). */
  dispatch: (command: string, context: { stepIndex: number }) => Promise<void> | void;
  /** Capture the pane's latest output preview (wired to /tmux/capture in the runtime). */
  capture: () => Promise<string> | string;
  /** Hand control to a human via the approval queue. */
  escalate: (reason: string, state: LoopState) => Promise<void> | void;
  /** Optional per-iteration observer for timelines/telemetry. */
  onStep?: (result: ReduceResult) => Promise<void> | void;
};

export type RunClosedLoopInput = {
  state: LoopState;
  effects: ClosedLoopEffects;
  /** hard cap on iterations so a misbehaving worker can't loop forever (default 50) */
  maxIterations?: number;
  /** cooperative cancellation — checked at loop boundaries; aborting resolves the run as "cancelled" */
  signal?: AbortSignal;
};

const DEFAULT_MAX_ITERATIONS = 50;

/**
 * Drive the loop to a terminal state (completed / failed / awaiting_human) or
 * until the iteration cap is hit. Returns the final state.
 */
export async function runClosedLoop({
  state,
  effects,
  maxIterations = DEFAULT_MAX_ITERATIONS,
  signal,
}: RunClosedLoopInput): Promise<LoopState> {
  let current = state;
  if (current.status !== "running") {
    return current;
  }
  const cancelled = () => signal?.aborted === true;
  if (cancelled()) {
    return { ...current, status: "cancelled" };
  }

  // Kick off the first verification step.
  const firstCommand = currentCommand(current);
  if (firstCommand === undefined) {
    return { ...current, status: "completed" };
  }
  try {
    await effects.dispatch(firstCommand, { stepIndex: current.stepIndex });
  } catch (error) {
    // An effect failing while we are being cancelled is the cancel, not a failure.
    if (cancelled()) return { ...current, status: "cancelled" };
    throw error;
  }

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    if (cancelled()) {
      return { ...current, status: "cancelled" };
    }
    let output: string;
    try {
      output = await effects.capture();
    } catch (error) {
      if (cancelled()) return { ...current, status: "cancelled" };
      throw error;
    }
    if (cancelled()) {
      return { ...current, status: "cancelled" };
    }
    const result = reduceClosedLoop(current, output);
    current = result.state;
    if (effects.onStep) {
      await effects.onStep(result);
    }

    if (result.decision.action === "escalate_approval") {
      await effects.escalate(result.decision.reason, current);
      return current;
    }
    if (current.status !== "running") {
      return current;
    }
    if (result.decision.action === "dispatch_next" && result.nextCommand !== undefined) {
      try {
        await effects.dispatch(result.nextCommand, { stepIndex: current.stepIndex });
      } catch (error) {
        if (cancelled()) return { ...current, status: "cancelled" };
        throw error;
      }
    }
    // await_capture: fall through and capture again.
  }

  // Iteration cap reached without resolving -> hand to a human rather than spin.
  await effects.escalate(`closed loop hit the ${maxIterations}-iteration cap without resolving`, current);
  return { ...current, status: "awaiting_human" };
}
