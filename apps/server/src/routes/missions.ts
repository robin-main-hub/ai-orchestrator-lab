import type { IncomingMessage } from "node:http";
import {
  appWorkspaceAttachRequestSchema,
  buildMissionCreateFromBlueprint,
  buildMissionCreateFromTemplate,
  deriveMissionKanbanBoard,
  deriveMissionTrace,
  derivePreviewPort,
  DESIGN_TEAM,
  findWorkflowTemplate,
  missingRequiredFields,
  missionFromBlueprintRequestSchema,
  previewFromProbe,
  previewProbeRequestSchema,
  missionCheckpointCreateRequestSchema,
  missionCreateRequestSchema,
  missionEventAppendRequestSchema,
  missionFromTemplateRequestSchema,
  missionMergeRequestSchema,
  missionRollbackRequestSchema,
  missionVerifyRequestSchema,
  plannedArtifactsFromTemplate,
  skillCurateRequestSchema,
  type MissionCheckpointCreateRequest,
  type MissionCreateRequest,
  type MissionEventAppendRequest,
  type AppWorkspaceAttachRequest,
  type MissionFromBlueprintRequest,
  type MissionFromTemplateRequest,
  type MissionRollbackOutcome,
  type MissionRollbackRequest,
  type ServerMissionRecord,
} from "@ai-orchestrator/protocol";
import type { CheckpointResult } from "../missions/gitCheckpointRunner.js";
import { MissionEventValidationError, type MissionStore } from "../missions/missionStore.js";

/**
 * Mission routes — 기존 tmux/approval route와 같은 DI 관용구.
 *
 *   POST /missions                    미션 생성(+초기 워커, capability 서버 재계산)
 *   GET  /missions                    materialized index 전체
 *   GET  /missions/:id                단일 미션
 *   POST /missions/:id/events         worker/artifact/verification/closed append
 *
 * append 창구를 /events 하나로 열어 route 폭발을 막는다.
 */
export type MissionRouteDependencies = {
  store: MissionStore;
  request: IncomingMessage;
  pathname: string;
  method?: string;
  readJsonBody: (request: IncomingMessage) => Promise<unknown>;
  isRequestBodyTooLargeError: (error: unknown) => error is { limit: number };
  respondJson: (statusCode: number, payload: unknown) => void;
  /** checkpoint/rollback 실행기 — index.ts에서 실제 git + allowlist + 승인검증으로 주입. 미주입이면 501. */
  runCheckpoint?: (missionId: string, req: MissionCheckpointCreateRequest) => Promise<CheckpointResult>;
  runRollback?: (missionId: string, req: MissionRollbackRequest) => Promise<MissionRollbackOutcome>;
  /** D4: preview 포트 실제 바인딩 probe(TCP). index.ts에서 net.connect로 주입. 미주입이면 501. */
  probePreview?: (input: { host: string; port: number }) => Promise<boolean>;
};

const MISSION_PATH = /^\/missions\/([^/]+)$/;
const MISSION_EVENTS_PATH = /^\/missions\/([^/]+)\/events$/;
const MISSION_VERIFY_PATH = /^\/missions\/([^/]+)\/verify$/;
const MISSION_MERGE_PATH = /^\/missions\/([^/]+)\/merge$/;
const MISSION_TRACE_PATH = /^\/missions\/([^/]+)\/trace$/;
const MISSION_CHECKPOINTS_PATH = /^\/missions\/([^/]+)\/checkpoints$/;
const MISSION_ROLLBACK_PATH = /^\/missions\/([^/]+)\/rollback$/;
const MISSION_SKILLS_PATH = /^\/missions\/([^/]+)\/skills$/;
const MISSION_SKILL_CURATE_PATH = /^\/missions\/([^/]+)\/skills\/([^/]+)\/curate$/;
const MISSION_WORKSPACE_PATH = /^\/missions\/([^/]+)\/workspace$/;
const MISSION_PREVIEW_PATH = /^\/missions\/([^/]+)\/workspace\/([^/]+)\/preview$/;

