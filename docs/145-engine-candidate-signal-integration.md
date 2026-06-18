# Engine E16-E19 (구현 핸드오프) - Candidate Signal Integration

> **상태**: 구현 완료 - PR #659/#660/#661/#662 (code/tests) + 본 docs/checklist PR - 선행 E13-E15(#658) - moving-os-engine-loop
> **목표**: `WorkItemCandidate` lifecycle을 열지 않고 Runner Theater, Patch Candidate lane, Learning/Memory Console과 read-only 신호 링크/필터/jump로 연결한다.

## 한 줄 요약
WorkItemCandidates can now surface read-only runner, patch, and learning/memory signal links. 확정 WorkItem lifecycle은 아직 없다.

## 무엇이 연결됐나
- Candidate / Runner linkage:
  - `linkCandidatesToRunnerSignals(candidates, runnerTheater?)` helper가 candidate refs와 runner/mission refs를 read-only로 매칭한다.
  - WorkItemCandidate row/detail에 runner-linked/active/stalled/done/attention 신호를 표시한다.
  - Runner Theater는 연결된 candidate count/chip을 local-view로 보여준다.
- Candidate / Patch linkage:
  - `linkCandidatesToPatchSignals(candidates, patchCandidates?)` helper가 patch candidate refs와 candidate refs를 매칭한다.
  - WorkItemCandidate row/detail에 patch-linked/pass/warning/blocked/diff-preview 신호를 표시한다.
  - Patch lane은 관련 WorkItemCandidate count/chip을 표시한다.
  - `not_run` verification은 exact status를 `data-verification`에 보존하되 UI 문구는 `verification pending`으로 표시한다.
- Candidate / Learning-Memory linkage:
  - `linkCandidatesToLearningMemorySignals(candidates, learningMemory?)` helper가 Learning & Memory console aggregate와 candidate refs를 연결한다.
  - row/detail에 memory-linked/learning-linked/warning/missing-context 신호를 표시한다.
  - console은 관련 candidate count를 보여주되 개별 memory object resolution을 주장하지 않는다.
- Cross-surface navigation:
  - Command Palette/Deck에 `Candidate Signals 열기`, `Runner-linked Candidates 보기`, `Patch-linked Candidates 보기`, `Memory-linked Candidates 보기`를 추가했다.
  - WorkItemCandidate board에 `all / any / runner / patch / memory` signal filter를 추가했다.
  - command는 local-view filter와 focus만 바꾼다.

## 안전 불변식
```text
candidate-only - read-only - local-view/local-detail only - ref-only
WorkItem create/launch/commit lifecycle 0
EventStorage append 0 - server write 0 - DB migration 0
runner dispatch 0 - patch apply 0 - memory write 0 - external send 0
hidden job 0 - remote plugin loading 0 - generic only
refs remain refs unless existing data is already directly available
PREVIEW fixtures do not leak into LIVE
```

## 코드 표면
- PR #659, merge commit `9da4924`
  - `workItemCandidateRunnerSignals.ts`
  - candidate runner chips/detail section
  - Runner Theater related candidate count
- PR #660, merge commit `b947999`
  - `workItemCandidatePatchSignals.ts`
  - candidate patch chips/detail section
  - Patch lane related candidate count
- PR #661, merge commit `41d7c6f`
  - `workItemCandidateLearningMemorySignals.ts`
  - candidate learning/memory chips/detail section
  - Learning & Memory console related candidate count
- PR #662, merge commit `bcacaff`
  - signal filters in WorkItemCandidate board
  - signal-focused Command Palette/Deck entries
  - local focus/filter routing for signal commands

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
| E16 | done | WorkItem Candidate / Runner Theater read-only signal linkage. |
| E17 | done | WorkItem Candidate / Patch Candidate read-only signal linkage. |
| E18 | done | WorkItem Candidate / Learning-Memory read-only aggregate signal linkage. |
| E19 | done | WorkItem Candidate cross-surface local signal filters and command jumps. |

## 검증
- PR #659:
  - RED verified before helper/UI existed.
  - `pnpm exec vitest run src/lib/workItemCandidateRunnerSignals.test.ts src/components/inbox/AssistantInboxWorkItemRunnerSignals.test.tsx` - pass.
  - `pnpm exec vitest run src/components/inbox src/lib` - 272 files / 1696 tests pass.
  - `pnpm typecheck` - pass.
  - `pnpm build` - pass.
  - `git diff --check` - pass.
  - CI pass, merged as `9da4924`.
- PR #660:
  - RED verified before helper/UI existed.
  - `pnpm exec vitest run src/lib/workItemCandidatePatchSignals.test.ts src/components/inbox/AssistantInboxWorkItemPatchSignals.test.tsx` - 4 tests pass.
  - patch/candidate regression set - 29 tests pass.
  - `pnpm exec vitest run src/components/inbox src/lib` - 274 files / 1700 tests pass.
  - `pnpm typecheck` - pass.
  - `pnpm build` - pass.
  - `git diff --check` - pass.
  - CI pass, merged as `b947999`.
- PR #661:
  - RED verified before helper/UI existed.
  - `pnpm exec vitest run src/lib/workItemCandidateLearningMemorySignals.test.ts src/components/inbox/AssistantInboxWorkItemLearningMemorySignals.test.tsx` - 4 tests pass.
  - learning/memory/candidate regression set - 25 tests pass.
  - `pnpm exec vitest run src/components/inbox src/lib` - 276 files / 1704 tests pass.
  - `pnpm typecheck` - pass.
  - `pnpm build` - pass.
  - `git diff --check` - pass.
  - CI pass, merged as `41d7c6f`.
- PR #662:
  - RED verified: missing palette entries, signal filter controls, and focus routing.
  - `pnpm exec vitest run src/components/inbox/AssistantInboxWorkItemSignalNavigation.test.tsx src/lib/inboxPaletteCommands.test.ts` - 8 tests pass.
  - signal navigation regression set - 33 tests pass.
  - `pnpm exec vitest run src/components/inbox src/lib` - 277 files / 1708 tests pass. 기존 `--localstorage-file` 경고만 출력.
  - `pnpm typecheck` - pass.
  - `pnpm build` - pass. 기존 Vite chunk/dynamic import warning만 출력.
  - `git diff --check` - pass.
  - CI pass, merged as `bcacaff`.

## 완료 문구 (과장 금지)
WorkItemCandidates can now surface read-only runner, patch, and learning/memory signal links. 확정 WorkItem lifecycle은 아직 없다. runner/patch/memory action도 없다.
