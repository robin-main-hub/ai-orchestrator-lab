import { afterEach, describe, expect, it, vi } from "vitest";
import type { RuntimeSnapshot } from "@ai-orchestrator/protocol";
import type { Stage4AgentRun } from "./stage4Runtime";
import { createStage5DgxBridge, mergeDgxRuntimeSnapshot, DgxConnectionStateMachine } from "./stage5Runtime";

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
    expect(bridge.heartbeat.message).toBe("DGX에 닿지 않아 데스크톱 로컬 대체 경로를 사용합니다.");
    expect(bridge.response.status).toBe("blocked");
    expect(bridge.response.message).toBe("DGX 원격 워크스페이스 실행 전 운영자 승인이 필요합니다.");
    expect(bridge.request.commandPreview).toBe("run_1 실행 · 검증 통과 · 승인 1건");
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
    expect(bridge.response.message).toBe("DGX 원격 실행 대기열에 등록했습니다.");
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

// Characterization tests for previously-uncovered stage5 dgx-bridge pure
// branches (no behavior change, no network, no secret). These pin the
// authority-adjacent bridge/merge seam's pure projections: the
// createLocalRemoteResponse fallback_required branch (approved but DGX
// offline), the createLocalHeartbeat online branch, the createCommandPreview
// verifier-label passthrough (verifier status is passed|warning|blocked, so
// only "passed" hits the map and warning/blocked fall through unchanged) plus
// the zero-required-steps count, the mergeDgxRuntimeSnapshot status/recentError
// rules when the server is not online, and the normalizeCacheClient role/outbox/
// failurePolicy normalization for non-authority clients flowing through
// mergeClients (desktop_pc, stateless, and compute_degraded variants), plus the
// mergeClients/mergeRuntimeNodes append-the-unmatched behavior. Only the
// crypto.randomUUID ids are non-deterministic and are not asserted.
function makeClient(overrides: Partial<ClientDeviceShape> & Pick<ClientDeviceShape, "id">): ClientDeviceShape {
  return {
    label: overrides.id,
    kind: "macbook",
    status: "online",
    syncRole: "cache_client",
    localStore: "sqlite",
    outboxMode: "offline_cache_outbox",
    failurePolicy: "continue_locally",
    outboxCount: 0,
    ...overrides,
  };
}

type ClientDeviceShape = RuntimeSnapshot["syncTopology"]["clients"][number];

describe("stage5 dgx bridge — projection & merge characterization", () => {
  const approvedRun: Stage4AgentRun = { ...run, status: "completed" };

  it("returns fallback_required (and enables local fallback) when approved but DGX is offline", () => {
    const bridge = createStage5DgxBridge({
      run: approvedRun,
      runtime,
      approvalOverride: "approved",
      createdAt: "2026-05-24T00:00:00.000Z",
    });

    expect(bridge.response.status).toBe("fallback_required");
    expect(bridge.response.fallbackMode).toBe("local_cli");
    expect(bridge.response.message).toBe("DGX가 오프라인이라 실행 요청을 로컬 발신함에 보관합니다.");
    expect(bridge.localFallbackEnabled).toBe(true);
  });

  it("reports a connected heartbeat with latency when DGX is online", () => {
    const onlineRuntime: RuntimeSnapshot = { ...runtime, dgxStatus: "online" };
    const bridge = createStage5DgxBridge({
      run,
      runtime: onlineRuntime,
      createdAt: "2026-05-24T00:00:00.000Z",
    });

    expect(bridge.heartbeat.status).toBe("connected");
    expect(bridge.heartbeat.latencyMs).toBe(18);
    expect(bridge.heartbeat.message).toBe("DGX 권위 노드에 연결되었습니다.");
  });

  it("passes warning/blocked verifier statuses through unchanged and counts zero required steps", () => {
    const noApprovalRun: Stage4AgentRun = {
      ...run,
      steps: [{ ...run.steps[0]!, permissionState: "not_required" }],
    };
    const warning = createStage5DgxBridge({
      run: { ...noApprovalRun, verifier: { ...run.verifier, status: "warning" } },
      runtime,
      createdAt: "2026-05-24T00:00:00.000Z",
    });
    const blocked = createStage5DgxBridge({
      run: { ...noApprovalRun, verifier: { ...run.verifier, status: "blocked" } },
      runtime,
      createdAt: "2026-05-24T00:00:00.000Z",
    });

    expect(warning.request.commandPreview).toBe("run_1 실행 · 검증 warning · 승인 0건");
    expect(blocked.request.commandPreview).toBe("run_1 실행 · 검증 blocked · 승인 0건");
  });

  it("keeps the local status and preserves recentError when the server is not online", () => {
    const localWithError: RuntimeSnapshot = { ...runtime, recentError: "local outbox stalled" };
    const merged = mergeDgxRuntimeSnapshot(localWithError, {
      ...runtime,
      status: "degraded",
      dgxStatus: "offline",
      updatedAt: "2026-05-24T00:05:00.000Z",
    });

    expect(merged.status).toBe("degraded");
    expect(merged.recentError).toBe("local outbox stalled");
    expect(merged.updatedAt).toBe("2026-05-24T00:05:00.000Z");
  });

  it("clears recentError once the server reports DGX online", () => {
    const localWithError: RuntimeSnapshot = { ...runtime, recentError: "local outbox stalled" };
    const merged = mergeDgxRuntimeSnapshot(localWithError, {
      ...runtime,
      status: "online",
      dgxStatus: "online",
      updatedAt: "2026-05-24T00:06:00.000Z",
    });

    expect(merged.status).toBe("online");
    expect(merged.recentError).toBeUndefined();
  });

  it("normalizes non-authority server clients to cache_client with kind-specific failure policy", () => {
    const merged = mergeDgxRuntimeSnapshot(runtime, {
      ...runtime,
      syncTopology: {
        ...runtime.syncTopology,
        clients: [
          makeClient({ id: "client_home_pc", kind: "desktop_pc", outboxMode: "offline_cache_outbox" }),
          makeClient({ id: "client_phone", kind: "mobile", outboxMode: "stateless", failurePolicy: "continue_locally" }),
          makeClient({ id: "client_macbook", kind: "macbook", outboxMode: "offline_cache_outbox", failurePolicy: "compute_degraded" }),
        ],
      },
      updatedAt: "2026-05-24T00:07:00.000Z",
    } as RuntimeSnapshot);

    const homePc = merged.syncTopology.clients.find((client) => client.id === "client_home_pc");
    const phone = merged.syncTopology.clients.find((client) => client.id === "client_phone");
    const macbook = merged.syncTopology.clients.find((client) => client.id === "client_macbook");

    expect(homePc?.syncRole).toBe("cache_client");
    expect(homePc?.failurePolicy).toBe("unavailable_without_dgx");
    expect(homePc?.outboxMode).toBe("offline_cache_outbox");

    expect(phone?.syncRole).toBe("cache_client");
    expect(phone?.outboxMode).toBe("stateless");
    expect(phone?.failurePolicy).toBe("continue_locally");

    expect(macbook?.failurePolicy).toBe("compute_degraded");
  });

  it("appends local-only clients and runtime nodes that the server does not report", () => {
    const localOnlyNode = { id: "client_phone_node", label: "Phone", role: "local" as const, status: "online" as const, isPrimary: false, models: [] };
    const localRuntime: RuntimeSnapshot = {
      ...runtime,
      runtimeNodes: [runtime.runtimeNodes[0]!, localOnlyNode],
      syncTopology: { ...runtime.syncTopology, clients: [makeClient({ id: "client_macbook" })] },
    };
    const merged = mergeDgxRuntimeSnapshot(localRuntime, {
      ...runtime,
      syncTopology: { ...runtime.syncTopology, clients: [] },
      updatedAt: "2026-05-24T00:08:00.000Z",
    });

    expect(merged.runtimeNodes.some((node) => node.id === "client_phone_node")).toBe(true);
    expect(merged.syncTopology.clients.some((client) => client.id === "client_macbook")).toBe(true);
  });
});

