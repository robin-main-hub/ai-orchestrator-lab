import type {
  ClientDevice,
  DgxHeartbeat,
  RemoteExecutionRequest,
  RemoteExecutionResponse,
  RuntimeSnapshot,
} from "@ai-orchestrator/protocol";
import type { Stage4AgentRun } from "./stage4Runtime";

export type Stage5DgxBridge = {
  id: string;
  authorityNodeId: string;
  heartbeat: DgxHeartbeat;
  request: RemoteExecutionRequest;
  response: RemoteExecutionResponse;
  localFallbackEnabled: boolean;
  syncMode: RuntimeSnapshot["syncTopology"]["eventStoreMode"];
  createdAt: string;
};

export type Stage5DgxBridgeInput = {
  run: Stage4AgentRun;
  runtime: RuntimeSnapshot;
  approvalOverride?: RemoteExecutionRequest["approvalState"];
  createdAt?: string;
};

export function createStage5DgxBridge({
  run,
  runtime,
  approvalOverride,
  createdAt = new Date().toISOString(),
}: Stage5DgxBridgeInput): Stage5DgxBridge {
  const approvalState = approvalOverride ?? (run.status === "ready_for_approval" ? "required" : "not_required");
  const request: RemoteExecutionRequest = {
    id: `remote_request_${crypto.randomUUID()}`,
    runId: run.id,
    kind: "workspace_run",
    targetNodeId: runtime.syncTopology.authorityNodeId,
    commandPreview: createCommandPreview(run),
    approvalState,
    createdAt,
  };
  const heartbeat = createLocalHeartbeat(runtime, createdAt);
  const response = createLocalRemoteResponse(request, runtime, createdAt);

  return {
    id: `dgx_bridge_${crypto.randomUUID()}`,
    authorityNodeId: runtime.syncTopology.authorityNodeId,
    heartbeat,
    request,
    response,
    localFallbackEnabled: response.status === "fallback_required" || response.status === "blocked",
    syncMode: runtime.syncTopology.eventStoreMode,
    createdAt,
  };
}

export function mergeDgxRuntimeSnapshot(localRuntime: RuntimeSnapshot, serverRuntime: RuntimeSnapshot): RuntimeSnapshot {
  const serverRuntimeNodes = normalizeServerRuntimeNodes(serverRuntime);

  return {
    ...localRuntime,
    status: serverRuntime.status === "online" ? "online" : localRuntime.status,
    dgxStatus: serverRuntime.dgxStatus,
    syncTopology: {
      ...localRuntime.syncTopology,
      authorityNodeId: serverRuntime.syncTopology.authorityNodeId,
      authorityLabel: serverRuntime.syncTopology.authorityLabel,
      clients: mergeClients(localRuntime, serverRuntime),
    },
    runtimeNodes: mergeRuntimeNodes(localRuntime, {
      ...serverRuntime,
      runtimeNodes: serverRuntimeNodes,
    }),
    recentError: serverRuntime.dgxStatus === "online" ? undefined : localRuntime.recentError,
    updatedAt: serverRuntime.updatedAt,
  };
}

function createLocalHeartbeat(runtime: RuntimeSnapshot, checkedAt: string): DgxHeartbeat {
  return {
    nodeId: runtime.syncTopology.authorityNodeId,
    status: runtime.dgxStatus === "online" ? "connected" : "unreachable",
    latencyMs: runtime.dgxStatus === "online" ? 18 : undefined,
    checkedAt,
    message: runtime.dgxStatus === "online" ? "dgx authority reachable" : "dgx unreachable; desktop uses local fallback",
  };
}

function createLocalRemoteResponse(
  request: RemoteExecutionRequest,
  runtime: RuntimeSnapshot,
  createdAt: string,
): RemoteExecutionResponse {
  if (request.approvalState !== "approved") {
    return {
      id: `remote_response_${crypto.randomUUID()}`,
      requestId: request.id,
      status: "blocked",
      targetNodeId: request.targetNodeId,
      fallbackMode: "local_cli",
      message: "approval required before DGX remote workspace execution",
      createdAt,
    };
  }

  if (runtime.dgxStatus !== "online") {
    return {
      id: `remote_response_${crypto.randomUUID()}`,
      requestId: request.id,
      status: "fallback_required",
      targetNodeId: request.targetNodeId,
      fallbackMode: "local_cli",
      message: "DGX is offline; keep the run in local outbox",
      createdAt,
    };
  }

  return {
    id: `remote_response_${crypto.randomUUID()}`,
    requestId: request.id,
    status: "queued",
    targetNodeId: request.targetNodeId,
    fallbackMode: "none",
    message: "DGX remote run queued",
    createdAt,
  };
}

function createCommandPreview(run: Stage4AgentRun): string {
  const verifier = run.verifier.status;
  const required = run.steps.filter((step) => step.permissionState === "required").length;
  return `run ${run.id} with verifier=${verifier}; approvals=${required}`;
}

function mergeClients(localRuntime: RuntimeSnapshot, serverRuntime: RuntimeSnapshot) {
  const serverClients = serverRuntime.syncTopology.clients.map((client) => normalizeServerClient(client));
  const serverClientIds = new Set(serverClients.map((client) => client.id));
  return [
    ...serverClients,
    ...localRuntime.syncTopology.clients.filter((client) => !serverClientIds.has(client.id)),
  ];
}

