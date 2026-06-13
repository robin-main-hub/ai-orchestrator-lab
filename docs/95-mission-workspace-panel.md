# 95 — Mission Workspace 데스크톱 패널 (2순위)

D1 감사 결론: **서버 엔진은 다 live, 데스크톱이 소비를 안 함**이 핵심 갭이었다. D2~D8에서
AppWorkspace/Preview/VisualQA/DesignIssue/ErrorCard/SelfCorrection이 서버 mission index에
쌓이는데 보드는 workers/검증/머지만 보여줬다. 그 차원들을 **읽기 전용 드릴다운**으로 펼친다.

UI 대수술 없음 — 기존 `MissionBoardContainer`(App→RunWorkspace→Container) 카드에 "Workspace
상세" 토글 하나를 더했다. 새 nav·새 fetch·새 store 없음(보드 snapshot에서 파생).

## 한 일

- **desktop** `missionBoardModel.ts`: `MissionBoardItem`에 차원 요약 추가 —
  `workspace`(name/appType/previewStatus/previewUrl?/previewTruth) + `workspaceCount`,
  `latestVisualQa`(status/truth/issueCount), `designIssues[]`, `errorCards[]`,
  `selfCorrections[]`. `mapServerMissionToBoardItem`이 record에서 평탄화(at(-1) 최신 +
  배열 매핑). 라벨맵 `PREVIEW_STATUS_LABEL`/`VISUAL_QA_STATUS_LABEL`/`DESIGN_ISSUE_KIND_LABEL`.
- **desktop** `MissionBoardPanel.tsx`: `expandedMissionId`/`onToggleDetail` props +
  `hasWorkspaceDetail` 게이트(차원 0이면 토글 숨김 — 죽은 토글 방지) + `MissionWorkspaceDetail`
  (Workspace+preview / Visual QA / DesignIssueCard 목록 / ErrorCard→SelfCorrection 체인).
- **desktop** `MissionBoardContainer.tsx`: `expandedMissionId` 로컬 UI 상태(한 번에 하나) +
  토글 핸들러를 패널에 배선.
- **styles.css**: `.mission-workspace-detail` 등 읽기 전용 드릴다운 스타일.

## 정직성 (테스트로 못박음)

- preview url은 **observed running일 때만** 채워짐 — 없으면 표시 안 함(가짜 링크 금지).
- design issue/error card는 서버가 **관측분만** 기록 → 그대로 노출, 지어내지 않음.
- record에 차원이 없으면 `workspace=undefined`/`designIssues=[]` — 가짜 0 카운트도 안 만든다.
- truth status(observed/configured/planned)를 차원마다 그대로 노출.

## Acceptance

| 기준 | 통과 |
| --- | --- |
| Workspace/preview 노출 | ✅ status 배지 + truth + observed url |
| Visual QA 종합 | ✅ passed/warning/이슈/차단 + 이슈 건수 |
| DesignIssueCard | ✅ kind 라벨·severity·요약→권고·증거ref |
| ErrorCard→SelfCorrection | ✅ rootCause→directive, 시도N·action·이유 |
| 차원 없으면 토글 숨김 | ✅ hasWorkspaceDetail 게이트 |
| 핸들러 없으면 토글 숨김 | ✅ onToggleDetail 가드 |
| UI 대수술·새 nav 없음 | ✅ 기존 카드에 토글 1개, 새 fetch/store 없음 |

## 후속

- 액션(probe/start preview·run visual-qa·curate skill) 버튼은 이번 패스 범위 밖 — wrapper는
  이미 있으니(`probeDgxPreview`/`startDgxPreview`/`runDgxVisualQa`/`curateDgxMissionSkill`)
  다음 패스에서 detail에 붙일 수 있다(읽기→실행). SkillCandidate는 별도 endpoint라 동일하게 후속.

## 검증

desktop typecheck 그린 · desktop 1151 passed(+5: mapper 2 + panel 3) · protocol 103 · server 273.
docs/95.
