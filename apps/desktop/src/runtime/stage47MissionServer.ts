import type {
  AppWorkspaceAttachRequest,
  AppWorkspacePreview,
  ConversationBlueprintDraftRequest,
  ConversationBlueprintDraftResponse,
  CuratorDecision,
  MissionCheckpoint,
  MissionCheckpointCreateRequest,
  MissionCreateRequest,
  MissionEventAppendRequest,
  MissionFromBlueprintRequest,
  MissionFromDebateRequest,
  MissionFromTemplateRequest,
  MissionKanbanBoard,
  MissionMergeRequest,
  MissionTraceEvent,
  MissionVerifyRequest,
  PreviewProbeRequest,
  MissionScaffoldLatestResponse,
  MissionScaffoldOverlayResponse,
  MissionScaffoldOverlayRequest,
  MissionPreviewRunScaffoldResponse,
  ScaffoldApplyResult,
  ScaffoldPlan,
  ScaffoldPlanRequest,
  ServerMissionRecord,
  SkillArchiveCandidate,
  VisualQaReport,
} from "@ai-orchestrator/protocol";
import { resolveDgxServerBaseUrls } from "./stage30DgxEndpoints";
import { createDgxOrchestratorJsonHeaders } from "./stage31DgxAuth";

/**
 * Stage 47 — Mission 서버 클라이언트.
 *
 * 서버 event storage에 영속화된 미션 인덱스(/missions)를 읽고, 검증 리포트·
 * 머지 큐 항목을 append한다. stage33/34와 같은 관용구: baseUrl 후보 순회 +
 * AbortController 타임아웃 + HMAC/Bearer 헤더(stage31).
 */

export type MissionListResponse = { missions: ServerMissionRecord[] };
export type MissionResponse = { mission: ServerMissionRecord };