function mergeRuntimeNodes(localRuntime: RuntimeSnapshot, serverRuntime: RuntimeSnapshot) {
  const localNodeIds = new Set(localRuntime.runtimeNodes.map((node) => node.id));
  return [
    ...localRuntime.runtimeNodes.map((node) =>
      node.id === serverRuntime.syncTopology.authorityNodeId
        ? serverRuntime.runtimeNodes.find((serverNode) => serverNode.id === node.id) ?? node
        : node,
    ),
    ...serverRuntime.runtimeNodes.filter((node) => !localNodeIds.has(node.id)),
  ];
}

function normalizeServerRuntimeNodes(serverRuntime: RuntimeSnapshot) {
  return serverRuntime.runtimeNodes.map((node) =>
    node.id === serverRuntime.syncTopology.authorityNodeId
      ? {
          ...node,
          role: "main_server" as const,
          isPrimary: true,
        }
      : node,
  );
}

function normalizeServerClient(client: ClientDevice): ClientDevice {
  if (client.id !== "dgx-02" && client.syncRole !== "authority") {
    return normalizeCacheClient(client);
  }

  return {
    ...client,
    id: "dgx-02",
    label: client.label || "DGX-02",
    kind: "server",
    syncRole: "authority",
    localStore: client.localStore === "none" ? "sqlite" : client.localStore,
    outboxMode: "stateless",
    failurePolicy: "compute_degraded",
  };
}

function normalizeCacheClient(client: ClientDevice): ClientDevice {
  return {
    ...client,
    syncRole: "cache_client",
    outboxMode: client.outboxMode === "stateless" ? "stateless" : "offline_cache_outbox",
    failurePolicy:
      client.kind === "desktop_pc"
        ? "unavailable_without_dgx"
        : client.failurePolicy === "compute_degraded"
          ? "compute_degraded"
          : "continue_locally",
  };
}

export type DgxConnectionState = "online" | "degraded" | "offline" | "syncing";

export interface DgxConnectionStateListener {
  onStateChange?(state: DgxConnectionState, previousState: DgxConnectionState): void;
  onRestore?(): Promise<void> | void;
}

export type DgxConnectionStateMachineOptions = {
  heartbeatIntervalMs?: number;
  reconnectIntervalMs?: number;
  listeners?: DgxConnectionStateListener;
  WebSocketImpl?: typeof WebSocket;
};

export class DgxConnectionStateMachine {
  private currentState: DgxConnectionState = "offline";
  private ws: WebSocket | null = null;
  private heartbeatTimer: any = null;
  private reconnectTimer: any = null;
  private lastHeartbeatTime: number = 0;
  private currentLatencyMs: number = 0;
  private lastError: string | null = null;

  constructor(
    private readonly wsUrl: string,
    private readonly options: DgxConnectionStateMachineOptions = {}
  ) {
    this.currentState = "offline";
  }

  getState(): DgxConnectionState {
    return this.currentState;
  }

  getLatencyMs(): number {
    return this.currentLatencyMs;
  }

  getLastError(): string | null {
    return this.lastError;
  }

  private transitionTo(nextState: DgxConnectionState) {
    if (this.currentState === nextState) return;
    const prevState = this.currentState;
    this.currentState = nextState;

    this.options.listeners?.onStateChange?.(nextState, prevState);

    if (prevState === "offline" && nextState === "syncing") {
      this.handleRestore();
    }
  }

  private async handleRestore() {
    try {
      if (this.options.listeners?.onRestore) {
        await this.options.listeners.onRestore();
      }
      this.transitionTo("online");
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      this.transitionTo("degraded");
    }
  }

  connect() {
    this.disconnect();

    const WSClass = this.options.WebSocketImpl ?? globalThis.WebSocket;
    if (!WSClass) {
      this.lastError = "WebSocket implementation not found";
      this.transitionTo("offline");
      return;
    }

    try {
      this.ws = new WSClass(this.wsUrl);
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.lastError = null;
      this.lastHeartbeatTime = Date.now();
      
      if (this.currentState === "offline") {
        this.transitionTo("syncing");
      } else {
        this.transitionTo("online");
      }
      this.startHeartbeat();
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "pong" || data.type === "heartbeat") {
          this.lastHeartbeatTime = Date.now();
          if (data.timestamp) {
            this.currentLatencyMs = Date.now() - data.timestamp;
          }
          if (this.currentState === "degraded") {
            this.transitionTo("online");
          }
        }
      } catch (err) {
        // ignore
      }
    };

    this.ws.onerror = () => {
      this.lastError = "WebSocket error event";
      this.transitionTo("degraded");
    };

    this.ws.onclose = () => {
      this.transitionTo("offline");
      this.scheduleReconnect();
    };
  }

  disconnect() {
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) {}
      this.ws = null;
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    const interval = this.options.heartbeatIntervalMs ?? 10000;
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === 1) { // OPEN
        try {
          this.ws.send(JSON.stringify({ type: "ping", timestamp: Date.now() }));
        } catch (e) {
          this.transitionTo("degraded");
        }
      }

      const elapsed = Date.now() - this.lastHeartbeatTime;
      if (elapsed > interval * 2.5) {
        this.transitionTo("degraded");
      }
    }, interval);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    const interval = this.options.reconnectIntervalMs ?? 5000;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, interval);
  }
}

