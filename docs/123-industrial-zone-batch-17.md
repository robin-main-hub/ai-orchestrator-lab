# Batch 17 (구현 핸드오프) — Patch Candidate Speed Lane

> **상태**: 구현 완료 · PR #609 #610 · 선행 Batch 16 docs/122 · SANDBOX는 Batch 18/19로 보류
> **목표**: Source Dock 갑판과 Operator Console 조종간이 생겼으니, 이제 **코딩 장난감답게** — AI가 만든 패치 후보를 빠르게 보고, 비교하고, 디테일을 까보는 **read-only 속도 레인**을 Assistant Inbox 안에 만든다. 실제 apply/commit/PR은 **하지 않는다**.

## 한 줄 요약
이미 있는 runner patch/diff handoff 파이프라인(H8c `RunnerPatchHandoff` + H8d `RunnerPatchSafetyReport`)을 **generic read-only 투영**으로 인박스에 노출. Patch Candidate Lane(행: id/runner/mission/파일수/+−/safety/verification/source/observed) + row→detail drawer(Identity/Stats/Safety/Verification/Evidence + diff preview) + ⌘K/덱 점프 + 로컬 필터 + 비교 스트립. 전부 view-only · 버튼은 `data-action-scope` 보유 · apply/commit/dispatch/file-write 0.

## PR 트랙 (속도 우선 — LINE 묶어서 2 코드 PR)
| PR | LINE | 내용 |
| --- | --- | --- |
| #609 | A/B/C | read surface — projection + 레인 카드 + detail drawer + diff preview |
| #610 | D/E | 덱/팔레트 점프 + 로컬 필터 + 비교 스트립 |
| #611 | F | 본 핸드오프(docs/123) + 체크리스트 §17 + Notion 1건 |

## 핵심 설계 결정 — runner-execution 비결합
`apps/desktop/src/lib/plugins/patchCandidateSource.ts`는 **fresh generic primitive 타입**을 정의하고, `runnerPatchHandoff.ts` / `codingRunner.ts` / `runnerPatchSafety.ts`를 **import 하지 않는다**. 그 모듈들은 runner-실행 타입을 끌고 오기 때문에, 인박스 표시 표면이 apply/dispatch/file-write 경로와 결합되면 안 됨. App이 실제 handoff 데이터를 `PatchCandidateInput`으로 매핑하는 건 인박스 **밖**에서 하고, 인박스는 투영+표시만 한다. 투영은 pure (no Date.now/IO/fetch/fs/EventStorage), generic (도메인 용어 0).

## LINE 요약
- **A** — `PatchCandidatesCard` 레인: 후보당 candidateId/runnerId/missionId/changedFileCount/+adds −dels/safety 배지(pass·warning·blocked 톤)/verification(claimed·actual·not_run)/source(runner·handoff)/observed. 행은 **detail drawer 열기 전용**(rowActivation, local-detail) — apply/commit/dispatch 버튼 0. blocked 후보는 `data-blocked` + 톤, 그래도 **inspectable**. 비면 null(LIVE honest empty). `projectPatchCandidates`는 invalid drop·observed 정직·숫자 음수→0.
- **B** — `SourceDetailItem`에 `patch` arm 추가, `SourceDetailDrawer.sectionsFor`가 Identity/Stats/Safety/Verification/Evidence 섹션 생성. 기존 drawer chrome(Esc·focus return·local-detail close) 재사용 — 두 번째 drawer 안 만듦.
- **C** — patch drawer 안 diff preview 블록: path/change type/risk 배지/+adds −dels/사전 요약된 hunkSummary + 정적 "diff preview only" 라벨. copy/apply/stage 버튼 0. raw diff 텍스트 안 보여줌(시크릿 누수 방지) — 입력이 주는 짧은 요약만.
- **D** — Command Deck "Patch Candidates" 버튼 + 팔레트 "Patch Candidates 열기"(hint "패치 후보 보기 · 적용 없음") → 기존 `focusSection` 커맨드 value `'patch-candidates'`(새 kind 0). scroll+focus만, 비면 no-op. 로컬 필터 All/Blocked/Warning/Runner(local-view) — 리스트만 좁힘(Runner = source==='runner').
- **E** — `PatchComparisonStrip`(후보 >1일 때): candidate count / safest(blocked 아닌 것 중 안전순위) / blocked / warning / files-touched overlap. 순수 `summarizePatchCandidates` 계산, 버튼 0, 모델/runner 콜 0.

## 안전 불변식 (0 유지)
```text
patch apply 0 · commit 0 · PR 생성 0 · file write 0 · runner dispatch 0
server/EventStorage write 0 · external send 0 · hidden job 0 · approval semantics 확장 0
patchCandidateSource = pure (no Date.now/IO) · runner/codingRunner/safety import 0
모든 interactive control은 allowed data-action-scope (행=local-detail · 필터/덱=local-view)
blocked 후보 = inspectable but apply 컨트롤 0 · "stage-preview"는 라벨만 (핸들러 0)
PREVIEW=example / LIVE=실입력만 (누수 0) · LIVE-empty honest empty
generic only (도메인/회사/ERP 0) · OS는 OS · SANDBOX 실행 0
```

## 절대 호출하지 않는 진입점 (스카우트가 식별)
`buildRunnerPatchHandoff`(읽기 전용 빌더라도 인박스에서 호출 안 함) · `grantDgxApproval`/`rejectDgxApproval`/`replayDgxApproval` · `requestTmuxDispatch`/`requestTmuxPreflight`/`requestTmuxCapture` · `handleResolveServerApproval`/`handleResolveUnifiedControlQueueItem` · `ControlQueueDrawer.onBulkApproveSafe` · 모든 `runtime/stage*` 서버 콜. 레인은 read-only 데이터만 받고 핸들러 0.

## 검증
- 신규 테스트: `patchCandidateSource.test.ts`(7), `AssistantInboxPatchLane.test.tsx`(5), `AssistantInboxPatchDetailDrawer.test.tsx`(6), `AssistantInboxPatchHooks.test.tsx`(10). 인박스+plugins 스위트 로컬 228 green · root typecheck clean · build green · CI 2/2 코드 PR green.
- **정직 한계**: 표면은 jsdom + Testing-Library DOM 단언으로 잠갔다. 실제 브라우저에서 레인 비교/디테일/diff preview 육안은 오너 프리뷰 체크리스트(§17). raw diff 렌더는 없음 — hunkSummary는 입력이 주는 redacted 한 줄.

## 미접촉 / 다음 후보 (OS 로드맵 — generic only)
- **Batch 18 — Sandbox Proposal Shell**: 실행 없는 실험장(scenario proposal · dry-run visual · no write/dispatch/run). action-risk 때문에 patch lane 뒤로 미뤘던 것.
- 실제 LIVE patch 후보 배선: App이 `RunnerPatchHandoff` → `PatchCandidateInput` 매핑을 인박스 밖에서 연결(이번 배치는 generic contract + PREVIEW fixture까지).
- 로컬 전용 copy(diff 블록) 어포던스는 보류 — 추가 시 `data-action-scope`='local-detail' + 클립보드만 건드린다는 전용 테스트 필요.
