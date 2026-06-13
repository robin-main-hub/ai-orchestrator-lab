import type { VerificationCheck, VerificationReport } from "@ai-orchestrator/protocol";
import { runDockerSandboxExec, type DockerSandboxRunnerConfig } from "./dockerSandboxRunner.js";
import { runGVisorSandboxExec, type RunscProbe } from "./gvisorSandboxRunner.js";
import { runLocalMissionVerification, type LocalExecFn } from "./localSandboxRunner.js";

/**
 * Verification Runner Registry (L2) — POST /missions/:id/verify가 어떤 sandbox runner로
 * 실행될지 정책으로 결정한다. Docker/gVisor runner를 dead code에서 꺼내 실제 검증
 * 루프에 물린다.
 *
 * 절대 불변식(정직성):
 *   - runner unavailable인데 observed=true 금지. Docker/gVisor가 막히면 fake fallback
 *     없이 blocked/observed:false로 남긴다(local로 몰래 fallback 금지).
 *   - observed는 모든 check가 실측 종료코드를 가질 때만 — blocked/skip은 미관측.
 *   - 명령 allowlist(safeCommandPolicy)는 각 runner 내부 게이트가 그대로 책임진다
 *     (local/docker/gVisor 전부 isAutoApprovableCommand 통과 필요).
 *   - capability 게이트: verifier가 sandbox_verify가 아니면 실행 자체를 막는다
 *     (companion이 검증 runner로 승격 불가 — 이중 방어).
 */

const VERIFY_CAPABILITY_MODE = "sandbox_verify";
const COMMAND_PREVIEW_LIMIT = 200;
const PREVIEW_LIMIT = 2_000;

function preview(value: string, limit = PREVIEW_LIMIT): string {
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
}

export type RunnerSelection =
  | { kind: "local" }
  | { kind: "docker"; image: string }
  | { kind: "gvisor"; image: string }
  | { kind: "blocked"; reason: string };

export type RunnerEnv = {
  /** ORCHESTRATOR_SANDBOX_RUNNER = local | docker | gvisor (기본 local) */
  requested?: string;
  /** ORCHESTRATOR_ENABLE_DOCKER_RUNNER === "1" */
  dockerEnabled: boolean;
  /** ORCHESTRATOR_ENABLE_GVISOR_RUNNER === "1" */
  gvisorEnabled: boolean;
  /** ORCHESTRATOR_SANDBOX_IMAGE — docker/gVisor에 필요 */
  image?: string;
  /** ORCHESTRATOR_ALLOWED_DOCKER_IMAGES (콤마 구분) — 비면 어떤 이미지도 불허 */
  allowedImages: ReadonlyArray<string>;
};

function isAllowedImage(image: string, allowed: ReadonlyArray<string>): boolean {
  return allowed.some((entry) => entry === image);
}

/**
 * 환경/정책에서 runner를 고른다(순수). docker/gVisor를 골랐는데 enable/image/allowlist
 * 조건이 안 맞으면 blocked — 절대 local로 몰래 떨어지지 않는다.
 */
export function selectVerificationRunner(env: RunnerEnv): RunnerSelection {
  const requested = (env.requested ?? "local").trim().toLowerCase();

  if (requested === "" || requested === "local") {
    return { kind: "local" };
  }

  if (requested === "docker" || requested === "gvisor") {
    const enabled = requested === "docker" ? env.dockerEnabled : env.gvisorEnabled;
    if (!enabled) {
      return {
        kind: "blocked",
        reason: `${requested} runner가 비활성 (ORCHESTRATOR_ENABLE_${requested.toUpperCase()}_RUNNER=1 필요)`,
      };
    }
    if (!env.image) {
      return { kind: "blocked", reason: `ORCHESTRATOR_SANDBOX_IMAGE가 설정되지 않았습니다 (${requested} runner)` };
    }
    if (!isAllowedImage(env.image, env.allowedImages)) {
      return {
        kind: "blocked",
        reason: `이미지 '${env.image}'가 ORCHESTRATOR_ALLOWED_DOCKER_IMAGES에 없습니다`,
      };
    }
    return requested === "docker" ? { kind: "docker", image: env.image } : { kind: "gvisor", image: env.image };
  }

  return { kind: "blocked", reason: `알 수 없는 runner '${requested}' (local|docker|gvisor 중 하나)` };
}

/** 모든 check가 blocked/skip인 정직한 미관측 리포트. */
function blockedReport(input: {
  reportId: string;
  missionId: string;
  verifierAgentId: string;
  commands: ReadonlyArray<string>;
  reason: string;
  now: () => string;
}): VerificationReport {
  const at = input.now();
  const checks: VerificationCheck[] = input.commands.map((command, index) => ({
    id: `check_${input.missionId}_${index + 1}`,
    command: preview(command, COMMAND_PREVIEW_LIMIT),
    status: "skipped",
    summary: `차단됨: ${input.reason}`,
    startedAt: at,
    completedAt: at,
  }));
  return {
    id: input.reportId,
    missionId: input.missionId,
    verifierAgentId: input.verifierAgentId,
    status: "blocked",
    checks,
    artifactIds: [],
    observed: false, // 실행하지 않았다 — observed로 위장 금지
    createdAt: at,
  };
}

