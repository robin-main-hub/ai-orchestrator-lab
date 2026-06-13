import { DANGEROUS_PATTERN } from "@ai-orchestrator/agents";
import {
  previewBlocked,
  previewFailed,
  previewRunning,
  previewStopped,
  type AppWorkspacePreview,
} from "@ai-orchestrator/protocol";
import { isAllowedRepoRoot } from "./gitWorktreeMergeRunner.js";

/**
 * PreviewProcessRunner (D5a) — Dyad식 "바로 본다"를 **observed**로 착지시킨다. preview
 * 명령을 실제로 spawn하고 deterministic 포트를 HTTP probe로 관측한다.
 *
 * 정직성/보안:
 *   - **running/observed는 실제 포트 probe가 성공할 때만**. 프로세스가 안 뜨거나 probe가
 *     실패하면 failed/configured(가짜 running 금지).
 *   - cwd는 repoRoot allowlist에 있어야 하고, 명령은 preview 정책(메타문자 차단 + prefix
 *     allowlist)을 통과해야 한다. 둘 중 하나라도 막히면 blocked(spawn 안 함).
 *   - host shell 직결 금지 — argv split 후 shell 없이 spawn. 포트는 PORT env로 전달.
 */

const DEFAULT_PREVIEW_PREFIXES: ReadonlyArray<string> = [
  "vite preview",
  "vite",
  "pnpm preview",
  "pnpm dev",
  "pnpm exec vite",
  "npm run preview",
  "npm run dev",
  "node",
];

export type PreviewCommandVerdict = { allowed: boolean; reason: string };

/** preview 명령 게이트 — 셸 메타문자/위험 토큰 차단 + 좁은 prefix allowlist(+env 추가). */
export function isAllowedPreviewCommand(
  command: string,
  extraPrefixes: ReadonlyArray<string> = [],
): PreviewCommandVerdict {
  const trimmed = (command ?? "").trim();
  if (!trimmed) return { allowed: false, reason: "empty preview command" };
  if (DANGEROUS_PATTERN.test(trimmed)) {
    return { allowed: false, reason: "preview command uses a shell feature or a disallowed/mutating token" };
  }
  const prefixes = [...DEFAULT_PREVIEW_PREFIXES, ...extraPrefixes];
  const match = prefixes.find((prefix) => trimmed === prefix || trimmed.startsWith(`${prefix} `));
  return match
    ? { allowed: true, reason: `matches preview prefix "${match}"` }
    : { allowed: false, reason: "not in the preview command allowlist" };
}

/** spawn된 preview 프로세스 핸들(DI 가능 — 테스트에선 가짜). */
export type PreviewSpawnHandle = {
  kill: () => void;
  onExit: (cb: (code: number | null) => void) => void;
  stderrPreview: () => string;
};

export type PreviewSpawnFn = (input: {
  command: string;
  argv: string[];
  cwd: string;
  host: string;
  port: number;
}) => PreviewSpawnHandle;

export type PreviewHttpProbe = (input: { host: string; port: number }) => Promise<boolean>;

export type PreviewProcessRegistry = Map<string, PreviewSpawnHandle>;

const PREVIEW_STDERR_LIMIT = 2_000;

/**
 * preview 프로세스를 띄우고 포트가 실제 서빙될 때까지 probe한다. observed는 probe 성공
 * 시에만. 같은 workspace의 기존 프로세스는 먼저 정리한다.
 */
export async function startPreviewProcess(input: {
  workspaceId: string;
  command: string;
  cwd: string;
  host: string;
  port: number;
  allowedRepoRoots: ReadonlyArray<string>;
  allowedPreviewPrefixes?: ReadonlyArray<string>;
  registry: PreviewProcessRegistry;
  spawn: PreviewSpawnFn;
  probe: PreviewHttpProbe;
  wait: (ms: number) => Promise<void>;
  now: () => string;
  readyTimeoutMs?: number;
  pollIntervalMs?: number;
}): Promise<AppWorkspacePreview> {
  const { command, host, port } = input;

  if (!isAllowedRepoRoot(input.cwd, input.allowedRepoRoots)) {
    return previewBlocked({ command, detail: `repoRoot '${input.cwd}'가 ORCHESTRATOR_ALLOWED_REPO_ROOTS에 없습니다` });
  }
  const verdict = isAllowedPreviewCommand(command, input.allowedPreviewPrefixes);
  if (!verdict.allowed) {
    return previewBlocked({ command, detail: `차단됨: ${verdict.reason}` });
  }

  // 기존 프로세스 정리(워크스페이스당 하나)
  await stopPreviewProcess(input.workspaceId, input.registry);

  const [cmd, ...args] = command.trim().split(/\s+/);
  let handle: PreviewSpawnHandle;
  try {
    handle = input.spawn({ command: cmd!, argv: args, cwd: input.cwd, host, port });
  } catch (error) {
    return previewFailed({ port, command, detail: `spawn 오류: ${error instanceof Error ? error.message : String(error)}` });
  }
  input.registry.set(input.workspaceId, handle);

  let exited = false;
  handle.onExit(() => {
    exited = true;
  });

  const readyTimeoutMs = input.readyTimeoutMs ?? 15_000;
  const pollIntervalMs = input.pollIntervalMs ?? 300;
  const attempts = Math.max(1, Math.ceil(readyTimeoutMs / pollIntervalMs));

  for (let i = 0; i < attempts; i += 1) {
    if (exited) break; // 프로세스가 떠 있지 않으면 더 기다리지 않는다
    if (await input.probe({ host, port })) {
      return previewRunning({ host, port, command }); // 실제 포트 관측 → observed
    }
    await input.wait(pollIntervalMs);
  }

  // 타임아웃/조기 종료 — 정리하고 정직하게 failed(observed 아님)
  const detail = (handle.stderrPreview() || (exited ? "프로세스가 조기 종료됨" : "준비 타임아웃")).slice(0, PREVIEW_STDERR_LIMIT);
  await stopPreviewProcess(input.workspaceId, input.registry);
  return previewFailed({ port, command, detail });
}

/** preview 프로세스를 종료한다(멱등). */
export async function stopPreviewProcess(workspaceId: string, registry: PreviewProcessRegistry): Promise<AppWorkspacePreview> {
  const handle = registry.get(workspaceId);
  if (handle) {
    try {
      handle.kill();
    } catch {
      /* already gone */
    }
    registry.delete(workspaceId);
  }
  return previewStopped();
}

/** 서버 종료 시 모든 preview 프로세스 정리(유령 dev 서버 방지). */
export function disposeAllPreviews(registry: PreviewProcessRegistry): void {
  for (const handle of registry.values()) {
    try {
      handle.kill();
    } catch {
      /* ignore */
    }
  }
  registry.clear();
}
