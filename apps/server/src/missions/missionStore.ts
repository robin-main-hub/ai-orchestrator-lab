import {
  missionArtifactAttachedPayloadSchema,
  missionClosedPayloadSchema,
  missionMergeQueuedPayloadSchema,
  missionVerificationRecordedPayloadSchema,
  missionWorkerAssignmentRequestSchema,
  type EventEnvelope,
  type MissionCreateRequest,
  type MissionEventAppendRequest,
  type ServerMissionRecord,
} from "@ai-orchestrator/protocol";
import { buildMissionIndexFromEvents } from "./missionIndex.js";
import { normalizeMissionWorker, normalizeVerificationReport } from "./missionPolicy.js";

/**
 * Mission store — 기존 Event Storage 위의 얇은 조립 레이어.
 *
 * 저장은 append-only 이벤트로만 하고(이후 SQLite 이행이 쉬움), 읽기는 매번
 * 이벤트에서 materialized view를 다시 만든다. I/O는 전부 DI(loadEvents/
 * appendEvents)로 받아서 index.ts와의 순환 의존 없이 순수하게 테스트된다.
 */
export type MissionStoreDeps = {
  loadEvents: () => Promise<ReadonlyArray<EventEnvelope>>;
  /** envelopes를 event storage에 append (dedup/idempotency는 storage가 보장) */
  appendEvents: (sessionId: string, envelopes: EventEnvelope[]) => Promise<void>;
  now?: () => string;
};

export type MissionStore = {
  create: (request: MissionCreateRequest) => Promise<ServerMissionRecord>;
  list: () => Promise<ServerMissionRecord[]>;
  get: (missionId: string) => Promise<ServerMissionRecord | undefined>;
  appendEvent: (missionId: string, request: MissionEventAppendRequest) => Promise<ServerMissionRecord | undefined>;
};

export class MissionEventValidationError extends Error {}

function envelope(input: {
  missionId: string;
  type: string;
  payload: unknown;
  seq: number;
  createdAt: string;
}): EventEnvelope {
  return {
    id: `event_${input.type.replaceAll(".", "_")}_${input.missionId}_${input.seq}`,
    // missionId를 sessionId로 써서 한 미션의 이벤트가 세션 단위로 묶인다
    sessionId: input.missionId,
    type: input.type,
    payload: input.payload,
    createdAt: input.createdAt,
    source: "server",
    sourceTrust: "trusted",
    redacted: true,
  };
}

