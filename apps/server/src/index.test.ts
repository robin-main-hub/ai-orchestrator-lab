import { describe, expect, it } from "vitest";
import {
  createDgxHeartbeat,
  createHealthResponse,
  createRemoteRunResponse,
  createRuntimeSnapshot,
} from "./index";

describe("server health placeholder", () => {
  it("returns a DGX-02 authority runtime status", () => {
    const health = createHealthResponse();

    expect(health.status).toBe("ok");
    expect(health.runtime.status).toBe("degraded");
    expect(health.runtime.syncTopology.authorityNodeId).toBe("dgx-02");
    expect(health.capabilities).toContain("remote-run-request");
  });

  it("blocks remote runs until approval is granted", () => {
    const response = createRemoteRunResponse({
      id: "remote_request_1",
      runId: "run_1",
      kind: "workspace_run",
      targetNodeId: "dgx-02",
      commandPreview: "pnpm test",
      approvalState: "required",
      createdAt: "2026-05-24T00:00:00.000Z",
    });

    expect(response.status).toBe("blocked");
    expect(response.fallbackMode).toBe("local_cli");
  });

  it("queues approved runs when DGX is online", () => {
    const response = createRemoteRunResponse({
      id: "remote_request_2",
      runId: "run_2",
      kind: "workspace_run",
      targetNodeId: "dgx-02",
      commandPreview: "pnpm test",
      approvalState: "approved",
      createdAt: "2026-05-24T00:00:00.000Z",
    });

    expect(response.status).toBe("queued");
    expect(response.fallbackMode).toBe("none");
  });

  it("reports heartbeat state from runtime", () => {
    const heartbeat = createDgxHeartbeat(createRuntimeSnapshot("2026-05-24T00:00:00.000Z"));

    expect(heartbeat.nodeId).toBe("dgx-02");
    expect(heartbeat.status).toBe("connected");
  });
});
