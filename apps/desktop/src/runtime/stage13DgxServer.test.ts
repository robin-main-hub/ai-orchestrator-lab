import { describe, expect, it } from "vitest";
import type { RuntimeSnapshot } from "@ai-orchestrator/protocol";
import { probeDgxOrchestratorServer } from "./stage13DgxServer";

const localRuntime: RuntimeSnapshot = {
  status: "degraded",
  dgxStatus: "offline",
  localModelStatus: "online",
  memorySyncStatus: "syncing",
  runtimeNodes: [
    {
      id: "dgx-02",
      label: "DGX-02",
      role: "main_server",
      status: "offline",
      isPrimary: true,
      endpoint: "dgx-02",
      models: ["remote-workspace"],
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
        id: "client_macbook",
        label: "MacBook",
        kind: "macbook",
        status: "online",
        syncRole: "client_replica",
        localStore: "sqlite",
        outboxMode: "persistent_local",
        failurePolicy: "local_queue",
        outboxCount: 2,
      },
      {
        id: "client_home_pc",
        label: "Home PC",
        kind: "desktop_pc",
        status: "online",
        syncRole: "client_replica",
        localStore: "none",
        outboxMode: "online_only",
        failurePolicy: "requires_dgx",
        outboxCount: 0,
      },
      {
        id: "dgx-02",
        label: "DGX-02",
        kind: "server",
        status: "offline",
        syncRole: "authority",
        localStore: "sqlite",
        outboxMode: "authority",
        failurePolicy: "authority_recovery",
        outboxCount: 0,
      },
    ],
  },
  recentError: "pending",
  updatedAt: "2026-05-24T00:00:00.000Z",
};

describe("stage13 DGX server probing", () => {
  it("merges live DGX server health, heartbeat, and model discovery", async () => {
    const fetchImpl = async (url: RequestInfo | URL) => {
      const path = String(url);
      if (path.endsWith("/health")) {
        return jsonResponse({
          service: "ai-orchestrator-dgx-server",
          status: "ok",
          capabilities: ["health", "provider-completion-proxy", "vllm-health"],
          runtime: {
            ...localRuntime,
            dgxStatus: "online",
            runtimeNodes: [{ ...localRuntime.runtimeNodes[0]!, status: "online", models: ["qwen36-gio-wiki-rag-prisma"] }],
            syncTopology: {
              ...localRuntime.syncTopology,
              clients: [{ ...localRuntime.syncTopology.clients[2]!, status: "online", outboxCount: 0 }],
            },
            updatedAt: "2026-05-24T00:01:00.000Z",
          },
        });
      }

      if (path.endsWith("/heartbeat")) {
        return jsonResponse({
          nodeId: "dgx-02",
          status: "connected",
          checkedAt: "2026-05-24T00:01:00.000Z",
          message: "dgx-02 authority reachable",
        });
      }

      return jsonResponse({
        id: "model_discovery_dgx02_vllm_qwen36",
        providerProfileId: "provider_dgx02_vllm",
        status: "succeeded",
        source: "remote_probe",
        selectedModelId: "qwen36-gio-wiki-rag-prisma",
        redactionApplied: true,
        warnings: [],
        createdAt: "2026-05-24T00:01:00.000Z",
        models: [
          {
            id: "qwen36-gio-wiki-rag-prisma",
            name: "qwen36-gio-wiki-rag-prisma",
            providerProfileId: "provider_dgx02_vllm",
            supportsStreaming: true,
            supportsTools: false,
            tags: ["dgx", "vllm"],
          },
        ],
      });
    };

    const probe = await probeDgxOrchestratorServer({
      localRuntime,
      fetchImpl,
      checkedAt: "2026-05-24T00:01:00.000Z",
    });

    expect(probe.status).toBe("online");
    expect(probe.heartbeat.status).toBe("connected");
    expect(probe.runtime.dgxStatus).toBe("online");
    expect(probe.modelDiscovery?.models[0]?.id).toBe("qwen36-gio-wiki-rag-prisma");
  });

  it("keeps the desktop in local fallback when dgx-02:4317 is unavailable", async () => {
    const probe = await probeDgxOrchestratorServer({
      localRuntime,
      fetchImpl: async () => {
        throw new Error("connection refused");
      },
      checkedAt: "2026-05-24T00:02:00.000Z",
    });

    expect(probe.status).toBe("unreachable");
    expect(probe.runtime.dgxStatus).toBe("offline");
    expect(probe.runtime.memorySyncStatus).toBe("degraded");
    expect(probe.heartbeat.status).toBe("unreachable");
    expect(probe.runtime.recentError).toContain("Home PC waits for DGX-02 recovery");
    expect(probe.runtime.syncTopology.clients.find((client) => client.id === "client_home_pc")?.status).toBe("degraded");
  });
});

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), { status: 200 });
}
