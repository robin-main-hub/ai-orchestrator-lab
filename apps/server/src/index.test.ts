import { describe, expect, it } from "vitest";
import {
  createDgxProviderCompletionResponse,
  createDgxHeartbeat,
  createDgxModelDiscovery,
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
    expect(health.capabilities).toContain("model-registry");
  });

  it("publishes the DGX-02 vLLM model registry", () => {
    const discovery = createDgxModelDiscovery("2026-05-24T00:00:00.000Z");

    expect(discovery.providerProfileId).toBe("provider_dgx02_vllm");
    expect(discovery.source).toBe("remote_probe");
    expect(discovery.models[0]?.id).toBe("qwen36-domain-wiki-rag-prisma");
    expect(discovery.redactionApplied).toBe(true);
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

  it("proxies DGX-02 vLLM completions without receiving raw endpoints from desktop", async () => {
    const response = await createDgxProviderCompletionResponse(
      {
        id: "provider_completion_request_1",
        sessionId: "session_1",
        providerProfileId: "provider_dgx02_vllm",
        modelId: "qwen36-domain-wiki-rag-prisma",
        messages: [{ role: "user", content: "Reply OK only" }],
        source: "desktop",
        routePreference: "server_proxy",
        createdAt: "2026-05-24T00:00:00.000Z",
      },
      {
        now: "2026-05-24T00:00:00.000Z",
        vllmBaseUrl: "http://127.0.0.1:8001/v1",
        fetchImpl: async (url, init) => {
          expect(url).toBe("http://127.0.0.1:8001/v1/chat/completions");
          expect(String(init?.body)).not.toContain("sk-");
          expect(String(init?.body)).toContain("\"enable_thinking\":false");
          return {
            ok: true,
            status: 200,
            async text() {
              return JSON.stringify({
                choices: [{ message: { content: "OK" } }],
                usage: { prompt_tokens: 12, completion_tokens: 2, total_tokens: 14 },
              });
            },
          };
        },
      },
    );

    expect(response.status).toBe("succeeded");
    expect(response.route).toBe("server_proxy");
    expect(response.content).toBe("OK");
    expect(response.usage?.totalTokens).toBe(14);
  });
});
