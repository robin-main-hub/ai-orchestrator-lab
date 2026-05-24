import { describe, expect, it } from "vitest";
import type { RuntimeSnapshot } from "@ai-orchestrator/protocol";
import { fetchDgxProviderModelDiscovery, probeDgxOrchestratorServer } from "./stage13DgxServer";

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
    authorityNodeId: "client_macbook",
    authorityLabel: "MacBook",
    eventStoreMode: "macbook_authoritative_with_dgx_projection",
    offlineWritePolicy: "append_authoritative_local",
    conflictPolicy: "macbook_authority_wins",
    clients: [
      {
        id: "client_macbook",
        label: "MacBook",
        kind: "macbook",
        status: "online",
        syncRole: "authority",
        localStore: "sqlite",
        outboxMode: "authoritative_local",
        failurePolicy: "continue_locally",
        outboxCount: 2,
      },
      {
        id: "client_home_pc",
        label: "Home PC",
        kind: "desktop_pc",
        status: "online",
        syncRole: "thin_surface",
        localStore: "none",
        outboxMode: "stateless",
        failurePolicy: "unavailable_without_dgx",
        outboxCount: 0,
      },
      {
        id: "dgx-02",
        label: "DGX-02",
        kind: "server",
        status: "offline",
        syncRole: "projection_server",
        localStore: "sqlite",
        outboxMode: "projection_outbox",
        failurePolicy: "compute_degraded",
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
          eventStorage: {
            mode: "jsonl",
            storageDir: "/home/robin/ai-orchestrator-lab/data/events",
            eventLogPath: "/home/robin/ai-orchestrator-lab/data/events/events.jsonl",
            revision: 42,
            eventCount: 12,
            sessionCount: 2,
            loadedAt: "2026-05-24T00:01:00.000Z",
          },
          runtime: {
            ...localRuntime,
            dgxStatus: "online",
            runtimeNodes: [{ ...localRuntime.runtimeNodes[0]!, status: "online", models: ["qwen36-domain-wiki-rag-prisma"] }],
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
          message: "dgx-02 projection server reachable",
        });
      }

      return jsonResponse({
        id: "model_discovery_dgx02_vllm_qwen36",
        providerProfileId: "provider_dgx02_vllm",
        status: "succeeded",
        source: "remote_probe",
        selectedModelId: "qwen36-domain-wiki-rag-prisma",
        redactionApplied: true,
        warnings: [],
        createdAt: "2026-05-24T00:01:00.000Z",
        models: [
          {
            id: "qwen36-domain-wiki-rag-prisma",
            name: "qwen36-domain-wiki-rag-prisma",
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
    expect(probe.eventStorage?.mode).toBe("jsonl");
    expect(probe.eventStorage?.revision).toBe(42);
    expect(probe.modelDiscovery?.models[0]?.id).toBe("qwen36-domain-wiki-rag-prisma");
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
    expect(probe.runtime.recentError).toContain("Home PC waits for DGX-02 projection recovery");
    expect(probe.runtime.syncTopology.clients.find((client) => client.id === "client_home_pc")?.status).toBe("degraded");
  });

  it("fetches provider-specific model discovery through the DGX server", async () => {
    const discovery = await fetchDgxProviderModelDiscovery({
      provider: {
        id: "provider_deepseek_dgx",
        name: "DeepSeek DGX-02 Key",
        kind: "openai",
        enabled: true,
        tags: ["server-proxy", "deepseek"],
        trustLevel: "limited",
      },
      fetchImpl: async (url) => {
        expect(String(url)).toBe("http://dgx-02:4317/provider-models?providerProfileId=provider_deepseek_dgx");
        return jsonResponse({
          id: "model_discovery_deepseek",
          providerProfileId: "provider_deepseek_dgx",
          status: "succeeded",
          source: "remote_probe",
          selectedModelId: "deepseek-chat",
          redactionApplied: true,
          warnings: [],
          createdAt: "2026-05-24T00:01:00.000Z",
          models: [
            {
              id: "deepseek-chat",
              name: "deepseek-chat",
              providerProfileId: "provider_deepseek_dgx",
              supportsStreaming: true,
              supportsTools: false,
              tags: ["server-proxy", "deepseek"],
            },
          ],
        });
      },
    });

    expect(discovery.providerProfileId).toBe("provider_deepseek_dgx");
    expect(discovery.models[0]?.id).toBe("deepseek-chat");
  });
});

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), { status: 200 });
}
