import type {
  OrchestrationMissionStatus,
  ServerMissionRecord,
  TruthStatus,
} from "@ai-orchestrator/protocol";

/**
 * Mission Board 뷰 모델 — 서버 mission index와 로컬 임시 항목을 한 보드로
 * 병합한다. 줄곧 지켜온 원칙 그대로: 상태는 멋있게 보이되 거짓말하지 않는다.
 *
 *   server_observed   = DGX event storage에서 복원된 실물
 *   local_fallback    = 아직 서버에 닿지 않은 로컬 임시
 *   (보드 자체의 연결 상태는 MissionBoardSnapshot.serverReachable로 별도 표기)
 */
export type MissionBoardSource = "server_observed" | "local_fallback";

export type MissionBoardWorker = {
  agentId: string;
  displayName: string;
  role: string;
  capabilityMode: string;
  canMutateFiles: boolean;
  hermesSlotId: string;
};

/** Coding/Design OS D2~D8 차원 요약 — 서버 record에 이미 있는 것을 보드 아이템으로 평탄화.
 *  새 fetch 없음(같은 mission index 응답에서 파생). 화면에 안 본 걸 지어내지 않는다. */
export type MissionWorkspaceSummary = {
  id: string;
  name: string;
  appType: string;
  /** 코딩 runner 대상 repo 루트 (있을 때만) */
  repoRootRef?: string;
  /** preview 라이프사이클 — not_started/starting/running/failed/stopped/blocked */
  previewStatus: string;
  /** observed running일 때만 채워짐 */
  previewUrl?: string;
  previewTruth: TruthStatus;
};

export type MissionVisualQaSummary = {
  id: string;
  workspaceId: string;
  status: "passed" | "warning" | "failed" | "blocked";
  truthStatus: TruthStatus;
  issueCount: number;
  previewUrl: string;
};

export type MissionDesignIssueSummary = {
  id: string;
  kind: string;
  severity: "low" | "medium" | "high";
  summary: string;
  recommendation: string;
  evidenceRef?: string;
  truthStatus: TruthStatus;
};

export type MissionErrorCardSummary = {
  id: string;
  status: string;
  rootCause: string;
  directive: string;
  targetFile?: string;
  truthStatus: TruthStatus;
};

export type MissionSelfCorrectionSummary = {
  id: string;
  action: string;
  attempt: number;
  reason: string;
};

export type MissionBoardItem = {
  missionId: string;
  title: string;
  goal: string;
  status: OrchestrationMissionStatus;
  truthStatus: TruthStatus;
  source: MissionBoardSource;
  workers: MissionBoardWorker[];
  artifactCount: number;
  verificationCount: number;
  mergeQueueCount: number;
  /** 최신 검증 결과 한 줄 (없으면 undefined) */
  latestVerification?: { id: string; status: string; observed: boolean; failedCheck?: string };
  /** 최신 머지 큐 항목 상태 (없으면 undefined) — merged sha / conflict / dry_run 정직 표시 */
  latestMerge?: { id: string; status: string; sha?: string; conflictCount: number };
  /** 최신 AppWorkspace + preview (D2/D4/D5a) — 없으면 undefined */
  workspace?: MissionWorkspaceSummary;
  workspaceCount: number;
  /** 최신 Visual QA 리포트 (D5b) — 없으면 undefined */
  latestVisualQa?: MissionVisualQaSummary;
  /** 디자인 이슈 카드 (D5b) — observed 관측분만 */
  designIssues: MissionDesignIssueSummary[];
  /** 코딩 에러 카드 (L4) */
  errorCards: MissionErrorCardSummary[];
  /** bounded self-correction (L5) */
  selfCorrections: MissionSelfCorrectionSummary[];
  updatedAt: string;
};

export type MissionBoardSnapshot = {
  items: MissionBoardItem[];
  serverReachable: boolean;
  /** 서버 fetch 실패 시 사용자에게 보여줄 사유 */
  serverError?: string;
};

/** repo/worktree 경로 → 짧은 라벨(마지막 1~2 조각). 경로 구분자는 / 와 \\ 둘 다. */
function workspaceLabel(ref: string): string {
  const parts = ref.split(/[/\\]+/).filter(Boolean);
  return parts.slice(-2).join("/") || ref;
}

