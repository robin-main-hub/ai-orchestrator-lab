import { describe, expect, it } from "vitest";
import type { ProviderProfile, RuntimeSnapshot } from "@ai-orchestrator/protocol";
import {
  fetchDgxOperatorCockpitSnapshot,
  fetchDgxProviderModelDiscovery,
  fetchDgxProviderRegistry,
  probeDgxOrchestratorServer,
  updateRuntimeWithFsmState,
} from "./stage13DgxServer";
import { DgxConnectionStateMachine, type DgxConnectionState } from "./stage5Runtime";
import { DGX02_LAN_ORCHESTRATOR_BASE_URL } from "./stage30DgxEndpoints";

function fsmStub(state: DgxConnectionState, lastError: string | null = null): DgxConnectionStateMachine {
  return {
    getState: () => state,
    getLastError: () => lastError,
  } as unknown as DgxConnectionStateMachine;
}

function expectHttpHmacHeaders(headers: Record<string, string>) {
  expect(headers.authorization).toBeUndefined();
  expect(headers["x-dgx-signature"]).toMatch(/^[a-f0-9]{64}$/);
  expect(headers["x-dgx-timestamp"]).toMatch(/^\d+$/);
  expect(headers["x-dgx-nonce"]).toBeTruthy();
}

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
      expectHttpHmacHeaders(init?.headers as Record<string, string>);
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
        expectHttpHmacHeaders(init?.headers as Record<string, string>);
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
        expectHttpHmacHeaders(init?.headers as Record<string, string>);
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

  it("fetches a read-only Operator Cockpit snapshot through the DGX server", async () => {
    const snapshot = await fetchDgxOperatorCockpitSnapshot({
      fetchImpl: async (url, init) => {
        expect(String(url)).toBe(`${DGX02_LAN_ORCHESTRATOR_BASE_URL}/cockpit/snapshot`);
        expectHttpHmacHeaders(init?.headers as Record<string, string>);
        return jsonResponse({
          id: "server-cockpit-20260524000100000",
          timestamp: "2026-05-24T00:01:00.000Z",
          fleet: [
            {
              workerId: "server-provider-registry",
              role: "orchestrator",
              status: "idle",
              statusRingColor: "green",
            },
          ],
          approvals: [],
          handoffs: [],
          memory: {
            contextReasons: ["Server provider registry readiness"],
            macBookAuthorityEnabled: true,
            dgxMirrorHealth: "healthy",
            contradictionWarnings: [],
          },
          routing: {
            selectedModelId: "claude-opus-4-8",
            fallbackStatus: "available",
            costBadge: "high",
            speedBadge: "average",
            trustBadge: "limited",
          },
          recovery: {
            offlineResumeSupported: true,
            outboxSyncStatus: "synced",
            healthIndicators: ["Server cockpit snapshot synced"],
          },
          dispatchHistory: [],
        });
      },
    });

    expect(snapshot.id).toBe("server-cockpit-20260524000100000");
    expect(snapshot.routing.selectedModelId).toBe("claude-opus-4-8");
  });

  it("redacts secret-like response previews from DGX server fetch errors", async () => {
    await expect(
      fetchDgxOperatorCockpitSnapshot({
        serverBaseUrl: "http://dgx-02:4317",
        fetchImpl: async () =>
          new Response("upstream failed with sk-stage13-secret-token at /Users/robin/.config/key", { status: 500 }),
      }),
    ).rejects.toThrow("[redacted-secret]");

    await expect(
      fetchDgxOperatorCockpitSnapshot({
        serverBaseUrl: "http://dgx-02:4317",
        fetchImpl: async () =>
          new Response("upstream failed with sk-stage13-secret-token at /Users/robin/.config/key", { status: 500 }),
      }),
    ).rejects.not.toThrow(/sk-stage13-secret-token|\/Users\/robin/);
  });

  it("updates runtime snapshot state based on DgxConnectionStateMachine state", () => {
    const fsm = new DgxConnectionStateMachine("ws://localhost:8080", {
      WebSocketImpl: class {} as any,
    });
    const updated = updateRuntimeWithFsmState(localRuntime, fsm, "2026-05-24T00:03:00.000Z");
    expect(updated.dgxStatus).toBe("offline");
    expect(updated.status).toBe("degraded");
    expect(updated.memorySyncStatus).toBe("degraded");
  });
});

