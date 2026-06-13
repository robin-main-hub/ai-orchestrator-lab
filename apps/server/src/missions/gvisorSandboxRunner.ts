import type { SandboxExecRequest, SandboxExecResult } from "@ai-orchestrator/protocol";
import { runDockerSandboxExec, type DockerSandboxRunnerConfig } from "./dockerSandboxRunner.js";
import type { LocalExecFn } from "./localSandboxRunner.js";

/**
 * GVisorSandboxRunner — Docker runner를 `--runtime=runsc`로 돌리는 무균실.
 *
 * 정직성: runsc가 호스트에 없으면 **가짜로 gVisor 실행됐다고 표시하지 않는다**.
 * status=blocked, observed=false(=configured 의미)로 정직하게 떨어진다. runsc가
 * 있을 때만 docker runner에 runtime=runsc를 얹어 실제 실행한다.
 */

/** runsc(gVisor) 사용 가능 여부 프로브 — 주입형(예: `docker info` runtimes에 runsc 포함). */
export type RunscProbe = () => Promise<boolean>;

export async function runGVisorSandboxExec(input: {
  request: Pick<SandboxExecRequest, "id" | "command">;
  config: DockerSandboxRunnerConfig;
  exec: LocalExecFn;
  probeRunsc: RunscProbe;
  now: () => string;
}): Promise<SandboxExecResult> {
  const available = await input.probeRunsc();
  if (!available) {
    return {
      requestId: input.request.id,
      status: "blocked",
      observed: false, // 실행하지 않았다 — observed로 위장 금지(configured 의미)
      reason: "gVisor(runsc) runtime을 사용할 수 없습니다 — runsc 설치 또는 Docker runner로 대체하세요",
      observedAt: input.now(),
    };
  }
  return runDockerSandboxExec({
    request: input.request,
    config: { ...input.config, runtime: "runsc", runnerKind: "docker_gvisor" },
    exec: input.exec,
    now: input.now,
  });
}
