# 39 — 병렬 미션 git worktree 격리

해외 OSS 오케스트레이터(Agent Orchestrator, Claude Squad, octomux, NTM 등) 전반이
수렴한 격리 프리미티브를 병렬 실행 콘솔에 얹은 것: **미션마다 전용 git worktree +
브랜치**. 여러 에이전트가 같은 레포를 동시에 수정해도 서로 덮어쓰지 않고, 미션의
작업물이 리뷰 가능한 브랜치로 남는다.

## 동작

`병렬실행` 탭에서 "워크트리 격리"를 켜고 실행 호스트 기준 레포 절대 경로를 입력하면,
미션마다:

1. **setup (게이트 통과)** — 정체성 주입 *전에* 디스패치:
   `git -C "<repo>" worktree add -b "agent/par_<stamp>_<mission>" "<repo>/.agent-worktrees/par_<stamp>_<mission>" "<base>"`
2. **킥오프 preamble** — 에이전트에게 해당 worktree 안에서만 작업하고 그 브랜치에
   커밋하라는 지시가 킥오프 앞에 붙는다.
3. **teardown (옵션, 기본 꺼짐)** — `cleanup: true`일 때만, 미션이 **completed**로
   끝난 경우에 한해 worktree 제거 + 브랜치 삭제를 디스패치. 실패/승인대기 미션은
   디버깅을 위해 worktree를 남긴다. teardown 실패는 best-effort(완료 상태 유지).

## 안전 규칙

- 모든 setup/teardown 명령은 일반 미션 명령과 동일하게 권한·승인·리댁션 게이트를
  통과한다 — 우회 경로가 아니다.
- auto_safe 모드의 safe prefix는 레포 경로까지 포함한 정확한
  `git -C "<repo>" worktree add` 하나만. `worktree remove --force`/`branch -D`는
  파괴적이므로 절대 자동승인되지 않는다 (`workspaceSafePrefixes`).

## 코드

- `apps/desktop/src/lib/missionWorkspace.ts` — 순수 플래너 (`buildWorkspacePlan`)
- `apps/desktop/src/lib/parallelAutonomy.ts` — `ParallelMissionSpec.workspace` 통합
- `apps/desktop/src/components/ParallelMissionContainer.tsx` — 격리 토글 UI
- 보드 터미널 카드에 `⎇ 브랜치` 태그 표시
