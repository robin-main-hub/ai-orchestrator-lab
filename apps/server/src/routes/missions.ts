import type { IncomingMessage } from "node:http";
import {
  appWorkspaceAttachRequestSchema,
  buildBlueprintInputFromConversation,
  buildMissionCreateFromBlueprint,
  buildMissionCreateFromTemplate,
  buildScaffoldPlan,
  scaffoldForTemplate,
  conversationBlueprintDraftRequestSchema,
  conversationBlueprintDraftResponseSchema,
  CORE_WORKFLOW_TEMPLATES,
  debateDecisionToBlueprintInput,
  defaultPreviewCommandForAppType,
  deriveMissionKanbanBoard,
  deriveMissionTrace,
  derivePreviewPort,
  DESIGN_TEAM,
  findWorkflowTemplate,
  missingRequiredFields,
  missionFromBlueprintRequestSchema,
  missionFromDebateRequestSchema,
  previewFromProbe,
  previewProbeRequestSchema,
  previewStartRequestSchema,
  scaffoldApplyRequestSchema,
  scaffoldPlanRequestSchema,
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
  type AppWorkspacePreview,
  type ConversationBlueprintDraftRequest,
  type DesignBlueprintInput,
  type DesignTargetSurface,
  type MissionFromBlueprintRequest,
  type MissionFromDebateRequest,
  type ScaffoldApplyResult,
  type ScaffoldPlan,
  type VisualQaReport,
  type MissionFromTemplateRequest,
  type MissionRollbackOutcome,
  type MissionRollbackRequest,
  type ServerMissionRecord,
} from "@ai-orchestrator/protocol";
import type { CheckpointResult } from "../missions/gitCheckpointRunner.js";
import { MissionEventValidationError, type MissionStore } from "../missions/missionStore.js";
import { buildMissionScaffoldLatestResponse } from "../missions/scaffoldLatest.js";

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
  /** D5a: preview dev 프로세스 start/stop. index.ts에서 spawn+HTTP probe로 주입. 미주입이면 501. */
  startPreview?: (input: { missionId: string; workspaceId: string; command: string; cwd: string; host: string; port: number }) => Promise<AppWorkspacePreview>;
  stopPreview?: (input: { missionId: string; workspaceId: string }) => Promise<AppWorkspacePreview>;
  /** D5b: Visual QA 실행기(observed preview HTML/DOM 관측 → 리포트). 미주입이면 501. */
  runVisualQa?: (input: { missionId: string; workspaceId: string; previewUrl: string }) => Promise<VisualQaReport>;
  /** D7: 스캐폴드 plan(쓰기 없음)/apply(approval/checkpoint 뒤 쓰기). 미주입이면 501. */
  planScaffold?: (input: { missionId: string; workspaceId: string; templateId: string; input: Record<string, string | number>; repoRoot: string }) => Promise<{ ok: true; plan: ScaffoldPlan } | { ok: false; reason: string }>;
  applyScaffold?: (input: { plan: ScaffoldPlan; approvalId?: string }) => Promise<ScaffoldApplyResult>;
  /**
   * 3순위: "AI로 초안 채우기" — 단발 LLM으로 대화를 DesignBlueprintInput으로 보강한다.
   * index.ts에서 createDgxProviderCompletionResponse + JSON parse/validate로 주입. 어떤 이유로든
   * 실패(호출 실패·빈응답·JSON 파싱 실패·스키마 무효)면 **null**을 돌려 결정적 stub으로 폴백시킨다.
   * 미주입이면 AI 경로 자체가 비활성(stub-only). baseline은 결정적 stub(프롬프트 시드).
   */
  enrichBlueprintWithAi?: (input: {
    messages: ConversationBlueprintDraftRequest["messages"];
    draft?: string;
    targetSurface?: DesignTargetSurface;
    sessionId: string;
    providerProfileId: string;
    modelId: string;
    baseline: DesignBlueprintInput;
  }) => Promise<DesignBlueprintInput | null>;
  /** seed scaffold createdAt 등에 쓰는 시계. 미주입이면 Date 기반 기본. */
  now?: () => string;
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
const MISSION_PREVIEW_START_PATH = /^\/missions\/([^/]+)\/workspace\/([^/]+)\/preview\/start$/;
const MISSION_PREVIEW_STOP_PATH = /^\/missions\/([^/]+)\/workspace\/([^/]+)\/preview\/stop$/;
const MISSION_VISUAL_QA_PATH = /^\/missions\/([^/]+)\/workspace\/([^/]+)\/visual-qa$/;
const MISSION_SCAFFOLD_PLAN_PATH = /^\/missions\/([^/]+)\/workspace\/([^/]+)\/scaffold\/plan$/;
const MISSION_SCAFFOLD_APPLY_PATH = /^\/missions\/([^/]+)\/scaffold\/([^/]+)\/apply$/;
const MISSION_SCAFFOLD_LATEST_PATH = /^\/missions\/([^/]+)\/scaffold\/latest$/;

