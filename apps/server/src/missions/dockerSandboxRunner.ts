import { isAutoApprovableCommand } from "@ai-orchestrator/agents";
import type { SandboxExecRequest, SandboxExecResult } from "@ai-orchestrator/protocol";
import type { LocalExecFn } from "./localSandboxRunner.js";

/**
 * DockerSandboxRunner — Local/Legacy runner보다 강한 격리. SandboxRunner와 같은
 * 철학(observed exit code) 뒤에서 `docker run`으로 명령을 무균 컨테이너에서 실행한다.
 *
 * 보안 기본값(항상 적용):
 *   --rm --read-only --cap-drop=ALL --security-opt=no-new-privileges
 *   --network=none --memory --pids-limit  (옵션: --cpus, --runtime=runsc)
 * host repo를 직접 rw 마운트하지 않고 mission worktree만 마운트한다.
 * 명령은 공유 allowlist(isAutoApprovableCommand) 게이트를 통과해야 하며, argv로
 * 전달해 컨테이너 안에서도 셸을 쓰지 않는다. 호스트 docker 호출은 execFile(shell:false).
 */

export type DockerRuntime = "runc" | "runsc";

export type DockerSandboxRunnerConfig = {
  image: string;
  /** mission worktree 경로 — host repo 직접 마운트 금지 */
  worktreePath: string;
  repoMountMode: "readonly" | "rw_worktree";
  network: "none" | "allowlisted";
  memoryMb: number;
  cpuQuota?: number;
  pidsLimit?: number;
  timeoutMs: number;
  /** 컨테이너 작업 디렉터리 (기본 /work) */
  workdir?: string;
  /** PR4 gVisor: "runsc" */
  runtime?: DockerRuntime;
  runnerKind?: "docker_rootless" | "docker_gvisor";
};

const CONTAINER_WORKDIR = "/work";
const PREVIEW_LIMIT = 2_000;

function preview(value: string, limit = PREVIEW_LIMIT): string {
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
}

/** docker run 인자 빌드(순수) — 보안 기본값을 항상 적용. command는 argv로 전달. */
export function buildDockerRunArgs(config: DockerSandboxRunnerConfig, commandArgv: ReadonlyArray<string>): string[] {
  const args: string[] = [
    "run",
    "--rm",
    "--read-only",
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges",
    `--network=${config.network === "none" ? "none" : "bridge"}`,
    `--memory=${Math.max(64, Math.floor(config.memoryMb))}m`,
    `--pids-limit=${config.pidsLimit ?? 256}`,
  ];
  if (config.cpuQuota && config.cpuQuota > 0) {
    args.push(`--cpus=${config.cpuQuota}`);
  }
  if (config.runtime === "runsc") {
    args.push("--runtime=runsc");
  }
  // mission worktree만 마운트 — readonly면 :ro
  const mountSuffix = config.repoMountMode === "readonly" ? ":ro" : "";
  args.push("-v", `${config.worktreePath}:${CONTAINER_WORKDIR}${mountSuffix}`);
  // 쓰기가 필요한 빌드도 worktree(tmpfs/볼륨)에만 — root fs는 read-only 유지
  if (config.repoMountMode === "rw_worktree") {
    args.push("--tmpfs", "/tmp:rw,size=256m");
  }
  args.push("-w", config.workdir || CONTAINER_WORKDIR);
  args.push(config.image);
  args.push(...commandArgv);
  return args;
}

export async function runDockerSandboxExec(input: {
  request: Pick<SandboxExecRequest, "id" | "command">;
  config: DockerSandboxRunnerConfig;
  /** "docker" 바이너리 실행기 — exec("docker", args). 테스트에서 가짜, 운영에서 execFile. */
  exec: LocalExecFn;
  now: () => string;
}): Promise<SandboxExecResult> {
  const raw = input.request.command.trim();
  const verdict = isAutoApprovableCommand(raw);
  if (!verdict.allowed) {
    // 게이트에 막힘 — docker를 실행하지 않았으므로 observed=false
    return {
      requestId: input.request.id,
      status: "blocked",
      observed: false,
      reason: `차단됨: ${verdict.reason}`,
      observedAt: input.now(),
    };
  }

  const commandArgv = raw.split(/\s+/);
  const dockerArgs = buildDockerRunArgs(input.config, commandArgv);

  let outcome;
  try {
    outcome = await input.exec("docker", dockerArgs);
  } catch (error) {
    return {
      requestId: input.request.id,
      status: "failed",
      observed: false,
      reason: `docker 실행 오류: ${error instanceof Error ? error.message : String(error)}`,
      observedAt: input.now(),
    };
  }

  if (outcome.timedOut) {
    return {
      requestId: input.request.id,
      status: "timeout",
      observed: true,
      exitCode: outcome.exitCode ?? undefined,
      stderrPreview: preview(outcome.stderr),
      reason: `시간 초과 (${input.config.timeoutMs}ms)`,
      observedAt: input.now(),
    };
  }

  const completed = outcome.exitCode === 0;
  return {
    requestId: input.request.id,
    status: completed ? "completed" : "failed",
    observed: true,
    exitCode: outcome.exitCode ?? undefined,
    stdoutPreview: preview(outcome.stdout),
    stderrPreview: preview(outcome.stderr),
    reason: completed ? "exit 0" : `exit ${outcome.exitCode}`,
    observedAt: input.now(),
  };
}