type MissionServerRequestInput = {
  serverBaseUrl?: string | string[];
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

export async function fetchDgxMissions({
  serverBaseUrl,
  fetchImpl = fetch,
  timeoutMs = 3_000,
}: MissionServerRequestInput = {}): Promise<MissionListResponse> {
  return requestMissionServerJson<MissionListResponse>({
    method: "GET",
    path: "/missions",
    serverBaseUrl,
    fetchImpl,
    timeoutMs,
  });
}

export async function fetchDgxMission({
  missionId,
  serverBaseUrl,
  fetchImpl = fetch,
  timeoutMs = 3_000,
}: MissionServerRequestInput & { missionId: string }): Promise<MissionResponse> {
  return requestMissionServerJson<MissionResponse>({
    method: "GET",
    path: `/missions/${encodeURIComponent(missionId)}`,
    serverBaseUrl,
    fetchImpl,
    timeoutMs,
  });
}

export async function createDgxMission({
  request,
  serverBaseUrl,
  fetchImpl = fetch,
  timeoutMs = 5_000,
}: MissionServerRequestInput & { request: MissionCreateRequest }): Promise<MissionResponse> {
  return requestMissionServerJson<MissionResponse>({
    method: "POST",
    path: "/missions",
    body: request,
    serverBaseUrl,
    fetchImpl,
    timeoutMs,
  });
}

export async function appendDgxMissionEvent({
  missionId,
  request,
  serverBaseUrl,
  fetchImpl = fetch,
  timeoutMs = 5_000,
}: MissionServerRequestInput & { missionId: string; request: MissionEventAppendRequest }): Promise<MissionResponse> {
  return requestMissionServerJson<MissionResponse>({
    method: "POST",
    path: `/missions/${encodeURIComponent(missionId)}/events`,
    body: request,
    serverBaseUrl,
    fetchImpl,
    timeoutMs,
  });
}

export async function verifyDgxMission({
  missionId,
  request,
  serverBaseUrl,
  fetchImpl = fetch,
  timeoutMs = 200_000,
}: MissionServerRequestInput & { missionId: string; request: MissionVerifyRequest }): Promise<MissionResponse> {
  // 서버가 실제 검증 명령을 실행하므로 타임아웃이 길다 (pnpm test 등)
  return requestMissionServerJson<MissionResponse>({
    method: "POST",
    path: `/missions/${encodeURIComponent(missionId)}/verify`,
    body: request,
    serverBaseUrl,
    fetchImpl,
    timeoutMs,
  });
}

export async function mergeDgxMission({
  missionId,
  request,
  serverBaseUrl,
  fetchImpl = fetch,
  timeoutMs = 10_000,
}: MissionServerRequestInput & { missionId: string; request: MissionMergeRequest }): Promise<MissionResponse> {
  return requestMissionServerJson<MissionResponse>({
    method: "POST",
    path: `/missions/${encodeURIComponent(missionId)}/merge`,
    body: request,
    serverBaseUrl,
    fetchImpl,
    timeoutMs,
  });
}

// ── Coding/Design OS surfacing (live server engines → desktop client seam) ───
// 감사(docs/85)에서 데스크톱이 소비 안 하던 live 엔드포인트들의 클라이언트 래퍼.
// UI 대수술 없이 소비 seam만 — 패널은 후속.

export type MissionKanbanResponse = { board: MissionKanbanBoard };
export type MissionTraceResponse = { trace: MissionTraceEvent[] };
export type MissionSkillsResponse = { candidates: SkillArchiveCandidate[] };
export type MissionSkillCurateResponse = { candidate: SkillArchiveCandidate };
export type MissionPreviewResponse = { mission: ServerMissionRecord; preview: AppWorkspacePreview };

/** L1/PR1: Kanban 보드(materialized missions → 컬럼) */
export async function fetchDgxMissionKanban({
  serverBaseUrl,
  fetchImpl = fetch,
  timeoutMs = 3_000,
}: MissionServerRequestInput = {}): Promise<MissionKanbanResponse> {
  return requestMissionServerJson<MissionKanbanResponse>({ method: "GET", path: "/missions/kanban", serverBaseUrl, fetchImpl, timeoutMs });
}

/** L1/PR1: 한 미션의 redacted 라이프사이클 trace(폴링) */
export async function fetchDgxMissionTrace({
  missionId,
  serverBaseUrl,
  fetchImpl = fetch,
  timeoutMs = 3_000,
}: MissionServerRequestInput & { missionId: string }): Promise<MissionTraceResponse> {
  return requestMissionServerJson<MissionTraceResponse>({ method: "GET", path: `/missions/${encodeURIComponent(missionId)}/trace`, serverBaseUrl, fetchImpl, timeoutMs });
}

/** L6: skill candidate curator queue */
export async function fetchDgxMissionSkills({
  missionId,
  serverBaseUrl,
  fetchImpl = fetch,
  timeoutMs = 3_000,
}: MissionServerRequestInput & { missionId: string }): Promise<MissionSkillsResponse> {
  return requestMissionServerJson<MissionSkillsResponse>({ method: "GET", path: `/missions/${encodeURIComponent(missionId)}/skills`, serverBaseUrl, fetchImpl, timeoutMs });
}

/** L6: curator 결정(approve/reject/pin) */
export async function curateDgxMissionSkill({
  missionId,
  candidateId,
  decision,
  serverBaseUrl,
  fetchImpl = fetch,
  timeoutMs = 5_000,
}: MissionServerRequestInput & { missionId: string; candidateId: string; decision: CuratorDecision }): Promise<MissionSkillCurateResponse> {
  return requestMissionServerJson<MissionSkillCurateResponse>({
    method: "POST",
    path: `/missions/${encodeURIComponent(missionId)}/skills/${encodeURIComponent(candidateId)}/curate`,
    body: { decision },
    serverBaseUrl,
    fetchImpl,
    timeoutMs,
  });
}

/** D2: App Workspace 붙이기 */
export async function attachDgxWorkspace({
  missionId,
  request,
  serverBaseUrl,
  fetchImpl = fetch,
  timeoutMs = 5_000,
}: MissionServerRequestInput & { missionId: string; request: AppWorkspaceAttachRequest }): Promise<MissionResponse> {
  return requestMissionServerJson<MissionResponse>({ method: "POST", path: `/missions/${encodeURIComponent(missionId)}/workspace`, body: request, serverBaseUrl, fetchImpl, timeoutMs });
}

/** D4: preview 포트 probe(observed는 실제 바인딩 시만) */
export async function probeDgxPreview({
  missionId,
  workspaceId,
  request = {},
  serverBaseUrl,
  fetchImpl = fetch,
  timeoutMs = 5_000,
}: MissionServerRequestInput & { missionId: string; workspaceId: string; request?: Partial<PreviewProbeRequest> }): Promise<MissionPreviewResponse> {
  return requestMissionServerJson<MissionPreviewResponse>({
    method: "POST",
    path: `/missions/${encodeURIComponent(missionId)}/workspace/${encodeURIComponent(workspaceId)}/preview`,
    body: request,
    serverBaseUrl,
    fetchImpl,
    timeoutMs,
  });
}

/** D5a: preview dev 프로세스 start(observed running은 실제 포트 서빙 관측 시만) */
export async function startDgxPreview({
  missionId,
  workspaceId,
  request = {},
  serverBaseUrl,
  fetchImpl = fetch,
  timeoutMs = 30_000,
}: MissionServerRequestInput & { missionId: string; workspaceId: string; request?: { command?: string; host?: string; port?: number } }): Promise<MissionPreviewResponse> {
  // 서버가 dev 프로세스를 띄우고 포트가 뜰 때까지 probe하므로 타임아웃이 길다.
  return requestMissionServerJson<MissionPreviewResponse>({
    method: "POST",
    path: `/missions/${encodeURIComponent(missionId)}/workspace/${encodeURIComponent(workspaceId)}/preview/start`,
    body: request,
    serverBaseUrl,
    fetchImpl,
    timeoutMs,
  });
}

/** D5a: preview dev 프로세스 stop */
export async function stopDgxPreview({
  missionId,
  workspaceId,
  serverBaseUrl,
  fetchImpl = fetch,
  timeoutMs = 5_000,
}: MissionServerRequestInput & { missionId: string; workspaceId: string }): Promise<MissionPreviewResponse> {
  return requestMissionServerJson<MissionPreviewResponse>({
    method: "POST",
    path: `/missions/${encodeURIComponent(missionId)}/workspace/${encodeURIComponent(workspaceId)}/preview/stop`,
    body: {},
    serverBaseUrl,
    fetchImpl,
    timeoutMs,
  });
}

export type MissionScaffoldPlanResponse = { mission: ServerMissionRecord; plan: ScaffoldPlan };
export type MissionScaffoldApplyResponse = { mission?: ServerMissionRecord; result: ScaffoldApplyResult };

/** D7: 스캐폴드 plan(쓰기 없음 — 무엇이 생성/덮어쓰기될지) */
export async function planDgxScaffold({
  missionId,
  workspaceId,
  request,
  serverBaseUrl,
  fetchImpl = fetch,
  timeoutMs = 8_000,
}: MissionServerRequestInput & { missionId: string; workspaceId: string; request: ScaffoldPlanRequest }): Promise<MissionScaffoldPlanResponse> {
  return requestMissionServerJson<MissionScaffoldPlanResponse>({
    method: "POST",
    path: `/missions/${encodeURIComponent(missionId)}/workspace/${encodeURIComponent(workspaceId)}/scaffold/plan`,
    body: request,
    serverBaseUrl,
    fetchImpl,
    timeoutMs,
  });
}

/**
 * Publish Flow file prefill을 위한 read-only fetcher. 서버가 mission의 가장 최근 scaffold plan에서
 * 결정적으로 path+content를 재생성해서 안전 파일만 반환한다. GitHub에는 쓰지 않는다.
 */
export async function fetchMissionScaffoldLatest({
  missionId,
  serverBaseUrl,
  fetchImpl = fetch,
  timeoutMs = 8_000,
}: MissionServerRequestInput & { missionId: string }): Promise<MissionScaffoldLatestResponse> {
  return requestMissionServerJson<MissionScaffoldLatestResponse>({
    method: "GET",
    path: `/missions/${encodeURIComponent(missionId)}/scaffold/latest`,
    serverBaseUrl,
    fetchImpl,
    timeoutMs,
  });
}

/**
 * AppFix overlay — Visual QA의 수정안을 사용자가 명시 클릭으로 적용. scaffold/latest가 새 파일을
 * 반환하게 만든다(GitHub write 0). 자동 적용 0 — 호출은 사용자 클릭 한 번에서만.
 */
export async function postDgxMissionScaffoldOverlay({
  missionId,
  request,
  serverBaseUrl,
  fetchImpl = fetch,
  timeoutMs = 15_000,
}: MissionServerRequestInput & { missionId: string; request: MissionScaffoldOverlayRequest }): Promise<MissionScaffoldOverlayResponse> {
  return requestMissionServerJson<MissionScaffoldOverlayResponse>({
    method: "POST",
    path: `/missions/${encodeURIComponent(missionId)}/scaffold/overlay`,
    body: request,
    serverBaseUrl,
    fetchImpl,
    timeoutMs,
  });
}

/**
 * Preview Run vertical — scaffold/latest 파일을 임시 디렉터리에 풀고 preview를 띄우는 단일 진입.
 * 자동 실행 절대 없음(사용자 클릭만). 실패는 outcome으로 정직하게 전달.
 */
export async function runDgxMissionPreviewScaffold({
  missionId,
  serverBaseUrl,
  fetchImpl = fetch,
  timeoutMs = 30_000,
  body = {},
}: MissionServerRequestInput & {
  missionId: string;
  body?: { command?: string; host?: string; port?: number; repoRootOverride?: string };
}): Promise<MissionPreviewRunScaffoldResponse> {
  return requestMissionServerJson<MissionPreviewRunScaffoldResponse>({
    method: "POST",
    path: `/missions/${encodeURIComponent(missionId)}/preview/run-scaffold`,
    body,
    serverBaseUrl,
    fetchImpl,
    timeoutMs,
  });
}

/** D7: 스캐폴드 apply(실제 쓰기 — overwrite는 approvalId 필요) */
export async function applyDgxScaffold({
  missionId,
  planId,
  approvalId,
  serverBaseUrl,
  fetchImpl = fetch,
  timeoutMs = 10_000,
}: MissionServerRequestInput & { missionId: string; planId: string; approvalId?: string }): Promise<MissionScaffoldApplyResponse> {
  return requestMissionServerJson<MissionScaffoldApplyResponse>({
    method: "POST",
    path: `/missions/${encodeURIComponent(missionId)}/scaffold/${encodeURIComponent(planId)}/apply`,
    body: { planId, approvalId },
    serverBaseUrl,
    fetchImpl,
    timeoutMs,
  });
}

export type MissionVisualQaResponse = { mission: ServerMissionRecord; report: VisualQaReport };

/** D5b: observed preview 위에서 Visual QA 실행(없으면 409). screenshot 없으면 skipped. */
export async function runDgxVisualQa({
  missionId,
  workspaceId,
  serverBaseUrl,
  fetchImpl = fetch,
  timeoutMs = 15_000,
}: MissionServerRequestInput & { missionId: string; workspaceId: string }): Promise<MissionVisualQaResponse> {
  return requestMissionServerJson<MissionVisualQaResponse>({
    method: "POST",
    path: `/missions/${encodeURIComponent(missionId)}/workspace/${encodeURIComponent(workspaceId)}/visual-qa`,
    body: {},
    serverBaseUrl,
    fetchImpl,
    timeoutMs,
  });
}

/**
 * 3순위: 대화 → DesignBlueprintInput 초안(검토 패널용). 미션을 만들지 않는다.
 * useAi=false(기본)면 결정적 stub만. useAi+provider/model이면 단발 LLM 보강(실패 시 stub 폴백).
 * AI 보강은 LLM 1콜이라 타임아웃을 길게(120s) 둔다.
 */
export async function createDgxBlueprintDraft({
  request,
  serverBaseUrl,
  fetchImpl = fetch,
  timeoutMs = 120_000,
}: MissionServerRequestInput & { request: ConversationBlueprintDraftRequest }): Promise<ConversationBlueprintDraftResponse> {
  return requestMissionServerJson<ConversationBlueprintDraftResponse>({ method: "POST", path: "/missions/blueprint-draft", body: request, serverBaseUrl, fetchImpl, timeoutMs });
}

/** D3: 디자인 청사진 → 디자인 미션 */
export async function createDgxMissionFromBlueprint({
  request,
  serverBaseUrl,
  fetchImpl = fetch,
  timeoutMs = 8_000,
}: MissionServerRequestInput & { request: MissionFromBlueprintRequest }): Promise<MissionResponse> {
  return requestMissionServerJson<MissionResponse>({ method: "POST", path: "/missions/from-blueprint", body: request, serverBaseUrl, fetchImpl, timeoutMs });
}

/** D6: 토론 결정 패킷 → 디자인 미션(실행 가능한 결정 없으면 400) */
export async function createDgxMissionFromDebate({
  request,
  serverBaseUrl,
  fetchImpl = fetch,
  timeoutMs = 8_000,
}: MissionServerRequestInput & { request: MissionFromDebateRequest }): Promise<MissionResponse> {
  return requestMissionServerJson<MissionResponse>({ method: "POST", path: "/missions/from-debate", body: request, serverBaseUrl, fetchImpl, timeoutMs });
}

/** L7: 템플릿 → 미션(현재는 보류 도메인이지만 seam은 둠) */
export async function createDgxMissionFromTemplate({
  request,
  serverBaseUrl,
  fetchImpl = fetch,
  timeoutMs = 8_000,
}: MissionServerRequestInput & { request: MissionFromTemplateRequest }): Promise<MissionResponse> {
  return requestMissionServerJson<MissionResponse>({ method: "POST", path: "/missions/from-template", body: request, serverBaseUrl, fetchImpl, timeoutMs });
}

export type ControlAvailabilityResponse = {
  runners: string[];
  defaults: { mode: string; thinking: string; toolPermission: string; runner: string };
};

/** D8: 컨트롤 스트립 가용성(runner는 서버 env에서 정직하게 파생 — 없으면 미노출). */
export async function fetchDgxControlAvailability({
  serverBaseUrl,
  fetchImpl = fetch,
  timeoutMs = 3_000,
}: MissionServerRequestInput = {}): Promise<ControlAvailabilityResponse> {
  return requestMissionServerJson<ControlAvailabilityResponse>({ method: "GET", path: "/controls/availability", serverBaseUrl, fetchImpl, timeoutMs });
}

/** L3/PR2: 수동 checkpoint(observed sha) */
export async function createDgxMissionCheckpoint({
  missionId,
  request,
  serverBaseUrl,
  fetchImpl = fetch,
  timeoutMs = 8_000,
}: MissionServerRequestInput & { missionId: string; request: MissionCheckpointCreateRequest }): Promise<{ checkpoint: MissionCheckpoint }> {
  return requestMissionServerJson<{ checkpoint: MissionCheckpoint }>({ method: "POST", path: `/missions/${encodeURIComponent(missionId)}/checkpoints`, body: request, serverBaseUrl, fetchImpl, timeoutMs });
}

async function requestMissionServerJson<TResponse>({
  body,
  fetchImpl,
  method,
  path,
  serverBaseUrl,
  timeoutMs,
}: {
  body?: unknown;
  fetchImpl: typeof fetch;
  method: "GET" | "POST";
  path: string;
  serverBaseUrl?: string | string[];
  timeoutMs: number;
}): Promise<TResponse> {
  const errors: string[] = [];

  for (const baseUrl of resolveDgxServerBaseUrls(serverBaseUrl)) {
    const endpoint = `${baseUrl}${path}`;
    // GET은 fetch body가 없지만, 서명은 빈 문자열 해시로 맞춘다 (stage34 관용구)
    const requestBody = body === undefined ? undefined : JSON.stringify(body);
    const controller = new AbortController();
    const timeoutId = globalThis.setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    try {
      const response = await fetchImpl(endpoint, {
        body: requestBody,
        headers: await createDgxOrchestratorJsonHeaders(method, path, endpoint, { body: requestBody ?? "" }),
        method,
        signal: controller.signal,
      });
      const rawText = await response.text();
      if (!response.ok) {
        throw new Error(`${endpoint} failed: ${response.status} ${rawText.slice(0, 180)}`);
      }

      return JSON.parse(rawText) as TResponse;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${baseUrl}: ${message}`);
    } finally {
      globalThis.clearTimeout(timeoutId);
    }
  }

  throw new Error(errors.join(" | ") || `DGX-02 mission endpoint unavailable: ${path}`);
}
