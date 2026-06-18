# Engine E7 (구현 핸드오프) - WorkItem Candidate Board / Triage View

> **상태**: 구현 완료 - PR #640 (코드) + 본 docs/checklist PR - 선행 E6(#639) - moving-os-engine-loop
> **목표**: `WorkItemCandidate`를 확정 작업으로 바꾸지 않고, 후보들을 로컬에서 빠르게 triage 가능하게 만든다.

## 한 줄 요약
WorkItemCandidate can now be triaged locally as a read-only candidate board. 확정 WorkItem lifecycle은 아직 없다.

## 무엇이 보이게 됐나
- board summary: total, lane(now/soon/watch), risk(high/medium/low), kind(patch/runner/evidence/memory/source), sourceRefs 있음, evidenceRefs 있음.
- local filters: lane, risk, kind, source ref presence, evidence ref presence.
- local search: title, reason, id, kind/lane/status/risk, source/evidence refs를 대상으로 필터링.
- command jump: Command Deck / Command Palette에서 `WorkItem Candidates 열기`로 후보 보드 위치로 이동.
- E6 유지: 후보 row click / Enter / Space로 read-only detail drawer와 ref-only link graph를 계속 열 수 있다.

## 안전 불변식
```text
candidate-only - local-view / local-detail only - display-only
WorkItem create/launch/commit lifecycle 0
EventStorage append 0 - server write 0 - DB migration 0
runner dispatch 0 - patch apply 0 - external send 0 - hidden job 0
PREVIEW/LIVE projection unchanged - generic only
```

## 코드 표면
- `AssistantInbox.tsx`
  - `WorkItemCandidatesCard`를 local triage board로 확장.
  - summary counts, local filters, local search, filtered rows를 추가.
  - `workItemCandidatesRef`와 `jumpToWorkItemCandidates`를 추가해 deck/palette jump를 local-view로 연결.
- `inboxPaletteCommands.ts`
  - `inbox.workItemCandidates` command 추가.
- `AssistantInboxWorkItemCandidateBoard.test.tsx`
  - summary, filters, search, command jump, E6 drawer 유지, side-effect control 부재를 검증.

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

## 검증
- `pnpm exec vitest run src/components/inbox/AssistantInboxWorkItemCandidateBoard.test.tsx src/components/inbox/AssistantInboxWorkItemCandidates.test.tsx src/components/inbox/AssistantInboxWorkItemCandidateDetail.test.tsx src/components/inbox/AssistantInboxCommandDeck.test.tsx src/lib/inboxPaletteCommands.test.ts` - 26 tests pass.
- `pnpm exec vitest run src/components/inbox src/lib` - 252 files / 1621 tests pass. 기존 `--localstorage-file` 경고만 출력.
- `pnpm typecheck` - pass.
- `pnpm build` - pass.
- PR #640 CI - pass.

## 완료 문구 (과장 금지)
WorkItemCandidate can now be triaged locally as a read-only candidate board. 확정 WorkItem lifecycle은 아직 없다.
