/**
 * Mission Workspace 상단의 "전체 여정" rail — 생성 → 실행 → QA → 수정 → 검증 → 게시.
 *
 * 정직성:
 *   - StatusBar(다음 액션 1개 추천)와 역할 분리: 이건 "어디까지 와 있나" 표시 전용.
 *   - 자동 실행 0 — 단순 상태 계산.
 *   - 추측 X: 입력이 없는 단계는 not_started, verify fail 신호가 있으면 그 단계가 blocked.
 *   - 가짜 done 표시 X: passed/observed가 확실할 때만 done.
 */

export type ProgressStage = "create" | "run" | "qa" | "fix" | "verify" | "publish";
export type StageStatus = "not_started" | "current" | "done" | "blocked";

export type ProgressStep = {
  stage: ProgressStage;
  status: StageStatus;
  label: string;
};

export type ProgressInputs = {
  /** mission record가 만들어진 상태인지. */
  missionExists: boolean;
  /** scaffold/latest로 받은 파일이 1개 이상 있는지. */
  hasScaffoldFiles: boolean;
  /** workspace.preview.url이 observed로 있는지. */
  previewObserved: boolean;
  qaReport?: { status: "passed" | "warning" | "failed" | "blocked"; issueCount: number };
  fixApplied: boolean;
  verifyDiff?: { status: "passed" | "improved" | "no_change" | "regressed" | "blocked" };
  verifyFailedStep?: "preview" | "qa";
  /** publish가 observed로 완료됐는지(PR 등록 등). */
  publishObserved?: boolean;
};

const STAGE_LABEL: Record<ProgressStage, string> = {
  create: "생성",
  run: "실행",
  qa: "QA",
  fix: "수정",
  verify: "검증",
  publish: "게시",
};

export function computeProgressRail(input: ProgressInputs): ProgressStep[] {
  // create — mission record 존재 시 done. 아니면 current.
  const create: StageStatus = input.missionExists ? "done" : "current";

  // run — preview rerun 실패가 있으면(가장 최근 신호) blocked가 우선. 아니면 observed면 done.
  let run: StageStatus;
  if (input.verifyFailedStep === "preview") run = "blocked";
  else if (input.previewObserved) run = "done";
  else if (input.missionExists && input.hasScaffoldFiles) run = "current";
  else run = "not_started";

  // qa — passed+issues=0 → done. qa rerun 실패 → blocked. report 존재 → current(failed/warning/blocked 다 current). preview observed지만 미실행 → current.
  let qa: StageStatus;
  if (input.qaReport?.status === "passed" && input.qaReport.issueCount === 0) qa = "done";
  else if (input.verifyFailedStep === "qa") qa = "blocked";
  else if (input.qaReport) qa = "current";
  else if (input.previewObserved) qa = "current";
  else qa = "not_started";

  // fix — qa passed+0 → not_started(불필요). fixApplied → done. 이슈 있고 미적용 → current.
  let fix: StageStatus;
  if (input.qaReport?.status === "passed" && input.qaReport.issueCount === 0) fix = "not_started";
  else if (input.fixApplied) fix = "done";
  else if (input.qaReport && input.qaReport.issueCount > 0) fix = "current";
  else fix = "not_started";

  // verify — diff passed → done. verify rerun 실패 → blocked. diff 있고 미통과(improved/no_change/regressed) → current.
  // fixApplied인데 diff 없음 → current(verify 대기 중).
  let verify: StageStatus;
  if (input.verifyDiff?.status === "passed") verify = "done";
  else if (input.verifyFailedStep) verify = "blocked";
  else if (input.verifyDiff) verify = "current";
  else if (input.fixApplied) verify = "current";
  else verify = "not_started";

  // publish — observed → done. 그 외에는 verify가 done이거나(qa done && 수정 불필요)면 current.
  let publish: StageStatus;
  if (input.publishObserved) publish = "done";
  else if (verify === "done" || (qa === "done" && fix === "not_started")) publish = "current";
  else publish = "not_started";

  return [
    { stage: "create", status: create, label: STAGE_LABEL.create },
    { stage: "run", status: run, label: STAGE_LABEL.run },
    { stage: "qa", status: qa, label: STAGE_LABEL.qa },
    { stage: "fix", status: fix, label: STAGE_LABEL.fix },
    { stage: "verify", status: verify, label: STAGE_LABEL.verify },
    { stage: "publish", status: publish, label: STAGE_LABEL.publish },
  ];
}
