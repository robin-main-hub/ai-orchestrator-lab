/**
 * Mission Workspace 상단의 한 줄 상태 요약 — 사용자가 "지금 어디까지 와 있고 다음에 뭘 누를지"
 * 한 눈에 보게 한다.
 *
 * 정직성:
 *   - 보수적으로 결정. 의심 상태는 verification 쪽으로 흐른다(자동 publish ready 표시 X).
 *   - 입력의 verifyFailed가 우선 — preview/QA 재실행 실패면 그 사실을 가장 위에 노출.
 *   - 자동 실행 0 — 이 모듈은 상태만 계산.
 */

import type { VisualQaReport } from "@ai-orchestrator/protocol";
import type { VisualQaDiff } from "./visualQaDiff";

export type MissionWorkspacePhase =
  /** scaffold가 없거나 mission 자체가 미생성 단계. */
  | "blocked_no_scaffold"
  /** scaffold는 있지만 preview를 안 띄움 — Preview 실행 권장. */
  | "build_ready"
  /** preview observed. Visual QA 실행 권장. */
  | "preview_running"
  /** preview rerun 실패 — 다시 시도 권장. */
  | "preview_failed"
  /** Visual QA 실패(rerun 또는 처음 실행) — 다시 시도. */
  | "qa_failed"
  /** Visual QA 시작 안 됨/blocked — Preview observed 다시 확인. */
  | "qa_blocked"
  /** Visual QA 이슈 있음 — 수정안 초안 작성 권장. */
  | "qa_issues_found"
  /** patch 적용됨 — verify 실행 권장. */
  | "fix_applied_verification_needed"
  /** verify 후 남은 이슈 있음 — 추가 수정 권장. */
  | "verify_needs_fix"
  /** Visual QA/verify가 통과 — Publish 진행 가능. */
  | "publish_ready";

export type MissionWorkspaceStatus = {
  phase: MissionWorkspacePhase;
  /** 짧은 라벨(배지용). */
  label: string;
  /** 한 줄 headline(다음 행동 추천 포함). */
  headline: string;
  /** Evidence Card readiness CTA가 가야 할 target — Router가 사용. */
  recommendedAction: "publish" | "fix" | "preview" | "qa" | "none";
};

export type MissionWorkspaceStatusInputs = {
  /** scaffold/latest로 받은 파일이 있는지. 없으면 build 자체가 불가능. */
  hasScaffoldFiles: boolean;
  /** workspace.preview.url이 observed로 있는지. */
  previewObserved: boolean;
  /** 직전 visual QA report(없으면 undefined). */
  qaReport?: VisualQaReport;
  /** AppFix patch가 user click으로 적용됐는지. */
  fixApplied: boolean;
  /** verify가 한 번 끝나서 diff가 있는지. */
  verifyDiff?: VisualQaDiff;
  /** verify에서 어느 단계가 실패했는지. */
  verifyFailedStep?: "preview" | "qa";
};

export function computeMissionWorkspaceStatus(input: MissionWorkspaceStatusInputs): MissionWorkspaceStatus {
  // 가장 시급한 실패가 가장 위에.
  if (input.verifyFailedStep === "preview") {
    return {
      phase: "preview_failed",
      label: "Preview rerun 실패",
      headline: "Preview 재실행이 실패했습니다 — 다시 시도하세요.",
      recommendedAction: "preview",
    };
  }
  if (input.verifyFailedStep === "qa") {
    return {
      phase: "qa_failed",
      label: "QA rerun 실패",
      headline: "Visual QA 재실행이 실패했습니다 — 다시 시도하세요.",
      recommendedAction: "qa",
    };
  }
  if (!input.hasScaffoldFiles) {
    return {
      phase: "blocked_no_scaffold",
      label: "Scaffold 없음",
      headline: "Mission 생성/blueprint 적용으로 scaffold를 먼저 만드세요.",
      recommendedAction: "none",
    };
  }
  // verify diff가 있으면 우선 — 가장 마지막 사실이 가장 정확.
  if (input.verifyDiff) {
    if (input.verifyDiff.status === "passed") {
      return {
        phase: "publish_ready",
        label: "Publish 준비됨",
        headline: "수정 검증 통과 — Publish Panel에서 multi-file plan을 진행하세요.",
        recommendedAction: "publish",
      };
    }
    if (input.verifyDiff.status === "blocked") {
      return {
        phase: "qa_blocked",
        label: "검증 차단",
        headline: "verify가 blocked — Preview를 다시 띄우고 Visual QA를 재실행하세요.",
        recommendedAction: "preview",
      };
    }
    return {
      phase: "verify_needs_fix",
      label: "추가 수정 필요",
      headline: `verify 결과 남은 이슈 ${input.verifyDiff.counts.remaining}건, 새 이슈 ${input.verifyDiff.counts.new}건 — 다시 수정안을 만드세요.`,
      recommendedAction: "fix",
    };
  }
  if (input.fixApplied) {
    return {
      phase: "fix_applied_verification_needed",
      label: "검증 필요",
      headline: "수정안 적용됨 — '수정 검증 실행'으로 결과를 확인하세요.",
      recommendedAction: "fix",
    };
  }
  if (input.qaReport) {
    if (input.qaReport.status === "blocked") {
      return {
        phase: "qa_blocked",
        label: "QA 차단",
        headline: "Visual QA가 blocked — Preview observed running이 필요합니다.",
        recommendedAction: "preview",
      };
    }
    if (input.qaReport.status === "passed" && input.qaReport.issues.length === 0) {
      return {
        phase: "publish_ready",
        label: "Publish 준비됨",
        headline: "Visual QA 통과 — Publish Panel에서 multi-file plan을 진행하세요.",
        recommendedAction: "publish",
      };
    }
    return {
      phase: "qa_issues_found",
      label: `QA 이슈 ${input.qaReport.issues.length}건`,
      headline: "Visual QA 이슈 발견 — 수정안 초안을 만드세요.",
      recommendedAction: "fix",
    };
  }
  if (input.previewObserved) {
    return {
      phase: "preview_running",
      label: "Preview running",
      headline: "Preview observed — Visual QA 실행으로 디자인 품질을 확인하세요.",
      recommendedAction: "qa",
    };
  }
  return {
    phase: "build_ready",
    label: "Build ready",
    headline: "Scaffold 준비됨 — Preview 실행으로 진행하세요.",
    recommendedAction: "preview",
  };
}
