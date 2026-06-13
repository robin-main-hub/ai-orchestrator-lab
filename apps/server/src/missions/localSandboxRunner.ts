import { isAutoApprovableCommand } from "@ai-orchestrator/agents";
import type { VerificationCheck, VerificationReport } from "@ai-orchestrator/protocol";

/**
 * LocalSandboxRunner — 서버가 미션의 검증 명령을 실제로 실행하고 종료코드를
 * 관측한다. 이게 legacy tmux의 한계(디스패치만 가능, 종료코드 미관측 →
 * observed=false)를 풀어 "진짜 observed 검증"을 만든다.
 *
 * 보안 경계:
 *   - 유일한 게이트는 공유 allowlist(isAutoApprovableCommand). allowlist 밖이거나
 *     셸 메타문자/mutating 토큰이 있으면 skipped로 막힌다(클라이언트가 보낸
 *     명령이라도 신뢰하지 않는다).
 *   - 명령은 공백 split 후 shell 없이 execFile로 실행한다 → 셸 인젝션 불가
 *     (allowlist가 메타문자를 이미 막지만, shell:false로 이중 방어).
 *   - cwd는 repo root, timeout/maxBuffer로 폭주 차단.
 */

export type LocalExecOutcome = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
};

export type LocalExecFn = (command: string, args: string[]) => Promise<LocalExecOutcome>;

const PREVIEW_LIMIT = 2_000;
const COMMAND_PREVIEW_LIMIT = 200;

function preview(value: string, limit = PREVIEW_LIMIT): string {
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
}

export async function runLocalMissionVerification(input: {
  commands: ReadonlyArray<string>;
  missionId: string;
  verifierAgentId: string;
  exec: LocalExecFn;
  now: () => string;
  reportId?: string;
}): Promise<VerificationReport> {
  const checks: VerificationCheck[] = [];

  for (let index = 0; index < input.commands.length; index += 1) {
    const raw = input.commands[index]!.trim();
    const startedAt = input.now();
    const checkBase = {
      id: `check_${input.missionId}_${index + 1}`,
      command: preview(raw, COMMAND_PREVIEW_LIMIT),
      startedAt,
    };

    const verdict = isAutoApprovableCommand(raw);
    if (!verdict.allowed) {
      // 게이트에 막힘 — 실행하지 않고 정직하게 skipped
      checks.push({ ...checkBase, status: "skipped", summary: `차단됨: ${verdict.reason}`, completedAt: input.now() });
      continue;
    }

    const [cmd, ...args] = raw.split(/\s+/);
    let outcome: LocalExecOutcome;
    try {
      outcome = await input.exec(cmd!, args);
    } catch (error) {
      checks.push({
        ...checkBase,
        status: "failed",
        summary: `실행 오류: ${error instanceof Error ? error.message : String(error)}`,
        completedAt: input.now(),
      });
      continue;
    }

    const completedAt = input.now();
    if (outcome.timedOut) {
      checks.push({ ...checkBase, status: "failed", exitCode: outcome.exitCode ?? undefined, summary: "시간 초과", completedAt });
      continue;
    }
    const passed = outcome.exitCode === 0;
    checks.push({
      ...checkBase,
      status: passed ? "passed" : "failed",
      exitCode: outcome.exitCode ?? undefined,
      summary: passed
        ? `exit 0${outcome.stdout ? ` · ${preview(outcome.stdout.trim(), 120)}` : ""}`
        : `exit ${outcome.exitCode} · ${preview((outcome.stderr || outcome.stdout).trim(), 200)}`,
      completedAt,
    });
  }

  // 모든 check가 실측 종료코드를 가진 경우에만 observed (skipped/timeout은 미관측)
  const observed = checks.length > 0 && checks.every((check) => typeof check.exitCode === "number");
  const status: VerificationReport["status"] = checks.some((c) => c.status === "failed")
    ? "failed"
    : checks.some((c) => c.status === "skipped")
      ? "blocked"
      : observed && checks.every((c) => c.status === "passed")
        ? "passed"
        : "pending";

  return {
    id: input.reportId ?? `verify_${input.missionId}_${checks.length}`,
    missionId: input.missionId,
    verifierAgentId: input.verifierAgentId,
    status,
    checks,
    artifactIds: [],
    observed,
    createdAt: input.now(),
  };
}
