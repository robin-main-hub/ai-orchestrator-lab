# 50 — 실제 git merge runner + 정직성/사용성 마무리 (D4a + 감사 반영)

라이브 풀루프에서 `mergeCommitSha=deadbeef`라는 마지막 가짜 착지가 드러났다.
이 문서는 그 합성 sha를 제거(D4a)하고, 3축 병렬 감사(사용성·가짜착지·일관성)에서
나온 핵심 결함들을 함께 마무리한다.

## D4a — 실제 git worktree merge runner (deadbeef 제거)

- `missions/gitWorktreeMergeRunner.ts`: 실제 git을 execFile(shell:false)로 실행.
  `mergeCommitSha`는 오직 `git rev-parse HEAD` 결과만 — 합성 sha 금지.
- **안전 경계**:
  - repoRoot는 `ORCHESTRATOR_ALLOWED_REPO_ROOTS`에 있어야 실제 merge. 미명시면
    `dry_run`으로 정직하게 떨어진다(가짜 성공 아님, observed=false).
  - sourceBranch는 `agent/*`·`mission/*`만(main 금지), targetBranch는
    `ORCHESTRATOR_ALLOWED_MERGE_TARGETS`(기본 main/develop)만, 브랜치명 셸 메타문자 금지.
  - dirty worktree면 `blocked`. 충돌이면 `merge --abort` 후 `conflict`(미션 미완료).
- 머지 성공 시에만 미션을 `merged`로 닫는다. conflict/blocked/failed/dry_run은
  닫지 않는다(가짜 성공 방지). 클라이언트는 sha를 보내지 못한다(요청 스키마에서 제거).

## 가짜 착지(fake landing) 정리

| 발견 | 수정 |
|---|---|
| 막 만든 미션이 검증 0건인데 truthStatus="observed" | 생성 기본값 `planned`. 서버 `deriveTruthStatus`가 observed passed verification이 있을 때만 observed로 격상, 없는데 observed 주장 시 configured로 강등 |
| merge가 git 없이 merged + 클라 sha 무검증 | D4a로 해결 (위) |
| 모바일 System probe가 네트워크 없이 "200 OK" 위조 | 실제 fetch로 교체 — 서버 죽으면 offline, 401이면 "인증 필요·서버 정상" |

## 사용성 마무리

- **미션 생성이 페르소나를 무시하던 문제**: 익명 역할 하드코딩 대신 실제
  `agents`(쿠루미 등 enabled 캐릭터)로 워커 구성 + `acquireHermesSlot`으로 점유한
  진짜 슬롯 id를 채운다(보드의 hermesSlotId가 병렬 콘솔의 실제 풀 슬롯과 일치).
  lineage(sourceSessionId/debateId)도 함께 채워 출처와 연결.
- **미션 id 충돌**: `mission_<ts>_<uuid8>` — 연타/멀티창에서 두 번째가 dedup으로
  조용히 사라지던 유령 손실 제거.
- **폴링**: verifying/running 미션이 있으면 8초 간격 자동 갱신(busy/로딩 중 제외).
- **busy 직렬화 가시화**: 한 미션 작업 중이면 다른 카드 버튼도 disabled + "다른
  미션 작업 중" 안내(무반응 클릭 제거).
- **검증 실패 사유**: 실패 명령/요약을 카드에 표시 + "명령 고치고 다시 검증" 안내.
- **검증 진행/타임아웃**: "검증 중… (최대 3분)" + abort/timeout 시 "서버에선 계속
  실행 중일 수 있음" 안내 + 자동 1회 새로고침.
- **머지 결과 정직 표시**: merged sha / conflict N파일(abort) / dry_run을 카드에 노출.
- **액션 0개 카드 사유**: "검증 가능한 워커가 없습니다" 등.
- **두 갈래 구분**: 보드 빈 상태에 "실제 실행은 자율·병렬 탭, 보드는 검증·머지 기록" 명시.

## 라이브 E2E (dgx, 임시 repo)

실제 프로젝트 repo를 건드리지 않고, 임시 git repo를 allowlist에 넣어 검증:
미션 생성 → 검증 observed → 머지 큐 → **실제 git merge → git rev-parse HEAD real sha**
→ 서버 재시작 복원. negative: allowlist 밖 → dry_run, 충돌 브랜치 → conflict+abort.

## 남은 것

- D4b: Docker/gVisor sandbox runner(검증 격리 강화), 토론/패킷에서 직접 '미션 승격'
  동선, 자율실행 완주 결과의 미션화(두 갈래 실행 연결).
