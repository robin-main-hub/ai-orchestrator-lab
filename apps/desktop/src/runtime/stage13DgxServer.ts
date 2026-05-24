import type {
  DgxHeartbeat,
  ModelDiscoverySnapshot,
  ProviderProfile,
  RuntimeSnapshot,
} from "@ai-orchestrator/protocol";
import { mergeDgxRuntimeSnapshot } from "./stage5Runtime";
import { DEFAULT_DGX_SERVER_BASE_URL, resolveDgxServerBaseUrls } from "./stage30DgxEndpoints";

type DgxServerHealthResponse = {
  service: "ai-orchestrator-dgx-server";
  status: "ok";
  runtime: RuntimeSnapshot;
  capabilities: string[];
  eventStorage?: DgxServerEventStorageSnapshot;
};

export type Stage13DgxServerProbeStatus = "online" | "unreachable";

export type DgxServerEventStorageSnapshot = {
  mode: "memory" | "jsonl";
  storageDir: string;
  eventLogPath: string;
  revision: number;
  eventCount: number;
  sessionCount: number;
  lastStoredAt?: string;
  loadedAt: string;
};

export type Stage13DgxServerProbe = {
  status: Stage13DgxServerProbeStatus;
  baseUrl: string;
  runtime: RuntimeSnapshot;
  heartbeat: DgxHeartbeat;
  modelDiscovery?: ModelDiscoverySnapshot;
  eventStorage?: DgxServerEventStorageSnapshot;
  error?: string;
  checkedAt: string;
  latencyMs?: number;
};

export type Stage13DgxServerProbeInput = {
  localRuntime: RuntimeSnapshot;
  serverBaseUrl?: string | string[];
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  checkedAt?: string;
};

export type Stage13ProviderModelDiscoveryInput = {
  provider: ProviderProfile;
  serverBaseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

export async function probeDgxOrchestratorServer({
  localRuntime,
  serverBaseUrl = DEFAULT_DGX_SERVER_BASE_URL,
  fetchImpl = fetch,
  timeoutMs = 1_500,
  checkedAt = new Date().toISOString(),
}: Stage13DgxServerProbeInput): Promise<Stage13DgxServerProbe> {
  const startedAt = Date.now();
  const errors: string[] = [];

  for (const baseUrl of resolveDgxServerBaseUrls(serverBaseUrl)) {
    try {
      const health = await fetchJson<DgxServerHealthResponse>(fetchImpl, `${baseUrl}/health`, timeoutMs);
      const heartbeat = await fetchJson<DgxHeartbeat>(fetchImpl, `${baseUrl}/heartbeat`, timeoutMs);
      const modelDiscovery = await fetchJson<ModelDiscoverySnapshot>(fetchImpl, `${baseUrl}/models`, timeoutMs);
      const runtime = mergeDgxRuntimeSnapshot(localRuntime, health.runtime);

      return {
        status: "online",
        baseUrl,
        runtime,
        heartbeat,
        modelDiscovery,
        eventStorage: health.eventStorage,
        checkedAt,
        latencyMs: Date.now() - startedAt,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${baseUrl}: ${message}`);
    }
  }

  {
    const baseUrl = resolveDgxServerBaseUrls(serverBaseUrl)[0] ?? DEFAULT_DGX_SERVER_BASE_URL;
    const message = errors.join(" | ") || "DGX-02 orchestrator server unavailable";
    const runtime = createUnreachableRuntime(localRuntime, checkedAt, message);

    return {
      status: "unreachable",
      baseUrl,
      runtime,
      heartbeat: {
        nodeId: "dgx-02",
        status: "unreachable",
        checkedAt,
        message: `dgx-02 orchestrator server unreachable: ${message}`,
      },
      error: message,
      checkedAt,
      latencyMs: Date.now() - startedAt,
    };
  }
}

export async function fetchDgxProviderModelDiscovery({
  provider,
  serverBaseUrl = DEFAULT_DGX_SERVER_BASE_URL,
  fetchImpl = fetch,
  timeoutMs = 1_500,
}: Stage13ProviderModelDiscoveryInput): Promise<ModelDiscoverySnapshot> {
  const baseUrl = serverBaseUrl.replace(/\/$/, "");
  const endpoint = `${baseUrl}/provider-models?providerProfileId=${encodeURIComponent(provider.id)}`;
  return fetchJson<ModelDiscoverySnapshot>(fetchImpl, endpoint, timeoutMs);
}

async function fetchJson<T>(fetchImpl: typeof fetch, url: string, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetchImpl(url, {
      headers: { "content-type": "application/json" },
      signal: controller.signal,
    });
    const rawText = await response.text();
    if (!response.ok) {
      throw new Error(`${url} failed: ${response.status} ${rawText.slice(0, 180)}`);
    }

    return JSON.parse(rawText) as T;
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

function createUnreachableRuntime(localRuntime: RuntimeSnapshot, checkedAt: string, error: string): RuntimeSnapshot {
  return {
    ...localRuntime,
    status: "degraded",
    dgxStatus: "offline",
    memorySyncStatus: "degraded",
    runtimeNodes: localRuntime.runtimeNodes.map((node) =>
      node.id === "dgx-02"
        ? {
            ...node,
            status: "offline",
          }
        : node,
    ),
    syncTopology: {
      ...localRuntime.syncTopology,
      clients: localRuntime.syncTopology.clients.map((client) =>
        client.syncRole === "authority" || client.id === "dgx-02"
          ? {
              ...client,
              status: "offline",
              lastSeenAt: checkedAt,
            }
          : client.failurePolicy === "unavailable_without_dgx"
            ? {
                ...client,
                status: "degraded",
                lastSeenAt: checkedAt,
              }
          : client,
      ),
    },
    recentError: `dgx-02:4317 unavailable; MacBook can continue with local model/outbox, Home PC degrades until DGX-02 authority returns. ${error}`,
    updatedAt: checkedAt,
  };
}