export async function handleMissionRoute({
  store,
  request,
  pathname,
  method,
  readJsonBody,
  isRequestBodyTooLargeError,
  respondJson,
  runCheckpoint,
  runRollback,
  probePreview,
}: MissionRouteDependencies): Promise<boolean> {
  if (pathname === "/missions" && method === "POST") {
    let payload: MissionCreateRequest;
    try {
      payload = missionCreateRequestSchema.parse(await readJsonBody(request));
    } catch (error) {
      if (isRequestBodyTooLargeError(error)) {
        respondJson(413, { error: "payload_too_large", limit: error.limit });
        return true;
      }
      respondJson(400, {
        error: "invalid_mission_create_payload",
        message: error instanceof Error ? error.message : String(error),
      });
      return true;
    }

    try {
      const mission = await store.create(payload);
      respondJson(201, { mission });
    } catch (error) {
      respondJson(500, {
        error: "mission_create_failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
    return true;
  }

  if (pathname === "/missions" && method === "GET") {
    const missions: ServerMissionRecord[] = await store.list();
    respondJson(200, { missions });
    return true;
  }

  // L7: 업무 템플릿 → 실제 Mission. 필수 입력 누락은 400(필드 목록), 미지정 템플릿은 404.
  // 산출물은 planned 아티팩트(초안 예정)로만 붙인다 — 외부 발송 없음.
  if (pathname === "/missions/from-template" && method === "POST") {
    let payload: MissionFromTemplateRequest;
    try {
      payload = missionFromTemplateRequestSchema.parse(await readJsonBody(request));
    } catch (error) {
      if (isRequestBodyTooLargeError(error)) {
        respondJson(413, { error: "payload_too_large", limit: error.limit });
        return true;
      }
      respondJson(400, { error: "invalid_mission_from_template_payload", message: error instanceof Error ? error.message : String(error) });
      return true;
    }
    const template = findWorkflowTemplate(payload.templateId);
    if (!template) {
      respondJson(404, { error: "workflow_template_not_found", templateId: payload.templateId });
      return true;
    }
    const missing = missingRequiredFields(template, payload.input);
    if (missing.length > 0) {
      respondJson(400, { error: "missing_required_fields", missingFields: missing });
      return true;
    }
    const missionId = payload.missionId ?? `mission_tpl_${template.id}_${Date.now()}`;
    const now = () => new Date().toISOString();
    try {
      let mission = await store.create(buildMissionCreateFromTemplate(template, payload.input, { missionId, createdBy: payload.createdBy }));
      const plannedArtifacts = plannedArtifactsFromTemplate(template, missionId, now);
      for (const artifact of plannedArtifacts) {
        const updated = await store.appendEvent(missionId, { type: "mission.artifact.attached", payload: { artifact } });
        if (updated) mission = updated;
      }
      respondJson(201, {
        mission,
        plannedArtifacts,
        missionPlan: template.missionPlan,
        verificationPlan: template.verificationPlan,
      });
    } catch (error) {
      respondJson(500, { error: "mission_from_template_failed", message: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }

  // Kanban view — materialized missions를 컬럼으로 파생(새 저장소 없음). /missions/:id GET보다 먼저.
  if (pathname === "/missions/kanban" && method === "GET") {
    const missions: ServerMissionRecord[] = await store.list();
    respondJson(200, { board: deriveMissionKanbanBoard(missions) });
    return true;
  }

  // Live trace — 한 미션의 mission.* 라이프사이클을 시간순 trace로 파생(redacted).
  const traceMatch = MISSION_TRACE_PATH.exec(pathname);
  if (traceMatch && method === "GET") {
    const missionId = decodeURIComponent(traceMatch[1]!);
    const mission = await store.get(missionId);
    if (!mission) {
      respondJson(404, { error: "mission_not_found", missionId });
      return true;
    }
    respondJson(200, { trace: deriveMissionTrace(mission) });
    return true;
  }

  // D3: 디자인 청사진 → 실제 디자인 Mission(DESIGN_TEAM 배정 + 화면 planned 아티팩트).
  if (pathname === "/missions/from-blueprint" && method === "POST") {
    let payload: MissionFromBlueprintRequest;
    try {
      payload = missionFromBlueprintRequestSchema.parse(await readJsonBody(request));
    } catch (error) {
      if (isRequestBodyTooLargeError(error)) {
        respondJson(413, { error: "payload_too_large", limit: error.limit });
        return true;
      }
      respondJson(400, { error: "invalid_mission_from_blueprint_payload", message: error instanceof Error ? error.message : String(error) });
      return true;
    }
    const missionId = payload.missionId ?? `mission_design_${Date.now()}`;
    try {
      await store.create(buildMissionCreateFromBlueprint(payload.blueprint, { missionId, createdBy: payload.createdBy }));
      const result = await store.attachDesignBlueprint(missionId, payload.blueprint);
      if (!result) {
        respondJson(500, { error: "mission_from_blueprint_failed", message: "blueprint attach did not materialize" });
        return true;
      }
      respondJson(201, {
        mission: result.mission,
        blueprint: result.blueprint,
        designTeam: DESIGN_TEAM,
        acceptanceCriteria: result.blueprint.acceptanceCriteria,
      });
    } catch (error) {
      respondJson(500, { error: "mission_from_blueprint_failed", message: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }

  const eventsMatch = MISSION_EVENTS_PATH.exec(pathname);
  if (eventsMatch && method === "POST") {
    const missionId = decodeURIComponent(eventsMatch[1]!);
    let payload: MissionEventAppendRequest;
    try {
      payload = missionEventAppendRequestSchema.parse(await readJsonBody(request));
    } catch (error) {
      if (isRequestBodyTooLargeError(error)) {
        respondJson(413, { error: "payload_too_large", limit: error.limit });
        return true;
      }
      respondJson(400, {
        error: "invalid_mission_event_payload",
        message: error instanceof Error ? error.message : String(error),
      });
      return true;
    }

    try {
      const mission = await store.appendEvent(missionId, payload);
      if (!mission) {
        respondJson(404, { error: "mission_not_found", missionId });
        return true;
      }
      respondJson(202, { mission });
    } catch (error) {
      if (error instanceof MissionEventValidationError) {
        respondJson(400, { error: "invalid_mission_event_payload", message: error.message });
        return true;
      }
      respondJson(500, {
        error: "mission_event_append_failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
    return true;
  }

  const verifyMatch = MISSION_VERIFY_PATH.exec(pathname);
  if (verifyMatch && method === "POST") {
    const missionId = decodeURIComponent(verifyMatch[1]!);
    let payload;
    try {
      payload = missionVerifyRequestSchema.parse(await readJsonBody(request));
    } catch (error) {
      if (isRequestBodyTooLargeError(error)) {
        respondJson(413, { error: "payload_too_large", limit: error.limit });
        return true;
      }
      respondJson(400, {
        error: "invalid_mission_verify_payload",
        message: error instanceof Error ? error.message : String(error),
      });
      return true;
    }
    try {
      const mission = await store.verify(missionId, payload);
      if (!mission) {
        respondJson(404, { error: "mission_not_found", missionId });
        return true;
      }
      respondJson(202, { mission });
    } catch (error) {
      if (error instanceof MissionEventValidationError) {
        respondJson(400, { error: "mission_verify_rejected", message: error.message });
        return true;
      }
      respondJson(500, {
        error: "mission_verify_failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
    return true;
  }

  // 작업 전 snapshot — 현재 sha를 관측해 checkpoint로 보관(reset 안 함)
  const checkpointMatch = MISSION_CHECKPOINTS_PATH.exec(pathname);
  if (checkpointMatch && method === "POST") {
    const missionId = decodeURIComponent(checkpointMatch[1]!);
    if (!runCheckpoint) {
      respondJson(501, { error: "checkpoint_not_configured" });
      return true;
    }
    if (!(await store.get(missionId))) {
      respondJson(404, { error: "mission_not_found", missionId });
      return true;
    }
    let payload: MissionCheckpointCreateRequest;
    try {
      payload = missionCheckpointCreateRequestSchema.parse(await readJsonBody(request));
    } catch (error) {
      if (isRequestBodyTooLargeError(error)) {
        respondJson(413, { error: "payload_too_large", limit: error.limit });
        return true;
      }
      respondJson(400, { error: "invalid_checkpoint_payload", message: error instanceof Error ? error.message : String(error) });
      return true;
    }
    const result = await runCheckpoint(missionId, payload);
    if (!result.ok) {
      respondJson(409, { error: "checkpoint_blocked", reason: result.reason });
      return true;
    }
    respondJson(201, { checkpoint: result.checkpoint });
    return true;
  }

  // rollback — grant된 approvalId가 있을 때만 reset --hard(자동 rollback 금지)
  const rollbackMatch = MISSION_ROLLBACK_PATH.exec(pathname);
  if (rollbackMatch && method === "POST") {
    const missionId = decodeURIComponent(rollbackMatch[1]!);
    if (!runRollback) {
      respondJson(501, { error: "rollback_not_configured" });
      return true;
    }
    if (!(await store.get(missionId))) {
      respondJson(404, { error: "mission_not_found", missionId });
      return true;
    }
    let payload: MissionRollbackRequest;
    try {
      payload = missionRollbackRequestSchema.parse(await readJsonBody(request));
    } catch (error) {
      if (isRequestBodyTooLargeError(error)) {
        respondJson(413, { error: "payload_too_large", limit: error.limit });
        return true;
      }
      respondJson(400, { error: "invalid_rollback_payload", message: error instanceof Error ? error.message : String(error) });
      return true;
    }
    const outcome = await runRollback(missionId, payload);
    const code = outcome.status === "completed" ? 200 : outcome.status === "blocked" ? 409 : 500;
    respondJson(code, { outcome });
    return true;
  }

  const mergeMatch = MISSION_MERGE_PATH.exec(pathname);
  if (mergeMatch && method === "POST") {
    const missionId = decodeURIComponent(mergeMatch[1]!);
    let payload;
    try {
      payload = missionMergeRequestSchema.parse(await readJsonBody(request));
    } catch (error) {
      if (isRequestBodyTooLargeError(error)) {
        respondJson(413, { error: "payload_too_large", limit: error.limit });
        return true;
      }
      respondJson(400, {
        error: "invalid_mission_merge_payload",
        message: error instanceof Error ? error.message : String(error),
      });
      return true;
    }
    try {
      const mission = await store.merge(missionId, payload);
      if (!mission) {
        respondJson(404, { error: "mission_not_found", missionId });
        return true;
      }
      respondJson(202, { mission });
    } catch (error) {
      if (error instanceof MissionEventValidationError) {
        respondJson(400, { error: "mission_merge_rejected", message: error.message });
        return true;
      }
      respondJson(500, {
        error: "mission_merge_failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
    return true;
  }

  // L6: skill candidate curator queue — merged 미션이 남긴 suggested 후보들(읽기).
  const skillsMatch = MISSION_SKILLS_PATH.exec(pathname);
  if (skillsMatch && method === "GET") {
    const missionId = decodeURIComponent(skillsMatch[1]!);
    const candidates = await store.skills(missionId);
    if (!candidates) {
      respondJson(404, { error: "mission_not_found", missionId });
      return true;
    }
    respondJson(200, { candidates });
    return true;
  }

  // L6: curator 결정(approve/reject/pin) — 승인된 것만 export. 자동 trusted 승격 없음.
  const curateMatch = MISSION_SKILL_CURATE_PATH.exec(pathname);
  if (curateMatch && method === "POST") {
    const missionId = decodeURIComponent(curateMatch[1]!);
    const candidateId = decodeURIComponent(curateMatch[2]!);
    let payload;
    try {
      payload = skillCurateRequestSchema.parse(await readJsonBody(request));
    } catch (error) {
      if (isRequestBodyTooLargeError(error)) {
        respondJson(413, { error: "payload_too_large", limit: error.limit });
        return true;
      }
      respondJson(400, { error: "invalid_skill_curate_payload", message: error instanceof Error ? error.message : String(error) });
      return true;
    }
    const updated = await store.curateSkill(missionId, candidateId, payload.decision);
    if (!updated) {
      respondJson(404, { error: "skill_candidate_not_found", missionId, candidateId });
      return true;
    }
    respondJson(200, { candidate: updated });
    return true;
  }

  // D2: Mission에 App Workspace 붙이기(코딩/디자인 작업공간). preview는 아직 미시작(planned).
  const workspaceMatch = MISSION_WORKSPACE_PATH.exec(pathname);
  if (workspaceMatch && method === "POST") {
    const missionId = decodeURIComponent(workspaceMatch[1]!);
    let payload: AppWorkspaceAttachRequest;
    try {
      payload = appWorkspaceAttachRequestSchema.parse(await readJsonBody(request));
    } catch (error) {
      if (isRequestBodyTooLargeError(error)) {
        respondJson(413, { error: "payload_too_large", limit: error.limit });
        return true;
      }
      respondJson(400, { error: "invalid_workspace_payload", message: error instanceof Error ? error.message : String(error) });
      return true;
    }
    const mission = await store.attachWorkspace(missionId, payload);
    if (!mission) {
      respondJson(404, { error: "mission_not_found", missionId });
      return true;
    }
    respondJson(201, { mission });
    return true;
  }

  // D4: preview probe(probe-only) — deterministic 포트의 실제 바인딩을 관측해 기록한다.
  // observed는 바인딩 성공 시만(가짜 running 금지). dev 서버 spawn은 호출 측/후속 책임.
  const previewMatch = MISSION_PREVIEW_PATH.exec(pathname);
  if (previewMatch && method === "POST") {
    const missionId = decodeURIComponent(previewMatch[1]!);
    const workspaceId = decodeURIComponent(previewMatch[2]!);
    if (!probePreview) {
      respondJson(501, { error: "preview_probe_not_configured" });
      return true;
    }
    const mission = await store.get(missionId);
    const workspace = mission?.workspaces?.find((ws) => ws.id === workspaceId);
    if (!workspace) {
      respondJson(404, { error: "workspace_not_found", missionId, workspaceId });
      return true;
    }
    let payload;
    try {
      payload = previewProbeRequestSchema.parse(await readJsonBody(request));
    } catch (error) {
      if (isRequestBodyTooLargeError(error)) {
        respondJson(413, { error: "payload_too_large", limit: error.limit });
        return true;
      }
      respondJson(400, { error: "invalid_preview_payload", message: error instanceof Error ? error.message : String(error) });
      return true;
    }
    const port = payload.port ?? derivePreviewPort(workspaceId);
    const bound = await probePreview({ host: payload.host, port });
    const preview = previewFromProbe({ bound, host: payload.host, port });
    const updated = await store.recordPreview(missionId, workspaceId, preview);
    if (!updated) {
      respondJson(404, { error: "workspace_not_found", missionId, workspaceId });
      return true;
    }
    respondJson(200, { mission: updated, preview });
    return true;
  }

  const missionMatch = MISSION_PATH.exec(pathname);
  if (missionMatch && method === "GET") {
    const missionId = decodeURIComponent(missionMatch[1]!);
    const mission = await store.get(missionId);
    if (!mission) {
      respondJson(404, { error: "mission_not_found", missionId });
      return true;
    }
    respondJson(200, { mission });
    return true;
  }

  return false;
}
