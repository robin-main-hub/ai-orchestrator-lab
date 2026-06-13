import type { SequentialMergeQueueItem } from "@ai-orchestrator/protocol";

/**
 * MergeRunner — 검증 통과한 큐 항목을 실제 git merge로 착지시킨다.
 *
 * 가짜 sha(deadbeef) 금지: mergeCommitSha는 `git rev-parse HEAD` 결과만.
 * 안전 경계:
 *   - repoRoot는 서버 allowlist(ORCHESTRATOR_ALLOWED_REPO_ROOTS)에 있어야 실제
 *     merge. 미명시면 dry_run으로 정직하게 떨어진다(합성 sha를 만들지 않는다).
 *   - sourceBranch는 agent/* 또는 mission/* 만, targetBranch는 allowlist만,
 *     브랜치 이름에 셸 메타문자 금지. sourceBranch=main 금지.
 *   - dirty worktree면 blocked. 충돌이면 merge --abort 후 conflict(미션 안 닫음).
 *   - 모든 git 호출은 execFile(shell:false) — 인젝션 방지.
 */

export type MergeRunnerKind = "git_worktree" | "dry_run";

export type MergeExecOutcome = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
};
/** git 한 번 실행 (DI: 테스트에서 가짜 git, 운영에서 execFile) */
export type GitExecFn = (repoRoot: string, args: string[]) => Promise<MergeExecOutcome>;

export type MergeExecutionResult = {
  queueItemId: string;
  kind: MergeRunnerKind;
  status: "merged" | "conflict" | "blocked" | "failed" | "dry_run";
  mergeCommitSha?: string;
  reason: string;
  conflictFiles: string[];
  observed: boolean;
  completedAt: string;
};

const BRANCH_NAME_RE = /^[A-Za-z0-9._\/-]+$/;
const SOURCE_BRANCH_PREFIXES = ["agent/", "mission/"];

export function isAllowedRepoRoot(repoRoot: string | undefined, allowedRoots: ReadonlyArray<string>): boolean {
  if (!repoRoot) {
    return false;
  }
  return allowedRoots.includes(repoRoot);
}

