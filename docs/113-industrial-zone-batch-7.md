# Batch 7 (구현 핸드오프) — Assistant Inbox를 쓸 수 있는 OS 데스크로

> **상태**: 구현 완료 · PR #567 · #568 · #569 · #570 · 지시 정본 docs/110 LINE A~F (Batch 7)
> **선행**: Batch 6 docs/112 (LIVE 첫인상 + 토스트 겹침). 본 배치는 "멋있는 셸"에서 "실사용 OS 데스크"로.

## 한 줄 요약
LIVE를 데이터가 적어도 지휘실처럼 읽히게 만들고(상단 커맨드 스트립 + 우선순위 레인), PREVIEW를 명시적 시나리오 덱으로 굳히고, 밀도를 ops-desk로 조였다. 새 기능·실배선·도메인 연결·자동 액션 0.

## PR 트랙
| PR | LINE | 내용 |
| --- | --- | --- |
| #567 | A/C | 상단 커맨드 스트립(severity rollup + live event/record/source) + eventLog 라이브 확장 |
| #568 | B | read-only work-queue 레인(Today/Waiting/Blocked/Learning/Runner) |
| #569 | E | preview 시나리오 덱(레전드 + 커버리지 lock) |
| #570 | D/F | 밀도 패스 + 본 핸드오프(docs/113) + 체크리스트 |

## LINE 요약
- **A** — `StatusStrip`에 blocked/warn rollup 추가 + (LIVE) `events N`/`records N`/`src · eventLog|no live data` 칩. 화면에 있는 props에서만 파생, 날조 0, 버튼 0, LIVE+PREVIEW 동작.
- **C** — `AssistantInboxLiveInput.eventLogCount`를 App의 실제 `eventLog.length`로 배선. 비면 honest "no live data". projection 반환 타입을 Pick으로 굳혀 UI prop 추가가 더는 깨지 않음.
- **B** — `buildWorkLanes` 순수 버킷팅 → 레인 레일(읽기 전용). 화면 항목의 파생 VIEW일 뿐(새 소스/가짜 live 0), generic only, 빈 레인 정직(Today는 시간 버킷 미배선이라 정직 empty).
- **E** — PREVIEW 시나리오 레전드(PASS/WARNING/BLOCKED/not observed/eval failed/quarantined/verified/rejected) + 커버리지 lock 테스트. 덱은 이미 이 상태들을 보였고, 이번에 명시·고정. fixture 카운트 인플레 없이(핀 테스트 churn 회피). LIVE 전환 시 시나리오 데이터·레전드 모두 사라짐(누수 0).
- **D** — Card/섹션 패딩 축소 + 2열 grid gap 정리(xl 확대) + 섹션 헤더 구분선. 클래스만, 불변식·testid 무변경.
- **F** — 본 문서 + `docs/ASSISTANT_INBOX_PREVIEW_CHECKLIST.md`에 Batch 7 regression 추가.

## 검증
- desktop 인박스 스위트 그린 (신규 누적: A/C +4, B +5, E +3 = +12). root typecheck·build·secret scan green(4 PR CI). 로컬 브라우저 실측: LIVE 커맨드 스트립/레인/밀도, PREVIEW 시나리오 레전드 렌더 확인(콘솔 에러 0).

## 안전 불변식 (계승 — 0 유지)
```text
ERP/domain 도메인 import 0 · fake live 0 · external send 0
server append/write/activation 0 · runtime skill load 0 · DB migration 0
hidden background job 0 · new action button 0 · approval semantics 변경 0
direct runner execution 0 · preview→live 누수 0
```

## 미접촉 / 다음 후보
- REPLAY/SANDBOX 실배선(eventLog 재생 / sandbox runner) — 여전히 disabled placeholder.
- Today 레인 시간 버킷 실배선(현재 정직 empty).
- 좌석 localStorage 영속.
- 앱 셸 최소 창 높이/center 스크롤 구속(좁은 창 오버플로).
- runner/control 이벤트 카운트를 strip에 추가 배선(현재 eventLog 총량만).
