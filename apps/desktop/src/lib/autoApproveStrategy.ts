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
 * "전체 자동" 승인 전략(full-auto, Codex full-auto / Claude Code bypass 대응).
 *
 * 두 갈래로 동작한다:
 *   - 기본(`includeDangerous` 미지정/false): DANGEROUS_PATTERN에 걸리지 않는 명령만
 *     자동 승인하고, 위험 명령(rm/git push/sudo/force/shell 메타문자 등)은 fallback으로 넘긴다.
 *     (코딩 워크벤치 guided_auto가 쓰는 등급형 카브아웃.)
 *   - `includeDangerous: true`("완전 자동", AutonomyMode "full_auto"): 위험 명령까지 포함해
 *     비어 있지 않은 모든 명령을 자동 승인한다. 카브아웃 없음 — 사용자가 명시적으로 확정한
 *     "예외 없이 전부 자동 승인" 경로다. 사람 승인 게이트는 사라지지만, 그랜트는 여전히 서버
 *     /approvals/grant 를 통과해 actor "agent"로 append-only 감사에 남는다(로깅이지 게이트 아님).
 *
 * 어느 경우든 그랜트는 서버 grant 엔드포인트를 round-trip 하므로 감사 기록은 항상 남는다.
 */
export function createAutoApproveAllStrategy(deps: {
  fallback: (sourceItemId: string, context: { command: string }) => Promise<ApprovalDecisionOutcome>;
  grant?: typeof grantDgxApproval;
  serverBaseUrl?: string | string[];
  fetchImpl?: typeof fetch;
  /** true면 DANGEROUS_PATTERN 카브아웃을 건너뛰고 위험 명령까지 전부 자동 승인한다("완전 자동"). */
  includeDangerous?: boolean;
  logger?: (message: string) => void;
}): (sourceItemId: string, context: { command: string; stepIndex?: number }) => Promise<ApprovalDecisionOutcome> {
  const grant = deps.grant ?? grantDgxApproval;
  const logger = deps.logger ?? (() => {});
  const includeDangerous = deps.includeDangerous ?? false;

  return async (sourceItemId, context) => {
    const command = (context.command ?? "").trim();
    if (!command) {
      logger(`full-auto: empty command; deferring to fallback`);
      return deps.fallback(sourceItemId, context);
    }
    // 카브아웃 모드에서만 위험 명령을 fallback으로 넘긴다. 완전 자동(includeDangerous)은 넘기지 않는다.
    if (!includeDangerous && DANGEROUS_PATTERN.test(command)) {
      logger(`full-auto: "${command}" is dangerous; deferring to human`);
      return deps.fallback(sourceItemId, context);
    }
    const grantReason = includeDangerous
      ? "full-auto: 완전 자동(위험 카브아웃 없음)"
      : "full-auto: 위험 패턴 아님";
    const result = await grant({
      request: { sourceItemId, actor: "agent", reason: grantReason },
      serverBaseUrl: deps.serverBaseUrl,
      fetchImpl: deps.fetchImpl,
    });
    if ("status" in result && result.status === "approved") {
      logger(`full-auto: auto-approved "${command}"`);
      return "approved";
    }
    const failReason = "error" in result ? result.error : "unknown grant failure";
    logger(`full-auto: grant failed for "${command}" (${failReason}); deferring to fallback`);
    return deps.fallback(sourceItemId, context);
  };
}
