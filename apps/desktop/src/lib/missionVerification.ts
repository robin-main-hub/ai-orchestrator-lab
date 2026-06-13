import type {
  SandboxExecRequest,
  SandboxExecResult,
  VerificationCheck,
  VerificationReport,
} from "@ai-orchestrator/protocol";
import type { SandboxRunner } from "./sandboxRunner";

/**
 * 검증 실행 → VerificationReport 빌더.
 *
 * truth 원칙을 클라이언트에서도 그대로 강제한다:
 *   - exitCode가 실측된 check만 passed/failed 판정에 기여한다
 *   - legacy tmux처럼 디스패치만 가능하고 종료코드를 관측할 수 없는 runner의
 *     결과는 warning("종료코드 미관측")으로 남고, report.observed=false
 *   - preflight에서 막힌 명령은 skipped + report.status="blocked"
 *   - observed=true 주장은 서버(missionPolicy)에서도 한 번 더 검증된다
 */
export type MissionVerificationRun = {
  report: VerificationReport;
  results: SandboxExecResult[];
};

const PREVIEW_LIMIT = 200;

function checkFromResult(request: SandboxExecRequest, result: SandboxExecResult): VerificationCheck {
  const command = request.command.length > PREVIEW_LIMIT ? `${request.command.slice(0, PREVIEW_LIMIT - 1)}…` : request.command;
  const base = {
    id: request.id,
    command,
    exitCode: result.exitCode,
    summary: result.reason ?? "",
    startedAt: request.createdAt,
    completedAt: result.observedAt,
  };

  if (result.status === "blocked") {
    return { ...base, status: "skipped", summary: result.reason ?? "preflight에서 차단됨" };
  }
  if (result.status === "failed" || result.status === "timeout") {
    return { ...base, status: "failed", summary: result.reason ?? result.status };
  }
  if (typeof result.exitCode === "number") {
    return result.exitCode === 0
      ? { ...base, status: "passed", summary: base.summary || "exit 0" }
      : { ...base, status: "failed", summary: base.summary || `exit ${result.exitCode}` };
  }
  // 디스패치는 됐지만 종료코드를 관측할 수 없는 runner (legacy tmux)
  return { ...base, status: "warning", summary: "디스패치됨 — 종료코드 미관측 (legacy tmux)" };
}

function reportStatus(checks: ReadonlyArray<VerificationCheck>, observed: boolean): VerificationReport["status"] {
  if (checks.some((check) => check.status === "failed")) {
    return "failed";
  }
  if (checks.some((check) => check.status === "skipped")) {
    return "blocked";
  }
  if (observed && checks.length > 0 && checks.every((check) => check.status === "passed")) {
    return "passed";
  }
  // 종료코드 미관측 등으로 판정 불가 — 정직하게 pending
  return "pending";
}

export async function runMissionVerificationPlan(input: {
  requests: ReadonlyArray<SandboxExecRequest>;
  runner: SandboxRunner;
  missionId: string;
  verifierAgentId: string;
  reportId?: string;
  now?: () => string;
}): Promise<MissionVerificationRun> {
  const now = input.now ?? (() => new Date().toISOString());
  const results: SandboxExecResult[] = [];
  const checks: VerificationCheck[] = [];

  for (const request of input.requests) {
    const result = await input.runner.exec(request);
    results.push(result);
    checks.push(checkFromResult(request, result));
  }

  const observed = checks.length > 0 && checks.every((check) => typeof check.exitCode === "number");
  const report: VerificationReport = {
    id: input.reportId ?? `verify_${input.missionId}_${input.requests.length}_${checks.filter((c) => c.status === "passed").length}`,
    missionId: input.missionId,
    verifierAgentId: input.verifierAgentId,
    status: reportStatus(checks, observed),
    checks,
    artifactIds: [],
    observed,
    createdAt: now(),
  };
  return { report, results };
}
