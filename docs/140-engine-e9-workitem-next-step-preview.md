# Engine E9 (구현 핸드오프) - WorkItem Candidate Next-Step Preview

> **상태**: 구현 완료 - PR #644 (코드, merge commit `0fa9982`) + 본 docs/checklist PR - 선행 E8(#642/#643) - moving-os-engine-loop
> **목표**: `WorkItemCandidate`를 확정 작업 lifecycle 없이 다음 단계에 필요한 refs/context로 preview-only 점검한다.

## 한 줄 요약
WorkItemCandidate can now show a read-only next-step preview. 확정 WorkItem lifecycle은 아직 없다.

## 무엇이 보이게 됐나
- pure helper: `buildWorkItemCandidateNextStepPreview(candidate, crossLink?)`.
- Candidate detail drawer: `Next-step preview` 섹션을 read-only local-detail로 표시한다.
- Preview content:
  - candidate id/title.
  - current lane/status/risk.
  - reason.
  - available sourceRefs.
  - available evidenceRefs.
  - missing source/evidence refs.
  - related draft claims/footnotes when E8 cross-links exist.
  - risk notes.
  - suggested operator note.
- Clear label: `preview only · not committed · no lifecycle transition`.
- PREVIEW: fixture refs가 겹칠 때 예시 preview가 보인다.
- LIVE: live candidate / live draft cross-link 입력이 있을 때만 실제 refs로 preview를 만든다.

## 안전 불변식
```text
read-only - preview-only - local-detail only
WorkItem create/launch/commit lifecycle 0
EventStorage append 0 - server write 0 - DB migration 0
runner dispatch 0 - patch apply 0 - external send 0 - hidden job 0
PREVIEW/LIVE projection unchanged - generic only
```

## 코드 표면
- `workItemCandidateNextStepPreview.ts`
  - candidate refs와 E8 cross-link refs를 순수 projection으로 요약.
  - 없는 refs는 honest unknown/missing state로 표시.
  - lifecycle action 문구 없이 preview-only label과 operator note를 생성.
- `AssistantInbox.tsx`
  - WorkItem Candidate detail drawer 아래에 `Next-step preview` 섹션 추가.
  - E6 detail drawer / E8 draft cross-links는 그대로 유지.
- tests
  - helper projection.
  - missing refs honest state.
  - linked draft claims/footnotes.
  - preview-only/not-committed/no-lifecycle labels.
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

## 검증
- `pnpm exec vitest run src/lib/workItemCandidateNextStepPreview.test.ts src/components/inbox/AssistantInboxWorkItemNextStepPreview.test.tsx` - 8 tests pass.
- E6/E7/E8/E9 focused regression set - 34 tests pass.
- `pnpm exec vitest run src/components/inbox src/lib` - 256 files / 1637 tests pass. 기존 `--localstorage-file` 경고만 출력.
- `pnpm typecheck` - pass.
- `pnpm build` - pass.
- PR #644 - merged, merge commit `0fa9982`, CI pass.

## 완료 문구 (과장 금지)
WorkItemCandidate can now show a read-only next-step preview. 확정 WorkItem lifecycle은 아직 없다.
