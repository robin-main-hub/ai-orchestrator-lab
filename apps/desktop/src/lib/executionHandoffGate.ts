import type { DebateDecisionReadinessState } from "./debateDecisionReadiness";
import type { AutonomyMode } from "./autonomousRun";

/**
 * Gate the handoff from a debate's CodingPacket to an autonomous run on the
 * debate's decision readiness. A debate that hasn't actually reached a decision
 * should not auto-execute — and one that only "needs review" must stay in
 * human-approval mode even if the operator picked auto-approve.
 *
 *   blocked       -> not allowed
 *   needs_review  -> allowed, but mode is forced to "human"
 *   ready         -> allowed, requested mode honored
 *
 * Pure, so it is unit-tested.
 */

export type ExecutionHandoffGate = {
  allowed: boolean;
  effectiveMode: AutonomyMode;
  /** true when the requested mode was downgraded to human */
  modeDowngraded: boolean;
  reason: string;
};

export function evaluateExecutionHandoffGate(input: {
  readiness: DebateDecisionReadinessState;
  requestedMode: AutonomyMode;
}): ExecutionHandoffGate {
  switch (input.readiness) {
    case "blocked":
      return {
        allowed: false,
        effectiveMode: input.requestedMode,
        modeDowngraded: false,
        reason: "토론 결정이 막혀 있어 실행으로 넘길 수 없습니다",
      };
    case "needs_review": {
      const modeDowngraded = input.requestedMode !== "human";
      return {
        allowed: true,
        effectiveMode: "human",
        modeDowngraded,
        reason: modeDowngraded
          ? "토론 검토가 필요해 사람 승인 모드로 실행합니다"
          : "토론 검토 필요 — 사람 승인 모드",
      };
    }
    case "ready":
    default:
      return {
        allowed: true,
        effectiveMode: input.requestedMode,
        modeDowngraded: false,
        reason: "토론 결정 준비됨",
      };
  }
}
