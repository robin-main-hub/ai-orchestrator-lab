# 2026-06-15 AI Orchestrator Lab — App Builder H7~H10 스택 정리 (PR #514 / #515 / #517)

## 한 줄 요약

App Builder closed loop(H7~H9)를 main에 박고, 그 위에 Project Persistence / Resume 레이어(H10 foundation + wiring)를 두 단계로 얹어 main까지 머지했다. 운영 룰("baseline-red PR은 admin-merge로 stack 풀기")이 같은 날 세 PR에 동일하게 적용됐다.

## 최종 main 상태

```
fd639a2  feat(desktop): H10 ProjectRecord wiring (#517)
2ab96ec  feat(desktop): H10 ProjectRecord foundation (#515)
ba788b6  feat(desktop): app builder closed loop H7-H9 (#514)
be029dc  docs: 다른 컴퓨터 작업용 핸드오프 가이드
```

## PR 트랙 (모두 main merged)

### PR #514 — App Builder H7-H9 closed loop
- branch: `codex/h9-edit-history` → main
- merge commit: `ba788b6` (2026-06-15T10:35:32Z, admin squash)
- 내용
  - H7 Phase 2: Preview Iframe viewport-only annotation. cross-origin 안전, DOM selector unknown 명시
  - H8: in-app Turbo Edits provider bridge — valid SEARCH/REPLACE 출력만 SearchReplace textarea로 자동 주입, 외부 LLM 복붙 경로 fallback 유지
  - H9: Mission Workspace edit timeline. slim metadata만, raw payload 0, restore CTA 지원
- rebase: 6 commits onto origin/main, 충돌 해결은 H7 정책 준수
  - viewport-only 기본 / same-origin DOM capture 없음 / cross-origin = url + viewport coords + selector unknown / fake selector·text 금지
  - 양쪽 API 공존: main `onAnnotate` + 신규 `onViewportClick`(richer superset)
