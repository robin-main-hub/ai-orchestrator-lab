# Batch 16 (구현 핸드오프) — Operator Console / Command Deck

> **상태**: 구현 완료 · PR #603 #604 #605 #606 #607 · 선행 Batch 15 docs/121 · SANDBOX 계속 보류
> **목표**: Source Dock 갑판은 생겼으니, 이제 **OS를 손에 잡히게** 만든다 — 3초 안에 상태 파악, 자주 쓰는 명령을 한 번에, Source Dock으로 즉시 점프, drawer를 작전실답게. 그리고 상호작용 철학을 `button 0`에서 **`no side-effect action`**으로 확정.

## 한 줄 요약
`<button>`은 적이 아니다 — 적은 **side-effect OS action**이다. 이 철학 전환을 테스트 불변식에 박제(LINE E)한 뒤, Operator Console 헤더(A), Command Deck(B), Source Dock quick controls(C), detail drawer 섹션화(D)를 올렸다. 새 버튼은 전부 `data-action-scope="local-view|local-detail"` 로컬 뷰 컨트롤이고, send/approve/run/sync/dispatch/write 같은 OS 액션은 라벨·핸들러 레벨에서 계속 0.

## PR 트랙
| PR | LINE | 내용 |
| --- | --- | --- |
| #603 | E | **불변식 업그레이드** — `inboxInvariant.ts` 공유 헬퍼 + 22개 테스트 마이그레이션(가장 먼저, 버튼 도입 전 green refactor) |
| #604 | A | Operator Console 헤더 — seat/active view/filter/source health/blocked/warn/gate/replay 3초 리드 |
| #605 | B | Command Deck — 9개 local-view 버튼(프리셋 7 + Source Dock + Clear Filters) |
| #606 | C | Source Dock quick controls — jump/alerts/sources/evidence/all 로컬 뷰 필터 |
| #607 | D | Detail drawer 폴리시 — Identity/Health/Source/Evidence·Trust/Observed 섹션 + full sourceRef |

## 철학 전환 (LINE E) — 이게 이번 배치의 코어
이전: 인박스는 `<button>` 0개여야 한다(18개 테스트가 `querySelectorAll("button").length === 0` 단언). 이건 "겁먹은 결재 프로그램" 냄새가 났다.

이후: **side-effect action control만 금지**, local view control은 허용.
- **허용**: view toggle · local filter · saved-view apply · command-deck action · jump/focus · detail open/close.
- **금지**: send · approve · write · append · run · apply patch · dispatch · sync · external call · source execution · runtime load.

### `inboxInvariant.ts` 계약
- `ALLOWED_ACTION_SCOPES = local-view | local-preference | local-detail`. (deck/뷰토글=local-view, saved-view=local-preference, drawer/행=local-detail)
- `FORBIDDEN_ACTION_WORDS` (컨트롤 라벨용) — false-positive 회피 튜닝: `"run "`/`"run-"`(bare "run" 아님 → "Runner" 안전), `"apply patch"`(bare "apply" 아님 → "Apply view" 안전). **`"external"`은 제외** — 여기선 generic 명사("External Source Deck", "external-source")지 액션이 아님.
- `FORBIDDEN_TEXT_WORDS` (본문 스캔용) — 명사 충돌 단어 제외한 좁은 리스트.
- `assertNoSideEffectActionControls(root)` — 모든 `<button>`/`[role=button]`은 허용 scope를 달아야 하고 라벨에 금지어가 없어야 함. radio/checkbox는 단일 선택 뷰 상태라 단어 프로브만(기존 필터 radio 무수정).
- `assertNoForbiddenActionText(root)` / `collectActionControls(root)`.

**순서**: LINE E를 가장 먼저 머지(버튼 없을 때 trivially green refactor) → 그 다음에야 B/C가 진짜 버튼을 띄움. 거꾸로 하면 18개가 동시에 red. 기존 Batch 15 `role=button` 행/close에는 `local-detail` scope를 E에서 부여.

