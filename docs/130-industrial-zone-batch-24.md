# Batch 24 (구현 핸드오프) — Evidence Draft / Footnote Surface

> **상태**: 구현 완료 · PR #625 (코드) + 본 docs PR · 선행 Batch 23 docs/129 · forward-loop iter 6
> **목표**: 신뢰가능한 어시스턴트의 **draft 레이어**를 OS에 보이게 — claim마다 번호 매겨진 evidence
> **footnote**(출처 ref), 각 footnote의 **freshness 판정**(fresh/aging/stale/unknown), 그리고 근거 없는
> claim은 조용히 단정하지 않고 **missing info / ask** 슬롯에 노출. 외부 전송 0 · approve 관료주의 0 · 로컬 PREVIEW 전용.

## 한 줄 요약
generic example draft를 정의하고(claim + source-ref 표), PREVIEW Evidence Draft 카드에 **claim + 위첨자
footnote 마커 + 번호 매겨진 footnote 표(freshness 칩) + missing-info/ask 슬롯**으로 렌더. 투영은 순수
(`projectEvidenceDraft(input, nowMs)`) — 주입된 기준 시각으로 freshness를 계산해 결정적이고 테스트 가능. Date.now 0.

## PR 트랙
| PR | 내용 |
| --- | --- |
| #625 | `lib/evidenceDraft.ts`(타입 + projectEvidenceDraft + classifyFreshness + EXAMPLE_EVIDENCE_DRAFT + EXAMPLE_DRAFT_NOW_MS) + `EvidenceDraftCard`(PREVIEW 전용, AssistantInbox 인라인) + 테스트 2종 |
| (this) | 본 핸드오프(docs/130) + 체크리스트 §24 |

## 무엇이 보이게 됐나
- `projectEvidenceDraft`(순수): claim들이 참조하는 **known ref만** 첫 등장 순서로 footnote 번호 부여 →
  각 footnote에 `freshness`(주입 nowMs 기준) + `ageHours`. claim→footnote 번호 매핑 + `supported` 플래그.
  근거 없는 claim은 `missing[]`(ask 텍스트)로. `freshnessSummary` + `staleCount` 집계.
- `classifyFreshness(ageMs)`: `< 24h` fresh · `< 7d` aging · 그 외 stale · `null/NaN` unknown · 미래 스탬프는 fresh.
- `EvidenceDraftCard`(PREVIEW 전용): 헤더(제목 + stale 경고 칩 + "footnoted · read-only") + claim 본문(위첨자
  `[n]` 마커, 근거 없으면 "needs source" 태그) + 번호 footnote 표(refId/label/locator + freshness 칩) +
  점선 **missing info · ask** 슬롯. 표시 전용, 버튼 0.
- `EXAMPLE_EVIDENCE_DRAFT`: footnote 4개(fresh/aging/stale/unknown 각 1) + 근거 없는 claim 1개 → 모든
  freshness 판정과 ask 경로를 한 카드에서 시연. generic only.

## 안전 불변식 (0 유지)
```text
PREVIEW 전용(LIVE 누수 0) · 순수 투영(Date.now 0, I/O 0) · 외부 전송 0 · approve 관료주의 0
side-effect action control 0(표시 전용, 버튼 0) · generic only(도메인 용어 0)
assertNoSideEffectActionControls + assertNoForbiddenActionText 통과 · SANDBOX 실행 0
```

## 검증
신규 테스트: `evidenceDraft.test.ts`(7 — freshness 분류 · footnote 번호 · freshness 버킷 · claim↔footnote
매핑 · ask 슬롯 · unknown ref 무시 · 결정성/도메인 용어 0) · `AssistantInboxEvidenceDraft.test.tsx`(5 —
draft/footnote PREVIEW 가시 · freshness 칩 · claim 마커+ask · PREVIEW 전용 · read-only).
인박스+lib 로컬 **1556 green** · typecheck clean · build green · CI green.

## 미접촉 / 다음 후보 (OS 로드맵 — generic only)
- BATCH J — Command Palette Power Pass(더 많은 local-view 점프 명령 + 금지 라벨 테스트).
- BATCH K — Visual Style Pass(밀도 높은 다크 커맨드센터 톤 · 위계/배지/empty state).
- BATCH I — Launch Key / Commit Point UX(승인 큐 → 컨트롤/오퍼레이터 큐 라벨링, 의미 불변).
- 보류 유지: BATCH B(patch queue 통합, docs/125 설계 노트 — 명시적 스코프 필요).