export function createMissionStore(deps: MissionStoreDeps): MissionStore {
  const now = deps.now ?? (() => new Date().toISOString());

  async function materialize(): Promise<ServerMissionRecord[]> {
    return buildMissionIndexFromEvents(await deps.loadEvents());
  }

  async function get(missionId: string): Promise<ServerMissionRecord | undefined> {
    return (await materialize()).find((record) => record.mission.missionId === missionId);
  }

  return {
    list: materialize,
    get,

    async create(request) {
      const createdAt = now();
      const envelopes: EventEnvelope[] = [
        envelope({
          missionId: request.id,
          type: "mission.created",
          payload: {
            missionId: request.id,
            title: request.title,
            goal: request.goal,
            sourceSessionId: request.sourceSessionId,
            codingPacketId: request.codingPacketId,
            debateId: request.debateId,
            truthStatus: request.truthStatus,
            createdBy: request.createdBy,
          },
          seq: 0,
          createdAt,
        }),
        // 서버측 재계산: 클라이언트 capability는 받지 않는다 (missionPolicy)
        ...request.workers.map((worker, index) =>
          envelope({
            missionId: request.id,
            type: "mission.worker.assigned",
            payload: {
              missionId: request.id,
              worker: normalizeMissionWorker(worker, request.id, createdAt),
              capabilityRecomputed: true,
            },
            seq: index + 1,
            createdAt,
          }),
        ),
      ];
      await deps.appendEvents(request.id, envelopes);
      const record = await get(request.id);
      if (!record) {
        throw new Error(`mission ${request.id} did not materialize after create`);
      }
      return record;
    },

    async appendEvent(missionId, request) {
      const existing = await get(missionId);
      if (!existing) {
        return undefined;
      }
      const createdAt = now();
      const seq = existing.workers.length + existing.artifacts.length + existing.verificationReports.length + 1;

      let payload: unknown;
      switch (request.type) {
        case "mission.created":
          throw new MissionEventValidationError("mission.created can only be issued via POST /missions");
        case "mission.worker.assigned": {
          // append 경로의 워커도 같은 정책: 요청 스키마로만 받고 capability는 재계산
          const parsed = missionWorkerAssignmentRequestSchema.safeParse(request.payload);
          if (!parsed.success) {
            throw new MissionEventValidationError(`invalid worker payload: ${parsed.error.message}`);
          }
          payload = {
            missionId,
            worker: normalizeMissionWorker(parsed.data, missionId, createdAt),
            capabilityRecomputed: true,
          };
          break;
        }
        case "mission.artifact.attached": {
          const parsed = missionArtifactAttachedPayloadSchema.safeParse({ missionId, ...(request.payload as object) });
          if (!parsed.success) {
            throw new MissionEventValidationError(`invalid artifact payload: ${parsed.error.message}`);
          }
          if (parsed.data.missionId !== missionId) {
            throw new MissionEventValidationError("artifact missionId mismatch");
          }
          payload = parsed.data;
          break;
        }
        case "mission.verification.recorded": {
          const parsed = missionVerificationRecordedPayloadSchema.safeParse({
            missionId,
            ...(request.payload as object),
          });
          if (!parsed.success) {
            throw new MissionEventValidationError(`invalid verification payload: ${parsed.error.message}`);
          }
          if (parsed.data.missionId !== missionId || parsed.data.report.missionId !== missionId) {
            throw new MissionEventValidationError("verification missionId mismatch");
          }
          const normalized = normalizeVerificationReport(parsed.data.report);
          payload = { missionId, report: normalized.report, observedDowngraded: normalized.observedDowngraded };
          break;
        }
        case "mission.merge.queued": {
          const parsed = missionMergeQueuedPayloadSchema.safeParse({ missionId, ...(request.payload as object) });
          if (!parsed.success) {
            throw new MissionEventValidationError(`invalid merge queue payload: ${parsed.error.message}`);
          }
          if (parsed.data.missionId !== missionId || parsed.data.item.missionId !== missionId) {
            throw new MissionEventValidationError("merge queue missionId mismatch");
          }
          // D3 불변식: 검증을 통과한(observed + passed) report가 있어야만 병합 대기열에 선다
          const report = existing.verificationReports.find(
            (candidate) => candidate.id === parsed.data.item.requiredVerificationReportId,
          );
          if (!report) {
            throw new MissionEventValidationError(
              `merge queue requires an existing verification report (${parsed.data.item.requiredVerificationReportId} not found)`,
            );
          }
          if (report.status !== "passed" || !report.observed) {
            throw new MissionEventValidationError(
              `merge queue requires an observed passed verification report (got status=${report.status}, observed=${report.observed})`,
            );
          }
          payload = parsed.data;
          break;
        }
        case "mission.closed": {
          const parsed = missionClosedPayloadSchema.safeParse({ missionId, ...(request.payload as object) });
          if (!parsed.success) {
            throw new MissionEventValidationError(`invalid close payload: ${parsed.error.message}`);
          }
          if (parsed.data.missionId !== missionId) {
            throw new MissionEventValidationError("close missionId mismatch");
          }
          payload = parsed.data;
          break;
        }
        default:
          throw new MissionEventValidationError(`unknown mission event type: ${String(request.type)}`);
      }

      await deps.appendEvents(missionId, [
        envelope({ missionId, type: request.type, payload, seq, createdAt }),
      ]);
      return get(missionId);
    },
  };
}
