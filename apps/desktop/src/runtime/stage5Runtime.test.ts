import { describe, expect, it } from "vitest";
import type { RuntimeSnapshot } from "@ai-orchestrator/protocol";
import type { Stage4AgentRun } from "./stage4Runtime";
import { createStage5DgxBridge, mergeDgxRuntimeSnapshot } from "./stage5Runtime";

const runtime: RuntimeSnapshot = {
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
    clients: [],
  },
  updatedAt: "2026-05-24T00:00:00.000Z",
};

const run: Stage4AgentRun = {
  id: "run_1",
  status: "ready_for_approval",
  primaryAgentId: "agent_orchestrator",
  soulSummary: "summary soul",
  recallTrace: [],
  reflection: {
    sessionId: "session_desktop_001",
    summary: "ready",
    decisions: [],
    risks: [],
    createdAt: "2026-05-24T00:00:00.000Z",
  },
  steps: [
    {
      id: "step_1",
      title: "Remote",
      ownerAgentId: "agent_executor",
      status: "blocked",
      permissionState: "required",
      summary: "approval required",
    },
  ],
  verifier: {
    id: "verifier_1",
    status: "passed",
    checks: [],
    notes: [],
  },
  replay: {
    id: "replay_1",
    eventIds: ["event_1"],
    replayable: true,
    summary: "replay",
  },
  createdAt: "2026-05-24T00:00:00.000Z",
};

describe("stage5 dgx bridge", () => {
  it("requires local fallback while approval or DGX is missing", () => {
    const bridge = createStage5DgxBridge({
      run,
      runtime,
      createdAt: "2026-05-24T00:00:00.000Z",
    });

    expect(bridge.heartbeat.status).toBe("unreachable");
    expect(bridge.response.status).toBe("blocked");
    expect(bridge.localFallbackEnabled).toBe(true);
  });

  it("queues approved runs when the merged DGX snapshot is online", () => {
    const merged = mergeDgxRuntimeSnapshot(runtime, {
      ...runtime,
      dgxStatus: "online",
      runtimeNodes: [{ ...runtime.runtimeNodes[0]!, status: "online" }],
      updatedAt: "2026-05-24T00:01:00.000Z",
    });
    const bridge = createStage5DgxBridge({
      run,
      runtime: merged,
      approvalOverride: "approved",
      createdAt: "2026-05-24T00:01:00.000Z",
    });

    expect(bridge.response.status).toBe("queued");
    expect(bridge.localFallbackEnabled).toBe(false);
  });

  it("normalizes older DGX server authority fields before merging into desktop state", () => {
    const merged = mergeDgxRuntimeSnapshot(runtime, {
      ...runtime,
      dgxStatus: "online",
      runtimeNodes: [{ ...runtime.runtimeNodes[0]!, status: "online", role: "compute" }],
      syncTopology: {
        ...runtime.syncTopology,
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
            outboxMode: "authority",
            failurePolicy: "authority_recovery",
            outboxCount: 0,
          },
        ],
      },
      updatedAt: "2026-05-24T00:02:00.000Z",
    } as unknown as RuntimeSnapshot);
    const authorityClient = merged.syncTopology.clients.find((client) => client.id === "dgx-02");

    expect(merged.syncTopology.eventStoreMode).toBe("dgx02_authoritative_with_client_cache");
    expect(merged.syncTopology.offlineWritePolicy).toBe("append_local_outbox_when_offline");
    expect(merged.syncTopology.conflictPolicy).toBe("dgx02_authority_wins");
    expect(authorityClient?.outboxMode).toBe("stateless");
    expect(authorityClient?.failurePolicy).toBe("compute_degraded");
    expect(merged.runtimeNodes[0]?.role).toBe("main_server");
  });
});
