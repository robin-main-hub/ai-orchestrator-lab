# 106 — Industrial Zone Batch 1 (D/E/F/G + integration fix)

## 한 줄

오케스트레이션 OS의 첫 "지상 공장" 배치. 4개 라인을 **git worktree로 격리해 진짜 병렬**로 가동(에이전트 4기 동시), 각각 별도 PR + CI green + 순차 merge. 끝에 병렬로 들어온 #538과의 통합 충돌을 한 번 더 fix로 닫았다.

## 실행 방식

- dgx-01에 worktree 4개(`aol-wt-d/e/f/g`)를 main 최신에서 분리.
- 라인별 백그라운드 에이전트가 자기 worktree에서 구현 → package test → typecheck → build → push → PR (merge는 오케스트레이터가 CI green 확인 후 순차).
- 안전벨트(package tests / root typecheck / root build / secret scan) 매 PR 유지.
- 확인 대기 없이 연속 진행(공장 모드).

## PR 트랙 (모두 main merged)

| PR | merge | 라인 | 내용 |
|---|---|---|---|
| #540 | `f2c7100` | D | ERP evidence bridge → batchRemember (`evidence_bridge` origin, never trusted) |
| #541 | `cdc13b1` | G | runner gate status model + control panel card (dgx 기본 OFF) |
| #542 | `9761ab5` | F | Assistant Inbox command-center 카드 5종 + 컨테이너 |
| #543 | `bf01b42` | E | learning failure projector + manifest preview helpers (pure, no auto-run) |
| #544 | `6669078` | fix | #538 병렬 충돌 통합 fix (main red 복구) |

## LINE D — ERP Evidence Bridge (`packages/simplememo/src/evidenceBridge.ts`)

- `ApprovedEvidence` → `buildBatchRememberCandidatesFromEvidence` (approved/published만, draft/candidate 무시) → `executeEvidenceBatchRemember`.
- origin=`evidence_bridge`, trustLevel=`limited`(절대 trusted 아님), source refs 없으면 rejected, writer 미주입 observed:false.
- 13 tests.

## LINE F — Assistant Inbox (`apps/desktop/src/components/inbox/`)

- `AssistantInbox`(shell) + `EvidenceCard` / `LearningLoopCard` / `MemoryCandidateCard` / `RuntimeManifestPreviewCard`.
- 카드 중심, 배지 중심, 다크 dense command-center. evidence footnotes 표시, pass/warning/blocked 배지(data-verdict).
- read-only: mount 시 자동 콜백 0, blocked 항목에 approve/enable 버튼 0, observed:false 정직 표시.
- 15 tests. App.tsx nav mount은 후속(자급자족 모듈).

## LINE E — Server learning wiring (`apps/server/src/learning/learningFailureProjector.ts`)

- `learningFailureEventFromArtifacts`(C1 위임, evidence-gated), `learningFailureEnvelope*`(append-ready, append는 안 함), `projectLearningLoopsFromEvents`(C2 read-only wrap), `previewLearningRuntimeManifest`(C3 preview only).
- 12 tests, 서버 suite 571 green.
- **deferred(정직)**: 서버 route 자동 호출 — append seam은 있으나 idempotency/dedup + enablement 게이트가 owner 결정 필요. pure helper로 zero-regression 유지.

## LINE G — Runner controls (`apps/desktop/src/lib/runnerGateStatus.ts` + `RunnerControlPanelCard.tsx`)

- `deriveRunnerGateStatus` + `RUNNER_SAFE_PRESETS`(mock / local_read_only / opencode_read_only / dgx_disabled).
- dgx 실행 기본 OFF, opencode/local read-only, `--dangerously-skip-permissions` 표현 자체 없음, 게이트 off/executor 없으면 observed:false + 사유.
- 25 tests. 실제 게이트 ON/실행은 운영 승인 영역(비범위).

## 통합 충돌 — #538 (중요)

배치 도중 **#538 `feat/memory-evidence-learning-loop-integration`이 병렬 머지**됨. 이건 L8/C(#530~#543)와 **같은 개념을 다른 API 이름·shape으로 구현한 중복**이고, 그 consumer 파일(테스트 0, 호출처 0)이 현 main에 없는 컨트랙트를 참조해 main을 red로 만들었다:

- `evidenceIngest.ts` → `MemoryAdapter.batchRemember`(미존재)
- `learningLoopIngest.ts` → `DistilledLearningCandidate.rule/reusablePrompt/target`(미존재)
- `autonomyRunMemory.ts` → `isRuntimeLoadableSkill`(머지된 이름은 `isSkillRuntimeLoadable`, 게다가 activation record 필요)

**#544 fix**: `MemoryAdapter.batchRemember?`를 optional로 추가(기존 adapter 무손상), 나머지를 실제 머지 컨트랙트에 맞춰 적응. `loadRuntimeSkills`는 L8 PR3 분리 설계대로 `(candidates, activations)` + `buildSkillRuntimeManifest`로 판정(후보 trustStatus 단독 판정 금지 유지 — 안전 강화). 모두 dead code라 behavior 변화 0.

> ⚠️ **owner 결정 필요**: #538과 L8/C는 같은 기능의 두 병렬 구현이다. #544는 타입 화해로 main만 풀었다. 어느 설계를 canonical로 할지 정해 통합해야 한다(현재 evidence/learning helper가 양쪽 다 공존).

## 검증

- 통합 후 main: `corepack pnpm typecheck` 0 errors / `corepack pnpm build` green.
- 라인 합계 신규 테스트: D 13 + F 15 + E 12 + G 25 = 65, 전부 pass.
- 안전 불변선 전부 유지: 가짜 observed 0 / 자동 trusted·active 승격 0 / 자동 runtime load 0 / 외부 발송 0 / DB migration 0 / secret 노출 0 / 숨은 백그라운드 0.

## 다음 (후속 실행)

- **#538 vs L8/C canonical 통합 결정** (owner)
- E 서버 route 자동 호출(게이트+idempotency 설계 후)
- F Assistant Inbox를 App.tsx nav에 mount (실제 화면 노출)
- G 카드 + D evidence bridge를 Inbox에 연결
- 실제 SimpleMem/DGX writer 구현, 실제 runtime skill load
