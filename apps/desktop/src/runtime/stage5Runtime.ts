import type {
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
    runtimeNodes: mergeRuntimeNodes(localRuntime, serverRuntime),
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
  const serverClientIds = new Set(serverRuntime.syncTopology.clients.map((client) => client.id));
  return [
    ...serverRuntime.syncTopology.clients,
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