export function mapServerMissionToBoardItem(record: ServerMissionRecord): MissionBoardItem {
  const latestReport = record.verificationReports.at(-1);
  const latestMergeItem = record.mergeQueueItems.at(-1);
  const failedCheck =
    latestReport && latestReport.status === "failed"
      ? latestReport.checks.find((check) => check.status === "failed")
      : undefined;
  const latestWorkspace = record.workspaces.at(-1);
  const latestQa = record.visualQaReports.at(-1);
  return {
    missionId: record.mission.missionId,
    title: record.mission.title,
    goal: record.mission.goal,
    status: record.status,
    truthStatus: record.truthStatus,
    source: "server_observed",
    workers: record.workers.map((worker) => ({
      agentId: worker.agentId,
      displayName: worker.capability.displayName,
      role: worker.role,
      capabilityMode: worker.capability.mode,
      canMutateFiles: worker.capability.canMutateFiles,
      hermesSlotId: worker.capability.personaContinuity.hermes.slotId,
    })),
    artifactCount: record.artifacts.length,
    verificationCount: record.verificationReports.length,
    mergeQueueCount: record.mergeQueueItems.length,
    latestVerification: latestReport
      ? {
          id: latestReport.id,
          status: latestReport.status,
          observed: latestReport.observed,
          failedCheck: failedCheck ? `${failedCheck.command} → ${failedCheck.summary}`.slice(0, 160) : undefined,
        }
      : undefined,
    latestMerge: latestMergeItem
      ? {
          id: latestMergeItem.id,
          status: latestMergeItem.status,
          sha: latestMergeItem.mergeCommitSha,
          conflictCount: latestMergeItem.conflictFiles.length,
        }
      : undefined,
    workspace: latestWorkspace
      ? {
          id: latestWorkspace.id,
          // AppWorkspace엔 별도 name이 없다 — repo 경로의 마지막 조각을 라벨로(worktree 우선)
          name: workspaceLabel(latestWorkspace.worktreeRef ?? latestWorkspace.repoRootRef),
          repoRootRef: latestWorkspace.repoRootRef,
          appType: latestWorkspace.appType,
          previewStatus: latestWorkspace.preview.status,
          // url은 observed running일 때만 있다 — 없으면 표시하지 않음(가짜 링크 금지)
          previewUrl: latestWorkspace.preview.url,
          previewTruth: latestWorkspace.preview.truthStatus,
        }
      : undefined,
    workspaceCount: record.workspaces.length,
    latestVisualQa: latestQa
      ? {
          id: latestQa.id,
          workspaceId: latestQa.workspaceId,
          status: latestQa.status,
          truthStatus: latestQa.truthStatus,
          issueCount: latestQa.issues.length,
          previewUrl: latestQa.previewUrl,
        }
      : undefined,
    // 디자인 이슈는 observed 관측분만 기록되므로 그대로 노출(가짜 이슈 없음)
    designIssues: record.designIssues.map((issue) => ({
      id: issue.id,
      kind: issue.kind,
      severity: issue.severity,
      summary: issue.summary,
      recommendation: issue.recommendation,
      evidenceRef: issue.evidenceRef,
      truthStatus: issue.truthStatus,
    })),
    errorCards: record.errorCards.map((card) => ({
      id: card.id,
      status: card.status,
      rootCause: card.rootCause,
      directive: card.directive,
      targetFile: card.targetFile,
      truthStatus: card.truthStatus,
    })),
    selfCorrections: record.selfCorrections.map((correction) => ({
      id: correction.id,
      action: correction.action,
      attempt: correction.attempt,
      reason: correction.reason,
    })),
    updatedAt: record.updatedAt,
  };
}

/**
 * 병합 규칙:
 *   - 같은 missionId면 server_observed가 local_fallback을 이긴다
 *   - local-only 항목은 "로컬 임시"로 유지
 *   - 서버 fetch가 실패하면 로컬 보드를 그대로 두고 serverReachable=false로 표기
 *     (서버가 꺼져 있어도 기존 UX는 죽지 않는다)
 */
export function mergeMissionBoard(input: {
  serverRecords?: ReadonlyArray<ServerMissionRecord>;
  localItems?: ReadonlyArray<MissionBoardItem>;
  serverError?: string;
}): MissionBoardSnapshot {
  const locals = input.localItems ?? [];
  if (!input.serverRecords) {
    return { items: [...locals], serverReachable: false, serverError: input.serverError };
  }

  const serverItems = input.serverRecords.map(mapServerMissionToBoardItem);
  const serverIds = new Set(serverItems.map((item) => item.missionId));
  const localOnly = locals.filter((item) => !serverIds.has(item.missionId));
  const items = [...serverItems, ...localOnly].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return { items, serverReachable: true };
}

export const MISSION_SOURCE_LABEL: Record<MissionBoardSource, string> = {
  server_observed: "DGX 저장됨",
  local_fallback: "로컬 임시",
};

export const MISSION_TRUTH_LABEL: Record<TruthStatus, string> = {
  observed: "observed",
  configured: "configured",
  planned: "planned",
  simulated: "simulated",
};

export const MISSION_STATUS_LABEL: Record<OrchestrationMissionStatus, string> = {
  draft: "초안",
  planned: "대기",
  running: "진행 중",
  waiting_approval: "승인 대기",
  verifying: "검증 중",
  ready_to_merge: "병합 대기",
  merged: "병합됨",
  failed: "실패",
  cancelled: "취소됨",
};

/** preview 라이프사이클 라벨 (D4/D5a) — 상태를 한국어로, observed 여부는 truth로 별도 표기. */
export const PREVIEW_STATUS_LABEL: Record<string, string> = {
  not_started: "미시작",
  starting: "기동 중",
  running: "실행 중",
  failed: "실패",
  stopped: "중지됨",
  blocked: "차단됨",
};

/** Visual QA 종합 상태 라벨 (D5b). blocked = observed preview 없어 QA 건너뜀(정직). */
export const VISUAL_QA_STATUS_LABEL: Record<MissionVisualQaSummary["status"], string> = {
  passed: "통과",
  warning: "경고",
  failed: "이슈",
  blocked: "차단(preview 없음)",
};

/** 디자인 이슈 종류 라벨 (D5b). */
export const DESIGN_ISSUE_KIND_LABEL: Record<string, string> = {
  visual_overflow: "가로 overflow",
  console_error: "콘솔 에러",
  contrast: "대비 부족",
  hierarchy: "정보 위계",
  missing_primary_action: "주요 액션 없음",
  mobile_break: "모바일 깨짐",
  click_target: "클릭 타겟 작음",
  accessibility: "접근성",
};
