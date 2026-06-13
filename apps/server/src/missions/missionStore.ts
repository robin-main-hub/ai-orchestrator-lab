import {
  missionArtifactAttachedPayloadSchema,
  missionClosedPayloadSchema,
  missionMergeQueuedPayloadSchema,
  missionVerificationRecordedPayloadSchema,
  missionWorkerAssignmentRequestSchema,
  type EventEnvelope,
  type MissionCreateRequest,
  type MissionEventAppendRequest,
  type MissionMergeRequest,
  type MissionVerifyRequest,
  type ServerMissionRecord,
  type VerificationReport,
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
  /** 검증 명령을 실제로 실행해 observed VerificationReport를 만든다 (LocalSandboxRunner) */
  runVerification?: (input: {
    commands: ReadonlyArray<string>;
    missionId: string;
    verifierAgentId: string;
    reportId: string;
  }) => Promise<VerificationReport>;
  /** 단조 증가 nonce 생성 (reportId/merge 등 유니크 id용; 테스트 결정성 위해 주입) */
  nextNonce?: () => string;
  /** 큐 항목을 실제 git merge로 실행 (없으면 머지 자체가 not configured) */
  runMerge?: MissionMergeExecutor;
};

export type MissionStore = {
  create: (request: MissionCreateRequest) => Promise<ServerMissionRecord>;
  list: () => Promise<ServerMissionRecord[]>;
  get: (missionId: string) => Promise<ServerMissionRecord | undefined>;
  appendEvent: (missionId: string, request: MissionEventAppendRequest) => Promise<ServerMissionRecord | undefined>;
  /** 미션의 검증 명령을 서버에서 실행하고 결과를 기록 (E1: 진짜 observed) */
  verify: (missionId: string, request: MissionVerifyRequest) => Promise<ServerMissionRecord | undefined>;
  /** 검증 통과한 큐 항목의 머지를 실제 git으로 실행한다 (D4a: real sha / conflict / dry_run) */
  merge: (missionId: string, request: MissionMergeRequest) => Promise<ServerMissionRecord | undefined>;
};

/** 머지 실행기 — repoRoot allowlist에 있으면 real git merge, 아니면 dry_run */
export type MissionMergeExecutor = (input: {
  item: import("@ai-orchestrator/protocol").SequentialMergeQueueItem;
  missionTitle: string;
}) => Promise<{
  status: "merged" | "conflict" | "blocked" | "failed" | "dry_run";
  mergeCommitSha?: string;
  reason: string;
  conflictFiles: string[];
  completedAt: string;
}>;

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
  let nonceCounter = 0;
  const nextNonce = deps.nextNonce ?? (() => `${nonceCounter++}`);

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

    async verify(missionId, request) {
      const existing = await get(missionId);
      if (!existing) {
        return undefined;
      }
      if (!deps.runVerification) {
        throw new MissionEventValidationError("verification runner not configured on this server");
      }
      // verifier 우선순위: 명시 id → sandbox_verify 워커 → (없으면 거부)
      const verifier =
        (request.verifierAgentId && existing.workers.find((w) => w.agentId === request.verifierAgentId)) ||
        existing.workers.find((w) => w.capability.mode === "sandbox_verify");
      if (!verifier) {
        throw new MissionEventValidationError("no sandbox_verify worker available to run verification");
      }

      const report = await deps.runVerification({
        commands: request.commands,
        missionId,
        verifierAgentId: verifier.agentId,
        reportId: `verify_${missionId}_${nextNonce()}`,
      });
      // 같은 정직성 정책을 한 번 더 통과 (LocalSandboxRunner가 이미 정직하지만 이중 방어)
      const normalized = normalizeVerificationReport(report);
      const createdAt = now();
      const seq = existing.workers.length + existing.artifacts.length + existing.verificationReports.length + 1;
      await deps.appendEvents(missionId, [
        envelope({
          missionId,
          type: "mission.verification.recorded",
          payload: { missionId, report: normalized.report, observedDowngraded: normalized.observedDowngraded },
          seq,
          createdAt,
        }),
      ]);
      return get(missionId);
    },

    async merge(missionId, request) {
      const existing = await get(missionId);
      if (!existing) {
        return undefined;
      }
      const queueItem = existing.mergeQueueItems.find((item) => item.id === request.mergeQueueItemId);
      if (!queueItem) {
        throw new MissionEventValidationError(`merge queue item not found: ${request.mergeQueueItemId}`);
      }
      // 불변식: 큐 항목이 가리키는 검증이 여전히 observed+passed여야 머지 실행
      const report = existing.verificationReports.find((r) => r.id === queueItem.requiredVerificationReportId);
      if (!report || report.status !== "passed" || !report.observed) {
        throw new MissionEventValidationError(
          "merge requires the queued item's verification to be observed and passed",
        );
      }
      if (queueItem.status === "merged") {
        return existing; // 멱등: 이미 머지됨
      }
      if (!deps.runMerge) {
        throw new MissionEventValidationError("merge runner not configured on this server");
      }

      // D4a: 실제 git merge 실행. mergeCommitSha는 클라이언트가 보낸 값이 아니라
      // runner가 git rev-parse HEAD로 관측한 real sha만 저장한다 (합성값 금지).
      const result = await deps.runMerge({ item: queueItem, missionTitle: existing.mission.title });
      const createdAt = now();
      const baseSeq =
        existing.workers.length +
        existing.artifacts.length +
        existing.verificationReports.length +
        existing.mergeQueueItems.length +
        1;

      const updatedItem = {
        ...queueItem,
        status: result.status,
        mergeCommitSha: result.mergeCommitSha,
        conflictFiles: result.conflictFiles,
        reason: result.reason,
        completedAt: result.completedAt,
      };

      const envelopes: EventEnvelope[] = [
        envelope({
          missionId,
          type: "mission.merge.queued",
          payload: { missionId, item: updatedItem },
          seq: baseSeq,
          createdAt,
        }),
      ];
      // merged일 때만 미션을 닫는다. conflict/blocked/failed/dry_run은 미션을
      // merged로 닫지 않는다 (가짜 성공 방지 — 사용자가 다시 판단).
      if (result.status === "merged") {
        envelopes.push(
          envelope({
            missionId,
            type: "mission.closed",
            payload: { missionId, status: "merged", reason: `merged via queue item ${queueItem.id} (${result.mergeCommitSha})` },
            seq: baseSeq + 1,
            createdAt,
          }),
        );
      }
      await deps.appendEvents(missionId, envelopes);
      return get(missionId);
    },
  };
}
