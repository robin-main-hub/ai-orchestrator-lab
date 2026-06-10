/**
 * Per-mission git worktree isolation — the consensus primitive of overseas
 * parallel-agent orchestrators (Agent Orchestrator, Claude Squad, octomux…):
 * every concurrently running mission gets its own worktree + branch, so N
 * agents can mutate the SAME repository at the same time without clobbering
 * each other, and each mission's work survives as a reviewable branch.
 *
 * Pure planner: it only builds the shell commands and the kickoff preamble.
 * The parallel runner dispatches them through the same permission/approval/
 * redaction gate as every other command — workspace setup is not a bypass.
 */

export type WorkspaceConfig = {
  /** absolute path of the shared repository on the execution host */
  repoPath: string;
  /** branch the worktree starts from (default "main") */
  baseBranch?: string;
  /** directory that holds the per-mission worktrees (default <repo>/.agent-worktrees) */
  worktreesRoot?: string;
  /** branch name prefix (default "agent/") */
  branchPrefix?: string;
  /** remove the worktree + branch after a COMPLETED mission (default false — keep for review/PR) */
  cleanup?: boolean;
};

export type WorkspacePlan = {
  worktreePath: string;
  branchName: string;
  /** dispatched (gated) before identity injection */
  setupCommands: string[];
  /** dispatched (gated) after a completed mission, when cleanup is on */
  teardownCommands: string[];
  /** prepended to the mission kickoff so the agent stays inside its worktree */
  kickoffPreamble: string;
};

/** branch/path-safe key: keep [A-Za-z0-9._-], map everything else to "-". */
export function sanitizeWorkspaceKey(key: string): string {
  const safe = key.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return safe.length > 0 ? safe : "mission";
}

export function buildWorkspacePlan(key: string, config: WorkspaceConfig): WorkspacePlan {
  const safeKey = sanitizeWorkspaceKey(key);
  const repo = config.repoPath.replace(/[\\/]+$/, "");
  const root = (config.worktreesRoot ?? `${repo}/.agent-worktrees`).replace(/[\\/]+$/, "");
  const branchName = `${config.branchPrefix ?? "agent/"}${safeKey}`;
  const worktreePath = `${root}/${safeKey}`;
  const base = config.baseBranch ?? "main";

  const setupCommands = [
    `git -C "${repo}" worktree add -b "${branchName}" "${worktreePath}" "${base}"`,
  ];
  const teardownCommands = config.cleanup
    ? [
        `git -C "${repo}" worktree remove --force "${worktreePath}"`,
        `git -C "${repo}" branch -D "${branchName}"`,
      ]
    : [];

  const kickoffPreamble =
    `[워크스페이스 격리] 모든 파일 작업은 git worktree ${worktreePath} (브랜치 ${branchName}) 안에서만 수행하세요. ` +
    `먼저 cd "${worktreePath}" 로 이동한 뒤 작업하고, 변경 사항은 해당 브랜치에 커밋하세요. 메인 체크아웃은 건드리지 마세요.`;

  return { worktreePath, branchName, setupCommands, teardownCommands, kickoffPreamble };
}

/**
 * Exact, repo-scoped safe prefix for auto_safe mode: only `git -C "<repo>"
 * worktree add …` auto-approves. Teardown (`worktree remove --force`,
 * `branch -D`) is intentionally NOT safe-listed — destructive, so it always
 * needs a human in mode A or stays queued in mode B.
 */
export function workspaceSafePrefixes(config: WorkspaceConfig): string[] {
  const repo = config.repoPath.replace(/[\\/]+$/, "");
  return [`git -C "${repo}" worktree add`];
}
