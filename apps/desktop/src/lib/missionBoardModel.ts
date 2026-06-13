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
  updatedAt: string;
};

export type MissionBoardSnapshot = {
  items: MissionBoardItem[];
  serverReachable: boolean;
  /** 서버 fetch 실패 시 사용자에게 보여줄 사유 */
  serverError?: string;
};

export function mapServerMissionToBoardItem(record: ServerMissionRecord): MissionBoardItem {
  const latestReport = record.verificationReports.at(-1);
  const latestMergeItem = record.mergeQueueItems.at(-1);
  const failedCheck =
    latestReport && latestReport.status === "failed"
      ? latestReport.checks.find((check) => check.status === "failed")
      : undefined;
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
