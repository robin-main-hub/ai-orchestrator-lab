# 108 — Industrial Zone Batch 3 (honest live inbox + disabled gate route)

## 한 줄

Assistant Inbox를 "fixture 전시장"에서 **실제 app state 일부를 읽는 정직한 책상**으로 옮기고(H), learning failure gate를 **기본 OFF·부수효과 0 preview route**로 서버에 노출(L). evidence/ERP는 Antigravity 트랙으로 분리 유지. 자동 append/write/activation은 여전히 0.

## PR 트랙 (모두 main merged)

| PR | merge | 라인 | 내용 |
|---|---|---|---|
| #550 | `2bc7bd2` | L | learning failure gate preview route (disabled by default, read-only, no append) |
| #551 | `1cce6ee` | H | Assistant Inbox honest live data + empty states + example labeling |

## LINE H — Assistant Inbox 진실성 (#551)

데이터 출처를 **live / empty / 예시(fixture)** 3분리하고 섹션별 source badge 표시:
- `assistantInboxProjection.ts`: `buildAssistantInboxLiveProps(input)` — 실제 입력에서 카드 projection + 정직한 empty fallback. helpers `filterLearningEvents`, `projectMemoryCandidatesFromProjectRecords`. legacy `buildAssistantInboxProps`는 모든 섹션 `example` 태그.
- `AssistantInbox.tsx`: 섹션별 source badge(`live` / `no live data` / `예시(fixture)`) + example notice 배너 + 정직한 empty hint.
- `AssistantInboxContainer.tsx`: optional `live` prop — 있으면 live 모드, 없으면 fixture/example 모드.
- `App.tsx`: 실제 `eventLog` + `projectRecordController.records`를 read-only로 전달.

**카드 상태:**
- Runner gate: **LIVE** (dgx disabled → observed:false 정직)
- Learning loops: 실이벤트 있으면 LIVE, 없으면 **EMPTY** (server auto-emit OFF라 보통 empty)
- Memory candidates: H10 project records 있으면 LIVE(suggested/observed:false), 없으면 EMPTY
- Evidence: 기본 EMPTY, opt-in 시 명시 라벨 **예시(fixture)** (OS core엔 실 도메인 evidence 없음 — plugin/ERP 영역)
- Runtime manifest: 실 candidate 있으면 LIVE, 없으면 EMPTY

**검증(직접 확인):** 프로덕션 inbox에 `<button>`/`onClick` 0(테스트의 onClick은 "콜백 미발생" assert용 spy), live/empty/예시 provenance 분리, App.tsx 실 state 전달, 39 tests(4 files). **browser preview 미실행** — 사유: 원격 headless dgx-01, preview 툴 로컬·미연결·display 없음. 대체검증 = jsdom render + build + typecheck.

## LINE L — gate preview route (#550)

`GET /learning/failure-gate/preview` (`apps/server/src/routes/learningGatePreview.ts`), 기존 `handle...Route()→boolean` dispatch 패턴으로 등록.
- 가설 실패 artifact(verificationReportId/sandboxErrorCardId/missionId/observed)를 받아 `shouldAppendLearningFailure` **결정만** 반환.
- 기본 `gate.enabled=false` → 어떤 입력에도 `append:false / gate_disabled`. `?enabled=true`는 preview 전용(실 enablement 미연결), 그래도 append 0.
- **EventStorage 의존성 주입 자체가 없음** → 변이 불가능. 응답에 `sideEffectsPerformed:false` 고정. 결정론적 idempotency key 표면화(`lf:mission_1:verification:vr_1`).
- 9 tests: spy로 append/store/runBackgroundJob/send 0회 호출 assert.

## 통합 검증 (main, 두 PR 합쳐진 후)

- `corepack pnpm typecheck`: **0 errors** / `corepack pnpm build`: **green**
- 신규 테스트: H 39 + L 9
- 안전 불변선 전부 유지: 가짜 observed/live 0 / 자동 trusted·active 승격 0 / 자동 runtime load 0 / 자동 append·write 0 / 자동 외부 발송 0 / EventStorage 변이 0 / DB migration 0 / OS core 도메인 import 0.

## 체감 변화

- 어시스턴트 인박스가 이제 실제 app state(runner gate / eventLog / project records) 일부를 읽음.
- live / empty / 예시 상태가 화면에서 구분됨 — 가짜 live 0.
- 서버가 "이 실패가 학습 이벤트가 될 수 있나?"를 preview로 판정(append는 안 함).

## 다음 후보

- browser preview/스크린샷 실측 (로컬 desktop dev)
- 카드 디자인 다듬기 + 더 많은 live source 연결
- evidence 경로 단일화(evidenceBridge canonical) — Antigravity 조율
- gate route를 실제 enablement에 연결 (owner 결정)
- 실 mission 실패 → learning.failure 자동 emit (gate ON + idempotency, owner 결정)
