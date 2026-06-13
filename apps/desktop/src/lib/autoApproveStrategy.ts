import { grantDgxApproval } from "../runtime/stage34ApprovalServer";
import type { ApprovalDecisionOutcome } from "./closedLoopRuntime";
import { DANGEROUS_PATTERN, isAutoApprovableCommand } from "./safeCommandPolicy";

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

/**
 * "전체 자동" 승인 전략(full-auto, Codex full-auto / Claude Code bypass 대응) — DANGEROUS_PATTERN에
 * 걸리지 않는 명령은 전부 자동 승인하고, 위험 명령(rm/git push/sudo/force/shell 메타문자 등)은
 * 자동 승인하지 않고 fallback(사람)으로 넘긴다. 사용자가 명시적으로 켜는 모드이며, 위험 명령
 * 게이트는 절대 우회하지 않는다(가장 중요한 안전선). 그랜트는 actor "agent"로 감사에 남는다.
 */
export function createAutoApproveAllStrategy(deps: {
  fallback: (sourceItemId: string, context: { command: string }) => Promise<ApprovalDecisionOutcome>;
  grant?: typeof grantDgxApproval;
  serverBaseUrl?: string | string[];
  fetchImpl?: typeof fetch;
  logger?: (message: string) => void;
}): (sourceItemId: string, context: { command: string; stepIndex?: number }) => Promise<ApprovalDecisionOutcome> {
  const grant = deps.grant ?? grantDgxApproval;
  const logger = deps.logger ?? (() => {});

  return async (sourceItemId, context) => {
    const command = (context.command ?? "").trim();
    // 위험 명령은 전체자동에서도 자동 승인하지 않는다 — 사람 확인으로 넘긴다.
    if (!command || DANGEROUS_PATTERN.test(command)) {
      logger(`full-auto: "${command}" is dangerous/empty; deferring to human`);
      return deps.fallback(sourceItemId, context);
    }
    const result = await grant({
      request: { sourceItemId, actor: "agent", reason: "full-auto: 위험 패턴 아님" },
      serverBaseUrl: deps.serverBaseUrl,
      fetchImpl: deps.fetchImpl,
    });
    if ("status" in result && result.status === "approved") {
      logger(`full-auto: auto-approved "${command}"`);
      return "approved";
    }
    const reason = "error" in result ? result.error : "unknown grant failure";
    logger(`full-auto: grant failed for "${command}" (${reason}); deferring to human`);
    return deps.fallback(sourceItemId, context);
  };
}