describe("DgxConnectionStateMachine", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  class MockWebSocket {
    static instances: MockWebSocket[] = [];
    url: string;
    readyState: number = 0; // CONNECTING
    onopen: (() => void) | null = null;
    onmessage: ((event: any) => void) | null = null;
    onerror: ((event: any) => void) | null = null;
    onclose: (() => void) | null = null;
    sentMessages: string[] = [];
    closed = false;

    constructor(url: string) {
      this.url = url;
      MockWebSocket.instances.push(this);
    }

    send(msg: string) {
      this.sentMessages.push(msg);
    }

    close() {
      this.closed = true;
      if (this.onclose) this.onclose();
    }

    triggerOpen() {
      this.readyState = 1; // OPEN
      if (this.onopen) this.onopen();
    }

    triggerMessage(data: any) {
      if (this.onmessage) {
        this.onmessage({ data: JSON.stringify(data) });
      }
    }

    triggerError() {
      if (this.onerror) this.onerror({});
    }
  }

  it("transitions state correctly during open and restore", async () => {
    MockWebSocket.instances = [];
    let restoreCalled = false;
    let stateChanges: string[] = [];

    let resolveRestore: (() => void) | null = null;
    const restorePromise = new Promise<void>((resolve) => {
      resolveRestore = resolve;
    });

    const fsm = new DgxConnectionStateMachine("ws://localhost:8080", {
      WebSocketImpl: MockWebSocket as any,
      listeners: {
        onStateChange(state, prev) {
          stateChanges.push(`${prev}->${state}`);
          if (state === "online") {
            resolveRestore?.();
          }
        },
        onRestore() {
          restoreCalled = true;
        }
      }
    });

    expect(fsm.getState()).toBe("offline");

    fsm.connect();
    expect(MockWebSocket.instances.length).toBe(1);
    const mockWs = MockWebSocket.instances[0]!;

    mockWs.triggerOpen();

    await restorePromise;

    expect(stateChanges).toContain("offline->syncing");
    expect(stateChanges).toContain("syncing->online");
    expect(restoreCalled).toBe(true);
    expect(fsm.getState()).toBe("online");

    fsm.disconnect();
  });

  it("handles degraded states when ping pong is missing or error happens", () => {
    MockWebSocket.instances = [];
    const fsm = new DgxConnectionStateMachine("ws://localhost:8080", {
      WebSocketImpl: MockWebSocket as any,
      heartbeatIntervalMs: 100
    });

    fsm.connect();
    const mockWs = MockWebSocket.instances[0]!;
    mockWs.triggerOpen();

    expect(fsm.getState()).toBe("online");

    mockWs.triggerError();
    expect(fsm.getState()).toBe("degraded");
    expect(fsm.getLastError()).toBe("WebSocket 오류 이벤트를 받았습니다.");

    fsm.disconnect();
  });

  it("reports a Korean error when no WebSocket implementation is available", () => {
    vi.stubGlobal("WebSocket", undefined);
    const fsm = new DgxConnectionStateMachine("ws://localhost:8080");

    fsm.connect();

    expect(fsm.getState()).toBe("offline");
    expect(fsm.getLastError()).toBe("WebSocket 구현을 찾지 못했습니다.");
  });
});