export function parseAllowedRepoRoots(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

/** 브랜치/대상 정합성 — 실행 전에 거부할 것들 */
export function validateMergeRefs(input: {
  sourceBranch?: string;
  targetBranch?: string;
  allowedTargetBranches: ReadonlyArray<string>;
}): { ok: true } | { ok: false; reason: string } {
  const { sourceBranch, targetBranch, allowedTargetBranches } = input;
  if (!sourceBranch || !targetBranch) {
    return { ok: false, reason: "sourceBranch와 targetBranch가 필요합니다" };
  }
  if (!BRANCH_NAME_RE.test(sourceBranch) || !BRANCH_NAME_RE.test(targetBranch)) {
    return { ok: false, reason: "브랜치 이름에 허용되지 않은 문자가 있습니다" };
  }
  if (sourceBranch === "main" || sourceBranch === "master") {
    return { ok: false, reason: "sourceBranch는 main/master일 수 없습니다" };
  }
  if (!SOURCE_BRANCH_PREFIXES.some((prefix) => sourceBranch.startsWith(prefix))) {
    return { ok: false, reason: `sourceBranch는 ${SOURCE_BRANCH_PREFIXES.join("/")} 로 시작해야 합니다` };
  }
  if (!allowedTargetBranches.includes(targetBranch)) {
    return { ok: false, reason: `targetBranch '${targetBranch}'는 허용 목록에 없습니다` };
  }
  return { ok: true };
}

function blocked(item: SequentialMergeQueueItem, reason: string, now: string, kind: MergeRunnerKind = "git_worktree"): MergeExecutionResult {
  return { queueItemId: item.id, kind, status: "blocked", reason, conflictFiles: [], observed: true, completedAt: now };
}

export async function executeMerge(input: {
  item: SequentialMergeQueueItem;
  missionTitle: string;
  allowedRepoRoots: ReadonlyArray<string>;
  allowedTargetBranches: ReadonlyArray<string>;
  git: GitExecFn;
  now: () => string;
}): Promise<MergeExecutionResult> {
  const { item, git } = input;
  const now0 = input.now();

  // 1) repoRoot가 allowlist에 없으면 정직하게 dry_run — 합성 sha를 만들지 않는다
  if (!isAllowedRepoRoot(item.repoRoot, input.allowedRepoRoots)) {
    return {
      queueItemId: item.id,
      kind: "dry_run",
      status: "dry_run",
      reason: item.repoRoot
        ? `repoRoot '${item.repoRoot}'가 ORCHESTRATOR_ALLOWED_REPO_ROOTS에 없어 실제 머지를 건너뜁니다`
        : "repoRoot 미지정 — dry_run",
      conflictFiles: [],
      observed: false, // 실제 merge를 관측하지 않았다
      completedAt: now0,
    };
  }

  // 2) ref 정합성
  const refs = validateMergeRefs({
    sourceBranch: item.sourceBranch,
    targetBranch: item.targetBranch,
    allowedTargetBranches: input.allowedTargetBranches,
  });
  if (!refs.ok) {
    return blocked(item, refs.reason, now0);
  }
  const repoRoot = item.repoRoot!;
  const sourceBranch = item.sourceBranch!;
  const targetBranch = item.targetBranch!;

  // 3) dirty worktree 차단
  const dirty = await git(repoRoot, ["status", "--porcelain"]);
  if (dirty.exitCode !== 0) {
    return blocked(item, `git status 실패: ${dirty.stderr.slice(0, 200)}`, input.now());
  }
  if (dirty.stdout.trim().length > 0) {
    return blocked(item, "대상 작업트리가 dirty합니다 — 커밋/정리 후 다시 시도하세요", input.now());
  }

  // 4) source/target 존재 확인
  for (const ref of [sourceBranch, targetBranch]) {
    const verify = await git(repoRoot, ["rev-parse", "--verify", ref]);
    if (verify.exitCode !== 0) {
      return blocked(item, `ref를 찾을 수 없습니다: ${ref}`, input.now());
    }
  }

  // 5) checkout target → merge --no-ff source
  const checkout = await git(repoRoot, ["checkout", targetBranch]);
  if (checkout.exitCode !== 0) {
    return blocked(item, `checkout ${targetBranch} 실패: ${checkout.stderr.slice(0, 200)}`, input.now());
  }
  const merge = await git(repoRoot, [
    "merge",
    "--no-ff",
    sourceBranch,
    "-m",
    `merge mission ${item.missionId}: ${input.missionTitle}`.slice(0, 200),
  ]);

  if (merge.exitCode !== 0) {
    // 충돌 파일 수집 후 abort — 충돌은 실패가 아니라 별도 상태
    const conflicts = await git(repoRoot, ["diff", "--name-only", "--diff-filter=U"]);
    const conflictFiles = conflicts.stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    await git(repoRoot, ["merge", "--abort"]);
    return {
      queueItemId: item.id,
      kind: "git_worktree",
      status: conflictFiles.length > 0 ? "conflict" : "failed",
      reason:
        conflictFiles.length > 0
          ? `머지 충돌 — abort됨 (${conflictFiles.length}개 파일)`
          : `머지 실패: ${merge.stderr.slice(0, 200)}`,
      conflictFiles,
      observed: true,
      completedAt: input.now(),
    };
  }

  // 6) real merge commit sha
  const head = await git(repoRoot, ["rev-parse", "HEAD"]);
  const sha = head.stdout.trim();
  return {
    queueItemId: item.id,
    kind: "git_worktree",
    status: "merged",
    mergeCommitSha: sha || undefined,
    reason: `merged ${sourceBranch} → ${targetBranch}`,
    conflictFiles: [],
    observed: true,
    completedAt: input.now(),
  };
}
