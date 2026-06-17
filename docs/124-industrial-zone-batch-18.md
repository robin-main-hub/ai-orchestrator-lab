# Batch 18 (구현 핸드오프) — LIVE Patch Candidate Wiring

> **상태**: 구현 완료 · PR #612 #613 · 선행 Batch 17 docs/123 · SANDBOX는 Batch 19로 보류
> **목표**: Batch 17의 Patch Candidate Speed Lane에 **실제 H8 runner patch handoff**를 끌어올린다.
> `RunnerPatchHandoff` + `RunnerPatchSafetyReport` → `PatchCandidateInput` 순수 type-only 매퍼로
> 변환해 Assistant Inbox LIVE에 read-only로 표시. apply/commit/PR/dispatch/file-write 0.

## 한 줄 요약
이미 안전하게 만들어진 H8c/H8d 패치 핸드오프 파이프라인을 **generic read-only로 "보이게 연결"**.
실행 경로(runner)는 type-only import로만 닿아 인박스 표면은 무오염 유지. PREVIEW=fixture / LIVE=실입력.

## PR 트랙 (속도 우선 — LINE 묶어서 2 코드 PR + docs)
| PR | LINE | 내용 |
| --- | --- | --- |
| #612 | A/B | H8 핸드오프 매퍼(type-only) + App/Inbox LIVE 투영 seam |
| #613 | C/D | patch 헬스/요약 스트립 + 덱·팔레트·필터 폴리시 |
| #614 | E | 본 핸드오프(docs/124) + 체크리스트 §18 |

## 핵심 설계 결정 — 실행 비결합 (type-only)
`apps/desktop/src/lib/patchHandoffToCandidate.ts`는 `RunnerPatchHandoff`/`RunnerPatchSafetyReport`/
`RunnerPatchApprovalItem`을 **`import type`로만** 받는다 → 런타임에 runner 실행 경로(codingRunner,
apply, dispatch)를 전혀 끌어오지 않음. 인박스의 `patchCandidateSource.ts`는 여전히 runner import 0.
매퍼는 App-side 다리일 뿐. 테스트가 import 그래프를 스캔해 이를 강제.

## LINE 요약
- **A (매퍼)** — `patchCandidateFromHandoff(handoff, safety?)` + `patchCandidatesFromApprovalItems(items)`.
  순수(no Date.now/IO). 정직 매핑: safety report 없으면 **warning 강등(pass 아님)** · observed는
  not_observed면 false · claimed(runner 주장) vs actual(verifier) 분리 보존 · **raw diff 본문 0 노출**
  (hunkSummary 비움, secretFindingCount만). blocked/warning 그대로 전달.
- **B (LIVE seam)** — App `command_center` live에 `patchCandidates: patchCandidatesFromApprovalItems(...)`.
  runner-patch 승인 큐는 **per-mission(MissionWorkspaceDetail)** 에 있어 아직 app-level로 통합 안 됨 →
  지금은 honest-empty(소스 통합 시 한 줄 교체). fetch/server/EventStorage/dispatch 0.
- **C (헬스/요약 스트립)** — `summarizePatchCandidates`에 pass/observed/notObserved/verificationNotRun/
  claimedTestsPresent 추가. `PatchSummaryStrip`(표시 전용, ≥1일 때): total·pass·warn·blocked·obs·not-obs·
  no-actual·claimed. 비교 스트립은 >1에서만(Batch 17). 전체 overview, 컨트롤 0.
- **D (덱/팔레트/필터)** — Patch Candidates 점프(focusSection) · All/Blocked/Warning/Runner 필터
  전부 view-only(local-view) 검증. Runner = source==='runner' 만 표시.

## 안전 불변식 (0 유지)
```text
patch apply 0 · commit 0 · PR 생성 0 · file write 0 · runner dispatch 0
server/EventStorage write 0 · approval semantics 확장 0 · hidden job 0 · external send 0
매퍼 runner 실행 import 0 (type-only) · raw diff/시크릿 본문 노출 0
PREVIEW=fixture / LIVE=실입력만 (누수 0) · LIVE-empty honest empty
"stage" 단어 안 씀 (diff preview only / read-only) · generic only · SANDBOX 실행 0
```

## 검증
- 신규 테스트: `patchHandoffToCandidate.test.ts`(8 — pass/warning/blocked/secret/missing-safety/
  secret-safe/approval-items/**import-graph 가드**), `AssistantInboxPatchLiveWiring.test.tsx`(4),
  `AssistantInboxPatchSummary.test.tsx`(5). 인박스+plugins+lib 로컬 241 green · typecheck clean ·
  build green · CI 2/2 코드 PR green.
- **정직 한계**: 매핑·표면은 jsdom + DOM 단언으로 잠금. LIVE는 per-mission 큐 미통합으로 현재 honest-empty —
  실제 후보 표시는 큐 통합(후속) 후 한 줄. 실제 브라우저 육안은 오너 프리뷰 체크리스트(§18).

## 미접촉 / 다음 후보 (OS 로드맵 — generic only)
- **per-mission 패치 큐 → app-level 통합**: MissionWorkspaceDetail의 승인 큐를 끌어올려 LIVE에 실제 표시
  (이번엔 seam + 매퍼까지, honest-empty).
- **Batch 19 — Sandbox Proposal Shell**: 실행 없는 실험장(scenario proposal · dry-run visual · no write/dispatch/run).
- 이후: Batch 20 patch compare / runner debate, Batch 21 apply preview contract (실제 apply는 더 뒤).
