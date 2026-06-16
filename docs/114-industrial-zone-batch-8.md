# Batch 8 (구현 핸드오프) — Persistence + Replay + Today Lane

> **상태**: 구현 완료 · PR #571 #572 #573 #574 · 지시 정본 docs/110 Batch 8 LINE A~E
> **선행**: Batch 7 docs/113 (command strip · work-queue · scenario deck · density). 본 배치는 "실사용 OS 데스크"의 사용감.

## 한 줄 요약
좌석을 기억하고(영속), Today/Recent를 실제 eventLog로 채우고, REPLAY를 읽기전용 재생으로 켜고, 좁은 창 스크롤을 안정화. SANDBOX는 action-risk로 계속 보류.

## PR 트랙
| PR | LINE | 내용 |
| --- | --- | --- |
| #571 | A | inboxViewMode localStorage 영속(opt-in `persistViewMode`, App 켬) |
| #572 | B | Today/Recent 레인 — 실제 eventLog 시간 버킷(주입 now) |
| #573 | C | REPLAY 모드 shell — read-only eventLog 재생 |
| #574 | D/E | 스크롤/레이아웃 안정화 + 본 핸드오프(docs/114) + 체크리스트 |

## LINE 요약
- **A** — `persistViewMode` prop(기본 off, 테스트 격리)로 좌석을 `ai-orchestrator.inbox-view-mode.v1`에 기억. 기본 LIVE 유지, 무효/비활성 저장값은 기본값으로 폴백. **로컬 UI pref만 — server/EventStorage write 0.**
- **B** — 순수 `bucketEventsByTime(events, nowMs)`(주입 now, Date.now 미사용)로 실제 eventLog를 today/recent로 버킷. App이 `recentEvents=eventLog` + `nowMs=Date.now()` 주입. 없으면 honest empty. generic 이벤트 타입 라벨만(도메인 0).
- **C** — REPLAY 좌석 활성(SANDBOX는 계속 disabled). `projectReplayEvents`(최신순·상한 20)로 `ReplayDeck`(read-only) 렌더 — type + timestamp. 액션 버튼/서버/write/append/activation 0. 비면 honest empty 재생 상태. replay 시 카드 그리드 대체.
- **D** — 실제 스크롤 컨테이너는 `.nav-center-shell .center-board`(셸 1fr 행에 bounded). `min-height:0` + `overscroll-behavior:contain` + command-center `scroll-padding-bottom`로 좁은/짧은 창 스크롤 안정화. 하단 safe-area(132px)·wide 2열 보존. **CSS only, approval 의미 불변.**
- **E** — 본 문서 + 체크리스트 Batch 8 regression.

## 검증
- 인박스 스위트 신규 누적: A +4, B +5, C +5 = **+14**. root typecheck·build·secret green(4 PR CI). 로컬 브라우저 실측: 좌석 영속(세션 간 REPLAY 기억), Today/Recent 카운트, REPLAY 20행, 좁은 창(760×720) center-board 스크롤 + 마지막 카드 토스트 클리어(gap ~233px).
- LINE D는 CSS 레이아웃이라 jsdom 단위테스트 부재 — 프리뷰 실측으로 검증(정직).

## 안전 불변식 (0 유지)
```text
ERP/GIO import 0 · fake live 0 · external send 0
server append/write 0 · runtime skill load 0 · DB migration 0
hidden background job 0 · new action button 0 · preview→live 누수 0
replay data mutation 0 · approval semantics 변경 0
영속은 localStorage(UI pref)만 — server/EventStorage write 0
```

## 미접촉 / 다음 후보
- SANDBOX 실배선(시뮬레이션/액션 위험 → 계속 보류).
- Today/Recent: runner/control 이벤트 타입별 분류·라벨 고도화.
- REPLAY: 타임라인 스크럽/필터(현재 최근 20 평면 리스트).
- 좌석 외 UI pref(밀도 등) 영속 확장.
