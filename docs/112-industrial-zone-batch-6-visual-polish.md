# Batch 6 (구현 핸드오프) — Visual Command Center Polish (LIVE 첫인상 + 토스트 겹침)

> **상태**: 구현 완료 · PR #565 + #566 · 지시 정본 `docs/110` LINE U~Y
> **선행**: Batch 5 `docs/111`(LIVE/PREVIEW 좌석) · 본 배치는 **실측 피드백 기반** 체감 개선

## 한 줄 요약
오너 실측에서 확인된 두 약점 — **LIVE 첫인상이 휑함**, **하단 승인 토스트가 인박스를 덮음** — 을 잡았다. 새 기능·실배선·도메인 연결 0. 작전극장 좌석 구조(Batch 5)는 그대로, "지휘실 첫인상"만 다듬음.

## 실측 근거 (상상 아님)
오너가 로컬 브라우저 프리뷰(desktop, `127.0.0.1:5173`)로 직접 확인:
- 좌석/모드 스위치·LIVE default·PREVIEW 워터마크·projection 분리·배지 가독성 — 전부 동작.
- PREVIEW = 지휘실 느낌 OK.
- **LIVE = 정직하지만 시각적으로 너무 비어 보임.**
- **하단 승인 토스트가 인박스 하단과 겹침.**

## PR 트랙
| PR | 내용 |
| --- | --- |
| #565 | LINE U/V/X — LIVE status strip + "No live data yet" hero + 의도적 빈 상태 + PREVIEW polish |
| #566 | LINE W/Y — 승인 토스트 bottom safe-area + 실측 체크리스트(Batch 6 regression) |

## LINE U — LIVE 커맨드센터 헤더 / status strip (#565)
- `AssistantInbox.tsx`: ModeSwitch 아래 `StatusStrip` — `mode · items · live X/4 · empty Y/4 · gate · disabled` 칩. 모두 **화면에 이미 있는 props에서만** 파생(runner gate verdict 포함), 날조 0·호출 0·버튼 0.
- 선택 `generatedAt` prop — **전달될 때만** "updated …" 칩 표시(순수 projection에 Date.now 미사용).
- `LiveEmptyHero` — LIVE가 runner gate 외 live 데이터가 없을 때만 `작전 대기 중 · No live data yet` (정직: gate만 관측됨 명시). 휑한 첫인상 → 의도된 대기 화면.

## LINE V — 의도적 빈 상태 (#565)
- 빈 섹션을 점선 ghost 행으로: `emptyHint` + `emptyDetail`(무엇이 채워지는지). 가짜 카드/fixture 텍스트 0, `source` `empty` 유지, 큰 여백 제거.
- 테스트: 빈 섹션에 fixture 텍스트 없음, source `empty`, LIVE에 preview fixture 누수 0.

## LINE X — PREVIEW polish (#565)
- amber 배너에 좌측 액센트 + `PREVIEW` 필 추가(가독·계층 강화). 정직성 불변(여전히 `예시(fixture)`, live 누수 0).

## LINE W — 승인 토스트 / 인박스 겹침 (#566, 레이아웃 only)
- 원인: `ApprovalToastBar`가 `fixed bottom-4`(~110px)로 떠서 인박스 하단을 덮음.
- 수정: `command_center` 페이지에만 스코프된 bottom safe-area —
  `.nav-center-page[data-page="command_center"] { padding-bottom: 132px }` + 래퍼 `data-safe-bottom="true"`.
- **토스트/승인 의미·UI 불변**, 인박스에 승인 액션 경로 추가 0.
- 검증: desktop 1280×860에서 인박스(2열)와 토스트 간격 ~150px, 겹침 없음. safe-area는 더 좁은/스크롤 레이아웃을 추가 보호.
- 정직 한계: 비정상적으로 짧은 창에선 앱 셸 자체가 오버플로(앱이 최소 창 높이를 가정) — 기존 셸 동작이라 본 레이아웃-only 변경 범위 밖. 오너가 실제 화면에서 regression 항목 체크.

## LINE Y — Visual QA 산출물 (#566)
- `docs/ASSISTANT_INBOX_PREVIEW_CHECKLIST.md`에 실측 결과 + **Batch 6 regression 체크리스트** 추가:
  LIVE sparse 의도적 / PREVIEW 여전히 fake / 토스트 무겹침 / 모드 스위치 / 누수 0 / read-only.

## 검증
- desktop 테스트 그린 (신규 **+10**: U/V/X 8 + W/Y 2). 인박스 스위트 그린.
- root typecheck green · root build green (CI). UI지만 dgx 제약 무관하게 **이번엔 로컬 브라우저 프리뷰 실측 수행** — LIVE 헤더/hero/빈상태, 토스트 무겹침 스크린샷 확인.

## 안전 불변식 (Batch 3~5 계승 — 0 유지)
```text
fake live / fake observed             0
auto append · write · activation       0
runtime load                          0
preview → live seam                   0
approval semantics 변경                0   (LINE W는 layout-only)
ERP/GIO 도메인 import                  0
read-only(no action button) 위반       0
```

## 미접촉 / 다음 후보
- REPLAY 실배선(eventLog 재생, read-only) · SANDBOX 실배선(sandbox runner) — 여전히 disabled placeholder.
- 좌석 localStorage 영속.
- 앱 셸 최소 창 높이/center-area 스크롤 구속(좁은 창 오버플로) — 별도 셸 배치 후보.
- 카드 내부(EvidenceCard 등) 추가 polish.
