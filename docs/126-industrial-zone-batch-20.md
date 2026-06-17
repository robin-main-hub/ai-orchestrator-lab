# Batch 20 (구현 핸드오프) — Patch Candidate Comparison V2

> **상태**: 구현 완료 · PR #617 #618 · 선행 Batch 19 docs/125 · forward-loop iter 2
> **목표**: patch 후보를 **더 재밌고 유용하게 비교**한다 — read-only compare board. apply/commit/dispatch/file write 0.

## 한 줄 요약
patch 후보를 safe/watch/risk 레인으로 나누고, file-overlap heatmap·verification delta·safety reason
chip을 한 보드에서 보여준다. local-view 토글 뒤에 숨은 표시-전용 보드. 순수 투영, side-effect 0.

## PR 트랙
| PR | 내용 |
| --- | --- |
| #617 | `buildPatchCompareBoard` 순수 투영 + `PatchCompareBoardView` + Compare 토글(local-view) |
| #618 | 본 핸드오프(docs/126) + 체크리스트 §20 |

## 무엇이 보이게/유용해졌나
- **레인**: safe(pass+observed) / watch(warning) / risk(blocked 또는 not-observed). 각 레인은
  churn(추가+삭제) 오름차순 정렬 — **검토 빠른 것(작은 변경)이 먼저**.
- **file-overlap heatmap**: 후보들이 건드린 파일을 count 내림차순으로, **2개 이상이 건드린 파일은
  overlap 하이라이트**(data-overlap=true).
- **verification delta**: runner 주장(claimed) vs 실제(actual). claimed-clean인데 actual 미확인이면
  ⚠ verify mismatch 표식.
- **safety reason chips**: safetyBlockers/safetyWarnings를 칩으로.
- Compare 토글(data-action-scope="local-view")로 열고 닫음 — 후보 ≥2일 때만.

## 안전 불변식 (0 유지)
```text
buildPatchCompareBoard 순수(no Date.now/IO/model/runner call) · 보드는 표시 전용(버튼 0)
Compare 토글은 local-view view 컨트롤 · apply/commit/dispatch/file write 0
PREVIEW/LIVE 누수 0 · generic only(파일경로/후보 id 전부 generic) · SANDBOX 실행 0
```

## 검증
신규 테스트: `patchCandidateSource.test.ts` +5(레인/churn 정렬/heatmap/mismatch/empty-safe) ·
`AssistantInboxPatchCompare.test.tsx`(7). 인박스+plugins 로컬 253 green · typecheck clean ·
build green · CI green.

## 미접촉 / 다음 후보 (OS 로드맵 — generic only)
- BATCH E — Replay Timeline V2(timeline grouping · scrubber local · event clusters).
- BATCH F — Sandbox Proposal Shell · BATCH G — Generic Source Pack Demo · BATCH H — Evidence Draft.
- BATCH B(patch queue 통합)은 docs/125 설계 노트대로 별 스코프 필요(보류 유지).
