# Batch 26 (구현 핸드오프) — Visual Style Pass

> **상태**: 구현 완료 · PR #629 (코드) + 본 docs PR · 선행 Batch 25 docs/131 · forward-loop iter 8
> **목표**: 인박스의 커맨드센터 룩을 **공유 스타일 토큰 1소스**로 통합 — 상태 칩이 어디서나 동일하게 읽히고
> 위계가 일관되게. 순수 표현(presentational)만 — testid·안전 불변식·PREVIEW/LIVE 분리 불변.

## 한 줄 요약
emerald/amber/rose "pass/warn/blocked" 트리플이 4개 레코드 + 인라인 span에 중복돼 있던 걸
`lib/inboxStyleTokens.ts`(semantic tone scale + chip/pill/empty/section 토큰)로 묶고, AssistantInbox의
FRESHNESS/SANDBOX/HEALTH/SAFETY 레코드·PatchSummaryStrip·StatChip·Section·Evidence stale 칩을 전부
그 토큰에서 파생하도록 리팩터. freshness 칩의 어색한 `/90` 투명도 제거 → 나머지 칩과 일치.

## PR 트랙
| PR | 내용 |
| --- | --- |
| #629 | `lib/inboxStyleTokens.ts`(TONE good/warn/bad/info/neutral/muted + CHIP_BASE/PILL_BASE/EMPTY_STATE/SECTION_* + toneClass/chipClass/pillClass) + AssistantInbox 토큰 적용 리팩터 + `inboxStyleTokens.test.ts` |
| (this) | 본 핸드오프(docs/132) + 체크리스트 §26 |

## 무엇이 보이게/일관돼졌나
- **상태 칩 일관성**: pass/connected/fresh = 동일 emerald · warn/aging = 동일 amber · blocked/error/stale =
  동일 rose. status strip / source dock health / patch summary / sandbox outcome / evidence freshness 전부 동일 톤.
- **freshness 칩 정렬**: 기존 `text-*-200/90` → `text-*-200`로 통일, 살짝 흐려보이던 문제 해소.
- **empty state**: 공유 `EMPTY_STATE`(점선 ghost) 토큰으로 섹션 빈 상태 일관 — "대기중"으로 읽힘(고장 아님).
- **section shell**: `SECTION_CARD` + `SECTION_HEADER` 토큰으로 카드 외곽/헤더 타이포 일관.

## 안전 불변식 (0 유지)
```text
순수 표현(presentational)만 · 모든 data-testid 불변 · 새 control 0 · 도메인 용어 0
PREVIEW/LIVE 분리 불변 · honest empty 불변 · side-effect action control 0
토큰은 순수 문자열(로직 0, side effect 0)
```

## 검증
`inboxStyleTokens.test.ts`(5 — tone scale 안정 · 팔레트 매핑 · chip/pill 조합 · 레이아웃 토큰 · 도메인 용어 0) ·
인박스+lib 로컬 **1564 green** · typecheck clean · build green · CI green.

## 미접촉 / 다음 후보 (OS 로드맵 — generic only)
- BATCH I — Launch Key / Commit Point UX(승인 큐 → 컨트롤/오퍼레이터 큐 라벨링, 의미 불변).
- BATCH L — Docs Cleanup / No-Domain Roadmap Guard.
- 보류 유지: BATCH B(patch queue 통합, docs/125 설계 노트 — 명시적 스코프 필요).
- 한계: patch compare board 등 일부 소규모 인라인 색상 span은 미이전(고트래픽 상태 칩 우선 통합).
