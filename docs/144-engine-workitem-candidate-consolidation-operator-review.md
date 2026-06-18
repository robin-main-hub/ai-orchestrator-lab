# Engine E13-E15 (구현 핸드오프) - WorkItem Candidate Consolidation + Operator Review

> **상태**: 구현 완료 - PR #654/#655/#656/#657 (code/tests) + 본 docs/checklist PR - 선행 E12(#652) - moving-os-engine-loop
> **목표**: `WorkItemCandidate` 축을 넓은 lifecycle로 열지 않고, UI/helper 중복을 줄이고 signal linkage와 read-only operator review surface를 추가한다.

## 한 줄 요약
WorkItemCandidate axis is now consolidated and can be reviewed through a read-only operator review surface. 확정 WorkItem lifecycle은 아직 없다.

## 무엇이 정리됐나
- Component extraction:
  - `WorkItemCandidateDetailDrawer`를 `AssistantInbox.tsx`에서 분리했다.
  - `WorkItemCandidateDetailSections`를 분리해 detail tab/section 렌더링을 좁은 컴포넌트로 옮겼다.
  - 기존 E6 detail drawer, ref-only link graph, E8/E9/E10/E12 detail sections는 유지된다.
- Board projection consolidation:
  - `buildWorkItemCandidateBoardProjection(operations, filters)` pure helper가 board counts, visible rows, attention rows를 만든다.
  - lane/risk/kind/ref/search/scope/sort 로직을 `AssistantInbox.tsx` 밖으로 이동했다.
- Signal chips:
  - `buildWorkItemCandidateSignalSummaryFromOperation`이 candidate origin signal을 ref-only chips로 요약한다.
  - board rows와 detail drawer가 source/evidence/draft/preview/risk/readiness 신호를 작은 chip/summary로 표시한다.
- Operator Review:
  - `buildWorkItemCandidateOperatorReview(operations, filter?)` pure helper가 readiness/confidence/missing-ref/trace-health counts와 filtered rows를 만든다.
  - WorkItem Candidate card에 `operator review` panel을 추가했다.
  - panel filter는 local-view only이며 기존 row list를 좁히기만 한다.
  - Command Deck / Command Palette에서 `Candidate Review`와 focused review filters로 jump할 수 있다.

## 안전 불변식
```text
candidate-only - read-only - local-view/local-detail only - ref-only
WorkItem create/launch/commit lifecycle 0
EventStorage append 0 - server write 0 - DB migration 0
runner dispatch 0 - patch apply 0 - external send 0 - hidden job 0
No object resolution beyond existing refs - PREVIEW/LIVE projection unchanged - generic only
```

## 코드 표면
- PR #654, merge commit `71ce8d0`
  - `WorkItemCandidateDetailDrawer.tsx`
  - `WorkItemCandidateDetailSections.tsx`
  - focused drawer/sections tests
- PR #655, merge commit `48d2a6c`
  - `workItemCandidateOperations.ts`
  - `buildWorkItemCandidateBoardProjection`
  - board projection tests
- PR #656, merge commit `8508bb4`
  - `workItemCandidateSignals.ts`
  - `WorkItemCandidateSignalChips.tsx`
  - board/detail signal chip tests
- PR #657, merge commit `b2a679a`
  - `workItemCandidateOperatorReview.ts`
  - `AssistantInboxWorkItemOperatorReview.test.tsx`
  - WorkItem Candidate card operator review panel
  - Command Deck / Command Palette `Candidate Review` jumps

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
| E13 | done | WorkItem Candidate component/helper consolidation. |
| E14 | done | WorkItem Candidate read-only signal chips and detail signal summary. |
| E15 | done | WorkItem Candidate read-only operator review surface and local review filters. |

## 검증
- PR #654:
  - RED verified: extracted drawer/sections imports failed before extraction.
  - focused detail tests pass.
  - `pnpm exec vitest run src/components/inbox src/lib` - 266 files / 1679 tests pass.
  - `pnpm typecheck` - pass.
  - `pnpm build` - pass.
  - `git diff --check` - pass.
  - CI pass, merged as `71ce8d0`.
- PR #655:
  - RED verified: board projection helper import failed before helper.
  - board projection focused tests pass.
  - `pnpm exec vitest run src/components/inbox src/lib` - 266 files / 1681 tests pass.
  - `pnpm typecheck` - pass.
  - `pnpm build` - pass.
  - `git diff --check` - pass.
  - CI pass, merged as `48d2a6c`.
- PR #656:
  - RED verified: signal helper/UI absent before implementation.
  - signal helper/UI focused tests pass.
  - `pnpm exec vitest run src/components/inbox src/lib` - 268 files / 1686 tests pass.
  - `pnpm typecheck` - pass.
  - `pnpm build` - pass.
  - `git diff --check` - pass.
  - CI pass, merged as `8508bb4`.
- PR #657:
  - RED verified: operator review panel, local filters, command deck jump, and palette commands absent before implementation.
  - `pnpm exec vitest run src/lib/workItemCandidateOperatorReview.test.ts src/components/inbox/AssistantInboxWorkItemOperatorReview.test.tsx src/components/inbox/AssistantInboxWorkItemCandidateBoard.test.tsx src/components/inbox/AssistantInboxCommandDeck.test.tsx src/lib/inboxPaletteCommands.test.ts` - 23 tests pass.
  - `pnpm exec vitest run src/components/inbox src/lib` - 270 files / 1692 tests pass. 기존 `--localstorage-file` 경고만 출력.
  - `pnpm typecheck` - pass.
  - `pnpm build` - pass. 기존 Vite chunk/dynamic import warning만 출력.
  - `git diff --check` - pass.
  - CI pass, merged as `b2a679a`.

## 완료 문구 (과장 금지)
WorkItemCandidate axis is now consolidated and can be reviewed through a read-only operator review surface. 확정 WorkItem lifecycle은 아직 없다.
