import type {
  DgxHeartbeat,
  ModelDiscoverySnapshot,
  RuntimeSnapshot,
} from "@ai-orchestrator/protocol";
import { mergeDgxRuntimeSnapshot } from "./stage5Runtime";

type DgxServerHealthResponse = {
  service: "ai-orchestrator-dgx-server";
  status: "ok";
  runtime: RuntimeSnapshot;
  capabilities: string[];
};

export type Stage13DgxServerProbeStatus = "online" | "unreachable";

export type Stage13DgxServerProbe = {
  status: Stage13DgxServerProbeStatus;
  baseUrl: string;
  runtime: RuntimeSnapshot;
  heartbeat: DgxHeartbeat;
  modelDiscovery?: ModelDiscoverySnapshot;
  error?: string;
  checkedAt: string;
  latencyMs?: number;
};

export type Stage13DgxServerProbeInput = {
  localRuntime: RuntimeSnapshot;
  serverBaseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  checkedAt?: string;
};

const DEFAULT_DGX_SERVER_BASE_URL = "http://dgx-02:4317";

export async function probeDgxOrchestratorServer({
  localRuntime,
  serverBaseUrl = DEFAULT_DGX_SERVER_BASE_URL,
  fetchImpl = fetch,
  timeoutMs = 1_500,
  checkedAt = new Date().toISOString(),
}: Stage13DgxServerProbeInput): Promise<Stage13DgxServerProbe> {
  const baseUrl = serverBaseUrl.replace(/\/$/, "");
  const startedAt = Date.now();

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
      checkedAt,
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const runtime = createUnreachableRuntime(localRuntime, checkedAt, message);

    return {
      status: "unreachable",
      baseUrl,
      runtime,
      heartbeat: {
        nodeId: localRuntime.syncTopology.authorityNodeId,
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
  const authorityNodeId = localRuntime.syncTopology.authorityNodeId;

  return {
    ...localRuntime,
    status: "degraded",
    dgxStatus: "offline",
    memorySyncStatus: "degraded",
    runtimeNodes: localRuntime.runtimeNodes.map((node) =>
      node.id === authorityNodeId
        ? {
            ...node,
            status: "offline",
          }
        : node,
    ),
    syncTopology: {
      ...localRuntime.syncTopology,
      clients: localRuntime.syncTopology.clients.map((client) =>
        client.id === authorityNodeId
          ? {
              ...client,
              status: "offline",
              lastSeenAt: checkedAt,
            }
          : client.outboxMode === "online_only"
            ? {
                ...client,
                status: "degraded",
                lastSeenAt: checkedAt,
              }
          : client,
      ),
    },
    recentError: `dgx-02:4317 unavailable; MacBook keeps local outbox, Home PC waits for DGX-02 recovery. ${error}`,
    updatedAt: checkedAt,
  };
}