// Characterization tests for the FSM-state -> runtime snapshot mapping (no
// behavior change). The existing suite only exercises the default offline
// state; these pin the previously-uncovered online/syncing/degraded branches,
// the WebSocket-error surfacing vs prior-error preservation, and the selective
// node/client update (authority + dgx-02 only). A typed stub drives getState/
// getLastError directly since updateRuntimeWithFsmState reads only those.
describe("stage13 FSM-state runtime mapping characterization", () => {
  it("maps an online FSM to a fully online runtime and stamps the authority client", () => {
    const updated = updateRuntimeWithFsmState(localRuntime, fsmStub("online"), "2026-05-24T00:03:00.000Z");

    expect(updated.status).toBe("online");
    expect(updated.dgxStatus).toBe("online");
    expect(updated.memorySyncStatus).toBe("online");
    expect(updated.runtimeNodes.find((node) => node.id === "dgx-02")?.status).toBe("online");
    const authorityClient = updated.syncTopology.clients.find((client) => client.id === "dgx-02");
    expect(authorityClient?.status).toBe("online");
    expect(authorityClient?.lastSeenAt).toBe("2026-05-24T00:03:00.000Z");
  });

  it("maps a syncing FSM to an online runtime with a syncing memory status", () => {
    const updated = updateRuntimeWithFsmState(localRuntime, fsmStub("syncing"), "2026-05-24T00:03:00.000Z");

    expect(updated.status).toBe("online");
    expect(updated.dgxStatus).toBe("online");
    expect(updated.memorySyncStatus).toBe("syncing");
    expect(updated.runtimeNodes.find((node) => node.id === "dgx-02")?.status).toBe("online");
  });

  it("maps a degraded FSM to a degraded/offline runtime", () => {
    const updated = updateRuntimeWithFsmState(localRuntime, fsmStub("degraded"), "2026-05-24T00:03:00.000Z");

    expect(updated.status).toBe("degraded");
    expect(updated.dgxStatus).toBe("offline");
    expect(updated.memorySyncStatus).toBe("degraded");
    expect(updated.runtimeNodes.find((node) => node.id === "dgx-02")?.status).toBe("offline");
  });

  it("surfaces the FSM last error into recentError", () => {
    const updated = updateRuntimeWithFsmState(localRuntime, fsmStub("degraded", "socket hangup"), "2026-05-24T00:03:00.000Z");

    expect(updated.recentError).toBe("dgx-02 WebSocket error: socket hangup");
  });

  it("preserves the prior recentError when the FSM has no error", () => {
    const updated = updateRuntimeWithFsmState(localRuntime, fsmStub("online"), "2026-05-24T00:03:00.000Z");

    expect(updated.recentError).toBe(localRuntime.recentError);
  });

  it("leaves non-authority cache clients untouched", () => {
    const updated = updateRuntimeWithFsmState(localRuntime, fsmStub("online"), "2026-05-24T00:03:00.000Z");

    const macbook = updated.syncTopology.clients.find((client) => client.id === "client_macbook");
    expect(macbook).toEqual(localRuntime.syncTopology.clients.find((client) => client.id === "client_macbook"));
    expect(macbook?.lastSeenAt).toBeUndefined();
  });
});

// Characterization tests for the previously-uncovered transport-failover and
// projection seams of the stage13 DGX-server client (no behavior change, no
// real network, no secret). The existing suite pins the FSM-state mapping and a
// single happy-path probe; these pin: probeDgxOrchestratorServer continuing the
// base-URL loop when the first endpoint throws, the all-endpoints-failed
// aggregate joining each base URL's error with " | ", createUnreachableRuntime
// leaving a continue_locally cache client untouched (the final `: client`
// passthrough), provider model discovery re-throwing the underlying Error,
// cockpit schema-validation failing over to the next base URL, and fetchJson
// truncating a non-ok body preview to 180 chars. A multi-base array routes
// through resolveDgxServerBaseUrls verbatim (normalized, in order).
const BASE_1 = "http://127.0.0.1:4317";
const BASE_2 = "http://127.0.0.1:4318";

function fakeProvider(): ProviderProfile {
  return {
    id: "provider_failover_probe",
    name: "Failover Probe",
    kind: "openai",
    enabled: true,
    tags: ["server-proxy"],
    trustLevel: "limited",
  };
}

function validCockpitPayload(id: string) {
  return {
    id,
    timestamp: "2026-05-24T00:01:00.000Z",
    fleet: [{ workerId: "server-provider-registry", role: "orchestrator", status: "idle", statusRingColor: "green" }],
    approvals: [],
    handoffs: [],
    memory: {
      contextReasons: ["Server provider registry readiness"],
      macBookAuthorityEnabled: true,
      dgxMirrorHealth: "healthy",
      contradictionWarnings: [],
    },
    routing: {
      selectedModelId: "claude-opus-4-8",
      fallbackStatus: "available",
      costBadge: "high",
      speedBadge: "average",
      trustBadge: "limited",
    },
    recovery: { offlineResumeSupported: true, outboxSyncStatus: "synced", healthIndicators: ["synced"] },
    dispatchHistory: [],
  };
}

