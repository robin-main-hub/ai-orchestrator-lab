import type { EventStorageSessionIndexItem, EventStorageSessionIndexResponse } from "@ai-orchestrator/protocol";
import { DEFAULT_DGX_SERVER_BASE_URL } from "./stage30DgxEndpoints";

export type Stage20SessionIndexStatus = "loaded" | "empty" | "failed";

export type Stage20SessionIndexState = {
  status: Stage20SessionIndexStatus;
  sessions: EventStorageSessionIndexItem[];
  serverRevision?: number;
  lastLoadedAt?: string;
  error?: string;
};

export type Stage20SessionIndexInput = {
  serverBaseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

const DEFAULT_DGX_SESSION_INDEX_BASE_URL = DEFAULT_DGX_SERVER_BASE_URL;

export function createInitialSessionIndexState(): Stage20SessionIndexState {
  return {
    status: "empty",
    sessions: [],
  };
}

export async function fetchDgxSessionIndex({
  serverBaseUrl = DEFAULT_DGX_SESSION_INDEX_BASE_URL,
  fetchImpl = fetch,
  timeoutMs = 1_500,
}: Stage20SessionIndexInput = {}): Promise<Stage20SessionIndexState> {
  const endpoint = `${serverBaseUrl.replace(/\/$/, "")}/sessions`;

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
    return {
      status: "failed",
      sessions: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function fetchWithTimeout(fetchImpl: typeof fetch, input: string, timeoutMs: number) {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    return await fetchImpl(input, {
      method: "GET",
      signal: controller.signal,
    });
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}
