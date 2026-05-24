import { createServer, type IncomingMessage } from "node:http";
import { pathToFileURL } from "node:url";
import type {
  DgxHeartbeat,
  ModelDiscoverySnapshot,
  RemoteExecutionRequest,
  RemoteExecutionResponse,
  RuntimeSnapshot,
} from "@ai-orchestrator/protocol";

export type ServerCapability =
  | "health"
  | "model-registry"
  | "runtime-status"
  | "remote-run-request"
  | "remote-event-stream-placeholder"
  | "memory-sync-placeholder";

export type ServerHealthResponse = {
  service: "ai-orchestrator-dgx-server";
  status: "ok";
  runtime: RuntimeSnapshot;
  capabilities: ServerCapability[];
};

export function createRuntimeSnapshot(now = new Date().toISOString()): RuntimeSnapshot {
  return {
    status: "degraded",
    dgxStatus: "online",
    localModelStatus: "offline",
    memorySyncStatus: "syncing",
    runtimeNodes: [
      {
        id: "dgx-02",
        label: "DGX-02",
        role: "main_server",
        status: "online",
        isPrimary: true,
        endpoint: "dgx-02",
        models: ["remote-workspace", "remote-model-queue", "qwen36-gio-wiki-rag-prisma"],
      },
    ],
    localModels: [],
    syncTopology: {
      authorityNodeId: "dgx-02",
      authorityLabel: "DGX-02",
      eventStoreMode: "server_authoritative_with_local_outbox",
      offlineWritePolicy: "append_local_outbox",
      conflictPolicy: "server_revision_lww_with_conflict_events",
      clients: [
        {
          id: "dgx-02",
          label: "DGX-02",
          kind: "server",
          status: "online",
          syncRole: "authority",
          localStore: "sqlite",
          outboxCount: 0,
          lastSeenAt: now,
        },
      ],
    },
    activeProviderProfileId: undefined,
    recentError: "remote execution waits for approval tokens",
    updatedAt: now,
  };
}

export function createHealthResponse(now = new Date().toISOString()): ServerHealthResponse {
  return {
    service: "ai-orchestrator-dgx-server",
    status: "ok",
    runtime: createRuntimeSnapshot(now),
    capabilities: [
      "health",
      "model-registry",
      "runtime-status",
      "remote-run-request",
      "remote-event-stream-placeholder",
      "memory-sync-placeholder",
    ],
  };
}

export function createDgxModelDiscovery(now = new Date().toISOString()): ModelDiscoverySnapshot {
  return {
    id: "model_discovery_dgx02_vllm_qwen36",
    providerProfileId: "provider_dgx02_vllm",
    status: "succeeded",
    source: "remote_probe",
    selectedModelId: "qwen36-gio-wiki-rag-prisma",
    redactionApplied: true,
    warnings: ["DGX-02 vLLM registry; completion still requires runtime approval"],
    createdAt: now,
    models: [
      {
        id: "qwen36-gio-wiki-rag-prisma",
        name: "qwen36-gio-wiki-rag-prisma",
        providerProfileId: "provider_dgx02_vllm",
        contextWindow: 65_536,
        supportsStreaming: true,
        supportsTools: false,
        tags: ["dgx", "vllm", "rag", "qwen"],
      },
    ],
  };
}

export function createDgxHeartbeat(runtime = createRuntimeSnapshot()): DgxHeartbeat {
  return {
    nodeId: "dgx-02",
    status: runtime.dgxStatus === "online" ? "connected" : "unreachable",
    latencyMs: runtime.dgxStatus === "online" ? 12 : undefined,
    checkedAt: new Date().toISOString(),
    message: runtime.dgxStatus === "online" ? "dgx-02 authority reachable" : "dgx-02 unreachable; local fallback required",
  };
}

export function createRemoteRunResponse(
  request: RemoteExecutionRequest,
  runtime = createRuntimeSnapshot(),
): RemoteExecutionResponse {
  if (request.approvalState !== "approved") {
    return {
      id: `remote_response_${crypto.randomUUID()}`,
      requestId: request.id,
      status: "blocked",
      targetNodeId: request.targetNodeId,
      fallbackMode: "local_cli",
      message: "approval required before DGX remote execution",
      createdAt: new Date().toISOString(),
    };
  }

  if (runtime.dgxStatus !== "online") {
    return {
      id: `remote_response_${crypto.randomUUID()}`,
      requestId: request.id,
      status: "fallback_required",
      targetNodeId: request.targetNodeId,
      fallbackMode: request.kind === "model_inference" ? "local_model" : "local_cli",
      message: "dgx-02 is not reachable; use local fallback",
      createdAt: new Date().toISOString(),
    };
  }

  return {
    id: `remote_response_${crypto.randomUUID()}`,
    requestId: request.id,
    status: "queued",
    targetNodeId: request.targetNodeId,
    fallbackMode: "none",
    message: "remote run accepted into the DGX queue",
    createdAt: new Date().toISOString(),
  };
}

export function startServer(port = Number(process.env.PORT ?? 4317)) {
  const server = createServer(async (request, response) => {
    if (request.url === "/health") {
      response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(createHealthResponse()));
      return;
    }

    if (request.url === "/runtime") {
      response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(createRuntimeSnapshot()));
      return;
    }

    if (request.url === "/heartbeat") {
      response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(createDgxHeartbeat()));
      return;
    }

    if (request.url === "/models") {
      response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(createDgxModelDiscovery()));
      return;
    }

    if (request.url === "/remote-runs" && request.method === "POST") {
      const payload = (await readJsonBody(request)) as RemoteExecutionRequest;
      response.writeHead(202, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(createRemoteRunResponse(payload)));
      return;
    }

    if (request.url === "/events/stream") {
      response.writeHead(200, {
        "cache-control": "no-cache",
        "content-type": "text/event-stream; charset=utf-8",
      });
      response.end(`event: heartbeat\ndata: ${JSON.stringify(createDgxHeartbeat())}\n\n`);
      return;
    }

    response.writeHead(404, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "not_found" }));
  });

  server.listen(port, "0.0.0.0");
  return server;
}

async function readJsonBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const rawBody = Buffer.concat(chunks).toString("utf8");
  return rawBody ? JSON.parse(rawBody) : {};
}

const entryPoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : undefined;

if (import.meta.url === entryPoint) {
  const server = startServer();
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : "unknown";
  console.log(`AI Orchestrator DGX placeholder listening on ${port}`);
}
