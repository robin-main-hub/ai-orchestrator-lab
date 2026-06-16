# Batch 10 (구현 핸드오프) — Command Center Search + Focus Filters

> **상태**: 구현 완료 · PR #579 #580 #581 · 지시 정본 docs/110 Batch 10 LINE A~E
> **선행**: Batch 9 docs/115 (분류/배지/REPLAY 필터/WorkItem-lite). 본 배치는 "찾고 좁히기".

## 한 줄 요약
어시스턴트 인박스에 로컬 검색·카테고리 필터·포커스 뷰·키보드를 넣어, 의미가 분류된 OS 책상을 **읽고 좁히고 찾을 수 있게** 했다. 모두 view-only — 부작용 액션 0.

## ⚠️ 상호작용 철학 전환 (이 배치의 핵심)
```text
기존:  "button 0"  (어떤 버튼도 없음)
정정:  "no side-effect action controls"  (부작용 있는 실행 컨트롤만 금지)
```
OS 데스크가 되려면 검색·필터·모드 전환·포커스가 필요하다. 금지선은 "상호작용 자체"가 아니라 **부작용**이다.

- **허용** (view-only): search input · radio · select · mode switch · local view filter · keyboard focus/clear.
- **금지** (side-effect): approve · send · write · run · apply · dispatch · external call · server append · memory activation.

> 실무 규칙: 인박스는 여전히 `<button>` 0개를 유지한다(검색=input, 필터/포커스=radio). 만약 향후 `<button>`을 쓰더라도 **view toggle임을 테스트로 증명**해야 하고, 부작용 라벨(approve/run/send/apply/dispatch)은 텍스트로도 금지한다.

## PR 트랙
| PR | LINE | 내용 |
| --- | --- | --- |
| #579 | A/D | local 검색 input + 키보드(`/` 포커스, `Esc` 클리어) |
| #580 | B/C | 카테고리 필터 strip + 포커스 뷰 strip |
| #581 | E | 본 핸드오프(docs/116) + 체크리스트/철학 정정 |

## LINE 요약
- **A** 검색 input → work-queue 레인 행 + REPLAY 행을 substring 필터. 결과 없으면 "검색 결과 없음"(정직). local state만, write/server 0.
- **D** `/` 검색 포커스, `Esc` 클리어. 액션 트리거 0.
- **B** 카테고리 strip(all + 8) → 이벤트 파생 Today/Recent 레인을 분류 카테고리로 정제(타입 레인은 불변, 날조 0). REPLAY는 자체 카테고리 필터(B9) 유지.
- **C** 포커스 strip(all/today/blocked/warnings/replay) — view-only 영역 narrowing: today/blocked는 레인 가시성, warnings는 evidence 카드 표시(레인 숨김), replay는 REPLAY 좌석으로 점프.
- **E** 본 문서 + 체크리스트.

## 검증
- 신규 테스트: A/D +4, B/C +5 = **+9**. 인박스 스위트 green, root typecheck·build·secret green(3 PR CI). 기본 focus=all·category=all이라 기존 테스트 무영향(검색/필터는 opt-in view).
- 빈 결과는 "검색 결과 없음 / 필터 결과 없음"으로 정직 표시(죽은 화면 방지).

## 안전 불변식 (0 유지)
```text
ERP/domain import 0 · fake live 0 · external send 0 · server append/write 0
runtime skill load 0 · DB migration 0 · hidden job 0
side-effect action control 0 (approve/send/write/run/apply/dispatch)
preview→live 누수 0 · replay mutation 0 · approval semantics 변경 0
검색/필터/포커스 = local view state only
```

## Batch 10 regression 체크리스트 (요약)
- 검색이 보이는 행만 필터 · `Esc`는 검색만 클리어 · `/`는 검색만 포커스
- 카테고리 필터는 보이는 행만 변경 · 포커스는 보이는 영역만 변경
- 부작용 버튼/라벨(approve/send/run/apply/dispatch) 0
- PREVIEW fixture 라벨 유지 · LIVE는 preview 데이터 안 받음 · REPLAY read-only(무변형)

## 미접촉 / 다음 후보 (오너 권장)
- **Batch 11 (추천)**: Saved Views(검색/필터 조합 저장 — localStorage UI pref까지만) + Command Palette hooks(⌘K/`/`에서 좌석 전환·필터).
- SANDBOX shell(여전히 보류) · 실제 WorkItem source 배선.
