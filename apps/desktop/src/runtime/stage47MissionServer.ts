import type {
  MissionCreateRequest,
  MissionEventAppendRequest,
  ServerMissionRecord,
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
