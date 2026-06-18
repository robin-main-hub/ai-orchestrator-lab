# Engine E8 (구현 핸드오프) - WorkItem Candidate / Evidence Draft Cross-Link

> **상태**: 구현 완료 - PR #642 (코드) + 본 docs/checklist PR - 선행 E7(#640/#641) - moving-os-engine-loop
> **목표**: `WorkItemCandidate`와 `Evidence Draft`를 확정 작업 lifecycle 없이 read-only string refs로 연결한다.

## 한 줄 요약
WorkItemCandidate and Evidence Draft can now cross-reference each other through read-only refs. 확정 WorkItem lifecycle은 아직 없다.

## 무엇이 보이게 됐나
- pure helper: `linkWorkItemCandidatesToEvidenceDraft(candidates, evidenceDraft)`.
- matching rule: candidate `evidenceRefs[]`와 draft footnote `refId`의 문자열 교집합만 사용한다.
- Candidate detail drawer: matching draft footnote / label / claim ids를 보여준다.
- Candidate detail honest empty: matching draft evidence가 없으면 `no matching draft evidence`.
- Evidence Draft card: related WorkItemCandidate count와 footnote별 candidate chip을 표시한다.
- PREVIEW: fixture refs가 겹칠 때만 cross-link가 보인다.
- LIVE: live candidate와 live evidence draft input이 둘 다 있을 때만 cross-link가 보인다.

## 안전 불변식
```text
read-only - ref-only - local-view / local-detail only
WorkItem create/launch/commit lifecycle 0
EventStorage append 0 - server write 0 - DB migration 0
runner dispatch 0 - patch apply 0 - external send 0 - hidden job 0
object resolution beyond existing refs 0
PREVIEW/LIVE projection unchanged - generic only
```

## 코드 표면
- `workItemEvidenceLinks.ts`
  - `linkWorkItemCandidatesToEvidenceDraft` helper.
  - candidate -> draft footnote refs, draft footnote -> candidate ids를 순수 projection으로 반환.
- `AssistantInbox.tsx`
  - Evidence Draft header/footnotes에 related candidate count/chips 표시.
  - WorkItem Candidate detail drawer에 matching draft evidence / honest empty 표시.
- `examplePatchCandidate.ts`
  - PREVIEW fixture에 `source-001` overlap 1개 추가. LIVE에는 영향 없음.
- tests
  - helper ref-only matching.
  - candidate detail matching/empty.
  - Evidence Draft related candidate chip/count.
  - LIVE absent draft/candidates fake-link 방지.
  - PREVIEW/LIVE separation 및 no side-effect controls.

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

## 검증
- `pnpm exec vitest run src/lib/workItemEvidenceLinks.test.ts src/components/inbox/AssistantInboxWorkItemEvidenceCrossLink.test.tsx` - 8 tests pass.
- E4/E5/E6/E7/Patch focused regression set - 61 tests pass.
- `pnpm exec vitest run src/components/inbox src/lib` - 254 files / 1629 tests pass. 기존 `--localstorage-file` 경고만 출력.
- `pnpm typecheck` - pass.
- `pnpm build` - pass.
- PR #642 CI - pass.

## 완료 문구 (과장 금지)
WorkItemCandidate and Evidence Draft can now cross-reference each other through read-only refs. 확정 WorkItem lifecycle은 아직 없다.