/** App Builder의 모든 blueprint 미션이 Publish Flow file prefill을 가질 수 있도록
 *  생성 직후 seed scaffold plan을 자동으로 남긴다.
 *
 *  정직성:
 *    - workspaceId/repoRootRef는 placeholder("<from-blueprint-seed>" 등) — 실제 fs apply는 아님.
 *      Publish Flow는 path+content만 읽으므로 placeholder가 노출돼도 위험 없음.
 *      추후 사용자가 workspace를 attach하고 명시적 scaffold/plan을 만들면 그게 latest로 덮인다.
 *    - templateId는 react_vite_app 고정(현 시점 generic 기본). blueprint에서 파생 로직은 별도 작업.
 *    - 실패해도 미션 생성은 막지 않는다(scaffold seed는 prefill 편의, 미션 본 흐름의 필수가 아님).
 */
async function seedBlueprintScaffold(input: {
  store: MissionStore;
  missionId: string;
  blueprintTitle: string;
  now: () => string;
}): Promise<void> {
  try {
    const templateId = "react_vite_app";
    const templateInput = { appName: input.blueprintTitle || "app" };
    const scaffold = scaffoldForTemplate(templateId, templateInput);
    if (scaffold.length === 0) return;
    const plan = buildScaffoldPlan({
      id: `plan_${input.missionId}_seed`,
      missionId: input.missionId,
      workspaceId: `workspace_seed_${input.missionId}`,
      templateId,
      templateInput,
      repoRootRef: "<from-blueprint-seed>",
      scaffold,
      existingPaths: new Set(),
      now: input.now,
    });
    await input.store.recordScaffoldPlan(input.missionId, plan);
  } catch {
    // 미션 본 흐름을 막지 않는다 — seed는 편의 기능.
  }
}

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
  startPreview,
  stopPreview,
  runVisualQa,
  planScaffold,
  applyScaffold,
  enrichBlueprintWithAi,
  now,
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
    // registry는 코어(generic 앱/디자인)뿐 — 회사 도메인 템플릿은 제품에서 제거됨.
    const template = findWorkflowTemplate(payload.templateId, CORE_WORKFLOW_TEMPLATES);
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

  // 3순위: 대화 → DesignBlueprintInput 초안(검토 패널용). 미션을 만들지 않는다 — 초안만 돌려준다.
  // 항상 결정적 stub을 먼저 만들고(안전망), useAi+provider/model이 있고 AI 보강기가 주입돼 있으면
  // 단발 LLM으로 보강을 시도한다. 실패하면 stub으로 폴백(200, source:"stub", degraded:true).
  // 정직성: AI 실패는 5xx가 아니라 200+stub — 패널은 항상 쓸 수 있는 초안을 받는다.
  if (pathname === "/missions/blueprint-draft" && method === "POST") {
    let payload: ConversationBlueprintDraftRequest;
    try {
      payload = conversationBlueprintDraftRequestSchema.parse(await readJsonBody(request));
    } catch (error) {
      if (isRequestBodyTooLargeError(error)) {
        respondJson(413, { error: "payload_too_large", limit: error.limit });
        return true;
      }
      respondJson(400, { error: "invalid_blueprint_draft_payload", message: error instanceof Error ? error.message : String(error) });
      return true;
    }
    const stub = buildBlueprintInputFromConversation({
      messages: payload.messages,
      draft: payload.draft,
      targetSurface: payload.targetSurface,
    });
    const wantsAi = payload.useAi && Boolean(payload.providerProfileId) && Boolean(payload.modelId);
    if (wantsAi && enrichBlueprintWithAi) {
      let ai: DesignBlueprintInput | null = null;
      try {
        ai = await enrichBlueprintWithAi({
          messages: payload.messages,
          draft: payload.draft,
          targetSurface: payload.targetSurface,
          sessionId: payload.sessionId,
          providerProfileId: payload.providerProfileId!,
          modelId: payload.modelId!,
          baseline: stub,
        });
      } catch {
        ai = null; // 어떤 실패든 stub으로 폴백(정직)
      }
      respondJson(
        200,
        conversationBlueprintDraftResponseSchema.parse(
          ai
            ? { blueprint: ai, source: "ai", degraded: false }
            : { blueprint: stub, source: "stub", degraded: true, note: "AI 초안 생성 실패 — 결정적 초안으로 대체했습니다" },
        ),
      );
      return true;
    }
    // AI를 원했지만 provider/model 미지정 또는 보강기 미주입이면 정직하게 stub(degraded로 표기).
    const degraded = payload.useAi === true;
    respondJson(
      200,
      conversationBlueprintDraftResponseSchema.parse(
        degraded
          ? { blueprint: stub, source: "stub", degraded: true, note: "AI 경로 미가용(모델/프로바이더 미지정 또는 미연결) — 결정적 초안" }
          : { blueprint: stub, source: "stub", degraded: false },
      ),
    );
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
      // sourceSessionId(대화→앱빌더 출처)를 미션·trace로 전달 — provenance.
      await store.create(buildMissionCreateFromBlueprint(payload.blueprint, { missionId, createdBy: payload.createdBy, sourceSessionId: payload.sourceSessionId }));
      const result = await store.attachDesignBlueprint(missionId, payload.blueprint);
      if (!result) {
        respondJson(500, { error: "mission_from_blueprint_failed", message: "blueprint attach did not materialize" });
        return true;
      }
      // Publish Flow file prefill을 위해 seed scaffold를 자동으로 남긴다(placeholder workspace).
      await seedBlueprintScaffold({ store, missionId, blueprintTitle: payload.blueprint.title, now: now ?? (() => new Date().toISOString()) });
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

  // D6: 토론 결정 패킷 → DesignBlueprint → 디자인 Mission(provenance debateId). 실행 가능한
  // 결정이 없으면 400(말잔치 금지).
  if (pathname === "/missions/from-debate" && method === "POST") {
    let payload: MissionFromDebateRequest;
    try {
      payload = missionFromDebateRequestSchema.parse(await readJsonBody(request));
    } catch (error) {
      if (isRequestBodyTooLargeError(error)) {
        respondJson(413, { error: "payload_too_large", limit: error.limit });
        return true;
      }
      respondJson(400, { error: "invalid_mission_from_debate_payload", message: error instanceof Error ? error.message : String(error) });
      return true;
    }
    const blueprintInput = debateDecisionToBlueprintInput(payload.packet, { targetSurface: payload.targetSurface as DesignTargetSurface | undefined });
    if (!blueprintInput) {
      respondJson(400, { error: "debate_not_actionable", message: "토론이 실행 가능한 결정(adoptedDecisions)을 내지 못해 Mission으로 승격할 수 없습니다" });
      return true;
    }
    const missionId = payload.missionId ?? `mission_debate_${Date.now()}`;
    try {
      await store.create(buildMissionCreateFromBlueprint(blueprintInput, { missionId, createdBy: payload.createdBy, debateId: payload.packet.debateId }));
      const result = await store.attachDesignBlueprint(missionId, blueprintInput);
      if (!result) {
        respondJson(500, { error: "mission_from_debate_failed", message: "blueprint attach did not materialize" });
        return true;
      }
      // from-blueprint와 동일 — Publish Flow file prefill용 seed scaffold.
      await seedBlueprintScaffold({ store, missionId, blueprintTitle: blueprintInput.title, now: now ?? (() => new Date().toISOString()) });
      respondJson(201, { mission: result.mission, blueprint: result.blueprint, debatePacket: payload.packet });
    } catch (error) {
      respondJson(500, { error: "mission_from_debate_failed", message: error instanceof Error ? error.message : String(error) });
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

  // D5a: preview dev 프로세스 start — 실제로 띄우고 포트 관측 성공 시에만 observed running.
  const previewStartMatch = MISSION_PREVIEW_START_PATH.exec(pathname);
  if (previewStartMatch && method === "POST") {
    const missionId = decodeURIComponent(previewStartMatch[1]!);
    const workspaceId = decodeURIComponent(previewStartMatch[2]!);
    if (!startPreview) {
      respondJson(501, { error: "preview_start_not_configured" });
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
      payload = previewStartRequestSchema.parse(await readJsonBody(request));
    } catch (error) {
      if (isRequestBodyTooLargeError(error)) {
        respondJson(413, { error: "payload_too_large", limit: error.limit });
        return true;
      }
      respondJson(400, { error: "invalid_preview_start_payload", message: error instanceof Error ? error.message : String(error) });
      return true;
    }
    const command = payload.command ?? defaultPreviewCommandForAppType(workspace.appType);
    const port = payload.port ?? derivePreviewPort(workspaceId);
    const preview = await startPreview({ missionId, workspaceId, command, cwd: workspace.repoRootRef, host: payload.host, port });
    const updated = await store.recordPreview(missionId, workspaceId, preview);
    respondJson(200, { mission: updated ?? mission, preview });
    return true;
  }

  // D5a: preview 프로세스 stop(멱등).
  const previewStopMatch = MISSION_PREVIEW_STOP_PATH.exec(pathname);
  if (previewStopMatch && method === "POST") {
    const missionId = decodeURIComponent(previewStopMatch[1]!);
    const workspaceId = decodeURIComponent(previewStopMatch[2]!);
    if (!stopPreview) {
      respondJson(501, { error: "preview_stop_not_configured" });
      return true;
    }
    const mission = await store.get(missionId);
    const workspace = mission?.workspaces?.find((ws) => ws.id === workspaceId);
    if (!workspace) {
      respondJson(404, { error: "workspace_not_found", missionId, workspaceId });
      return true;
    }
    const preview = await stopPreview({ missionId, workspaceId });
    const updated = await store.recordPreview(missionId, workspaceId, preview);
    respondJson(200, { mission: updated ?? mission, preview });
    return true;
  }

  // D5b: Visual QA — **observed running preview가 있을 때만** 실행. 없으면 409(가짜 QA 금지).
  const visualQaMatch = MISSION_VISUAL_QA_PATH.exec(pathname);
  if (visualQaMatch && method === "POST") {
    const missionId = decodeURIComponent(visualQaMatch[1]!);
    const workspaceId = decodeURIComponent(visualQaMatch[2]!);
    if (!runVisualQa) {
      respondJson(501, { error: "visual_qa_not_configured" });
      return true;
    }
    const mission = await store.get(missionId);
    const workspace = mission?.workspaces?.find((ws) => ws.id === workspaceId);
    if (!workspace) {
      respondJson(404, { error: "workspace_not_found", missionId, workspaceId });
      return true;
    }
    if (workspace.preview.status !== "running" || workspace.preview.truthStatus !== "observed") {
      respondJson(409, { error: "preview_not_observed", message: "Visual QA는 observed running preview가 필요합니다 (먼저 /preview/start)" });
      return true;
    }
    const previewUrl = workspace.preview.url ?? `http://127.0.0.1:${derivePreviewPort(workspaceId)}`;
    const report = await runVisualQa({ missionId, workspaceId, previewUrl });
    const updated = await store.recordVisualQa(missionId, report);
    respondJson(200, { mission: updated ?? mission, report });
    return true;
  }

  // D7: 스캐폴드 plan — 무엇이 생성/덮어쓰기될지 계산만(쓰기 없음, planned).
  const scaffoldPlanMatch = MISSION_SCAFFOLD_PLAN_PATH.exec(pathname);
  if (scaffoldPlanMatch && method === "POST") {
    const missionId = decodeURIComponent(scaffoldPlanMatch[1]!);
    const workspaceId = decodeURIComponent(scaffoldPlanMatch[2]!);
    if (!planScaffold) {
      respondJson(501, { error: "scaffold_not_configured" });
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
      payload = scaffoldPlanRequestSchema.parse(await readJsonBody(request));
    } catch (error) {
      if (isRequestBodyTooLargeError(error)) {
        respondJson(413, { error: "payload_too_large", limit: error.limit });
        return true;
      }
      respondJson(400, { error: "invalid_scaffold_plan_payload", message: error instanceof Error ? error.message : String(error) });
      return true;
    }
    const result = await planScaffold({ missionId, workspaceId, templateId: payload.templateId, input: payload.input, repoRoot: workspace.repoRootRef });
    if (!result.ok) {
      respondJson(409, { error: "scaffold_plan_blocked", reason: result.reason });
      return true;
    }
    const updated = await store.recordScaffoldPlan(missionId, result.plan);
    respondJson(201, { mission: updated ?? mission, plan: result.plan });
    return true;
  }

  // D7: 스캐폴드 apply — 실제 파일 기록(observed). overwrite는 approval, 적용 전 checkpoint.
  const scaffoldApplyMatch = MISSION_SCAFFOLD_APPLY_PATH.exec(pathname);
  if (scaffoldApplyMatch && method === "POST") {
    const missionId = decodeURIComponent(scaffoldApplyMatch[1]!);
    const planId = decodeURIComponent(scaffoldApplyMatch[2]!);
    if (!applyScaffold) {
      respondJson(501, { error: "scaffold_not_configured" });
      return true;
    }
    const plan = await store.getScaffoldPlan(missionId, planId);
    if (!plan) {
      respondJson(404, { error: "scaffold_plan_not_found", missionId, planId });
      return true;
    }
    let payload;
    try {
      payload = scaffoldApplyRequestSchema.parse(await readJsonBody(request));
    } catch (error) {
      if (isRequestBodyTooLargeError(error)) {
        respondJson(413, { error: "payload_too_large", limit: error.limit });
        return true;
      }
      respondJson(400, { error: "invalid_scaffold_apply_payload", message: error instanceof Error ? error.message : String(error) });
      return true;
    }
    const result = await applyScaffold({ plan, approvalId: payload.approvalId });
    const updated = await store.recordScaffoldApply(missionId, planId, result);
    const code = result.status === "applied" ? 200 : result.status === "blocked" ? 409 : 500;
    respondJson(code, { mission: updated, result });
    return true;
  }

  // Publish Flow file prefill — mission의 최신 scaffold plan에서 path+content를 재생성해
  // 안전 가드를 통과한 파일만 노출. GitHub에는 쓰지 않으며, plan의 truthStatus를 그대로 반영한다.
  // (W3a/W3b/W4 write 라우트와 분리 — 이건 read-only materialization.)
  const scaffoldLatestMatch = MISSION_SCAFFOLD_LATEST_PATH.exec(pathname);
  if (scaffoldLatestMatch && method === "GET") {
    const missionId = decodeURIComponent(scaffoldLatestMatch[1]!);
    const mission = await store.get(missionId);
    if (!mission) {
      respondJson(404, { error: "mission_not_found", missionId });
      return true;
    }
    const response = buildMissionScaffoldLatestResponse({
      missionId,
      plans: mission.scaffoldPlans ?? [],
    });
    respondJson(200, response);
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
