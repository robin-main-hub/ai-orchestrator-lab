import {
  missionArtifactAttachedPayloadSchema,
  missionCheckpointRecordedPayloadSchema,
  missionClosedPayloadSchema,
  missionCreatedPayloadSchema,
  missionErrorCardRecordedPayloadSchema,
  missionMergeQueuedPayloadSchema,
  missionSelfCorrectionRecordSchema,
  missionVerificationRecordedPayloadSchema,
  missionWorkerAssignedPayloadSchema,
  missionWorkspaceAttachedPayloadSchema,
  type EventEnvelope,
  type OrchestrationMissionStatus,
  type ServerMissionRecord,
} from "@ai-orchestrator/protocol";

/**
 * Materialized mission view — append-only mission.* 이벤트에서 현재 상태를
 * 복원하는 순수 함수. 서버 재시작 후에도:
 *
 *   events.jsonl(+세그먼트) → event storage state → buildMissionIndexFromEvents
 *
 * 로 GET /missions가 살아난다. payload는 신뢰하지 않고 스키마로 재검증하며,
 * 깨진 payload는 해당 이벤트만 건너뛴다(인덱스 전체를 죽이지 않는다).
 */

function sortByCreatedAt(events: ReadonlyArray<EventEnvelope>): EventEnvelope[] {
  // createdAt만 비교하는 stable sort — 같은 timestamp의 이벤트는 입력(=스토리지
  // append) 순서를 보존한다. id로 동률을 깨면 같은 ms에 만들어진
  // created/artifact 이벤트가 알파벳순으로 뒤집혀 인덱스가 어긋난다.
  return [...events].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/**
 * 상태 유도 규칙(의도적으로 단순):
 *   created → planned
 *   worker 1+ → running
 *   최신 verification passed → ready_to_merge / failed → verifying 유지
 *   mission.closed → 그 상태가 최종 (merged/failed/cancelled)
 */
/**
 * 미션 레벨 truthStatus도 검증과 같은 정직성 정책을 따른다:
 *   - observed passed verification이 있으면 "observed"
 *   - 없는데 created가 "observed"를 주장했으면 "configured"로 강등(가짜 green 방지)
 *   - 그 외엔 created 값(planned/configured/simulated) 유지
 */
function deriveTruthStatus(record: ServerMissionRecord): ServerMissionRecord["truthStatus"] {
  const hasObservedPass = record.verificationReports.some((r) => r.observed && r.status === "passed");
  if (hasObservedPass) {
    return "observed";
  }
  return record.truthStatus === "observed" ? "configured" : record.truthStatus;
}

function deriveStatus(record: ServerMissionRecord, closedStatus?: "merged" | "failed" | "cancelled"): OrchestrationMissionStatus {
  if (closedStatus) {
    return closedStatus;
  }
  const latestReport = record.verificationReports.at(-1);
  if (latestReport) {
    return latestReport.status === "passed" ? "ready_to_merge" : "verifying";
  }
  return record.workers.length > 0 ? "running" : "planned";
}

export function buildMissionIndexFromEvents(events: ReadonlyArray<EventEnvelope>): ServerMissionRecord[] {
  const records = new Map<string, ServerMissionRecord>();
  const closedBy = new Map<string, "merged" | "failed" | "cancelled">();

  for (const event of sortByCreatedAt(events.filter((candidate) => candidate.type.startsWith("mission.")))) {
    if (event.type === "mission.created") {
      const parsed = missionCreatedPayloadSchema.safeParse(event.payload);
      if (!parsed.success || records.has(parsed.data.missionId)) {
        continue;
      }
      records.set(parsed.data.missionId, {
        mission: { ...parsed.data, createdAt: event.createdAt },
        status: "planned",
        truthStatus: parsed.data.truthStatus,
        workers: [],
        artifacts: [],
        verificationReports: [],
        mergeQueueItems: [],
        checkpoints: [],
        errorCards: [],
        selfCorrections: [],
        workspaces: [],
        updatedAt: event.createdAt,
      });
      continue;
    }

    if (event.type === "mission.worker.assigned") {
      const parsed = missionWorkerAssignedPayloadSchema.safeParse(event.payload);
      const record = parsed.success ? records.get(parsed.data.missionId) : undefined;
      if (!parsed.success || !record || record.workers.some((worker) => worker.id === parsed.data.worker.id)) {
        continue;
      }
      record.workers.push(parsed.data.worker);
      record.updatedAt = event.createdAt;
      continue;
    }

    if (event.type === "mission.artifact.attached") {
      const parsed = missionArtifactAttachedPayloadSchema.safeParse(event.payload);
      const record = parsed.success ? records.get(parsed.data.missionId) : undefined;
      if (!parsed.success || !record || record.artifacts.some((artifact) => artifact.id === parsed.data.artifact.id)) {
        continue;
      }
      record.artifacts.push(parsed.data.artifact);
      record.updatedAt = event.createdAt;
      continue;
    }

    if (event.type === "mission.verification.recorded") {
      const parsed = missionVerificationRecordedPayloadSchema.safeParse(event.payload);
      const record = parsed.success ? records.get(parsed.data.missionId) : undefined;
      if (!parsed.success || !record || record.verificationReports.some((report) => report.id === parsed.data.report.id)) {
        continue;
      }
      record.verificationReports.push(parsed.data.report);
      record.updatedAt = event.createdAt;
      continue;
    }

    if (event.type === "mission.checkpoint.created") {
      const parsed = missionCheckpointRecordedPayloadSchema.safeParse(event.payload);
      const record = parsed.success ? records.get(parsed.data.missionId) : undefined;
      if (!parsed.success || !record || record.checkpoints.some((cp) => cp.id === parsed.data.checkpoint.id)) {
        continue;
      }
      record.checkpoints.push(parsed.data.checkpoint);
      record.updatedAt = event.createdAt;
      continue;
    }

    if (event.type === "mission.workspace.attached") {
      const parsed = missionWorkspaceAttachedPayloadSchema.safeParse(event.payload);
      const record = parsed.success ? records.get(parsed.data.missionId) : undefined;
      if (!parsed.success || !record) {
        continue;
      }
      // upsert by id — preview/files 상태 갱신 이벤트가 같은 id를 덮어쓴다(latest wins)
      const index = record.workspaces.findIndex((ws) => ws.id === parsed.data.workspace.id);
      if (index >= 0) {
        record.workspaces[index] = parsed.data.workspace;
      } else {
        record.workspaces.push(parsed.data.workspace);
      }
      record.updatedAt = event.createdAt;
      continue;
    }

    if (event.type === "mission.error_card.recorded") {
      const parsed = missionErrorCardRecordedPayloadSchema.safeParse(event.payload);
      const record = parsed.success ? records.get(parsed.data.missionId) : undefined;
      if (!parsed.success || !record || record.errorCards.some((card) => card.id === parsed.data.errorCard.id)) {
        continue;
      }
      record.errorCards.push(parsed.data.errorCard);
      record.updatedAt = event.createdAt;
      continue;
    }

    if (event.type === "mission.self_correction.suggested" || event.type === "mission.self_correction.stopped") {
      const parsed = missionSelfCorrectionRecordSchema.safeParse(event.payload);
      const record = parsed.success ? records.get(parsed.data.missionId) : undefined;
      if (!parsed.success || !record || record.selfCorrections.some((entry) => entry.id === parsed.data.id)) {
        continue;
      }
      record.selfCorrections.push(parsed.data);
      record.updatedAt = event.createdAt;
      continue;
    }

    if (event.type === "mission.merge.queued") {
      const parsed = missionMergeQueuedPayloadSchema.safeParse(event.payload);
      const record = parsed.success ? records.get(parsed.data.missionId) : undefined;
      if (!parsed.success || !record) {
        continue;
      }
      // upsert: 같은 큐 항목 id는 갱신(queued → merged 전이 반영), 새 항목은 추가
      const existingIndex = record.mergeQueueItems.findIndex((item) => item.id === parsed.data.item.id);
      if (existingIndex >= 0) {
        record.mergeQueueItems[existingIndex] = parsed.data.item;
      } else {
        record.mergeQueueItems.push(parsed.data.item);
      }
      record.updatedAt = event.createdAt;
      continue;
    }

    if (event.type === "mission.closed") {
      const parsed = missionClosedPayloadSchema.safeParse(event.payload);
      const record = parsed.success ? records.get(parsed.data.missionId) : undefined;
      if (!parsed.success || !record) {
        continue;
      }
      closedBy.set(parsed.data.missionId, parsed.data.status);
      record.updatedAt = event.createdAt;
    }
  }

  return [...records.values()]
    .map((record) => ({
      ...record,
      status: deriveStatus(record, closedBy.get(record.mission.missionId)),
      truthStatus: deriveTruthStatus(record),
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
