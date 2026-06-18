# Engine E6 (구현 핸드오프) — WorkItem Candidate Detail / Link Graph

> **상태**: 구현 완료 · 선행 E5(#637/#638) · moving-os-engine-loop
> **목표**: `WorkItemCandidate`를 확정 작업으로 바꾸지 않고, 후보가 왜 생겼는지 로컬에서 inspect 가능하게 만든다.

## 한 줄 요약
WorkItemCandidate row를 클릭하거나 키보드로 활성화하면 read-only local detail drawer가 열린다. drawer는 후보의
기본 필드와 source/evidence string refs, reason/signal을 보여주는 작은 ref-only link graph를 표시한다.

## 무엇이 보이게 됐나
- row selection: `data-action-scope="local-detail"`인 후보 row가 click / Enter / Space로 열린다.
- detail fields: id, title, kind, lane, status, risk, reason, observed, createdAt, sourceRefs, evidenceRefs.
- link graph: candidate -> sourceRefs, candidate -> evidenceRefs, candidate -> signal(reason/kind).
- honest empty: missing refs / missing createdAt은 `none / unknown`으로 표시한다.
- refs are refs: source/evidence refs는 string ref로만 표시하며 resolved object라고 주장하지 않는다.

## 안전 불변식
```text
candidate-only · local-detail only · display-only
WorkItem create/launch/commit lifecycle 0
EventStorage append 0 · server write 0 · runner dispatch 0 · patch apply 0 · external send 0
refs are unresolved string refs only · PREVIEW/LIVE projection unchanged · generic only
```

## 코드 표면
- `AssistantInbox.tsx`
  - `WorkItemCandidatesCard` row activation 추가.
  - `WorkItemCandidateDetailDrawer` 추가.
  - local state `selectedWorkItemCandidate` 추가.
- `AssistantInboxWorkItemCandidateDetail.test.tsx`
  - drawer open/close, keyboard activation, ref-only graph, honest empty, no side-effect controls 검증.

## 검증
- `AssistantInboxWorkItemCandidateDetail.test.tsx` — 4 tests.
- `AssistantInboxWorkItemCandidates.test.tsx` + `workItemCandidate.test.ts` — 기존 E5 surface 유지 확인.

## 완료 문구 (과장 금지)
WorkItemCandidate is now inspectable with a read-only local detail drawer and ref-only link graph. 확정 WorkItem lifecycle은 아직 없다.
