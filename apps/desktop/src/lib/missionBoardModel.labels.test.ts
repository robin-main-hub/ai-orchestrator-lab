import { describe, expect, it } from "vitest";
import {
  orchestrationMissionStatusSchema,
  truthStatusSchema,
} from "@ai-orchestrator/protocol";
import {
  MISSION_STATUS_LABEL,
  MISSION_TRUTH_LABEL,
  PREVIEW_STATUS_LABEL,
  VISUAL_QA_STATUS_LABEL,
} from "./missionBoardModel";

// Characterization tests (no behavior change) for the four presentation label
// tables in missionBoardModel.ts that the existing missionBoardModel.test.ts /
// appFixDraft.test.ts leave directly unasserted. MISSION_SOURCE_LABEL (only the
// server_observed arm) and DESIGN_ISSUE_KIND_LABEL (only mobile_break) are
// already touched, but these four are not pinned head-on. They are static
// Record constants the board UI reads. We pin every key->label entry and assert
// full coverage of the two protocol unions (truthStatus, missionStatus) against
// their zod schemas so a future literal added to the protocol without a label
// would surface here.

describe("MISSION_TRUTH_LABEL", () => {
  it("pins the truth-status label for every protocol TruthStatus literal", () => {
    expect(MISSION_TRUTH_LABEL).toEqual({
      observed: "observed",
      configured: "configured",
      planned: "planned",
      simulated: "simulated",
    });
  });

  it("covers exactly the truthStatus schema union", () => {
    expect(Object.keys(MISSION_TRUTH_LABEL).sort()).toEqual(
      [...truthStatusSchema.options].sort(),
    );
  });
});

describe("MISSION_STATUS_LABEL", () => {
  it("pins the Korean label for every orchestration mission status", () => {
    expect(MISSION_STATUS_LABEL).toEqual({
      draft: "초안",
      planned: "대기",
      running: "진행 중",
      waiting_approval: "승인 대기",
      verifying: "검증 중",
      ready_to_merge: "병합 대기",
      merged: "병합됨",
      failed: "실패",
      cancelled: "취소됨",
    });
  });

  it("covers exactly the orchestrationMissionStatus schema union", () => {
    expect(Object.keys(MISSION_STATUS_LABEL).sort()).toEqual(
      [...orchestrationMissionStatusSchema.options].sort(),
    );
  });
});

describe("PREVIEW_STATUS_LABEL", () => {
  it("pins the preview lifecycle labels", () => {
    expect(PREVIEW_STATUS_LABEL).toEqual({
      not_started: "미시작",
      starting: "기동 중",
      running: "실행 중",
      failed: "실패",
      stopped: "중지됨",
      blocked: "차단됨",
    });
  });
});

describe("VISUAL_QA_STATUS_LABEL", () => {
  it("pins the visual QA status labels incl. the blocked (no preview) arm", () => {
    expect(VISUAL_QA_STATUS_LABEL).toEqual({
      passed: "통과",
      warning: "경고",
      failed: "이슈",
      blocked: "차단(preview 없음)",
    });
  });
});
