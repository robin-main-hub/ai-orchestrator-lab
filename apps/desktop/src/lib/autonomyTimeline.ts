import type { StatusBadgeVariant } from "@/ui/status-badge";
import type { ReduceResult } from "./closedLoopController";
import type { LoopAction, PaneOutcome } from "./closedLoopExecution";

/**
 * Presentation helpers for the live closed-loop iteration timeline. Each
 * captured/decided step (a ReduceResult from the controller's onStep hook) maps
 * to a display row. Pure, so it is unit-tested without a DOM.
 */

export type AutonomyStepRow = {
  /** 1-based display index of the verification step being worked */
  step: number;
  outcome: PaneOutcome;
  action: LoopAction;
  reason: string;
};

export function stepRowFromReduce(result: ReduceResult, sequence: number): AutonomyStepRow {
  return {
    step: sequence,
    outcome: result.outcome,
    action: result.decision.action,
    reason: result.decision.reason,
  };
}

export function outcomeLabel(outcome: PaneOutcome): string {
  switch (outcome) {
    case "completed":
      return "완료";
    case "failed":
      return "실패";
    case "blocked":
      return "막힘";
    case "needs_approval":
      return "승인 필요";
    case "awaiting_input":
      return "입력 대기";
    case "progressing":
    default:
      return "진행 중";
  }
}

export function actionLabel(action: LoopAction): string {
  switch (action) {
    case "dispatch_next":
      return "다음 단계 전송";
    case "await_capture":
      return "출력 대기";
    case "escalate_approval":
      return "사람에게 에스컬레이트";
    case "complete":
      return "완료 처리";
    case "fail":
    default:
      return "실패 처리";
  }
}

export function actionBadgeVariant(action: LoopAction): StatusBadgeVariant {
  switch (action) {
    case "complete":
      return "success";
    case "fail":
      return "danger";
    case "escalate_approval":
      return "warning";
    case "dispatch_next":
      return "primary";
    case "await_capture":
    default:
      return "muted";
  }
}
