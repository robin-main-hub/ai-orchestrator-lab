import {
  applyCuratorDecision,
  buildAppWorkspace,
  decideSelfCorrection,
  deriveSkillArchiveQueue,
  deriveSkillCandidatesFromMission,
  finalizeDesignBlueprint,
  isExportableSkill,
  plannedArtifactsFromBlueprint,
  missionArtifactAttachedPayloadSchema,
  missionClosedPayloadSchema,
  missionMergeQueuedPayloadSchema,
  missionVerificationRecordedPayloadSchema,
  missionWorkerAssignmentRequestSchema,
  parseSandboxError,
  sandboxErrorSignature,
  type AppWorkspace,
  type AppWorkspaceAttachRequest,
  type AppWorkspacePreview,
  type CuratorDecision,
  type DesignBlueprint,
  type DesignBlueprintInput,
  type EventEnvelope,
  type MissionArtifactRef,
  type MissionCheckpoint,
  type MissionCheckpointReason,
  type MissionCreateRequest,
  type MissionEventAppendRequest,
  type MissionMergeRequest,
  type MissionSelfCorrectionRecord,
  type MissionVerifyRequest,
  type SandboxErrorCard,
  type ServerMissionRecord,
  type ScaffoldApplyResult,
  type ScaffoldOverlay,
  type ScaffoldPlan,
  type SkillArchiveCandidate,
  type VerificationReport,
  type VisualQaReport,
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
  /**
   * append 성공 직후 호출되는 관측 훅(L1). 여기서 미션 trace를 SSE로 broadcast한다.
   * 부수효과는 관측 전용 — 여기서 새 이벤트를 append하면 안 된다(루프 방지). 실패해도
   * append 자체는 이미 커밋됐으므로 store는 무시하고 진행(broadcast best-effort).
   */
  onEventsCommitted?: (missionId: string, envelopes: ReadonlyArray<EventEnvelope>) => void | Promise<void>;
  now?: () => string;
  /** 검증 명령을 실제로 실행해 observed VerificationReport를 만든다 (runner registry: local/docker/gVisor) */
  runVerification?: (input: {
    commands: ReadonlyArray<string>;
    missionId: string;
    verifierAgentId: string;
    /** 서버가 재계산한 verifier capability mode — registry의 capability 게이트 입력 */
    verifierCapabilityMode: string;
    reportId: string;
  }) => Promise<VerificationReport>;
  /** 단조 증가 nonce 생성 (reportId/merge 등 유니크 id용; 테스트 결정성 위해 주입) */
  nextNonce?: () => string;
  /** 큐 항목을 실제 git merge로 실행 (없으면 머지 자체가 not configured) */
  runMerge?: MissionMergeExecutor;
  /**
   * L3: verify/merge 전 자동 checkpoint 생성기. 미주입이거나 "skipped"면 checkpoint
   * 없이 진행한다(이 배포에 repoRoot allowlist가 없으면 checkpoint 미적용 — 회귀 0).
   * 자동 rollback은 절대 하지 않는다(rollback은 별도 승인 게이트 경로).
   */
  autoCheckpoint?: (missionId: string, reason: MissionCheckpointReason) => Promise<MissionAutoCheckpointOutcome>;
  /** L4: 에러 카드에 기록할 runner 종류 라벨(예: local/docker/gvisor). 기본 "local". */
  verificationRunnerKind?: () => string;
  /** L6: curator 승인(approved/pinned) skill을 Obsidian 등으로 export. 미주입이면 export 생략. */
  exportApprovedSkill?: (candidate: SkillArchiveCandidate) => Promise<void>;
};

/**
 * 자동 checkpoint 결과:
 *   - created: 실제 sha를 관측해 checkpoint 생성 → 이벤트로 기록
 *   - skipped: 이 배포에 적용 불가(allowlist 없음 등) → 조용히 진행
 *   - failed:  적용 대상인데 git 실패 → 정책에 따라(merge=critical) 차단/경고
 */
export type MissionAutoCheckpointOutcome =
  | { status: "created"; checkpoint: MissionCheckpoint }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string };

