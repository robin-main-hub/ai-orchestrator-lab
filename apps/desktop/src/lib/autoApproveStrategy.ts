import { grantDgxApproval } from "../runtime/stage34ApprovalServer";
import type { ApprovalDecisionOutcome } from "./closedLoopRuntime";
import { isAutoApprovableCommand } from "./safeCommandPolicy";

/**
 * Closed-loop "mode B" approval strategy: auto-approve a narrow allowlist of
 * safe (read-only / verification) commands, and defer everything else to a
 * fallback strategy (typically mode-A human polling).
 *
 * This is the only place the orchestration loop approves its own dispatch, so:
 *   - it is OPT-IN — the caller chooses this strategy instead of pure mode A;
 *   - the safety decision is delegated to `isAutoApprovableCommand` (deny by
 *     default; the allowlist is the security boundary);
 *   - auto-grants are recorded with actor "agent" (not "user"), so the audit
 *     trail shows the loop approved, not a human;
 *   - anything not provably safe falls through to the human fallback.
 *
 * The grant still goes through the server's /approvals/grant endpoint, and the
 * caller's dispatch path still replays through the gate afterwards — mode B
 * removes the human click for safe commands, it does not remove the gate.
 */
export function createAutoApproveStrategy(deps: {
  /** used when a command is NOT auto-approvable (e.g. pollForApprovalDecision) */
  fallback: (sourceItemId: string, context: { command: string }) => Promise<ApprovalDecisionOutcome>;
  grant?: typeof grantDgxApproval;
  serverBaseUrl?: string | string[];
  fetchImpl?: typeof fetch;
  /** replace the default allowlist entirely */
  safePrefixes?: ReadonlyArray<string>;
  /** extend the default allowlist */
  extraSafePrefixes?: ReadonlyArray<string>;
  logger?: (message: string) => void;
}): (sourceItemId: string, context: { command: string; stepIndex?: number }) => Promise<ApprovalDecisionOutcome> {
  const grant = deps.grant ?? grantDgxApproval;
  const logger = deps.logger ?? (() => {});

  return async (sourceItemId, context) => {
    // 소환 플랜 단계(음수 stepIndex): 부트/정체성 주입/킥오프는 모델 산출물이
    // 아니라 앱이 번들 페르소나 파일과 사용자 입력으로 조립한 텍스트라
    // mode B에서 자동 승인한다. 루프의 검증 명령(0 이상)은 그대로 접두사
    // 허용 목록을 통과해야 한다.
    const summonPlanStep = typeof context.stepIndex === "number" && context.stepIndex < 0;
    const verdict = summonPlanStep
      ? { allowed: true as const, reason: "persona summon-plan step (app-assembled)" }
      : isAutoApprovableCommand(context.command, {
          safePrefixes: deps.safePrefixes,
          extraSafePrefixes: deps.extraSafePrefixes,
        });

    if (!verdict.allowed) {
      logger(`mode B: "${context.command}" not auto-approvable (${verdict.reason}); deferring to human`);
      return deps.fallback(sourceItemId, context);
    }

    const result = await grant({
      request: { sourceItemId, actor: "agent", reason: `mode-B auto-approve: ${verdict.reason}` },
      serverBaseUrl: deps.serverBaseUrl,
      fetchImpl: deps.fetchImpl,
    });

    if ("status" in result && result.status === "approved") {
      logger(`mode B: auto-approved "${context.command}"`);
      return "approved";
    }

    const reason = "error" in result ? result.error : "unknown grant failure";
    logger(`mode B: grant failed for "${context.command}" (${reason}); deferring to human`);
    return deps.fallback(sourceItemId, context);
  };
}
