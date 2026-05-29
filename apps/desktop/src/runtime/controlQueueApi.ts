import type { WorkItem } from "@ai-orchestrator/protocol";
import { resolveDgxServerBaseUrls } from "./stage30DgxEndpoints";
import { createDgxOrchestratorJsonHeaders } from "./stage31DgxAuth";

type RequestInput = {
  serverBaseUrl?: string | string[];
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

type PostActionInput = RequestInput & {
  workItemId: string;
  action: string;
  payload?: any;
  sessionId?: string;
};

export async function fetchControlQueueItems({
  sessionId = "session_desktop_001",
  serverBaseUrl,
  fetchImpl = fetch,
  timeoutMs = 3_000,
}: RequestInput & { sessionId?: string } = {}): Promise<WorkItem[]> {
  return requestControlQueueJson<WorkItem[]>({
    method: "GET",
    path: `/control-queue/items?sessionId=${encodeURIComponent(sessionId)}`,
    serverBaseUrl,
    fetchImpl,
    timeoutMs,
  });
}

export async function submitControlQueueAction({
  workItemId,
  action,
  payload,
  sessionId = "session_desktop_001",
  serverBaseUrl,
  fetchImpl = fetch,
  timeoutMs = 5_000,
}: PostActionInput): Promise<{ success: boolean; nextStatus: string }> {
  return requestControlQueueJson<{ success: boolean; nextStatus: string }>({
    body: { workItemId, action, payload, sessionId },
    method: "POST",
    path: "/control-queue/action",
    serverBaseUrl,
    fetchImpl,
    timeoutMs,
  });
}

async function requestControlQueueJson<TResponse>({
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
    const controller = new AbortController();
    const timeoutId = globalThis.setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    try {
      const response = await fetchImpl(endpoint, {
        body: body === undefined ? undefined : JSON.stringify(body),
        headers: createDgxOrchestratorJsonHeaders(),
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

  throw new Error(errors.join(" | ") || `DGX-02 control-queue endpoint unavailable: ${path}`);
}
