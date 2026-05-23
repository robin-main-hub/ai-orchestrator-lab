import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import type { RuntimeSnapshot } from "@ai-orchestrator/protocol";

export type ServerCapability =
  | "health"
  | "runtime-status"
  | "remote-execution-placeholder"
  | "memory-sync-placeholder";

export type ServerHealthResponse = {
  service: "ai-orchestrator-dgx-server";
  status: "ok";
  runtime: RuntimeSnapshot;
  capabilities: ServerCapability[];
};

export function createHealthResponse(): ServerHealthResponse {
  return {
    service: "ai-orchestrator-dgx-server",
    status: "ok",
    runtime: {
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
          models: [],
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
            lastSeenAt: new Date().toISOString(),
          },
        ],
      },
      activeProviderProfileId: undefined,
      recentError: "remote execution layer is a placeholder",
      updatedAt: new Date().toISOString(),
    },
    capabilities: [
      "health",
      "runtime-status",
      "remote-execution-placeholder",
      "memory-sync-placeholder",
    ],
  };
}

export function startServer(port = Number(process.env.PORT ?? 4317)) {
  const server = createServer((request, response) => {
    if (request.url === "/health") {
      response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(createHealthResponse()));
      return;
    }

    response.writeHead(404, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "not_found" }));
  });

  server.listen(port, "0.0.0.0");
  return server;
}

const entryPoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : undefined;

if (import.meta.url === entryPoint) {
  const server = startServer();
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : "unknown";
  console.log(`AI Orchestrator DGX placeholder listening on ${port}`);
}
