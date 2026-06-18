# Engine E11 (구현 핸드오프) - WorkItem Candidate Operations Room

> **상태**: 구현 완료 - PR #648 (projection/board, merge commit `6d7f7d8`) + PR #649 (detail map, merge commit `a0cc7d9`) + PR #650 (controls, merge commit `b4dccd9`) + 본 docs/checklist PR - 선행 E10(#646/#647) - moving-os-engine-loop
> **목표**: `WorkItemCandidate`를 확정 작업 lifecycle 없이 빠르게 훑고, 묶고, inspect할 수 있는 read-only operations room으로 만든다.

## 한 줄 요약
WorkItemCandidates can now be operated as a read-only candidate operations room. 확정 WorkItem lifecycle은 아직 없다.

## 무엇이 보이게 됐나
- Operations projection:
  - `buildWorkItemCandidateOperations(candidates, links?, nextStepPreviews?, readinessById?)`.
  - lane/risk/kind/readiness/confidence/source/evidence/draft-link/preview-gap summary를 계산한다.
  - priority order는 lane -> risk -> readiness -> createdAt -> id로 deterministic.
- Candidate board upgrade:
  - operations summary strip.
  - lane grouping, attention group, readiness/confidence chips.
  - PREVIEW는 fixture 후보로 예시를 보여주고, LIVE는 실제 candidate/draft 입력이 없으면 honest empty.
- Detail drawer upgrade:
  - local-detail tabs: Overview / Map / Readiness / Preview.
  - Relationship map V2: candidate hub, source refs, evidence refs, draft claim refs, readiness, preview gaps.
  - refs는 string ref only이며, unresolved/missing state를 정직하게 보여준다.
- Operations controls:
  - local quick scope: all / attention / ready / linked refs.
  - local group-by: lane / readiness / risk.
  - local sort-by: priority / title / newest.
  - keyboard jump: `w` -> WorkItem Candidates board.
  - existing Command Deck / Command Palette `WorkItem Candidates 열기` jump 유지.

## 안전 불변식
```text
read-only - candidate-only - local-view / local-detail only
WorkItem create/launch/commit lifecycle 0
EventStorage append 0 - server write 0 - DB migration 0
runner dispatch 0 - patch apply 0 - external send 0 - hidden job 0
No object resolution beyond existing refs - PREVIEW/LIVE projection unchanged - generic only
```

## 코드 표면
- `workItemCandidateOperations.ts`
  - E8/E9/E10 projections를 묶어 operations summary/groups/rows를 만든다.
  - no I/O, no EventStorage, no server write, no runner/patch import.
- `AssistantInbox.tsx`
  - WorkItem Candidate card에 operations summary, local controls, group/sort/scope state 추가.
  - detail drawer에 local-detail tabs와 Relationship map V2 추가.
  - `w` keyboard accelerator를 WorkItem Candidates jump로 연결.
- tests
  - operations helper summary/group/sort.
  - board summary/grouping/PREVIEW/LIVE empty.
  - detail tabs/map V2.
  - local scope/group/sort controls and keyboard jump.
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
| E11 | done | WorkItem Candidate read-only operations room: projection, board, detail map, local controls. |

## 검증
- PR #648:
  - RED verified: operations helper/UI testids absent before implementation.
  - `pnpm exec vitest run src/components/inbox src/lib` - 260 files / 1658 tests pass.
  - `pnpm typecheck` - pass.
  - `pnpm build` - pass.
  - `git diff --check` - pass.
  - PR merged, merge commit `6d7f7d8`, CI pass.
- PR #649:
  - RED verified: detail tabs / relationship map V2 absent before implementation.
  - `pnpm exec vitest run src/components/inbox src/lib` - 261 files / 1662 tests pass.
  - `pnpm typecheck` - pass.
  - `pnpm build` - pass.
  - `git diff --check` - pass.
  - PR merged, merge commit `a0cc7d9`, CI pass.
- PR #650:
  - RED verified: operations controls / `w` jump absent before implementation.
  - `pnpm exec vitest run src/components/inbox src/lib` - 262 files / 1667 tests pass.
  - `pnpm typecheck` - pass.
  - `pnpm build` - pass.
  - `git diff --check` - pass.
  - GitHub Actions build+test and secret scan pass; Vercel deploy was rate-limited externally; PR merged, merge commit `b4dccd9`.

## 완료 문구 (과장 금지)
WorkItemCandidates can now be operated as a read-only candidate operations room. 확정 WorkItem lifecycle은 아직 없다.