export type MissionStore = {
  create: (request: MissionCreateRequest) => Promise<ServerMissionRecord>;
  list: () => Promise<ServerMissionRecord[]>;
  get: (missionId: string) => Promise<ServerMissionRecord | undefined>;
  appendEvent: (missionId: string, request: MissionEventAppendRequest) => Promise<ServerMissionRecord | undefined>;
  /** 미션의 검증 명령을 서버에서 실행하고 결과를 기록 (E1: 진짜 observed) */
  verify: (missionId: string, request: MissionVerifyRequest) => Promise<ServerMissionRecord | undefined>;
  /** 검증 통과한 큐 항목의 머지를 실제 git으로 실행한다 (D4a: real sha / conflict / dry_run) */
  merge: (missionId: string, request: MissionMergeRequest) => Promise<ServerMissionRecord | undefined>;
  /** L6: 이 미션의 skill candidate curator queue (memory.skill_candidate.* 파생). 미션 없으면 undefined. */
  skills: (missionId: string) => Promise<SkillArchiveCandidate[] | undefined>;
  /** L6: curator 결정(approve/reject/pin) → trustStatus 전이 + 승인 시 export. 후보 없으면 undefined. */
  curateSkill: (missionId: string, candidateId: string, decision: CuratorDecision) => Promise<SkillArchiveCandidate | undefined>;
  /** D2: Mission에 App Workspace를 붙인다(코딩/디자인 작업공간). 미션 없으면 undefined. */
  attachWorkspace: (missionId: string, request: AppWorkspaceAttachRequest) => Promise<ServerMissionRecord | undefined>;
  /** D3: 디자인 청사진을 미션에 기록(화면→planned 아티팩트). 미션 없으면 undefined. */
  attachDesignBlueprint: (
    missionId: string,
    blueprint: DesignBlueprintInput,
  ) => Promise<{ mission: ServerMissionRecord; blueprint: DesignBlueprint } | undefined>;
  /** D4: 워크스페이스 preview 상태를 기록(probe 결과). 미션/워크스페이스 없으면 undefined. */
  recordPreview: (
    missionId: string,
    workspaceId: string,
    preview: AppWorkspacePreview,
  ) => Promise<ServerMissionRecord | undefined>;
  /** D5b: Visual QA 리포트 + 디자인 이슈 기록. 미션 없으면 undefined. */
  recordVisualQa: (missionId: string, report: VisualQaReport) => Promise<ServerMissionRecord | undefined>;
  /** D7: 스캐폴드 계획 기록(planned, 쓰기 없음). 미션 없으면 undefined. */
  recordScaffoldPlan: (missionId: string, plan: ScaffoldPlan) => Promise<ServerMissionRecord | undefined>;
  /** AppFix: 사용자 확정 patch들. 같은 path 추가 overlay는 마지막이 이긴다. */
  recordScaffoldOverlay: (missionId: string, overlay: ScaffoldOverlay) => Promise<ServerMissionRecord | undefined>;
  /** D7: 스캐폴드 적용 결과 기록(observed). plan 찾으면 record + 갱신, 아니면 undefined. */
  recordScaffoldApply: (missionId: string, planId: string, result: ScaffoldApplyResult) => Promise<ServerMissionRecord | undefined>;
  /** D7: 한 계획을 id로 조회(apply 라우트가 plan을 재구성하는 데 씀). */
  getScaffoldPlan: (missionId: string, planId: string) => Promise<ScaffoldPlan | undefined>;
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

  /**
   * 단일 append 창구 — storage에 커밋한 뒤 관측 훅(broadcast)을 친다. 모든 미션
   * 이벤트(create/append/verify/merge 및 후속 error-card/self-correction)가 이 경로를
   * 지나므로 trace 스트림이 한 곳에서 일관되게 흐른다. 훅 실패는 삼키되 로그만 남긴다.
   */
  async function commit(missionId: string, envelopes: EventEnvelope[]): Promise<void> {
    if (envelopes.length === 0) return;
    await deps.appendEvents(missionId, envelopes);
    if (deps.onEventsCommitted) {
      try {
        await deps.onEventsCommitted(missionId, envelopes);
      } catch (error) {
        console.warn(
          `[mission-store] onEventsCommitted hook failed for ${missionId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  /** checkpoint.id가 전역 유니크하므로 그것을 envelope id로 써서 dedup을 보장한다. */
  function checkpointEnvelope(checkpoint: MissionCheckpoint): EventEnvelope {
    return {
      id: `event_mission_checkpoint_created_${checkpoint.id}`,
      sessionId: checkpoint.missionId,
      type: "mission.checkpoint.created",
      payload: { missionId: checkpoint.missionId, checkpoint },
      createdAt: checkpoint.createdAt,
      source: "server",
      sourceTrust: "trusted",
      redacted: true,
    };
  }

  /**
   * L3: verify/merge 전 자동 checkpoint. created면 이벤트로 기록(observed sha),
   * skipped면 조용히 진행, failed면 정책에 따라 — critical(merge)은 작업 중단,
   * 비critical(verify)은 경고 후 진행. 자동 rollback은 절대 하지 않는다.
   */
  async function runAutoCheckpoint(missionId: string, reason: MissionCheckpointReason, critical: boolean): Promise<void> {
    if (!deps.autoCheckpoint) return;
    const outcome = await deps.autoCheckpoint(missionId, reason);
    if (outcome.status === "created") {
      await commit(missionId, [checkpointEnvelope(outcome.checkpoint)]);
      return;
    }
    if (outcome.status === "failed") {
      if (critical) {
        throw new MissionEventValidationError(`checkpoint(${reason}) 실패로 작업을 중단합니다: ${outcome.reason}`);
      }
      console.warn(`[mission-store] non-critical checkpoint(${reason}) failed for ${missionId}: ${outcome.reason}`);
    }
    // skipped → 이 배포엔 checkpoint가 적용되지 않음(allowlist 없음). 조용히 진행.
  }

  function errorCardEnvelope(card: SandboxErrorCard, verificationReportId: string): EventEnvelope {
    return {
      id: `event_mission_error_card_recorded_${card.id}`,
      sessionId: card.missionId,
      type: "mission.error_card.recorded",
      payload: { missionId: card.missionId, workerId: card.workerId, verificationReportId, errorCard: card },
      createdAt: card.createdAt,
      source: "server",
      sourceTrust: "trusted",
      redacted: true,
    };
  }

  function selfCorrectionEnvelope(record: MissionSelfCorrectionRecord, type: string): EventEnvelope {
    return {
      id: `event_${type.replaceAll(".", "_")}_${record.id}`,
      sessionId: record.missionId,
      type,
      payload: record,
      createdAt: record.createdAt,
      source: "server",
      sourceTrust: "trusted",
      redacted: true,
    };
  }

  function workspaceAttachedEnvelope(missionId: string, workspace: AppWorkspace): EventEnvelope {
    return {
      id: `event_mission_workspace_attached_${workspace.id}`,
      sessionId: missionId,
      type: "mission.workspace.attached",
      payload: { missionId, workspace },
      createdAt: workspace.createdAt,
      source: "server",
      sourceTrust: "trusted",
      redacted: true,
    };
  }

  let previewSeq = 0;
  function workspacePreviewEnvelope(missionId: string, workspaceId: string, preview: AppWorkspacePreview): EventEnvelope {
    // preview는 같은 워크스페이스에 여러 번 갱신되므로 seq로 유니크 id를 만든다(dedup 회피).
    return {
      id: `event_mission_workspace_preview_${workspaceId}_${previewSeq++}`,
      sessionId: missionId,
      type: "mission.workspace.preview.recorded",
      payload: { missionId, workspaceId, preview },
      createdAt: now(),
      source: "server",
      sourceTrust: "trusted",
      redacted: true,
    };
  }

  function visualQaRecordedEnvelope(missionId: string, report: VisualQaReport): EventEnvelope {
    return {
      id: `event_mission_visual_qa_recorded_${report.id}`,
      sessionId: missionId,
      type: "mission.visual_qa.recorded",
      payload: { missionId, report },
      createdAt: report.createdAt,
      source: "server",
      sourceTrust: "trusted",
      redacted: true,
    };
  }

  function designIssueRecordedEnvelope(missionId: string, issue: VisualQaReport["issues"][number]): EventEnvelope {
    return {
      id: `event_mission_design_issue_recorded_${issue.id}`,
      sessionId: missionId,
      type: "mission.design.issue.recorded",
      payload: { missionId, issue },
      createdAt: issue.createdAt,
      source: "server",
      sourceTrust: "trusted",
      redacted: true,
    };
  }

  function scaffoldPlannedEnvelope(missionId: string, plan: ScaffoldPlan): EventEnvelope {
    return {
      id: `event_mission_scaffold_planned_${plan.id}`,
      sessionId: missionId,
      type: "mission.scaffold.planned",
      payload: { missionId, plan },
      createdAt: plan.createdAt,
      source: "server",
      sourceTrust: "trusted",
      redacted: true,
    };
  }

  function scaffoldAppliedEnvelope(missionId: string, planId: string, result: ScaffoldApplyResult): EventEnvelope {
    return {
      id: `event_mission_scaffold_applied_${planId}_${result.appliedAt}`,
      sessionId: missionId,
      type: "mission.scaffold.applied",
      payload: { missionId, planId, result },
      createdAt: result.appliedAt,
      source: "server",
      sourceTrust: "trusted",
      redacted: true,
    };
  }

  function scaffoldOverlayRecordedEnvelope(missionId: string, overlay: ScaffoldOverlay): EventEnvelope {
    return {
      id: `event_mission_scaffold_overlay_recorded_${overlay.id}`,
      sessionId: missionId,
      type: "mission.scaffold.overlay.recorded",
      payload: { missionId, overlay },
      createdAt: overlay.createdAt,
      source: "server",
      sourceTrust: "trusted",
      redacted: true,
    };
  }

  function designBlueprintRecordedEnvelope(missionId: string, blueprint: DesignBlueprint): EventEnvelope {
    return {
      id: `event_mission_design_blueprint_recorded_${blueprint.id}`,
      sessionId: missionId,
      type: "mission.design.blueprint.recorded",
      payload: { missionId, blueprint },
      createdAt: blueprint.createdAt,
      source: "server",
      sourceTrust: "trusted",
      redacted: true,
    };
  }

  function plannedArtifactEnvelope(missionId: string, artifact: MissionArtifactRef): EventEnvelope {
    return {
      id: `event_mission_artifact_attached_${artifact.id}`,
      sessionId: missionId,
      type: "mission.artifact.attached",
      payload: { missionId, artifact },
      createdAt: artifact.createdAt,
      source: "server",
      sourceTrust: "trusted",
      redacted: true,
    };
  }

  function skillCandidateCreatedEnvelope(missionId: string, candidate: SkillArchiveCandidate): EventEnvelope {
    return {
      id: `event_memory_skill_candidate_created_${candidate.id}`,
      sessionId: missionId,
      type: "memory.skill_candidate.created",
      payload: { missionId, candidate },
      createdAt: candidate.createdAt,
      source: "server",
      sourceTrust: "trusted",
      redacted: true,
    };
  }

  function skillCuratedEnvelope(
    missionId: string,
    candidateId: string,
    decision: CuratorDecision,
    trustStatus: SkillArchiveCandidate["trustStatus"],
  ): EventEnvelope {
    return {
      id: `event_memory_skill_candidate_curated_${candidateId}_${decision}`,
      sessionId: missionId,
      type: "memory.skill_candidate.curated",
      payload: { missionId, candidateId, decision, trustStatus },
      createdAt: now(),
      source: "server",
      sourceTrust: "trusted",
      redacted: true,
    };
  }

  /** 마지막 observed pass 시각 — self-correction 카운터를 통과 시점에 reset하기 위함. */
  function lastObservedPassAt(record: ServerMissionRecord): string | undefined {
    const passes = record.verificationReports
      .filter((report) => report.observed && report.status === "passed")
      .map((report) => report.createdAt)
      .sort();
    return passes.at(-1);
  }

  /**
   * L4+L5: 검증이 실패/blocked면 (1) 결정적 파서로 구조화 에러 카드를 만들어 기록하고,
   * (2) bounded self-correction을 **제안만** 한다(파일 변경 절대 없음). passed면 아무것도
   * 하지 않는다 → 자동으로 루프가 reset된다.
   */
  async function reactToVerification(input: {
    missionId: string;
    existing: ServerMissionRecord; // verify 직전 스냅샷(이전 에러카드/검증 포함)
    verifierAgentId: string;
    verifierRole: string;
    report: VerificationReport;
  }): Promise<void> {
    const { missionId, existing, report } = input;
    if (report.status !== "failed" && report.status !== "blocked") return;

    // L4 — 실패/skip check의 summary를 stderr로 모아 결정적 파서에 넣는다(raw secret 금지:
    // summary는 이미 preview, 카드도 redacted preview만 보관).
    const failingChecks = report.checks.filter((check) => check.status === "failed" || check.status === "skipped");
    const stderr = failingChecks.map((check) => check.summary).join("\n");
    const card = parseSandboxError({
      id: `errorcard_${report.id}`,
      missionId,
      workerId: input.verifierAgentId,
      runnerKind: deps.verificationRunnerKind?.() ?? "local",
      status: report.status === "blocked" ? "blocked" : "failed",
      stderr,
      relatedCheckId: failingChecks[0]?.id,
      // 실측 실행(observed)에서 난 에러만 observed, blocked(미실행)는 configured
      truthStatus: report.observed ? "observed" : "configured",
      now,
    });
    await commit(missionId, [errorCardEnvelope(card, report.id)]);

    // L5 — reset-on-pass: 마지막 observed pass 이후의 에러 카드만 prior로 센다.
    const lastPass = lastObservedPassAt(existing);
    const priorSignatures = (existing.errorCards ?? [])
      .filter((prior) => !lastPass || prior.createdAt > lastPass)
      .map((prior) => sandboxErrorSignature(prior));
    const decision = decideSelfCorrection({
      priorErrorSignatures: priorSignatures,
      currentErrorSignature: sandboxErrorSignature(card),
      workerRole: input.verifierRole,
    });
    const correction: MissionSelfCorrectionRecord = {
      id: `selfcorrection_${report.id}`,
      missionId,
      workerId: input.verifierAgentId,
      errorCardId: card.id,
      attempt: decision.attempt,
      action: decision.action,
      directive: decision.action === "retry" ? card.directive : undefined,
      reason: decision.reason,
      createdAt: now(),
    };
    const type = decision.action === "retry" ? "mission.self_correction.suggested" : "mission.self_correction.stopped";
    await commit(missionId, [selfCorrectionEnvelope(correction, type)]);
  }

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
      await commit(request.id, envelopes);
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
          if (parsed.data.missionId !== missionId || parsed.data.artifact.missionId !== missionId) {
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

      await commit(missionId, [envelope({ missionId, type: request.type, payload, seq, createdAt })]);
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

      // L3: 검증 전 자동 checkpoint(비critical — 실패해도 검증은 진행).
      await runAutoCheckpoint(missionId, "before_verification", false);

      const report = await deps.runVerification({
        commands: request.commands,
        missionId,
        verifierAgentId: verifier.agentId,
        verifierCapabilityMode: verifier.capability.mode,
        reportId: `verify_${missionId}_${nextNonce()}`,
      });
      // 같은 정직성 정책을 한 번 더 통과 (LocalSandboxRunner가 이미 정직하지만 이중 방어)
      const normalized = normalizeVerificationReport(report);
      const createdAt = now();
      const seq = existing.workers.length + existing.artifacts.length + existing.verificationReports.length + 1;
      await commit(missionId, [
        envelope({
          missionId,
          type: "mission.verification.recorded",
          payload: { missionId, report: normalized.report, observedDowngraded: normalized.observedDowngraded },
          seq,
          createdAt,
        }),
      ]);
      // L4+L5: 실패면 에러 카드 + bounded self-correction 제안(제안만, 파일 변경 없음).
      await reactToVerification({
        missionId,
        existing,
        verifierAgentId: verifier.agentId,
        verifierRole: verifier.role,
        report: normalized.report,
      });
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

      // L3: 머지 전 자동 checkpoint(critical — 적용 대상인데 실패하면 머지를 중단해
      // 되돌릴 지점 없는 머지를 막는다). skipped(미적용 배포)면 그대로 진행.
      await runAutoCheckpoint(missionId, "before_merge", true);

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
      await commit(missionId, envelopes);

      // L6: real merge면 skill candidate(suggested)를 자동 생성해 curator queue에 넣는다.
      // deriveSkillCandidatesFromMission은 merged 미션에서만 후보를 만든다(실패 미션은
      // 자동 생성 0). 자동 trusted 승격은 없다 — curator가 승인해야 한다.
      if (result.status === "merged") {
        const mergedRecord = await get(missionId);
        if (mergedRecord) {
          const candidates = deriveSkillCandidatesFromMission(mergedRecord, now);
          if (candidates.length > 0) {
            await commit(
              missionId,
              candidates.map((candidate) => skillCandidateCreatedEnvelope(missionId, candidate)),
            );
          }
        }
      }
      return get(missionId);
    },

    async skills(missionId) {
      if (!(await get(missionId))) return undefined;
      const events = await deps.loadEvents();
      const memoryEvents = events.filter(
        (event) => event.sessionId === missionId && event.type.startsWith("memory.skill_candidate."),
      );
      return deriveSkillArchiveQueue(memoryEvents);
    },

    async curateSkill(missionId, candidateId, decision) {
      if (!(await get(missionId))) return undefined;
      const events = await deps.loadEvents();
      const memoryEvents = events.filter(
        (event) => event.sessionId === missionId && event.type.startsWith("memory.skill_candidate."),
      );
      const candidate = deriveSkillArchiveQueue(memoryEvents).find((entry) => entry.id === candidateId);
      if (!candidate) return undefined;
      const updated = applyCuratorDecision(candidate, decision);
      await commit(missionId, [skillCuratedEnvelope(missionId, candidateId, decision, updated.trustStatus)]);
      // 승인(approved/pinned)된 것만 export — curator 승인 없이는 절대 export 안 함.
      if (isExportableSkill(updated) && deps.exportApprovedSkill) {
        try {
          await deps.exportApprovedSkill(updated);
        } catch (error) {
          console.warn(
            `[mission-store] skill export failed for ${candidateId}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
      return updated;
    },

    async attachWorkspace(missionId, request) {
      if (!(await get(missionId))) return undefined;
      const workspace = buildAppWorkspace(request, {
        id: `workspace_${missionId}_${nextNonce()}`,
        missionId,
        now,
      });
      await commit(missionId, [workspaceAttachedEnvelope(missionId, workspace)]);
      return get(missionId);
    },

    async attachDesignBlueprint(missionId, blueprintInput) {
      if (!(await get(missionId))) return undefined;
      const blueprint = finalizeDesignBlueprint(blueprintInput, {
        id: `blueprint_${missionId}_${nextNonce()}`,
        missionId,
        now,
      });
      // 청사진 이벤트 + 화면/수용기준 planned 아티팩트(초안 예정 — 외부 발송 없음)
      const artifacts = plannedArtifactsFromBlueprint(blueprint, missionId, now);
      await commit(missionId, [
        designBlueprintRecordedEnvelope(missionId, blueprint),
        ...artifacts.map((artifact) => plannedArtifactEnvelope(missionId, artifact)),
      ]);
      const mission = await get(missionId);
      return mission ? { mission, blueprint } : undefined;
    },

    async recordPreview(missionId, workspaceId, preview) {
      const existing = await get(missionId);
      if (!existing || !existing.workspaces.some((ws) => ws.id === workspaceId)) return undefined;
      await commit(missionId, [workspacePreviewEnvelope(missionId, workspaceId, preview)]);
      return get(missionId);
    },

    async recordVisualQa(missionId, report) {
      if (!(await get(missionId))) return undefined;
      if (report.missionId !== missionId || !report.issues.every((issue) => issue.missionId === missionId)) {
        throw new MissionEventValidationError("visual QA report missionId mismatch");
      }
      // 리포트 + 이슈를 각각 별도 이벤트로 — snapshot/stream trace가 일치한다.
      await commit(missionId, [
        visualQaRecordedEnvelope(missionId, report),
        ...report.issues.map((issue) => designIssueRecordedEnvelope(missionId, issue)),
      ]);
      return get(missionId);
    },

    async recordScaffoldPlan(missionId, plan) {
      if (!(await get(missionId))) return undefined;
      if (plan.missionId !== missionId) {
        throw new MissionEventValidationError("scaffold plan missionId mismatch");
      }
      await commit(missionId, [scaffoldPlannedEnvelope(missionId, plan)]);
      return get(missionId);
    },

    async recordScaffoldOverlay(missionId, overlay) {
      if (!(await get(missionId))) return undefined;
      if (overlay.missionId !== missionId) {
        throw new MissionEventValidationError("scaffold overlay missionId mismatch");
      }
      await commit(missionId, [scaffoldOverlayRecordedEnvelope(missionId, overlay)]);
      return get(missionId);
    },

    async recordScaffoldApply(missionId, planId, result) {
      const existing = await get(missionId);
      if (!existing || !existing.scaffoldPlans.some((p) => p.id === planId)) return undefined;
      await commit(missionId, [scaffoldAppliedEnvelope(missionId, planId, result)]);
      return get(missionId);
    },

    async getScaffoldPlan(missionId, planId) {
      const record = await get(missionId);
      return record?.scaffoldPlans.find((p) => p.id === planId);
    },
  };
}
