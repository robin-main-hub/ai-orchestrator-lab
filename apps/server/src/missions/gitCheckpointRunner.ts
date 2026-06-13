import type {
  MissionCheckpoint,
  MissionCheckpointReason,
  MissionRollbackOutcome,
} from "@ai-orchestrator/protocol";
import { isAllowedRepoRoot, type GitExecFn } from "./gitWorktreeMergeRunner.js";

/**
 * Checkpoint / Rollback runner — gitWorktreeMergeRunner와 같은 GitExecFn DI 순수
 * 함수. checkpoint = 현재 sha를 관측해 보관(reset 안 함). rollback = grant된
 * approvalId가 있을 때만, allowlist repoRoot + clean worktree + 존재하는 sha에
 * 한해 `git reset --hard`. 자동 rollback 금지, 합성 sha 금지.
 */

const SHA_RE = /^[0-9a-fA-F]{7,40}$/;

export type CheckpointResult = { ok: true; checkpoint: MissionCheckpoint } | { ok: false; reason: string };

export async function createMissionCheckpoint(input: {
  id: string;
  missionId: string;
  workerId?: string;
  repoRoot: string;
  gitRef: string;
  reason: MissionCheckpointReason;
  allowedRepoRoots: ReadonlyArray<string>;
  git: GitExecFn;
  now: () => string;
}): Promise<CheckpointResult> {
  if (!isAllowedRepoRoot(input.repoRoot, input.allowedRepoRoots)) {
    return { ok: false, reason: `repoRoot '${input.repoRoot}'가 ORCHESTRATOR_ALLOWED_REPO_ROOTS에 없습니다` };
  }
  const rev = await input.git(input.repoRoot, ["rev-parse", input.gitRef]);
  if (rev.exitCode !== 0) {
    return { ok: false, reason: `git rev-parse ${input.gitRef} 실패: ${rev.stderr.slice(0, 200)}` };
  }
  const headSha = rev.stdout.trim();
  if (!SHA_RE.test(headSha)) {
    return { ok: false, reason: "유효한 sha를 관측하지 못했습니다" };
  }
  return {
    ok: true,
    checkpoint: {
      id: input.id,
      missionId: input.missionId,
      workerId: input.workerId,
      repoRootRef: input.repoRoot,
      gitRef: input.gitRef,
      headSha,
      reason: input.reason,
      createdAt: input.now(),
      truthStatus: "observed",
    },
  };
}

export async function executeMissionRollback(input: {
  missionId: string;
  repoRoot: string;
  targetSha: string;
  /** grant된 approval — 없으면 실행 안 함(자동 rollback 금지) */
  approvalId: string;
  allowedRepoRoots: ReadonlyArray<string>;
  git: GitExecFn;
  now: () => string;
}): Promise<MissionRollbackOutcome> {
  const block = (reason: string): MissionRollbackOutcome => ({
    missionId: input.missionId,
    status: "blocked",
    reason,
    observed: true,
    completedAt: input.now(),
  });

  if (!input.approvalId) return block("rollback은 승인된 approvalId가 필요합니다 (자동 rollback 금지)");
  if (!isAllowedRepoRoot(input.repoRoot, input.allowedRepoRoots)) {
    return block(`repoRoot '${input.repoRoot}'가 ORCHESTRATOR_ALLOWED_REPO_ROOTS에 없습니다`);
  }
  if (!SHA_RE.test(input.targetSha)) return block("targetSha 형식이 올바르지 않습니다");

  // dirty worktree 차단 — stash로 숨기지 않는다
  const dirty = await input.git(input.repoRoot, ["status", "--porcelain"]);
  if (dirty.exitCode !== 0) return block(`git status 실패: ${dirty.stderr.slice(0, 200)}`);
  if (dirty.stdout.trim().length > 0) {
    return block("작업트리가 dirty합니다 — 변경을 커밋/정리한 뒤 rollback하세요");
  }

  // 대상 커밋 존재 확인
  const verify = await input.git(input.repoRoot, ["rev-parse", "--verify", `${input.targetSha}^{commit}`]);
  if (verify.exitCode !== 0) return block(`checkpoint sha를 찾을 수 없습니다: ${input.targetSha}`);

  const reset = await input.git(input.repoRoot, ["reset", "--hard", input.targetSha]);
  if (reset.exitCode !== 0) {
    return {
      missionId: input.missionId,
      status: "failed",
      reason: `git reset 실패: ${reset.stderr.slice(0, 200)}`,
      observed: true,
      completedAt: input.now(),
    };
  }

  const head = await input.git(input.repoRoot, ["rev-parse", "HEAD"]);
  const restoredSha = head.stdout.trim();
  return {
    missionId: input.missionId,
    status: "completed",
    restoredSha: restoredSha || undefined,
    reason: `rolled back to ${input.targetSha.slice(0, 10)}`,
    observed: true,
    completedAt: input.now(),
  };
}