- dedup 픽스: `activePreviewRef` 중복 선언 제거, `PreviewRunCard` 로컬 `ActivePreviewRef` 타입 제거(공유 import 사용)
- targeted tests: 12 files / 52 tests pass
- desktop typecheck: 432 errors (origin/main baseline 439, -7) — H7 신규 error 0
- 코멘트: [#514#issuecomment-4707019370](https://github.com/robin-main-hub/ai-orchestrator-lab/pull/514#issuecomment-4707019370)

### PR #515 — ProjectRecord foundation (H10 slices 1~6)
- branch: `claude/h10-project-record-data-model` → main
- merge commit: `2ab96ec` (2026-06-15T10:58:31Z, admin squash)
- 내용 (8 신규 파일, 기존 파일 수정 0)
  - `lib/projectRecord.ts` — `ProjectRecord` 데이터 모델 + storage helper (`localStorage:ai-orchestrator-lab:project-records:v1`)
    - 정직성: `updateProjectPreview`가 `truth !== "observed"`일 때 URL 자동 clear
    - `parseProjectRecordIndex`는 corrupt entry만 drop, 전체 index 실패 안 함
    - `createProjectRecord` defaults: scaffold `unknown`, visualQa/publish/lastPreviewUrl undefined
  - `hooks/useProjectRecordController.ts` — index 보관 + storage hydrate/persist + ensure/remove/find + record* mutators
  - `components/RecentProjectsPanel.tsx` — read-only UI. 자동 callback 0, "이어서" 클릭만 `onSelectProject` emit, observed truth일 때만 preview URL 노출
  - `hooks/useProjectRecordSync.ts` — adapter hook + `deriveEditTimelineSummary`. 같은 값 dedup, undefined publish는 기존 record 보존
  - `projectRecordLoop.integration.test.tsx` — 4-layer smoke
- rebase: PR #515의 stack 정리 — `git rebase --onto origin/main 7d23e8e` 로 #514 잔여 6개 commit drop, H10 8개 commit만 깨끗하게 main 위로
- self-defect 수정 (PR 내부에서)
  - `270bbf2` — `useProjectRecordController.test.ts`에 `// @vitest-environment jsdom` 추가, `makeClock` 호출 hoist (re-render마다 counter 리셋되던 버그)
  - `9cefbc1` — `useProjectRecordSync.test.ts`의 `as const` → union cast (CI tsc strict 통과)
- targeted tests: 5 files / 69 tests pass
- desktop typecheck: 426 errors (origin/main baseline 439, -13)
- 코멘트: [#515#issuecomment-4707191087](https://github.com/robin-main-hub/ai-orchestrator-lab/pull/515#issuecomment-4707191087)

### PR #517 — H10 wiring
- branch: `claude/h10-wiring` → main
- merge commit: `fd639a2` (2026-06-15T11:29:12Z, admin squash)
- 내용 (3 신규 파일 + 3 수정 파일)
  - `App.tsx` — `useProjectRecordController()` 단일 호출 + `pendingResumeMissionId` state. `RunWorkspace.boardProps`로 controller + activePreviewRef + resume target 일괄 전달
  - `MissionBoardContainer.tsx` — controller 제공 시 `RecentProjectsPanel`을 mission list 위에 mount. `pendingResumeMissionId` effect와 `handleResumeProject` 둘 다 `setExpandedMissionId`만 호출 — 자동 rerun 0
  - `MissionBoardPanel.tsx` — 각 mission마다 `<MissionRecordSync>` 렌더, MWD가 펼쳐졌을 때 추가로 `useProjectRecordSync` 호출해 editTimelineItems 흘림. controller 미제공 시 noop singleton
  - `MissionRecordSync.tsx` (신규) — `MissionBoardItem` + activePreviewRef + publishHistory + scaffoldFileCount를 sync hook 입력 모양으로 순수 변환. 렌더 0
- 정직성 가드
  - `observedPreview`는 activePreviewRef.missionId가 매칭일 때만
  - `visualQa`는 `item.latestVisualQa`가 실제 있을 때만, `warning → failed`(issue 있음 = 주의 필요), summary로 issue count 전달
  - `scaffold`는 `getScaffoldFiles?.length` 정의됐을 때만 (0→missing, >0→available), "stale" 자동 추정 금지
  - `publish`는 `branch.observed` 또는 `pr.observed` 실제 발생 후에만 `hasDraft=true`
  - `prNumber`는 `https://github.com/{owner}/{repo}/pull/{n}` 패턴만 신뢰
  - Resume 클릭은 `setExpandedMissionId`만 — preview/QA/provider/overlay/publish 자동 호출 0
- self-defect 수정 (PR 내부에서)
  - `15075dc` — `MissionRecordSync.test.tsx` fixture `truthStatus: "unobserved"` typo를 `"planned"`로 정정 (실제 union은 `"observed" | "configured" | "planned" | "simulated"`)
- targeted tests: 17 tests / 2 files pass (`MissionRecordSync` 13 + `MissionBoardContainer.recentProjectsResume` 4)
- desktop full vitest: **292 files / 1745 tests pass**
- desktop typecheck: 426 errors — #515 head와 동일, H10 wiring 신규 error 0
- 코멘트: [#517#issuecomment-4707455577](https://github.com/robin-main-hub/ai-orchestrator-lab/pull/517#issuecomment-4707455577)

## 운영 룰 — baseline-red PR은 admin-merge

세 PR 모두 CI `build + test`에서 동일하게 실패:

| run | head | apps/server test |
|---|---|---|
| origin/main CI | `be029dc` | 38 failed / 521 passed (559) |
| #514 CI | `23873ef` | 38 failed / 521 passed (559) |
| #515 CI | `9cefbc1` | 38 failed / 521 passed (559) |
| #517 CI | `15075dc` | 38 failed / 521 passed (559) |

실패 시그니처가 origin/main과 완전히 동일 = **0 regression**. 실패 파일은 모두 `apps/server/src/routes/github*` execute 라우트(W1c/W2/W3b/W4b) — desktop H7-H10 작업 영역과 무관.

판단 룰 (2026-06-15 메모리 확정):

1. PR이 required check 실패로 막힐 때 → 자동으로 "baseline 먼저" 결론 내지 않는다
2. main의 같은 check 최신 실행과 비교 → 같은 실패면 **regression 0**으로 분리 처리
3. stack을 막는 PR이면 **admin-merge 후보**
4. baseline fix는 별도 PR/issue — 본체 작업과 절대 섞지 않는다
5. **중요한 구분**: main에 동일 파일/케이스가 같은 증상으로 깨져 있으면 baseline → 별도 issue. main에 없는 신규 파일/케이스가 PR에서 깨져 있으면 → **PR 자체 결함**, 그 PR 안에서 즉시 수정 (admin-merge로 흘려보내지 말 것). 2026-06-15 #515 jsdom directive + #515 scaffold cast + #517 TruthStatus typo가 이 카테고리

## 별도 트랙 — issue #516

[apps/server github write routes baseline: 38 failed tests on main](https://github.com/robin-main-hub/ai-orchestrator-lab/issues/516)

증상 — execute 라우트들이 모두 `"plan을 찾을 수 없거나 만료됨"` 또는 `"blocked"` 응답. 정상 경로 / 적대적 체크리스트 / token leak guard / idempotency / TOCTOU / preflight 8개 분기 전체가 한꺼번에 같은 증상. plan store lookup 실패 또는 plan 검증 게이트의 over-rejection 회귀로 추정. `git bisect` 필요.

영향 파일:
- `githubBranchCreate.test.ts`, `githubBranchCreate.smoke.test.ts` (W2)
- `githubCommentWrite.test.ts`, `githubCommentWrite.smoke.test.ts` (W1c)
- `githubFileChangeExecute.test.ts`, `githubFileChangeExecute.smoke.test.ts` (W3b)
- `githubPullRequestCreateExecute.test.ts`, `githubPullRequestCreateExecute.smoke.test.ts` (W4b)

H7-H10 본체 작업과 분리. baseline fix 별도 PR로 트랙.

## 사용자에게 노출된 새 UX

H10 wiring이 들어가면서 App Builder가 처음으로 다음을 보여준다:

- 최근 프로젝트 카드 목록 (missionId별, updatedAt desc 정렬)
- 마지막 observed preview URL (truth === "observed"일 때만)
- 마지막 Visual QA 상태 (status badge + issue 개수)
- scaffold 가용 / publish draft / PR 번호
- edit timeline summary (counts + last source/status, restorable patch indicator)
- "이어서" 클릭 → 해당 mission detail 펼침 (자동 rerun 0)

세션이 휘발되어도 missionId 단위로 마지막 상태가 localStorage에 남아 있고, 사용자가 명시적으로 클릭한 mission만 다시 펼친다. 자동 실행 없음.

## H7-H9 제약 유지 확인

H10 두 PR 어디서도 다음 제약을 깨지 않았다:

- ❌ fake preview URL — `updateProjectPreview`가 truth 검사로 자동 clear
- ❌ fake DOM selector / fake text on cross-origin iframe
- ❌ auto-rerun on resume — Resume 클릭은 `setExpandedMissionId`만
- ❌ auto provider call / auto patch apply
- ❌ raw prompt / provider response / file content 저장
- ❌ 새 server route / 새 GitHub write 흐름

## 다음 권장 슬라이스

1. **H10 wiring 보강** — Resume 클릭 시 scroll-into-view / anchor 처리. 현재는 `expandedMissionId`만 갱신
2. **server baseline fix (#516)** — git bisect로 plan store regression 원인 찾고 별도 PR
3. **H11 same-origin DOM selector capture** — H10 persistence/resume 안정화 이후. cross-origin은 viewport-only 그대로
4. **Mission Workspace 외 mount surface** — 현재 RecentProjectsPanel은 board mode 안에만. ChatSidePanel 같은 글로벌 entry 검토

## 큰 그림 (불변)

```
Conversation
  → Mission
  → Scaffold
  → Observed Preview
  → Preview Annotation (viewport-only, cross-origin safe)
  → Provider SEARCH/REPLACE Draft (in-app or external paste)
  → User Apply (no auto-apply)
  → Scaffold Overlay
  → Preview / QA Rerun (user-initiated)
  → Edit Timeline (slim metadata only)
  → ProjectRecord persist (per missionId)
  → Resume (no auto-rerun)
  → Explicit GitHub Publish
```

세션 휘발 → ProjectRecord index hydrate → RecentProjectsPanel → 사용자 선택 → Mission Workspace 재오픈 → 사용자가 다음 액션 직접 결정.
