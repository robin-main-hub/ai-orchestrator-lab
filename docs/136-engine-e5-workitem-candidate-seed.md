# Engine E5 (구현 핸드오프) — WorkItem Candidate Seed

> **상태**: 구현 완료 · PR #637 (코드) + 본 docs PR · 선행 E4A(#636) · moving-os-engine-loop
> **목표**: OS의 read-only 표면들을 묶는 첫 generic **중심축**. `WorkItemCandidate`는 "이 신호가 작업 후보로
> 보인다"는 read-only 객체 — **확정 작업이 아니다**. 생성/append/write/dispatch/commit 0.

## 한 줄 요약
patch/runner/evidence/memory/source 신호에서 candidate-only WorkItem 후보를 **순수 derive**하고, 긴급도 lane
(now/soon/watch)으로 묶어 한 카드에 표시. PREVIEW=example 신호 반영, LIVE=실제 신호 + 명시 입력만(honest empty).
아무것도 만들지 않는다(candidate ≠ committed work).

## PR 트랙
| PR | 내용 |
| --- | --- |
| #637 | `lib/workItemCandidate.ts`(모델 + projectWorkItemCandidates + derive 헬퍼 5종 + deriveWorkItemCandidates + summarize + example) + `WorkItemCandidatesCard` + 컨테이너 workItemExtras + AssistantInboxLiveInput.workItemCandidates + 테스트 2종 |
| (this) | docs/136 + 체크리스트 §E5 |

## 무엇이 보이게 됐나
- 그동안 Runner/Patch/Evidence/Memory/Source가 따로 보였는데, 이제 **"이 중 실제 작업 후보는?"**를 한 축에서 봄.
- derive 규칙(순수): patch blocked/warning · runner attention/stalled · evidence missing-info · memory eval fail/
  hygiene(forbidden/contradicted) · source error/stale → 각각 lane/risk/status로 후보화.
- 카드: lane(now/soon/watch) 그룹 + kind 배지 + risk 칩 + reason(title hover). 표시 전용(버튼 0). honest empty.
- candidateId 스킴(`wic-<kind>-<id>`)은 향후 병합 충돌 안전하게 설계.

## 안전 불변식 (0 유지)
```text
candidate-only(확정 작업 아님, status에 committed 없음, lifecycle 0)
read-only projection · 자동 WorkItem 생성 0 · EventStorage append 0 · server write 0 · DB migration 0
external send/runner dispatch/patch apply/commit/PR/hidden job 0 · side-effect control 0(버튼 0)
honest empty · PREVIEW/LIVE 분리(누수 0) · generic only(도메인/회사/ERP 필드 0) · Date.now 0
```

## 검증
`workItemCandidate.test.ts`(8) · `AssistantInboxWorkItemCandidates.test.tsx`(5) · 인박스+lib 로컬 **1611 green** ·
typecheck clean · build green · CI green.

## 완료 문구 (과장 금지)
WorkItemCandidate can now be displayed and linked as a candidate-only OS object. 확정 WorkItem lifecycle(생성/commit/launch)은 아직 없다.

## 미접촉 / 다음 후보 (engine 큐 — generic only)
- E6 BATCH F — Control Queue / Launch Key Surface: commit point + candidate→next-step state 표시, launch-key 언어.
  외부 비가역 action 0, auto send/run/apply 0.
- E7 Source Pack Intake V2 · E8 Patch Candidate Next-Step Preview · E9 Sandbox Proposal V2.
- 보류: E1 정직한 patch feed(docs/133 — MissionBoard surgery 필요).
- 한계: 후보는 신호의 read-only 투영일 뿐, 확정 WorkItem lifecycle 없음.