describe("stage13 DGX server — transport failover & projection characterization", () => {
  it("continues to the next base URL when the first probe endpoint throws", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: RequestInfo | URL) => {
      const u = String(url);
      calls.push(u);
      if (u.startsWith(BASE_1)) throw new Error("base1 connection refused");
      if (u.endsWith("/health")) {
        return jsonResponse({
          service: "ai-orchestrator-dgx-server",
          status: "ok",
          capabilities: [],
          runtime: { ...localRuntime, dgxStatus: "online" },
        });
      }
      if (u.endsWith("/heartbeat")) {
        return jsonResponse({ nodeId: "dgx-02", status: "connected", checkedAt: "2026-05-24T00:05:00.000Z", message: "ok" });
      }
      return jsonResponse({
        id: "md",
        providerProfileId: "p",
        status: "succeeded",
        source: "remote_probe",
        selectedModelId: "m",
        redactionApplied: true,
        warnings: [],
        createdAt: "2026-05-24T00:05:00.000Z",
        models: [],
      });
    }) as unknown as typeof fetch;

    const probe = await probeDgxOrchestratorServer({
      localRuntime,
      serverBaseUrl: [BASE_1, BASE_2],
      fetchImpl,
      checkedAt: "2026-05-24T00:05:00.000Z",
    });

    expect(probe.status).toBe("online");
    expect(probe.baseUrl).toBe(BASE_2);
    expect(calls[0]).toBe(`${BASE_1}/health`);
  });

  it("aggregates every base URL's failure with ' | ' when the probe is fully unreachable", async () => {
    const probe = await probeDgxOrchestratorServer({
      localRuntime,
      serverBaseUrl: [BASE_1, BASE_2],
      fetchImpl: (async (url: RequestInfo | URL) => {
        throw new Error(`down ${String(url)}`);
      }) as unknown as typeof fetch,
      checkedAt: "2026-05-24T00:06:00.000Z",
    });

    expect(probe.status).toBe("unreachable");
    expect(probe.baseUrl).toBe(BASE_1);
    expect(probe.error).toContain(BASE_1);
    expect(probe.error).toContain(BASE_2);
    expect(probe.error).toContain(" | ");
    expect(probe.heartbeat.message).toContain(" | ");
  });

  it("leaves a continue_locally cache client untouched when the DGX is unreachable", async () => {
    const probe = await probeDgxOrchestratorServer({
      localRuntime,
      fetchImpl: async () => {
        throw new Error("connection refused");
      },
      checkedAt: "2026-05-24T00:07:00.000Z",
    });

    const macbook = probe.runtime.syncTopology.clients.find((client) => client.id === "client_macbook");
    expect(macbook).toEqual(localRuntime.syncTopology.clients.find((client) => client.id === "client_macbook"));

    const authority = probe.runtime.syncTopology.clients.find((client) => client.id === "dgx-02");
    expect(authority?.status).toBe("offline");
    expect(authority?.lastSeenAt).toBe("2026-05-24T00:07:00.000Z");
  });

  it("re-throws the underlying Error when provider model discovery fails", async () => {
    await expect(
      fetchDgxProviderModelDiscovery({
        provider: fakeProvider(),
        serverBaseUrl: BASE_1,
        fetchImpl: (async () => {
          throw new Error("discovery-down");
        }) as unknown as typeof fetch,
      }),
    ).rejects.toThrow("discovery-down");
  });

  it("fails over to the next base URL when the first cockpit payload fails schema validation", async () => {
    const snapshot = await fetchDgxOperatorCockpitSnapshot({
      serverBaseUrl: [BASE_1, BASE_2],
      fetchImpl: (async (url: RequestInfo | URL) => {
        if (String(url).startsWith(BASE_1)) return jsonResponse({ id: "malformed", timestamp: "2026-05-24T00:01:00.000Z" });
        return jsonResponse(validCockpitPayload("server-cockpit-failover"));
      }) as unknown as typeof fetch,
    });

    expect(snapshot.id).toBe("server-cockpit-failover");
    expect(snapshot.routing.selectedModelId).toBe("claude-opus-4-8");
  });

  it("truncates a non-ok response body preview to 180 characters in the thrown error", async () => {
    const fetchImpl = (async () => new Response("Z".repeat(300), { status: 500 })) as unknown as typeof fetch;

    await expect(fetchDgxProviderRegistry({ serverBaseUrl: BASE_1, fetchImpl })).rejects.toThrow("Z".repeat(180));
    await expect(fetchDgxProviderRegistry({ serverBaseUrl: BASE_1, fetchImpl })).rejects.not.toThrow("Z".repeat(181));
  });
});

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), { status: 200 });
}
