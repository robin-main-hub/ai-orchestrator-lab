# 68 — Mission Kanban + Live Trace API (Orchestration OS PR1)

GPT PRO 플랜의 첫 수: UI가 예뻐지기 전에 **서버가 Orchestration Board에 필요한 정규화된
상태**(Kanban 컬럼 + Live Trace)를 제공한다. 웹/데스크톱/PWA가 전부 같은 서버 진실을
같은 방식으로 읽는다.

## 새 저장소 없음 — 전부 파생 (불변식)

Mission은 이미 별도 DB 없이 EventStorage 위 append-only `mission.*` 이벤트로 저장되고
`buildMissionIndexFromEvents`로 materialize된다. Kanban·Trace는 그 `ServerMissionRecord`
위에서 **순수 함수로 파생**한다 — EventStorage가 단일 진실로 유지된다.

- `packages/protocol/src/missionBoard.ts`(순수·테스트):
  - `kanbanColumnForMissionStatus` — status → todo/running/verifying/ready_to_merge/
    merged/archived/blocked.
  - `deriveMissionKanbanBoard(records)` → 컬럼별 카드. 카드는 status·truthStatus·워커
    수·검증 수·**최신 검증 상태와 observed 여부**·**merge state + 진짜 mergeCommitSha**·
    next action 라벨을 담는다.
  - `deriveMissionTrace(record)` → mission.created/worker.assigned/verification.recorded/
    merge.* 시간순 trace. 검증은 `observed`를 그대로 실어 truthStatus(observed vs
    simulated)를 정직하게 표기. `redactTracePreview`로 시크릿 마스킹.
- `apps/server/src/routes/missions.ts`: 기존 `handleMissionRoute`에 두 GET 추가 —
  `GET /missions/kanban`, `GET /missions/:id/trace`. 새 핸들러/저장소 없이 `store.list()/
  get()` 결과를 파생.

## 정직성 (가짜 금지)

- `merged`는 미션의 실제 status로만, 카드의 `mergeCommitSha`는 진짜 git sha(`dry_run`/
  `conflict`은 sha 없음).
- 검증 trace는 `observed:false`면 truthStatus를 `simulated`로 — observed로 위장 안 함.
- trace preview는 redacted(raw secret/log 금지).

## 후속 (정직하게 명시)

- **SSE 실시간 스트림**: 기존 `/events/stream`(SseSession)은 heartbeat만 보내고 신규
  이벤트를 broadcast하지 않으며 데스크톱은 폴링(stage14EventSync)으로 동기화한다.
  실시간 trace stream(`/missions/:id/trace/stream`)은 SseSession에 broadcast 훅을
  붙이는 별도 작업이라 이번 PR은 폴링 가능한 두 GET 엔드포인트로 토대를 깔았다.
- terminal/approval 전역 이벤트로 trace 보강도 후속(현재는 mission 라이프사이클 재구성).

## 검증

protocol +7, server +3(라우트), desktop typecheck·suite 그대로(1141). 기존 mission
route/UI 무변경.

## 다음

PR2 Checkpoint/Rollback · PR3/4 Docker/gVisor runner · PR5 Error card+self-correction
· PR6 Skill archive · PR7 Workflow templates · PR8 PWA.