## LINE 요약
- **A** — StatusStrip를 Operator Console로 확장. 추가 칩: active view(프리셋 라벨 또는 "custom"), filter summary(q/cat/focus 또는 "none"), source health 트리오(✓connected/~stale/!error, 소스 있을 때만), replay count. 전부 화면에 이미 있는 props에서 파생, 서버 콜·write 0. LIVE-empty는 source 칩 안 뜸(정직).
- **B** — Command Deck: 7 프리셋 + Source Dock + Clear Filters, 각각 `<button data-action-scope="local-view">`. 기존 핸들러(onPreset/jumpToSourceDock/clearFilters)의 얇은 래퍼. **키스톤 테스트**: 진짜 `<button>`이 떠 있는데 `assertNoSideEffectActionControls`가 통과 → 철학 전환 end-to-end 증명.
- **C** — Source Dock quick controls: jump/alerts(stale·error만)/sources/evidence/all. dock이 **리스트**하는 것만 좁히는 순수 프레젠테이션(데이터 불변). health 스트립은 전체 overview 유지.
- **D** — drawer를 Identity/Health/Source/Evidence·Trust/Observed 섹션으로. 모든 `source-detail-field-{k}` testid 보존. sourceRef full 표시. close는 role=button div 유지(local-detail) — Radix Sheet 안 씀(real button이라 churn). copy 버튼 없음(차터 밖).

## 안전 불변식 (0 유지)
```text
side-effect OS action 0 (send/approve/write/append/run/apply patch/dispatch/sync/external/execute/load)
모든 interactive control은 allowed data-action-scope 보유 · 라벨에 금지어 0
plugin 실행 0 · dynamic import 0 · remote loading 0 · source sync/refresh 0
server/EventStorage write 0 · external send 0 · hidden job 0 · 파괴적 액션 0
preview→LIVE 누수 0 · LIVE-empty 정직 empty · OS는 OS · generic only (회사/도메인/ERP 0)
SANDBOX 실행 0
```

## 검증
- 신규/변경 테스트: E(Invariant 9 + 22파일 마이그레이션), A(OperatorConsole 5), B(CommandDeck 7), C(SourceDockControls 6), D(SourceDetailDrawer +4). 인박스 스위트 로컬 184 green · root typecheck clean · build green · CI(build+test / secret scan) 5/5 green.
- **정직 한계**: 표면(콘솔 칩·덱·quick controls·drawer 섹션)은 jsdom + Testing-Library DOM 단언으로 잠갔다. 실제 브라우저 육안(조종석 감·간격·색)은 오너 프리뷰 체크리스트(§16)로 남긴다.

## 새 로컬 컨트롤 추가하는 법 (앞으로)
1. `<button data-action-scope="local-view|local-preference|local-detail">` 로 만든다.
2. 라벨에 `FORBIDDEN_ACTION_WORDS`를 쓰지 않는다(side-effect 동사 금지).
3. 핸들러는 로컬 React 뷰 상태만 바꾼다(서버/EventStorage/write/dispatch 0).
4. 테스트는 `assertNoSideEffectActionControls`로 검증한다.
→ 다시는 `role=button` 우회를 쓸 필요 없다.

## 미접촉 / 다음 후보 (OS 로드맵 — generic only)
외부 소스 레이어는 **Generic External Source Layer / Source Dock**로만 유지. OS 로드맵은 특정 외부 도메인/업무 앱을 future OS milestone으로 명명하지 않는다.
- 실제 브라우저에서 Operator Console / Command Deck 조종석 감 육안 확인(오너 프리뷰).
- **Batch 17 — Sandbox Proposal Shell**: 실행 없는 실험장(scenario proposal · dry-run visual · no write/dispatch/run).
- **Batch 18 — Patch Candidate Speed Lane**: 안전 apply preview · diff compare · staged preview(코딩 가속).
- active saved-view 매처(현재 user-saved view 적용 시 "custom" 표시), Command Deck ↔ 프리셋 radio 일원화는 후속.
