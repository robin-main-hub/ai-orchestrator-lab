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

---

# 39b — 자가 체크인 + 브로드캐스트

같은 병렬 콘솔에 얹은 두 번째 배치 (해외 패턴 이식):

## 자가 체크인 (Tmux-Orchestrator 패턴)

- `lib/missionCheckIn.ts` — N분마다 실행 중인 미션의 pane 출력을 캡처하고,
  **직전 sweep과 출력이 동일한(=조용해진)** 에이전트에게만 게이트 통과 nudge를
  디스패치한다. 활발히 움직이는 pane은 건드리지 않는다.
- 첫 sweep은 베이스라인만 기록 (멈춤 여부를 알 수 없으므로 nudge 없음).
- 캡처 실패는 보고만 하고 nudge하지 않음 (pane이 사라졌을 수 있음). nudge 실패는
  sweep을 죽이지 않음. 느린 sweep이 겹치면 다음 tick을 건너뜀.
- UI: "자가 체크인" 토글 + 주기(1/5/10/30분), 마지막 sweep 요약 표시.

## 브로드캐스트 (NTM 패턴)

- `parallelAutonomy.broadcastToMissions` — 실행 중인 모든 미션 pane에
  `[브로드캐스트] <지시>` 를 한 번에 디스패치. 각 디스패치는 미션 자체 명령과
  동일한 승인·권한·리댁션 게이트를 통과한다. 대상별 성공/실패 개별 보고.
- 라이브 세션 접근은 엔진의 `onAllocate` 훅(할당 직후 1회 발화)으로 노출되며,
  완료된 미션은 대상에서 자동 제외된다.
- UI: 실행 중에만 보이는 브로드캐스트 바 (Enter 또는 "전체 지시").
