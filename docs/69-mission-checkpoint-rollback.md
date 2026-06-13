# 69 — Mission Checkpoint / Rollback (Orchestration OS PR2)

Grok이 말한 "작업 전 snapshot, rollback 버튼"을 실제 엔진에 넣는다. 가짜 sha·자동
rollback 없이, 사람 승인 기반으로.

## 구현 (gitWorktreeMergeRunner와 같은 seam)

- `packages/protocol/missionCheckpoint.ts`(스키마): `MissionCheckpoint`(reason:
  before_write/before_verification/before_merge/manual/auto_recovery, headSha,
  truthStatus:"observed"), checkpoint 생성 / rollback 요청 스키마.
- `apps/server/missions/gitCheckpointRunner.ts`(순수·GitExecFn DI, 테스트):
  - `createMissionCheckpoint` — repoRoot allowlist 통과 후 `git rev-parse`로 실제
    sha를 관측해 checkpoint 보관(reset 안 함). truthStatus=observed.
  - `executeMissionRollback` — **grant된 approvalId가 있을 때만**, allowlist repoRoot +
    clean worktree + 존재하는 sha일 때 `git reset --hard <sha>` 후 복원 sha 관측.
- `apps/server/routes/missions.ts`: `POST /missions/:id/checkpoints`,
  `POST /missions/:id/rollback`(주입형 runner, blocked→409). `index.ts`가 실제 git
  (execFile shell:false) + allowlist + **승인 검증**(listApprovals에서 approvalId가
  approved인지 확인)으로 배선.

## 안전 (GPT PRO 원칙 준수)

- **자동 rollback 금지**: approvalId 비거나 미승인이면 blocked. 처음부터 사람 승인 기반.
- **allowlist repoRoot만**: ORCHESTRATOR_ALLOWED_REPO_ROOTS 밖이면 차단.
- **dirty면 block**(stash로 숨기지 않음), sha 형식·존재 검증, 모든 git execFile(shell:false).
- **관측만**: checkpoint.headSha / rollback.restoredSha는 진짜 git 결과(observed), 합성 금지.

## 검증

protocol(빌드), server 러너 +6 / 라우트 +4(183 그린), desktop 무관. docs/69.

## 다음

PR3 DockerSandboxRunner.