/** container(docker/gVisor) runner로 명령들을 돌려 VerificationReport로 조립한다. */
async function runContainerVerification(input: {
  selection: { kind: "docker" | "gvisor"; image: string };
  commands: ReadonlyArray<string>;
  missionId: string;
  verifierAgentId: string;
  reportId: string;
  dockerExec: LocalExecFn;
  probeRunsc: RunscProbe;
  worktreePath: string;
  timeoutMs: number;
  memoryMb: number;
  now: () => string;
}): Promise<VerificationReport> {
  const config: DockerSandboxRunnerConfig = {
    image: input.selection.image,
    worktreePath: input.worktreePath,
    repoMountMode: "readonly", // verifier는 verify_no_write — 루트fs read-only
    network: "none",
    memoryMb: input.memoryMb,
    pidsLimit: 256,
    timeoutMs: input.timeoutMs,
    runnerKind: input.selection.kind === "gvisor" ? "docker_gvisor" : "docker_rootless",
  };

  const checks: VerificationCheck[] = [];
  for (let index = 0; index < input.commands.length; index += 1) {
    const command = input.commands[index]!.trim();
    const startedAt = input.now();
    const request = { id: `check_${input.missionId}_${index + 1}`, command };
    const result =
      input.selection.kind === "gvisor"
        ? await runGVisorSandboxExec({ request, config, exec: input.dockerExec, probeRunsc: input.probeRunsc, now: input.now })
        : await runDockerSandboxExec({ request, config, exec: input.dockerExec, now: input.now });

    const status: VerificationCheck["status"] =
      result.status === "completed" ? "passed" : result.status === "blocked" ? "skipped" : "failed";
    checks.push({
      id: request.id,
      command: preview(command, COMMAND_PREVIEW_LIMIT),
      status,
      exitCode: typeof result.exitCode === "number" ? result.exitCode : undefined,
      summary: `${result.reason}${result.stderrPreview ? ` · ${preview(result.stderrPreview, 200)}` : ""}`,
      startedAt,
      completedAt: input.now(),
    });
  }

  const observed = checks.length > 0 && checks.every((check) => typeof check.exitCode === "number");
  const status: VerificationReport["status"] = checks.some((c) => c.status === "failed")
    ? "failed"
    : checks.some((c) => c.status === "skipped")
      ? "blocked"
      : observed && checks.every((c) => c.status === "passed")
        ? "passed"
        : "pending";

  return {
    id: input.reportId,
    missionId: input.missionId,
    verifierAgentId: input.verifierAgentId,
    status,
    checks,
    artifactIds: [],
    observed,
    createdAt: input.now(),
  };
}

/**
 * 선택된 runner로 미션 검증을 실행한다. local은 기존 LocalSandboxRunner 그대로,
 * docker/gVisor는 container runner, blocked는 미관측 리포트.
 */
export async function runRegistryMissionVerification(input: {
  selection: RunnerSelection;
  commands: ReadonlyArray<string>;
  missionId: string;
  verifierAgentId: string;
  /** 서버가 재계산한 verifier capability mode — sandbox_verify가 아니면 실행 차단 */
  verifierCapabilityMode: string;
  reportId?: string;
  localExec: LocalExecFn;
  dockerExec: LocalExecFn;
  probeRunsc: RunscProbe;
  worktreePath: string;
  timeoutMs: number;
  memoryMb?: number;
  now: () => string;
}): Promise<VerificationReport> {
  const reportId = input.reportId ?? `verify_${input.missionId}_${input.commands.length}`;

  // capability 게이트 — verifier가 sandbox_verify가 아니면 어떤 runner도 안 돈다.
  if (input.verifierCapabilityMode !== VERIFY_CAPABILITY_MODE) {
    return blockedReport({
      reportId,
      missionId: input.missionId,
      verifierAgentId: input.verifierAgentId,
      commands: input.commands,
      reason: `verifier capability '${input.verifierCapabilityMode}'는 검증을 실행할 수 없습니다 (sandbox_verify 필요)`,
      now: input.now,
    });
  }

  if (input.selection.kind === "blocked") {
    return blockedReport({
      reportId,
      missionId: input.missionId,
      verifierAgentId: input.verifierAgentId,
      commands: input.commands,
      reason: input.selection.reason,
      now: input.now,
    });
  }

  if (input.selection.kind === "local") {
    return runLocalMissionVerification({
      commands: input.commands,
      missionId: input.missionId,
      verifierAgentId: input.verifierAgentId,
      reportId,
      exec: input.localExec,
      now: input.now,
    });
  }

  return runContainerVerification({
    selection: input.selection,
    commands: input.commands,
    missionId: input.missionId,
    verifierAgentId: input.verifierAgentId,
    reportId,
    dockerExec: input.dockerExec,
    probeRunsc: input.probeRunsc,
    worktreePath: input.worktreePath,
    timeoutMs: input.timeoutMs,
    memoryMb: input.memoryMb ?? 1_024,
    now: input.now,
  });
}
