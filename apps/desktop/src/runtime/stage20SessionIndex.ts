import type { EventStorageSessionIndexItem, EventStorageSessionIndexResponse } from "@ai-orchestrator/protocol";
import { resolveDgxServerBaseUrls } from "./stage30DgxEndpoints";
import { createDgxOrchestratorAuthHeaders } from "./stage31DgxAuth";

export type Stage20SessionIndexStatus = "loaded" | "empty" | "failed";

export type Stage20SessionIndexState = {
  status: Stage20SessionIndexStatus;
  sessions: EventStorageSessionIndexItem[];
  serverRevision?: number;
  lastLoadedAt?: string;
  error?: string;
};

export type Stage20SessionIndexInput = {
  serverBaseUrl?: string | string[];
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

export function createInitialSessionIndexState(): Stage20SessionIndexState {
  return {
    status: "empty",
    sessions: [],
  };
}

export async function fetchDgxSessionIndex({
  serverBaseUrl,
  fetchImpl = fetch,
  timeoutMs = 1_500,
}: Stage20SessionIndexInput = {}): Promise<Stage20SessionIndexState> {
  const errors: string[] = [];

  for (const baseUrl of resolveDgxServerBaseUrls(serverBaseUrl)) {
    const endpoint = `${baseUrl}/sessions`;

    try {
      const response = await fetchWithTimeout(fetchImpl, endpoint, timeoutMs);
      const rawText = await response.text();

      if (!response.ok) {
        throw new Error(`DGX-02 session index failed: ${response.status} ${rawText.slice(0, 240)}`);
      }

      const index = JSON.parse(rawText) as EventStorageSessionIndexResponse;

      return {
        status: index.sessions.length > 0 ? "loaded" : "empty",
        sessions: index.sessions,
        serverRevision: index.serverRevision,
        lastLoadedAt: index.createdAt,
      };
    } catch (error) {
      errors.push(`${baseUrl}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return {
    status: "failed",
    sessions: [],
    error: errors.join(" | ") || "DGX-02 session index unavailable",
  };
}

async function fetchWithTimeout(fetchImpl: typeof fetch, input: string, timeoutMs: number) {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    return await fetchImpl(input, {
      method: "GET",
      headers: await createDgxOrchestratorAuthHeaders("GET", "/sessions", input),
      signal: controller.signal,
    });
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}
