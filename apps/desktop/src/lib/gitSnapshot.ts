/**
 * Git snapshot / turn rollback (P1-5, KIMI 브리프). 현재 롤백은 대화 절단 +
 * 변경 파일 안내만이고 파일은 복원하지 않는다. 이 모듈은 `git stash create`로
 * working tree를 건드리지 않는 비파괴 스냅샷을 만들고(턴 시작), 롤백 시 그
 * 스냅샷에서 변경 파일만 복원하는 명령을 생성한다.
 *
 * 우리 아키텍처는 클라이언트가 파일시스템에 직접 접근하지 않고 원격 tmux pane으로
 * 명령을 보낸다(P0-1과 동일). 따라서 명령 문자열 생성 + 출력 파싱만 순수 함수로
 * 두고, 실제 실행/복원은 승인 게이트를 통과한다.
 *
 * 안전 원칙(브리프): 스냅샷 생성(stash create + update-ref)은 비파괴라 자동 가능.
 * 복원(checkout)은 파괴적이라 항상 사용자 승인 게이트를 거친다.
 */

const SNAPSHOT_REF_PREFIX = "refs/orch-snapshots";

/** 스냅샷 id를 ref-safe 문자로 정규화 */
export function sanitizeSnapshotId(id: string): string {
  return id.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64) || "snapshot";
}

/**
 * 턴 시작 비파괴 스냅샷 생성 명령. `git stash create`는 working tree/index를
 * 전혀 수정하지 않고 스냅샷 commit hash만 만든다. 그 hash를 orch 전용 ref로
 * 고정(update-ref)해 git gc가 정리하지 못하게 한다. 변경이 없으면 empty.
 * 출력: `ORCH_SNAPSHOT:<id>:<hash>` 또는 `ORCH_SNAPSHOT:<id>:empty`
 */
export function buildCreateSnapshotCommand(snapshotId: string): string {
  const id = sanitizeSnapshotId(snapshotId);
  const ref = `${SNAPSHOT_REF_PREFIX}/${id}`;
  return (
    `H=$(git stash create "orch-snapshot:${id}" 2>/dev/null); ` +
    `if [ -n "$H" ]; then git update-ref "${ref}" "$H" && echo "ORCH_SNAPSHOT:${id}:$H"; ` +
    `else echo "ORCH_SNAPSHOT:${id}:empty"; fi`
  );
}

export type SnapshotParseResult =
  | { ok: true; id: string; hash: string; empty: false }
  | { ok: true; id: string; hash: null; empty: true }
  | { ok: false };

/** buildCreateSnapshotCommand 출력에서 스냅샷 정보를 파싱 */
export function parseSnapshotOutput(output: string): SnapshotParseResult {
  const m = /ORCH_SNAPSHOT:([A-Za-z0-9_-]+):([0-9a-f]{7,40}|empty)/.exec(output);
  if (!m) return { ok: false };
  const id = m[1]!;
  if (m[2] === "empty") return { ok: true, id, hash: null, empty: true };
  return { ok: true, id, hash: m[2]!, empty: false };
}

/** 단일 셸 인자 안전 따옴표 처리 */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * 스냅샷 생성 결과로부터 복원 기준 ref를 결정한다.
 *   - 변경이 있던 시점(hash)이면 그 스냅샷 ref
 *   - empty(턴 시작이 깨끗했음)면 HEAD — 변경을 통째로 폐기하는 의미
 */
export function resolveSnapshotRef(result: SnapshotParseResult): string | null {
  if (!result.ok) return null;
  if (result.empty) return "HEAD";
  return `${SNAPSHOT_REF_PREFIX}/${result.id}`;
}

/**
 * baseRef에서 지정 파일만 복원하는 명령 (부분 롤백). working tree의 해당 파일을
 * baseRef 시점 내용으로 되돌린다. baseRef에 없던(턴에서 새로 생성된) 파일은
 * 삭제한다. bash 변경 항목은 복원 대상에서 제외.
 * baseRef는 resolveSnapshotRef로 얻은 값(스냅샷 ref 또는 "HEAD").
 */
export function buildRestoreFilesCommand(baseRef: string, files: string[]): string | null {
  const realFiles = files.filter((f) => f && !f.startsWith("(bash)"));
  if (realFiles.length === 0) return null;
  const quoted = realFiles.map(shellQuote).join(" ");
  // 파일별 개별 처리: baseRef에 없는 파일이 섞이면 `git checkout baseRef -- a b`가
  // 전체를 거부하므로, 파일마다 존재 여부를 확인해 복원/삭제를 따로 수행한다.
  return (
    `for f in ${quoted}; do ` +
    `if git cat-file -e "${baseRef}:$f" 2>/dev/null; then git checkout "${baseRef}" -- "$f" && echo "restored: $f"; ` +
    `else rm -f "$f" && echo "removed (new in turn): $f"; fi; done`
  );
}

/** baseRef 시점으로 working tree 전체 복원 — 더 파괴적, 명시 사용 */
export function buildFullRestoreCommand(baseRef: string): string {
  return `git checkout "${baseRef}" -- . && echo "restored full tree from ${baseRef}"`;
}

/** 오래된 orch 스냅샷 ref 정리 (보존 개수 초과분 삭제) */
export function buildPruneSnapshotsCommand(keepLatest = 20): string {
  return (
    `git for-each-ref --sort=-creatordate --format='%(refname)' "${SNAPSHOT_REF_PREFIX}/" ` +
    `| tail -n +$((${keepLatest} + 1)) | while read r; do git update-ref -d "$r"; done; ` +
    `echo "pruned orch snapshots (kept ${keepLatest})"`
  );
}
