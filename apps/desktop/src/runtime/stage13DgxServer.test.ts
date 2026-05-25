import { describe, expect, it } from "vitest";
import type { RuntimeSnapshot } from "@ai-orchestrator/protocol";
import { fetchDgxProviderModelDiscovery, fetchDgxProviderRegistry, probeDgxOrchestratorServer } from "./stage13DgxServer";
import { DGX02_LAN_ORCHESTRATOR_BASE_URL } from "./stage30DgxEndpoints";

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
    eventStoreMode: "dgx02_authoritative_with_client_cache",
    offlineWritePolicy: "append_local_outbox_when_offline",
    conflictPolicy: "dgx02_authority_wins",
    clients: [
      {
        id: "client_macbook",
        label: "MacBook",
        kind: "macbook",
        status: "online",
        syncRole: "cache_client",
        localStore: "sqlite",
        outboxMode: "offline_cache_outbox",
        failurePolicy: "continue_locally",
        outboxCount: 2,
      },
      {
        id: "client_home_pc",
        label: "Home PC",
        kind: "desktop_pc",
        status: "online",
        syncRole: "cache_client",
        localStore: "sqlite",
        outboxMode: "offline_cache_outbox",
        failurePolicy: "unavailable_without_dgx",
        outboxCount: 0,
      },
      {
        id: "dgx-02",
        label: "DGX-02",
        kind: "server",
        status: "offline",
        syncRole: "authority",
        localStore: "sqlite",
        outboxMode: "stateless",
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
    const fetchImpl = async (url: RequestInfo | URL, init?: RequestInit) => {
      const path = String(url);
      expect((init?.headers as Record<string, string>).authorization).toMatch(/^Bearer \S+/);
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
            runtimeNodes: [{ ...localRuntime.runtimeNodes[0]!, status: "online", models: ["qwen36-gio-lora-v5-prisma"] }],
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
        selectedModelId: "qwen36-gio-lora-v5-prisma",
        redactionApplied: true,
        warnings: [],
        createdAt: "2026-05-24T00:01:00.000Z",
        models: [
          {
            id: "qwen36-gio-lora-v5-prisma",
            name: "qwen36-gio-lora-v5-prisma",
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
    expect(probe.modelDiscovery?.models[0]?.id).toBe("qwen36-gio-lora-v5-prisma");
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
    expect(probe.runtime.recentError).toContain("Home PC degrades until DGX-02 authority returns");
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
      fetchImpl: async (url, init) => {
        expect(String(url)).toBe(`${DGX02_LAN_ORCHESTRATOR_BASE_URL}/provider-models?providerProfileId=provider_deepseek_dgx`);
        expect((init?.headers as Record<string, string>).authorization).toMatch(/^Bearer \S+/);
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

  it("fetches the DGX provider registry for reusable provider selection", async () => {
    const registry = await fetchDgxProviderRegistry({
      fetchImpl: async (url, init) => {
        expect(String(url)).toBe(`${DGX02_LAN_ORCHESTRATOR_BASE_URL}/provider-registry`);
        expect((init?.headers as Record<string, string>).authorization).toMatch(/^Bearer \S+/);
        return jsonResponse({
          id: "provider_registry_dgx02_1",
          authorityNodeId: "dgx-02",
          rawSecretPersisted: false,
          createdAt: "2026-05-24T00:01:00.000Z",
          summary: {
            total: 2,
            ready: 2,
            missingSecrets: 0,
            dgxVaultBacked: 1,
            oauthSessions: 0,
            noAuth: 1,
          },
          entries: [
            {
              providerProfileId: "provider_dgx02_vllm",
              name: "DGX-02 vLLM",
              kind: "openai",
              baseUrl: "http://dgx-02:8001/v1",
              trustLevel: "trusted",
              tags: ["dgx", "vllm", "no-auth"],
              defaultModelIds: ["qwen36-gio-lora-v5-prisma"],
              selectedModelId: "qwen36-gio-lora-v5-prisma",
              supportsModelList: true,
              apiStyle: "openai_chat",
              authMode: "none",
              secretAvailability: "available",
              updatedAt: "2026-05-24T00:01:00.000Z",
            },
          ],
        });
      },
    });

    expect(registry.authorityNodeId).toBe("dgx-02");
    expect(registry.rawSecretPersisted).toBe(false);
    expect(registry.entries[0]?.providerProfileId).toBe("provider_dgx02_vllm");
  });
});

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), { status: 200 });
}
