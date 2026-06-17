# Batch 15 (구현 핸드오프) — Source Dock V2 / External Source Deck

> **상태**: 구현 완료 · PR #598 #599 #600 #601 · 선행 Batch 14 docs/120 · SANDBOX 계속 보류
> **목표**: Batch 14의 "보이는 plugin source"를 **실제 OS 표면**으로 키운다 — 더 멋있고, 더 빠르고, 더 재밌게. 외부 소스 갑판(Source Dock)을 한눈에 읽고, ⌘K로 바로 가고, row를 누르면 디테일이 열린다. 전부 read-only · generic · side-effect 0.

## 한 줄 요약
Batch 14의 Plugin Sources 카드를 **Source Dock / External Source Deck**으로 승격: per-health 색 톤 + 한눈 health 스트립(A/B), PREVIEW 전용 시나리오 데모 덱(C), ⌘K "Source Dock 열기" 점프(D), row→로컬 detail drawer(E). 모두 view-only — 버튼 0(role=button div + Esc), 도메인 용어 0, plugin 실행/동적 import/원격 로딩 0, preview→LIVE 누수 0.

## PR 트랙
| PR | LINE | 내용 |
| --- | --- | --- |
| #598 | A/B | Source Dock 비주얼 업그레이드(health 색 톤·row-count chip·"External Source Deck" 언어) + 한눈 health 스트립 |
| #599 | C | PREVIEW 전용 데모 덱(mixed/healthy/stale/error/disabled 시나리오 radio 스위치, fixture only) |
| #600 | D | Command Palette → Source Dock 점프(`focusSection` 커맨드, scroll+focus, view/move only) |
| #601 | E | row → 로컬 detail drawer(role=button div + Esc, read-only typed 필드) |

## LINE 요약
- **A** — `PluginSourcesCard`의 모든 `data-testid`/`data-*`를 그대로 둔 채(=Batch 14 8개 테스트 green 유지) 보이는 카피를 "Source Dock · External Source Deck"으로, evidence 블록을 "Source Evidence"로 변경. `HEALTH_TONE`(connected=emerald / stale=amber / error=rose / disabled=muted / unknown=slate)을 health 배지에 적용(`data-health`는 불변). per-source row-count chip 추가.
- **B** — pure `summarizeSourceHealth()` + `SourceHealthStrip`: connected/stale/error/disabled/unknown 카운트 + **active-only** 총 row 수(disabled 소스는 0 기여 → dock 본문과 일치) + evidence 후보 수. PREVIEW=example 카운트, LIVE=실입력 카운트, **LIVE-empty는 dock·스트립 자체가 안 뜸**(정직 empty, all-zero 스트립 안 만듦).
- **C** — `EXAMPLE_SOURCE_SCENARIOS`(generic) + `SourceDemoDeck`(radio-group, **버튼 아님**) — `mode==='preview'`일 때만 렌더 + 컨테이너 데이터 플레인(`pluginExtras`)에서만 시나리오 라우팅. `mixed`=Batch 14 fixture 그대로(기존 PREVIEW 테스트 보존). 새 generic `error` 소스(status/health=error → row 0)로 error 톤 데모. **LIVE는 시나리오 완전 무시**.
- **D** — `InboxCommand.kind`에 `focusSection` 추가. 팔레트 엔트리 "Source Dock 열기"(hint "외부 소스 보기 · 화면 이동만") → `dispatch('focusSection','source-dock')`. inbox가 dock 카드 ref(`tabIndex=-1`)로 `scrollIntoView`+`focus`. **mode/필터/데이터 불변**. dock 비었을 때(LIVE 무입력 → 카드 null)는 ref null → 정직 no-op.
- **E** — `SourceDetailDrawer`: 선택 없으면 null(마운트시 DOM·버튼 0). 닫기는 `role="button"` div + Esc, 포커스 이동/복원. source row·evidence row를 `role="button"` tabIndex=0(Enter/Space)으로 클릭 가능하게. 드로어는 **typed primitive 필드만**(pluginId/sourceRef/category/status/health/observed/generatedAt | status/trust/observed) — 임의 객체 spread 안 함.

## 핵심 설계 결정 — ZERO-BUTTON 유지
인박스에는 `querySelectorAll('button').length === 0`을 단언하는 테스트가 **18개** 있고, 버튼을 허용하는 유일한 예외(SavedViewManager)는 `data-action-scope="local-preference"`를 요구한다. 그래서 LINE E의 drawer/close에 **Radix Sheet/Dialog를 쓰지 않았다**(그 내장 close가 진짜 `<button>`이라 18개를 깬다). 대신:
- row·close = `role="button"` **div** + `tabIndex` + Enter/Space + Esc(접근성 유지).
- drawer = 선택 전 `null`(마운트시 DOM 0).

→ 19개 버튼 관련 테스트를 **하나도 수정하지 않고** green 유지. 미래 배치가 이걸 "진짜 버튼으로 고치"면 19개가 깨지므로, 체크리스트 §15에 명시했다.

## 안전 불변식 (0 유지)
```text
OS는 OS · External Source Layer는 generic only (회사/도메인/ERP 용어 0, 미래 milestone 명명 0)
plugin 실행 0 · dynamic import 0 · remote loading 0 · source sync/run 버튼 0
side-effect 액션 0 · 버튼 0 (role=button div + Esc) · approve/send/run/sync/dispatch/write 0
server/EventStorage write 0 · external send 0 · hidden job 0 · 파괴적 액션 0
preview→LIVE 누수 0 (덱은 데이터 플레인 + 렌더 둘 다 preview gate) · LIVE-empty 정직 empty
evidence는 suggested(observed:false)만 · trusted/active 승격 0 · SANDBOX 실행 0
```

## 검증
- 신규 테스트: A/B `AssistantInboxSourceDock`(7), C `AssistantInboxSourceDemoDeck`(8), D `AssistantInboxSourceDockJump`(4), E `AssistantInboxSourceDetailDrawer`(7). 인박스 스위트 로컬 green · root typecheck clean · build green · CI(build+test / secret scan) green.
- **정직 한계**: 표면(색 톤·스트립·덱·점프·드로어)은 jsdom + Testing-Library DOM 단언으로 잠갔다. 실제 브라우저 육안(색감·애니메이션·스크롤 감)은 오너 프리뷰 체크리스트(§15)로 남긴다. `scrollIntoView`는 jsdom에 없어 점프 테스트에서 stub.

## 미접촉 / 다음 후보 (OS 로드맵 — generic only)
외부 소스 레이어는 **Generic External Source Layer / Source Dock**로만 유지. OS 로드맵은 특정 외부 도메인/업무 앱을 future OS milestone으로 명명하지 않는다.
- 실제 브라우저에서 Source Dock 색감/데모 덱/드로어 육안 확인(오너 프리뷰).
- **Batch 16 — Operator Console / Command Deck**: 오퍼레이터 콘솔 속도 레이어.
- **Batch 17 — Sandbox Proposal Shell**: action-risk라 미뤄둔 SANDBOX 제안 셸(제안만, 실행은 그 다음).
- **Batch 18 — Patch Candidate Speed Lane**: 패치 후보 스피드 레인.
