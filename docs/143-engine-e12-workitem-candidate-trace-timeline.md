# Engine E12 (구현 핸드오프) - WorkItem Candidate Source Trace Timeline

> **상태**: 구현 완료 - PR #652 (code/tests, merge commit `74080c7`) + 본 docs/checklist PR - 선행 E11(#648/#649/#650/#651) - moving-os-engine-loop
> **목표**: `WorkItemCandidate`를 확정 작업 lifecycle 없이 어떤 신호 흐름에서 생겼는지 read-only trace timeline으로 inspect한다.

## 한 줄 요약
WorkItemCandidate can now show a read-only source trace timeline. 확정 WorkItem lifecycle은 아직 없다.

## 무엇이 보이게 됐나
- Pure trace helper:
  - `buildWorkItemCandidateTrace(candidate, context?)`.
  - candidate reason, source refs, evidence refs, draft refs, readiness, next-step preview를 ref-only events로 만든다.
  - timestamp가 있으면 시간순, 없으면 deterministic fallback order를 사용한다.
- Candidate detail drawer:
  - local-detail `Trace` tab 추가.
  - `Trace timeline` section에서 source/evidence/draft/readiness/next-step events를 표시한다.
  - timestamp가 없으면 `time unknown`으로 표시한다.
  - string refs는 `ref only · unresolved`로 표시한다.
- Honest empty:
  - source/evidence refs가 없으면 `source refs unknown` / `evidence refs unknown`을 보여준다.
  - refs를 실제 object로 resolve했다고 주장하지 않는다.
- PREVIEW/LIVE:
  - PREVIEW는 fixture refs에서 trace를 보여준다.
  - LIVE는 live candidate/context 입력에서만 trace를 만든다.
  - PREVIEW fixture refs는 LIVE로 새지 않는다.

## 안전 불변식
```text
read-only - candidate-only - local-detail only - ref-only
WorkItem create/launch/commit lifecycle 0
EventStorage append 0 - server write 0 - DB migration 0
runner dispatch 0 - patch apply 0 - external send 0 - hidden job 0
No object resolution beyond existing refs - PREVIEW/LIVE projection unchanged - generic only
```

## 코드 표면
- `workItemCandidateTrace.ts`
  - candidate + optional E8/E9/E10 context를 trace events로 projection한다.
  - no I/O, no EventStorage, no server write, no runner/patch action import.
- `AssistantInbox.tsx`
  - WorkItem Candidate detail drawer에 `Trace` tab과 timeline section 추가.
  - 기존 Overview / Map / Readiness / Preview sections 유지.
- tests
  - helper trace projection.
  - linked draft claim trace events.
  - readiness / next-step trace events.
  - missing timestamp deterministic fallback.
  - unresolved refs and honest empty state.
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
| E11 | done | WorkItem Candidate read-only operations room: projection, board, detail map, local controls. |
| E12 | done | WorkItem Candidate read-only source trace timeline. |

## 검증
- PR #652:
  - RED verified: trace helper / trace tab absent before implementation.
  - `pnpm exec vitest run src/lib/workItemCandidateTrace.test.ts src/components/inbox/AssistantInboxWorkItemTrace.test.tsx` - 10 tests pass.
  - WorkItemCandidate regression set - 16 files / 79 tests pass.
  - `pnpm exec vitest run src/components/inbox src/lib` - 264 files / 1677 tests pass. 기존 `--localstorage-file` 경고만 출력.
  - `pnpm typecheck` - pass.
  - `pnpm build` - pass.
  - `git diff --check` - pass.
  - PR merged, merge commit `74080c7`, CI pass.

## 완료 문구 (과장 금지)
WorkItemCandidate can now show a read-only source trace timeline. 확정 WorkItem lifecycle은 아직 없다.
