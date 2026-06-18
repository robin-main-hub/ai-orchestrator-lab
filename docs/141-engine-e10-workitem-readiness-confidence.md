# Engine E10 (구현 핸드오프) - WorkItem Candidate Readiness / Confidence

> **상태**: 구현 완료 - PR #646 (코드, merge commit `cd68dbc`) + 본 docs/checklist PR - 선행 E9(#644/#645) - moving-os-engine-loop
> **목표**: `WorkItemCandidate`를 확정 작업 lifecycle 없이 readiness/confidence로 빠르게 판정한다.

## 한 줄 요약
WorkItemCandidate can now show read-only readiness/confidence. 확정 WorkItem lifecycle은 아직 없다.

## 무엇이 보이게 됐나
- pure helper: `buildWorkItemCandidateReadiness(candidate, nextStepPreview?, crossLinks?)`.
- Readiness states:
  - `ready`
  - `needs-evidence`
  - `blocked`
  - `needs-review`
  - `unknown`
- Confidence bands:
  - `high`
  - `medium`
  - `low`
  - `unknown`
- Candidate board:
  - 각 row에 readiness chip을 표시한다.
  - chip은 `data-readiness` / `data-confidence`를 가진다.
- Candidate detail drawer:
  - `Readiness / confidence` 섹션을 read-only local-detail로 표시한다.
  - reasons, missing source/evidence refs, risk blockers, next inspection target을 보여준다.
- E9 next-step preview:
  - readiness/confidence가 있으면 preview section 안에서 참조한다.
- PREVIEW: fixture refs가 겹칠 때 example readiness가 보인다.
- LIVE: live candidate / live draft cross-link 입력에서만 readiness를 만든다.

## 안전 불변식
```text
read-only - candidate-only - local-view / local-detail only
WorkItem create/launch/commit lifecycle 0
EventStorage append 0 - server write 0 - DB migration 0
runner dispatch 0 - patch apply 0 - external send 0 - hidden job 0
PREVIEW/LIVE projection unchanged - generic only
```

## 코드 표면
- `workItemCandidateReadiness.ts`
  - candidate refs, E9 next-step preview, E8 cross-links를 순수 projection으로 요약.
  - missing refs는 honest unknown/missing state로 degrade.
  - high risk / blocked status는 blocked readiness로 표시.
- `AssistantInbox.tsx`
  - WorkItem Candidate board row에 readiness chip 추가.
  - WorkItem Candidate detail drawer에 readiness section 추가.
  - E9 next-step preview에 readiness reference 추가.
- tests
  - ready / needs-evidence / blocked / unknown-missing refs helper cases.
  - board readiness chips.
  - detail readiness section.
  - next-step preview readiness reference.
  - PREVIEW/LIVE separation.
  - no side-effect controls.

## Batch-log ledger
| Batch | 상태 | 메모 |
| --- | --- | --- |
| E1 | deferred | app-level source에는 정직한 diff stats가 없어 fake row를 만들지 않음. |
| E2 | done | Runner Theater는 read-only LIVE surface. |
| E3 | done | Learning & Memory Console은 read-only roll-up. |
| E4A | done | Evidence Draft LIVE input seam. Producer 없음. |
| E5 | done | WorkItem Candidate seed. Candidate-only central axis. |
| E6 | done | WorkItem Candidate detail drawer + ref-only link graph. |
| E7 | done | WorkItem Candidate local triage board + filters/search/jump. |
| E8 | done | WorkItem Candidate / Evidence Draft read-only ref cross-link. |
| E9 | done | WorkItem Candidate read-only next-step preview. |
| E10 | done | WorkItem Candidate read-only readiness/confidence meter. |

## 검증
- RED verified: helper import missing and UI readiness chip/section absent before implementation.
- `pnpm exec vitest run src/lib/workItemCandidateReadiness.test.ts src/components/inbox/AssistantInboxWorkItemReadiness.test.tsx` - 12 tests pass.
- E7/E8/E9/E10 focused regression set - 46 tests pass.
- `pnpm exec vitest run src/components/inbox src/lib` - 258 files / 1649 tests pass. 기존 `--localstorage-file` 경고만 출력.
- `pnpm typecheck` - pass.
- `pnpm build` - pass.
- PR #646 - merged, merge commit `cd68dbc`, CI pass.

## 완료 문구 (과장 금지)
WorkItemCandidate can now show read-only readiness/confidence. 확정 WorkItem lifecycle은 아직 없다.
