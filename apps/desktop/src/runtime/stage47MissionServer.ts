import type {
  AppWorkspaceAttachRequest,
  AppWorkspacePreview,
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
