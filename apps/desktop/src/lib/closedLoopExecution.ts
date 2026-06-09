import type { ExecutionSlotStatus } from "@ai-orchestrator/protocol";
import { sanitizePublicText } from "./publicRedaction";

/**
 * Closed-loop execution controller (foundation).
 *
 * The orchestrator already has the open primitives: it can dispatch a command
 * to a tmux pane (`/tmux/dispatch` + `/approvals/replay`) and capture a pane's
 * output (`/tmux/capture`). What was missing is the layer that *reads* a
 * captured result and decides the next move, so a CodingPacket can be driven to
 * its verification plan without a human relaying every step.
 *
 * This module is intentionally pure and side-effect free:
 *   capture text -> classifyPaneOutput() -> PaneOutcome
 *   PaneOutcome (+ loop state) -> decideNextStep() -> LoopDecision
 *
 * The runtime wiring (subscribing to capture events and calling the existing
 * dispatch/approval paths) is layered on top of these decisions. Keeping the
 * decision logic pure makes it cheap to test and impossible for it to bypass a
 * gate on its own — every "dispatch_next" still flows through the same
 * permission/approval machinery as a human-initiated dispatch.
 */

export type PaneOutcome =
  | "progressing"
  | "awaiting_input"
  | "needs_approval"
  | "blocked"
  | "completed"
  | "failed";

const FAILURE_MARKERS: ReadonlyArray<RegExp> = [
  /\btraceback \(most recent call last\)/i,
  /\b(error|fatal|exception)\b[:\s]/i,
  /\b[1-9]\d* (?:tests? )?fail(?:ed|ing)\b/i,
  /\bsegmentation fault\b/i,
  /\bcommand not found\b/i,
  /\bnon-zero exit\b|\bexit code [1-9]/i,
  /\bpanic:/i,
];

const NEEDS_APPROVAL_MARKERS: ReadonlyArray<RegExp> = [
  /\b(allow|approve|grant)\b.*\?\s*$/im,
  /\bpermission (?:required|denied)\b/i,
  /\bwaiting for approval\b/i,
  /\(y\/n\)\s*$/im,
  /\bproceed\?\s*$/im,
];

const AWAITING_INPUT_MARKERS: ReadonlyArray<RegExp> = [
  /\bwhat would you like\b/i,
  /\bplease provide\b/i,
  /\benter (?:a )?(?:value|input|choice)\b/i,
  /[>$#]\s*$/m,
];

const BLOCKED_MARKERS: ReadonlyArray<RegExp> = [
  /\bblocked\b/i,
  /\bcannot proceed\b/i,
  /\bmissing (?:dependency|requirement|context)\b/i,
  /\bstuck\b/i,
];

const COMPLETED_MARKERS: ReadonlyArray<RegExp> = [
  /\ball (?:tests? )?pass(?:ed|ing)?\b/i,
  /\b\d+ passed(?:,| )?(?: 0 failed)?\b/i,
  /\b(done|completed|finished|success)\b[.!\s]*$/im,
  /✓|✔|\bok\b\s*$/im,
];

/**
 * Classify a captured pane output preview into a coarse outcome. Order matters:
 * failure and approval prompts dominate over completion claims, because a
 * worker that prints "done" but also a traceback is not done.
 */
export function classifyPaneOutput(outputPreview: string): PaneOutcome {
  const text = sanitizePublicText(outputPreview ?? "").trim();
  if (!text) {
    return "progressing";
  }

  if (matchesAny(text, FAILURE_MARKERS)) {
    return "failed";
  }
  if (matchesAny(text, NEEDS_APPROVAL_MARKERS)) {
    return "needs_approval";
  }
  if (matchesAny(text, BLOCKED_MARKERS)) {
    return "blocked";
  }
  if (matchesAny(text, COMPLETED_MARKERS)) {
    return "completed";
  }
  if (matchesAny(text, AWAITING_INPUT_MARKERS)) {
    return "awaiting_input";
  }
  return "progressing";
}

export type LoopAction = "dispatch_next" | "await_capture" | "escalate_approval" | "complete" | "fail";

export type LoopDecisionInput = {
  slotStatus: ExecutionSlotStatus;
  outcome: PaneOutcome;
  /** verification plan steps already confirmed passing */
  verificationPassed: number;
  /** total verification plan steps for this CodingPacket */
  verificationTotal: number;
  /** consecutive captures that produced no forward progress */
  consecutiveNoProgress: number;
  /** escalate to a human after this many no-progress captures (default 3) */
  maxNoProgress?: number;
};

export type LoopDecision = {
  action: LoopAction;
  reason: string;
};

const DEFAULT_MAX_NO_PROGRESS = 3;

/**
 * Decide the next loop action. The bias is conservative: anything ambiguous,
 * stuck, or that needs elevated permission is handed back to a human via the
 * approval queue rather than auto-dispatched. Only an unambiguous "keep going"
 * (a completed step with remaining verification work, or a worker explicitly
 * awaiting the next instruction) results in dispatch_next.
 */
export function decideNextStep(input: LoopDecisionInput): LoopDecision {
  const maxNoProgress = input.maxNoProgress ?? DEFAULT_MAX_NO_PROGRESS;
  const verificationComplete =
    input.verificationTotal > 0 && input.verificationPassed >= input.verificationTotal;

  if (input.slotStatus === "failed" || input.outcome === "failed") {
    return { action: "fail", reason: "worker reported a failure; halting the loop" };
  }

  if (input.outcome === "needs_approval") {
    return { action: "escalate_approval", reason: "worker is requesting elevated permission" };
  }

  if (input.outcome === "blocked" || input.slotStatus === "blocked") {
    return { action: "escalate_approval", reason: "worker is blocked and needs human input" };
  }

  if (input.consecutiveNoProgress >= maxNoProgress) {
    return {
      action: "escalate_approval",
      reason: `no forward progress after ${input.consecutiveNoProgress} captures`,
    };
  }

  if (input.outcome === "completed") {
    if (verificationComplete) {
      return { action: "complete", reason: "all verification steps passed" };
    }
    return {
      action: "dispatch_next",
      reason: `step completed; ${input.verificationTotal - input.verificationPassed} verification step(s) remain`,
    };
  }

  if (input.outcome === "awaiting_input") {
    return { action: "dispatch_next", reason: "worker is idle and awaiting the next instruction" };
  }

  return { action: "await_capture", reason: "worker is still progressing; wait for the next capture" };
}

function matchesAny(text: string, patterns: ReadonlyArray<RegExp>): boolean {
  return patterns.some((pattern) => pattern.test(text));
}
