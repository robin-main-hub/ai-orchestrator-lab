import type { RuntimeSnapshot } from "@ai-orchestrator/protocol";
import { now } from "../lib/appConstants";
import { createStage5DgxBridge } from "../runtime/stage5Runtime";
import {
  createExternalIngressDemoInput,
  createStage8IngressSnapshot,
} from "../runtime/stage8Ingress";
import { initialAgentRun } from "./conversation";

export const runtimeSnapshot: RuntimeSnapshot = {
  status: "degraded",
  dgxStatus: "offline",
  localModelStatus: "online",
  memorySyncStatus: "syncing",
  runtimeNodes: [
    {
      id: "dgx-01",
      label: "DGX-01",
      role: "compute",
      status: "offline",
      isPrimary: false,
      endpoint: "dgx-01",
      models: ["연결 대기"],
    },
    {
      id: "dgx-02",
      label: "DGX-02",
      role: "main_server",
      status: "offline",
      isPrimary: true,
      endpoint: "dgx-02",
      models: ["메인 서버", "원격 실행 대기"],
    },
  ],
  localModels: [
    {
      id: "mock-orchestrator",
      name: "mock-orchestrator",
      runner: "mock",
      status: "online",
      contextWindow: 128_000,
    },
  ],
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
        outboxCount: 0,
        lastSeenAt: now,
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
        lastSeenAt: now,
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
  activeProviderProfileId: "provider_dgx02_vllm",
  recentError: "dgx-02 heartbeat pending",
  updatedAt: now,
};

export const initialDgxBridge = createStage5DgxBridge({
  run: initialAgentRun,
  runtime: runtimeSnapshot,
  createdAt: now,
});

export const initialIngressSnapshot = createStage8IngressSnapshot(
  createExternalIngressDemoInput(new Date("2026-05-24T00:23:00.000+09:00").toISOString()),
);
