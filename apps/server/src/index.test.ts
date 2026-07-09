import { afterAll, describe, expect, it } from "vitest";
import { createHash, createHmac } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  agentDelegationEventTypeSchema,
  parseAgentDelegationEventPayload,
  parseTerminalCommandEventPayload,
  operatorCockpitSnapshotSchema,
  terminalCommandEventTypeSchema,
} from "@ai-orchestrator/protocol";
import type { MemoryInput, MemoryRecord } from "@ai-orchestrator/protocol";
import { MemoryAdapterError, type MemoryAdapter, type MemoryAdapterContext } from "@ai-orchestrator/simplememo";
import type { ServerAgentDelegationExecuteRequest } from "./index";
import {
  NonceRegistry,
  createEventStorageSnapshot,
  createDgxProviderCompletionResponse,
  createDgxHeartbeat,
  createDgxModelDiscovery,
  createHealthResponse,
  createJsonlServerEventStorage,
  createLiveHealthResponse,
  createProviderCompletionApprovalRequest,
  createServerIngressSnapshot,
  createServerOperatorCockpitSnapshot,
  createServerAgentDelegationExecution,
  createServerTmuxCaptureSnapshot,
  createServerTmuxDispatchSnapshot,
  createServerTmuxPreflightResponse,
  createServerProviderRegistrySnapshot,
  createServerProviderModelDiscoveryResponse,
  createRemoteRunResponse,
  decideApprovalInPersistentServerStorage,
  estimateProviderCompletionBudgetTokens,
  evaluateServerProviderCompletionPermission,
  evaluateServerRemoteRunPermission,
  createRuntimeSnapshot,
  createServerEventStorageState,
  listApprovalsFromServerStorage,
  listEventStorageSessions,
  loadServerEventStorageStateFromJsonl,
  pickAllowedOrigin,
  pullEventsFromServerStorage,
  probeDgxVllm,
  pullEventsFromPersistentServerStorage,
  pushEventsToPersistentServerStorage,
  pushEventsToServerStorage,
  redactInternalPathsForPublicHealth,
  redactForServerPhase,
  recordApprovalRequestToPersistentServerStorage,
  replayApprovedRequestFromPersistentServerStorage,
  resolveAllowedOrigins,
  startServer,
  syncMemoryRecords,
  getFilteredSubprocessEnv,
} from "./index";
import { handleVerifyPacketRoute, type VerifyPacketRouteDependencies } from "./routes/verifyPacket";

function expectValidAgentDelegationEvents(events: Array<{ type: string; payload: unknown }>) {
  for (const event of events) {
    const type = agentDelegationEventTypeSchema.parse(event.type);
    expect(() => parseAgentDelegationEventPayload(type, event.payload)).not.toThrow();
  }
}

function expectValidTerminalCommandEvents(events: Array<{ type: string; payload: unknown }>) {
  for (const event of events) {
    const type = terminalCommandEventTypeSchema.parse(event.type);
    expect(() => parseTerminalCommandEventPayload(type, event.payload)).not.toThrow();
  }
}

function createDgxRequestSignatureHeaders({
  method,
  path,
  token,
  body = "",
  timestamp = Date.now().toString(),
  nonce = "test-nonce",
}: {
  method: string;
  path: string;
  token: string;
  body?: string;
  timestamp?: string;
  nonce?: string;
}) {
  const bodyHash = createHash("sha256")
    .update(body)
    .digest("hex");
  const signature = createHmac("sha256", token)
    .update([method.toUpperCase(), path, bodyHash, timestamp, nonce].join("\n"))
    .digest("hex");

  return {
    "x-dgx-timestamp": timestamp,
    "x-dgx-nonce": nonce,
    "x-dgx-body-sha256": bodyHash,
    "x-dgx-signature": signature,
  };
}

describe("server health placeholder", () => {
  it("returns DGX-02 authority with client cache runtime status", () => {
    const health = createHealthResponse();

    expect(health.status).toBe("ok");
    expect(health.runtime.status).toBe("degraded");
    expect(health.runtime.syncTopology.authorityNodeId).toBe("dgx-02");
    expect(health.runtime.syncTopology.conflictPolicy).toBe("dgx02_authority_wins");
    expect(health.capabilities).toContain("remote-run-request");
    expect(health.capabilities).toContain("model-registry");
    expect(health.capabilities).toContain("agent-delegation-endpoint");
    expect(health.capabilities).toContain("vllm-health");
    expect(health.capabilities).toContain("event-storage-sync");
    expect(health.capabilities).toContain("event-stream");
    expect(health.capabilities).toContain("memory-sync");
    expect(health.capabilities).not.toContain("remote-event-stream-placeholder");
    expect(health.capabilities).not.toContain("memory-sync-placeholder");
    expect(health.eventStorage.mode).toBe("memory");
    expect(health.eventStorage.revision).toBe(0);
  });

  it("publishes the DGX-02 vLLM model registry", () => {
    const discovery = createDgxModelDiscovery("2026-05-24T00:00:00.000Z");

    expect(discovery.providerProfileId).toBe("provider_dgx02_vllm");
    expect(discovery.source).toBe("remote_probe");
    expect(discovery.models[0]?.id).toBe("qwen36-domain-lora-v5-prisma");
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

  it("blocks approved runs until a remote worker queue acknowledges the request", () => {
    const response = createRemoteRunResponse({
      id: "remote_request_2",
      runId: "run_2",
      kind: "workspace_run",
      targetNodeId: "dgx-02",
      commandPreview: "pnpm test",
      approvalState: "approved",
      createdAt: "2026-05-24T00:00:00.000Z",
    });

    expect(response.status).toBe("blocked");
    expect(response.fallbackMode).toBe("local_cli");
    expect(response.message).toContain("worker queue acknowledgement");
  });

  it("queues approved runs only with explicit remote worker acknowledgement", () => {
    const response = createRemoteRunResponse(
      {
        id: "remote_request_2_ack",
        runId: "run_2_ack",
        kind: "workspace_run",
        targetNodeId: "dgx-02",
        commandPreview: "pnpm test",
        approvalState: "approved",
        createdAt: "2026-05-24T00:00:00.000Z",
      },
      createRuntimeSnapshot(),
      { workerAck: true },
    );

    expect(response.status).toBe("queued");
    expect(response.fallbackMode).toBe("none");
  });

  it("requires approval before DGX-02 uses limited or untrusted provider credentials", () => {
    const permission = evaluateServerProviderCompletionPermission({
      id: "provider_completion_request_permission",
      sessionId: "session_1",
      providerProfileId: "provider_apifun_claude",
      modelId: "claude-opus-4-6",
      messages: [{ role: "user", content: "hello" }],
      source: "desktop",
      routePreference: "server_proxy",
      createdAt: "2026-05-24T00:00:00.000Z",
    });

    expect(permission.action).toBe("provider_completion");
    expect(permission.decision).toBe("approval_required");
    expect(permission.approvalState).toBe("required");
    expect(permission.requestedLevels).toEqual(["network_access", "secret_access"]);
  });

  it("creates a read-only Operator Cockpit snapshot without leaking raw secrets", async () => {
    const snapshot = await createServerOperatorCockpitSnapshot({
      now: "2026-05-24T00:01:00.000Z",
      eventStorage: {
        mode: "jsonl",
        storageDir: "[redacted]",
        eventLogPath: "[redacted]",
        revision: 7,
        eventCount: 13,
        sessionCount: 3,
        loadedAt: "2026-05-24T00:00:00.000Z",
      },
      fetchImpl: async () =>
        ({
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ data: [{ id: "qwen36-domain-lora-v5-prisma" }] }),
        }) as any,
    });

    expect(() => operatorCockpitSnapshotSchema.parse(snapshot)).not.toThrow();
    expect(snapshot.id).toContain("server-cockpit");
    expect(snapshot.fleet.map((worker) => worker.workerId)).toEqual([
      "server-provider-registry",
      "server-event-storage",
      "server-dgx-runtime",
    ]);
    expect(snapshot.memory.contextReasons).toContain("Server provider registry readiness");
    expect(snapshot.recovery.healthIndicators.join("\n")).toContain("Event storage: jsonl, 13 events, revision 7");
    expect(JSON.stringify(snapshot)).not.toMatch(/sk-|ANTHROPIC_API_KEY|OPENAI_API_KEY|BEGIN PRIVATE KEY/);
  });

  it("allows approved provider completion requests through the server gate", () => {
    const permission = evaluateServerProviderCompletionPermission({
      id: "provider_completion_request_permission_approved",
      sessionId: "session_1",
      providerProfileId: "provider_apifun_claude",
      modelId: "claude-opus-4-6",
      messages: [{ role: "user", content: "hello" }],
      source: "desktop",
      routePreference: "server_proxy",
      approvalState: "approved",
      permissionDecision: "allow",
      createdAt: "2026-05-24T00:00:00.000Z",
    });

    expect(permission.decision).toBe("allow");
    expect(permission.approvalState).toBe("approved");
  });

  it("does not treat client-supplied allow decisions as approval by themselves", () => {
    const permission = evaluateServerProviderCompletionPermission({
      id: "provider_completion_request_permission_client_allow",
      sessionId: "session_1",
      providerProfileId: "provider_apifun_claude",
      modelId: "claude-opus-4-6",
      messages: [{ role: "user", content: "hello" }],
      source: "desktop",
      routePreference: "server_proxy",
      permissionDecision: "allow",
      createdAt: "2026-05-24T00:00:00.000Z",
    });

    expect(permission.decision).toBe("approval_required");
    expect(permission.approvalState).toBe("required");
  });

  it("allows trusted DGX-02 providers without a second approval", () => {
    const permission = evaluateServerProviderCompletionPermission({
      id: "provider_completion_request_permission_trusted",
      sessionId: "session_1",
      providerProfileId: "provider_codex_oauth",
      modelId: "codex-session",
      messages: [{ role: "user", content: "hello" }],
      source: "desktop",
      routePreference: "server_proxy",
      createdAt: "2026-05-24T00:00:00.000Z",
    });

    expect(permission.decision).toBe("allow");
    expect(permission.approvalState).toBe("not_required");
    expect(permission.requestedLevels).toEqual(["network_access"]);
  });

  it("requires budget approval for high-token trusted provider requests", () => {
    const longPrompt = "budget ".repeat(14_000);
    const permission = evaluateServerProviderCompletionPermission({
      id: "provider_completion_request_budget_approval",
      sessionId: "session_1",
      providerProfileId: "provider_codex_oauth",
      modelId: "codex-session",
      messages: [{ role: "user", content: longPrompt }],
      source: "desktop",
      routePreference: "server_proxy",
      createdAt: "2026-05-24T00:00:00.000Z",
    });

    expect(permission.costEstimateTokens).toBe(estimateProviderCompletionBudgetTokens([{ role: "user", content: longPrompt }]));
    expect(permission.decision).toBe("approval_required");
    expect(permission.approvalState).toBe("required");
    expect(permission.reason).toContain("budget approval");
  });

  it("denies provider completion requests above the hard budget limit", () => {
    const oversizedPrompt = "hard-limit ".repeat(52_000);
    const permission = evaluateServerProviderCompletionPermission({
      id: "provider_completion_request_budget_denied",
      sessionId: "session_1",
      providerProfileId: "provider_codex_oauth",
      modelId: "codex-session",
      messages: [{ role: "user", content: oversizedPrompt }],
      source: "desktop",
      routePreference: "server_proxy",
      approvalState: "approved",
      permissionDecision: "allow",
      createdAt: "2026-05-24T00:00:00.000Z",
    });

    expect(permission.costEstimateTokens).toBeGreaterThan(128_000);
    expect(permission.decision).toBe("deny");
    expect(permission.approvalState).toBe("rejected");
    expect(permission.reason).toContain("hard limit");
  });

  it("includes provider cost estimate in approval requests", () => {
    const request = {
      id: "provider_completion_request_budget_payload",
      sessionId: "session_1",
      providerProfileId: "provider_apifun_claude",
      modelId: "claude-opus-4-6",
      messages: [{ role: "user" as const, content: "hello" }],
      source: "desktop" as const,
      routePreference: "server_proxy" as const,
      createdAt: "2026-05-24T00:00:00.000Z",
    };
    const permission = evaluateServerProviderCompletionPermission(request);
    const approval = createProviderCompletionApprovalRequest(request, permission, "2026-05-24T00:00:00.000Z");

    expect(approval.costEstimateTokens).toBe(permission.costEstimateTokens);
    expect(approval.costEstimateTokens).toBeGreaterThan(0);
  });

  it("derives the approval queue from Event Storage approval events", () => {
    const state = createServerEventStorageState();
    const request = {
      id: "provider_completion_request_approval_queue",
      sessionId: "session_1",
      providerProfileId: "provider_apifun_claude",
      modelId: "claude-opus-4-6",
      messages: [{ role: "user" as const, content: "hello" }],
      source: "desktop" as const,
      routePreference: "server_proxy" as const,
      createdAt: "2026-05-24T00:00:00.000Z",
    };
    const permission = evaluateServerProviderCompletionPermission(request);
    const approval = createProviderCompletionApprovalRequest(request, permission, "2026-05-24T00:00:00.000Z");

    pushEventsToServerStorage(
      {
        id: "event_sync_approval_queue",
        clientId: "test",
        sessionId: approval.sessionId,
        events: [
          {
            id: "event_approval_requested_test",
            sessionId: approval.sessionId,
            type: "approval.requested",
            payload: approval,
            createdAt: approval.createdAt,
            source: "server",
            sourceTrust: "trusted",
            redacted: true,
          },
        ],
        idempotencyKey: "event_approval_requested_test",
        createdAt: approval.createdAt,
      },
      state,
      approval.createdAt,
    );

    const list = listApprovalsFromServerStorage(state, "2026-05-24T00:00:01.000Z");

    expect(list.summary.pending).toBe(1);
    expect(list.queue[0]).toMatchObject({
      sourceItemId: request.id,
      state: "required",
      requestedBy: "user",
    });
    expect(list.queue[0]?.permissions).toEqual(["network_access", "secret_access"]);
  });

  it("maps remote run approvals through the shared server gate", () => {
    const required = evaluateServerRemoteRunPermission({
      id: "remote_request_permission_required",
      runId: "run_1",
      kind: "workspace_run",
      targetNodeId: "dgx-02",
      commandPreview: "pnpm test",
      approvalState: "required",
      createdAt: "2026-05-24T00:00:00.000Z",
    });
    const approved = evaluateServerRemoteRunPermission({
      id: "remote_request_permission_approved",
      runId: "run_2",
      kind: "workspace_run",
      targetNodeId: "dgx-02",
      commandPreview: "pnpm test",
      approvalState: "approved",
      createdAt: "2026-05-24T00:00:00.000Z",
    });

    expect(required.decision).toBe("approval_required");
    expect(required.requestedLevels).toEqual(["run_safe_commands", "remote_workspace"]);
    expect(approved.decision).toBe("allow");
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
        modelId: "qwen36-domain-lora-v5-prisma",
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
    expect(response.runtimeHints).toMatchObject({
      estimatedTokens: expect.any(Number),
      budgetApprovalThresholdTokens: expect.any(Number),
      budgetHardLimitTokens: expect.any(Number),
      retryable: false,
    });
  });

  it("redacts provider prompts before send and provider content after receive", async () => {
    const response = await createDgxProviderCompletionResponse(
      {
        id: "provider_completion_request_redaction",
        sessionId: "session_1",
        providerProfileId: "provider_dgx02_vllm",
        modelId: "qwen36-domain-lora-v5-prisma",
        messages: [
          {
            role: "user",
            content: "token sk-thisshouldnotleaveDGX02 and email choiminwoong@example.com",
          },
        ],
        source: "desktop",
        routePreference: "server_proxy",
        createdAt: "2026-05-24T00:00:00.000Z",
      },
      {
        now: "2026-05-24T00:00:00.000Z",
        vllmBaseUrl: "http://127.0.0.1:8001/v1",
        fetchImpl: async (_url, init) => {
          const bodyText = String(init?.body);
          expect(bodyText).not.toContain("sk-thisshouldnotleaveDGX02");
          expect(bodyText).not.toContain("choiminwoong@example.com");
          expect(bodyText).toContain("<redacted>");
          expect(bodyText).toContain("<redacted:email>");
          return {
            ok: true,
            status: 200,
            async text() {
              return JSON.stringify({
                choices: [{ message: { content: "received Bearer abcdefghijklmnopqrstuvwxyz123456" } }],
              });
            },
          };
        },
      },
    );

    expect(response.status).toBe("succeeded");
    expect(response.content).not.toContain("abcdefghijklmnopqrstuvwxyz");
    expect(response.content).toContain("<redacted>");
  });

  it("marks transient provider failures as retryable runtime hints", async () => {
    const response = await createDgxProviderCompletionResponse(
      {
        id: "provider_completion_request_retry_hint",
        sessionId: "session_1",
        providerProfileId: "provider_dgx02_vllm",
        modelId: "qwen36-domain-lora-v5-prisma",
        messages: [{ role: "user", content: "Reply OK only" }],
        source: "desktop",
        routePreference: "server_proxy",
        createdAt: "2026-05-24T00:00:00.000Z",
      },
      {
        now: "2026-05-24T00:00:00.000Z",
        vllmBaseUrl: "http://127.0.0.1:8001/v1",
        fetchImpl: async () => ({
          ok: false,
          status: 502,
          async text() {
            return "Bad Gateway";
          },
        }),
      },
    );

    expect(response.status).toBe("failed");
    expect(response.runtimeHints).toMatchObject({
      retryable: true,
      retryReason: "transient_http_status",
    });
  });

  it("recursively redacts sensitive keys and PII for server phases", () => {
    const result = redactForServerPhase(
      {
        authorization: "Bearer abcdefghijklmnopqrstuvwxyz123456",
        nested: {
          note: "contact 010-1234-5678 or robin@example.com",
        },
      },
      "pre_send",
    );

    expect(result.report.redacted).toBe(true);
    expect(result.report.patternIds).toContain("sensitive_key");
    expect(result.report.patternIds).toContain("pii_email");
    expect(JSON.stringify(result.value)).not.toContain("abcdefghijklmnopqrstuvwxyz");
    expect(JSON.stringify(result.value)).not.toContain("010-1234-5678");
    expect(JSON.stringify(result.value)).not.toContain("robin@example.com");
  });

  it("normalizes external ingress into redacted events and approval requests", () => {
    const snapshot = createServerIngressSnapshot({
      id: "external_ingress_input_server_test",
      sessionId: "session_ingress_test",
      channel: "external_legacy",
      authorType: "user",
      eventType: "message",
      text: "run pnpm test with OPENAI_API_KEY=sk-server-ingress-secret123456",
      receivedAt: "2026-05-24T00:00:00.000Z",
    });

    expect(snapshot.result.accepted).toBe(true);
    expect(snapshot.result.guardSteps).toHaveLength(7);
    expect(snapshot.result.approvalState).toBe("required");
    expect(snapshot.result.normalizedEvent?.sourceTrust).toBe("untrusted");
    expect(snapshot.result.normalizedEvent?.requestedPermissions).toEqual(
      expect.arrayContaining(["run_safe_commands", "secret_access"]),
    );
    expect(snapshot.result.normalizedEvent?.normalizedText).not.toContain("sk-server-ingress-secret");
    expect(snapshot.approvals[0]).toMatchObject({
      action: "terminal_run",
      state: "required",
      sourceTrust: "untrusted",
    });
  });

  it("records tmux dispatch intents behind approval without leaking raw secrets", () => {
    const snapshot = createServerTmuxDispatchSnapshot(
      {
        id: "tmux_dispatch_test",
        sessionId: "session_tmux_test",
        terminalSessionId: "terminal_session_ai_swarm",
        role: "architect",
        host: "dgx_02",
        paneId: "%4",
        requestedBy: "user",
        commandPreview: "pnpm typecheck",
        approvalState: "required",
        dispatchMode: "execute_if_approved",
        tmuxSessionName: "ai-swarm",
        createdAt: "2026-05-24T00:00:00.000Z",
      },
      "2026-05-24T00:00:00.000Z",
    );

    expect(snapshot.intent.dispatchState).toBe("pending_approval");
    expect(snapshot.permission.decision).toBe("approval_required");
    expect(snapshot.approval).toMatchObject({
      action: "terminal_run",
      replay: {
        endpoint: "/tmux/dispatch",
        kind: "tmux_dispatch",
        method: "POST",
      },
      state: "required",
      requestedLevels: expect.arrayContaining(["run_safe_commands", "remote_workspace"]),
    });
    expect(snapshot.approval?.replay?.payload).toMatchObject({
      approvalState: "approved",
      id: "tmux_dispatch_test",
    });
    expect(snapshot.events.map((event) => event.type)).toEqual([
      "terminal.command.intent.created",
      "approval.requested",
    ]);
    expect(snapshot.timelineBlocks.map((block) => block.kind)).toEqual(["command_intent", "approval"]);
    expect(snapshot.timelineBlocks[0]).toMatchObject({
      commandIntentId: "tmux_dispatch_test",
      status: "pending_approval",
    });
    expect(snapshot.timelineBlocks[1]).toMatchObject({
      approvalId: snapshot.approval?.id,
      status: "pending_approval",
    });
    expectValidTerminalCommandEvents(snapshot.events.filter((event) => event.type.startsWith("terminal.command.")));

    const denied = createServerTmuxDispatchSnapshot({
      id: "tmux_dispatch_secret_test",
      sessionId: "session_tmux_test",
      terminalSessionId: "terminal_session_ai_swarm",
      role: "qa",
      host: "dgx_02",
      paneId: "%7",
      requestedBy: "user",
      commandPreview: "echo Bearer abcdefghijklmnopqrstuvwxyz123456",
      approvalState: "approved",
      dispatchMode: "execute_if_approved",
      tmuxSessionName: "ai-swarm",
      createdAt: "2026-05-24T00:00:00.000Z",
    });
    expect(denied.permission.decision).toBe("deny");
    expect(denied.intent.dispatchState).toBe("blocked");
    expect(JSON.stringify(denied)).not.toContain("abcdefghijklmnopqrstuvwxyz");
  });

  it("preflights tmux dispatch with auditable timeline blocks before replay", () => {
    const preflight = createServerTmuxPreflightResponse(
      {
        id: "tmux_preflight_test",
        sessionId: "session_tmux_test",
        terminalSessionId: "terminal_session_ai_swarm",
        role: "backend",
        host: "dgx_02",
        paneId: "%6",
        requestedBy: "user",
        commandPreview: "pnpm test",
        approvalState: "required",
        dispatchMode: "execute_if_approved",
        tmuxSessionName: "ai-swarm",
        createdAt: "2026-05-24T00:00:00.000Z",
      },
      "2026-05-24T00:00:00.000Z",
    );

    expect(preflight.permission.decision).toBe("approval_required");
    expect(preflight.audit.wouldQueueApproval).toBe(true);
    expect(preflight.audit.wouldRecordEvents).toEqual(["terminal.command.intent.created", "approval.requested"]);
    expect(preflight.timelineBlocks).toHaveLength(2);
    expect(preflight.timelineBlocks[0]?.kind).toBe("command_intent");
    expect(preflight.timelineBlocks[1]?.kind).toBe("approval");
  });

  it("redacts read-only tmux pane captures before event storage", () => {
    const snapshot = createServerTmuxCaptureSnapshot(
      {
        id: "tmux_capture_test",
        sessionId: "session_tmux_test",
        terminalSessionId: "terminal_session_ai_swarm",
        role: "qa",
        host: "dgx_02",
        paneId: "%7",
        requestedBy: "user",
        lines: 80,
        tmuxSessionName: "ai-swarm",
        createdAt: "2026-05-24T00:00:00.000Z",
      },
      "running with Bearer abcdefghijklmnopqrstuvwxyz123456\nall good",
      "2026-05-24T00:00:00.000Z",
    );

    expect(snapshot.payload.redactionApplied).toBe(true);
    expect(snapshot.payload.outputPreview).not.toContain("abcdefghijklmnopqrstuvwxyz");
    expect(snapshot.payload.outputPreview).toContain("<redacted>");
    expect(snapshot.event.type).toBe("terminal.pane.output_captured");
    expect(snapshot.event.redacted).toBe(true);
  });

  it("merges desktop system prompts before proxying to strict vLLM chat templates", async () => {
    const response = await createDgxProviderCompletionResponse(
      {
        id: "provider_completion_request_system_merge",
        sessionId: "session_1",
        providerProfileId: "provider_dgx02_vllm",
        modelId: "qwen36-domain-lora-v5-prisma",
        messages: [
          { role: "system", content: "Desktop pipeline context." },
          { role: "user", content: "Reply OK only" },
        ],
        source: "desktop",
        routePreference: "server_proxy",
        createdAt: "2026-05-24T00:00:00.000Z",
      },
      {
        now: "2026-05-24T00:00:00.000Z",
        vllmBaseUrl: "http://127.0.0.1:8001/v1",
        fetchImpl: async (_url, init) => {
          const body = JSON.parse(String(init?.body)) as { messages: Array<{ role: string; content: string }> };
          expect(body.messages.filter((message) => message.role === "system")).toHaveLength(1);
          expect(body.messages[0]?.content).toContain("Desktop pipeline context.");
          expect(body.messages[1]?.role).toBe("user");
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
    expect(response.content).toBe("OK");
  });

  it("routes APIFun Claude through DGX-02 secret refs without leaking the token into the request body", async () => {
    const previousKey = process.env.APIFUN_API_KEY;
    process.env.APIFUN_API_KEY = "apifun-test-secret";

    try {
      const response = await createDgxProviderCompletionResponse(
        {
          id: "provider_completion_request_apifun",
          sessionId: "session_1",
          providerProfileId: "provider_apifun_claude",
          modelId: "claude-code-compatible",
          messages: [{ role: "user", content: "테스트 응답" }],
          source: "desktop",
          routePreference: "server_proxy",
          createdAt: "2026-05-24T00:00:00.000Z",
        },
        {
          now: "2026-05-24T00:00:00.000Z",
          fetchImpl: async (url, init) => {
            expect(url).toBe("https://api.apikey.fun/v1/messages");
            // Anthropic uses x-api-key, not Authorization: Bearer. The
            // AnthropicAdapter sets this header from the secret and never
            // echoes the value back into the body.
            expect(init?.headers?.["x-api-key"]).toBe("apifun-test-secret");
            expect(init?.headers?.["anthropic-version"]).toBe("2023-06-01");
            expect(init?.headers?.authorization).toBeUndefined();
            expect(String(init?.body)).not.toContain("apifun-test-secret");
            expect(String(init?.body)).toContain("\"model\":\"claude-code-compatible\"");
            return {
              ok: true,
              status: 200,
              async text() {
                return JSON.stringify({
                  type: "message",
                  content: [{ type: "text", text: "APIFun OK" }],
                  stop_reason: "end_turn",
                  usage: { input_tokens: 10, output_tokens: 3 },
                });
              },
            };
          },
        },
      );

      expect(response.status).toBe("succeeded");
      expect(response.content).toBe("APIFun OK");
      expect(response.usage?.totalTokens).toBe(13);
    } finally {
      if (previousKey === undefined) {
        delete process.env.APIFUN_API_KEY;
      } else {
        process.env.APIFUN_API_KEY = previousKey;
      }
    }
  });

  it("routes MiMo Token Plan with thinking disabled for OpenAI-compatible chat", async () => {
    const previousKey = process.env.MIMO_API_KEY;
    process.env.MIMO_API_KEY = "mimo-test-secret";

    try {
      const response = await createDgxProviderCompletionResponse(
        {
          id: "provider_completion_request_mimo",
          sessionId: "session_1",
          providerProfileId: "provider_mimo_token_openai",
          modelId: "mimo-v2.5-pro",
          messages: [{ role: "user", content: "짧게 응답" }],
          source: "desktop",
          routePreference: "server_proxy",
          createdAt: "2026-05-24T00:00:00.000Z",
        },
        {
          now: "2026-05-24T00:00:00.000Z",
          fetchImpl: async (url, init) => {
            expect(url).toBe("https://token-plan-sgp.xiaomimimo.com/v1/chat/completions");
            expect(init?.headers?.authorization).toBe("Bearer mimo-test-secret");
            expect(String(init?.body)).not.toContain("mimo-test-secret");
            const body = JSON.parse(String(init?.body)) as {
              max_completion_tokens?: number;
              messages: Array<{ role: string; content: string }>;
              model: string;
              thinking?: { type?: string };
              top_p?: number;
            };
            expect(body.model).toBe("mimo-v2.5-pro");
            expect(body.max_completion_tokens).toBe(4096);
            expect(body.thinking?.type).toBe("disabled");
            expect(body.top_p).toBe(0.95);
            expect(body.messages[0]?.role).toBe("system");
            return {
              ok: true,
              status: 200,
              async text() {
                return JSON.stringify({
                  choices: [{ message: { content: "MiMo OK" } }],
                  usage: { prompt_tokens: 9, completion_tokens: 3, total_tokens: 12 },
                });
              },
            };
          },
        },
      );

      expect(response.status).toBe("succeeded");
      expect(response.content).toBe("MiMo OK");
      expect(response.usage?.totalTokens).toBe(12);
    } finally {
      if (previousKey === undefined) {
        delete process.env.MIMO_API_KEY;
      } else {
        process.env.MIMO_API_KEY = previousKey;
      }
    }
  });

  it("routes DeepSeek through the OpenAI-compatible adapter without leaking the token into the request body", async () => {
    const previousKey = process.env.DEEPSEEK_API_KEY;
    process.env.DEEPSEEK_API_KEY = "deepseek-test-secret";

    try {
      const response = await createDgxProviderCompletionResponse(
        {
          id: "provider_completion_request_deepseek",
          sessionId: "session_1",
          providerProfileId: "provider_deepseek_dgx",
          modelId: "deepseek-v4-flash",
          messages: [
            { role: "system", content: "Use concise Korean." },
            { role: "user", content: "Reply OK only" },
          ],
          source: "desktop",
          routePreference: "server_proxy",
          createdAt: "2026-05-24T00:00:00.000Z",
        },
        {
          now: "2026-05-24T00:00:00.000Z",
          fetchImpl: async (url, init) => {
            expect(url).toBe("https://api.deepseek.com/v1/chat/completions");
            expect(init?.headers?.authorization).toBe("Bearer deepseek-test-secret");
            expect(String(init?.body)).not.toContain("deepseek-test-secret");
            const body = JSON.parse(String(init?.body)) as { model: string; messages: Array<{ role: string; content: string }> };
            expect(body.model).toBe("deepseek-v4-flash");
            expect(body.messages.filter((message) => message.role === "system")).toHaveLength(1);
            expect(body.messages[0]?.content).toContain("Use concise Korean.");
            return {
              ok: true,
              status: 200,
              async text() {
                return JSON.stringify({
                  choices: [{ message: { content: "DeepSeek OK" } }],
                  usage: { prompt_tokens: 9, completion_tokens: 2, total_tokens: 11 },
                });
              },
            };
          },
        },
      );

      expect(response.status).toBe("succeeded");
      expect(response.content).toBe("DeepSeek OK");
      expect(response.usage?.totalTokens).toBe(11);
    } finally {
      if (previousKey === undefined) {
        delete process.env.DEEPSEEK_API_KEY;
      } else {
        process.env.DEEPSEEK_API_KEY = previousKey;
      }
    }
  });

  it("fails closed for unregistered provider proxy requests without echoing secret-like input", async () => {
    const response = await createDgxProviderCompletionResponse(
      {
        id: "provider_completion_request_unregistered",
        sessionId: "session_1",
        providerProfileId: "provider_unknown_sk-test-secret",
        modelId: "unapproved-model",
        messages: [
          {
            role: "user",
            content: "Try this token sk-test-secret-from-message",
          },
        ],
        source: "desktop",
        routePreference: "server_proxy",
        createdAt: "2026-06-05T00:00:00.000Z",
      },
      {
        now: "2026-06-05T00:00:00.000Z",
        fetchImpl: async () => {
          throw new Error("unregistered provider must not fetch");
        },
      },
    );

    expect(response.status).toBe("failed");
    expect(response.route).toBe("server_proxy");
    expect(response.error).toContain("provider is not registered");
    expect(response.error).not.toContain("sk-test-secret");
    expect(response.content).toBeUndefined();
    expect(response.runtimeHints?.retryable).toBe(false);
    expect(JSON.stringify(response)).not.toContain("sk-test-secret-from-message");
  });

  it("fails closed for registered providers when the requested model is outside the proxy allowlist", async () => {
    const permission = evaluateServerProviderCompletionPermission({
      id: "provider_completion_request_bad_model",
      sessionId: "session_1",
      providerProfileId: "provider_apifun_claude",
      modelId: "claude-opus-99-unregistered",
      messages: [
        {
          role: "user",
          content: "Try the unregistered model sk-test-secret-from-message",
        },
      ],
      source: "desktop",
      routePreference: "server_proxy",
      approvalState: "approved",
      createdAt: "2026-06-05T00:00:00.000Z",
    });

    expect(permission.decision).toBe("deny");
    expect(permission.approvalState).toBe("rejected");
    expect(permission.reason).toContain("provider model is not registered");

    const response = await createDgxProviderCompletionResponse(
      {
        id: "provider_completion_request_bad_model",
        sessionId: "session_1",
        providerProfileId: "provider_apifun_claude",
        modelId: "claude-opus-99-unregistered",
        messages: [
          {
            role: "user",
            content: "Try the unregistered model sk-test-secret-from-message",
          },
        ],
        source: "desktop",
        routePreference: "server_proxy",
        approvalState: "approved",
        createdAt: "2026-06-05T00:00:00.000Z",
      },
      {
        now: "2026-06-05T00:00:00.000Z",
        fetchImpl: async () => {
          throw new Error("unregistered provider model must not fetch");
        },
      },
    );

    expect(response.status).toBe("failed");
    expect(response.error).toContain("provider model is not registered");
    expect(response.runtimeHints?.retryable).toBe(false);
    expect(JSON.stringify(response)).not.toContain("sk-test-secret-from-message");
  });

  it("routes Codex OAuth completions through the CLI adapter without calling HTTP fetch", async () => {
    const response = await createDgxProviderCompletionResponse(
      {
        id: "provider_completion_request_codex_oauth",
        sessionId: "session_1",
        providerProfileId: "provider_codex_oauth",
        modelId: "codex-session",
        messages: [{ role: "user", content: "안녕?" }],
        source: "desktop",
        routePreference: "server_proxy",
        createdAt: "2026-05-24T00:00:00.000Z",
      },
      {
        now: "2026-05-24T00:00:00.000Z",
        fetchImpl: async () => {
          throw new Error("Codex OAuth must not use HTTP fetch");
        },
        codexCliRunner: async (params) => {
          expect(params.codexHome).toBe("~/.codex");
          expect(params.codexBinPath).toContain("codex");
          expect(params.prompt).toContain("USER: 안녕?");
          expect(params.cliModelId).toBeUndefined();
          return {
            exitCode: 0,
            signal: null,
            stdout: "",
            stderr: "",
            lastMessage: "Codex OAuth OK",
          };
        },
      },
    );

    expect(response.status).toBe("succeeded");
    expect(response.content).toBe("Codex OAuth OK");
    expect(response.route).toBe("server_proxy");
  });

  it("routes Claude CLI completions through the local CLI adapter without calling HTTP fetch", async () => {
    const previousEnable = process.env.ENABLE_CLAUDE_CODE_SINGLE_OWNER_PROVIDER;
    const previousOwner = process.env.CLAUDE_CODE_OWNER_USER_ID;
    process.env.ENABLE_CLAUDE_CODE_SINGLE_OWNER_PROVIDER = "true";
    process.env.CLAUDE_CODE_OWNER_USER_ID = "owner-robin";

    let response: Awaited<ReturnType<typeof createDgxProviderCompletionResponse>>;
    try {
      response = await createDgxProviderCompletionResponse(
        {
          id: "provider_completion_request_claude_cli",
          sessionId: "session_1",
          providerProfileId: "provider_claude_code_single_owner",
          modelId: "claude-cli-session",
          messages: [{ role: "user", content: "delegate this" }],
          source: "desktop",
          routePreference: "server_proxy",
          requestContext: {
            userId: "owner-robin",
            routeType: "personal",
            humanInitiated: true,
          },
          createdAt: "2026-05-28T00:00:00.000Z",
        },
        {
          now: "2026-05-28T00:00:00.000Z",
          fetchImpl: async () => {
            throw new Error("Claude CLI must not use HTTP fetch");
          },
          claudeCliRunner: async (params) => {
            expect(params.claudeBinPath).toBe("claude");
            expect(params.permissionMode).toBe("plan");
            expect(params.prompt).toContain("USER: delegate this");
            expect(params.cliModelId).toBeUndefined();
            return {
              exitCode: 0,
              signal: null,
              stdout: JSON.stringify({ type: "result", result: "Claude CLI OK" }),
              stderr: "",
            };
          },
        },
      );
    } finally {
      if (previousEnable === undefined) delete process.env.ENABLE_CLAUDE_CODE_SINGLE_OWNER_PROVIDER;
      else process.env.ENABLE_CLAUDE_CODE_SINGLE_OWNER_PROVIDER = previousEnable;
      if (previousOwner === undefined) delete process.env.CLAUDE_CODE_OWNER_USER_ID;
      else process.env.CLAUDE_CODE_OWNER_USER_ID = previousOwner;
    }

    expect(response.status).toBe("succeeded");
    expect(response.content).toBe("Claude CLI OK");
    expect(response.route).toBe("server_proxy");
  });

  it("discovers DeepSeek models through the DGX-02 provider model proxy", async () => {
    const previousKey = process.env.DEEPSEEK_API_KEY;
    process.env.DEEPSEEK_API_KEY = "deepseek-test-secret";

    try {
      const discovery = await createServerProviderModelDiscoveryResponse("provider_deepseek_dgx", {
        now: "2026-05-24T00:00:00.000Z",
        fetchImpl: async (url, init) => {
          expect(url).toBe("https://api.deepseek.com/v1/models");
          expect(init?.headers?.authorization).toBe("Bearer deepseek-test-secret");
          return {
            ok: true,
            status: 200,
            async text() {
              return JSON.stringify({ data: [{ id: "deepseek-chat" }, { id: "deepseek-reasoner" }] });
            },
          };
        },
      });

      expect(discovery.status).toBe("succeeded");
      expect(discovery.source).toBe("remote_probe");
      expect(discovery.models.map((model) => model.id)).toEqual(["deepseek-chat", "deepseek-reasoner"]);
      expect(JSON.stringify(discovery)).not.toContain("deepseek-test-secret");
    } finally {
      if (previousKey === undefined) {
        delete process.env.DEEPSEEK_API_KEY;
      } else {
        process.env.DEEPSEEK_API_KEY = previousKey;
      }
    }
  });

  it("marks provider model static fallback as failed when remote discovery fails", async () => {
    const previousKey = process.env.DEEPSEEK_API_KEY;
    process.env.DEEPSEEK_API_KEY = "deepseek-test-secret";

    try {
      const discovery = await createServerProviderModelDiscoveryResponse("provider_deepseek_dgx", {
        now: "2026-05-24T00:00:00.000Z",
        fetchImpl: async () => ({
          ok: false,
          status: 503,
          async text() {
            return "temporarily unavailable";
          },
        }),
      });

      expect(discovery.status).toBe("failed");
      expect(discovery.source).toBe("static_fallback");
      expect(discovery.models.map((model) => model.id)).toContain("deepseek-v4-flash");
      expect(discovery.warnings.join(" ")).toContain("static model fallback");
      expect(JSON.stringify(discovery)).not.toContain("deepseek-test-secret");
    } finally {
      if (previousKey === undefined) {
        delete process.env.DEEPSEEK_API_KEY;
      } else {
        process.env.DEEPSEEK_API_KEY = previousKey;
      }
    }
  });

  it("publishes a DGX-02 provider registry without raw secrets", async () => {
    const previousDeepSeekKey = process.env.DEEPSEEK_API_KEY;
    const previousAnthropicKey = process.env.ANTHROPIC_API_KEY;
    const previousAnthropicKeyAlt = process.env.ANTHROPIC_API_KEY_ALT;
    const previousApifunKey = process.env.APIFUN_API_KEY;
    const previousApifunKeyFile = process.env.APIFUN_API_KEY_FILE;
    const previousMimoKey = process.env.MIMO_API_KEY;
    process.env.DEEPSEEK_API_KEY = "deepseek-test-secret";
    process.env.MIMO_API_KEY = "mimo-test-secret";
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY_ALT;
    delete process.env.APIFUN_API_KEY;
    process.env.APIFUN_API_KEY_FILE = "/tmp/ai-orchestrator-missing-apifun.key";

    try {
      const registry = await createServerProviderRegistrySnapshot({
        now: "2026-05-24T00:00:00.000Z",
      });

      const deepseek = registry.entries.find((entry) => entry.providerProfileId === "provider_deepseek_dgx");
      const apifun = registry.entries.find((entry) => entry.providerProfileId === "provider_apifun_claude");
      const codexOauth = registry.entries.find((entry) => entry.providerProfileId === "provider_codex_oauth");
      const claudeCli = registry.entries.find((entry) => entry.providerProfileId === "provider_claude_code_single_owner");
      const grok = registry.entries.find((entry) => entry.providerProfileId === "provider_grok_oauth_dgx");
      const mimoOpenAi = registry.entries.find((entry) => entry.providerProfileId === "provider_mimo_token_openai");
      const mimoAnthropic = registry.entries.find((entry) => entry.providerProfileId === "provider_mimo_token_anthropic");

      expect(registry.authorityNodeId).toBe("dgx-02");
      expect(registry.rawSecretPersisted).toBe(false);
      expect(registry.summary.total).toBeGreaterThanOrEqual(8);
      expect(deepseek?.authMode).toBe("dgx_secret_ref");
      expect(deepseek?.secretAvailability).toBe("available");
      expect(apifun?.name).toBe("APIKey.fun Claude A");
      expect(apifun?.secretAvailability).toBe("missing");
      expect(apifun?.secretSourceRefs).toContain("env:ANTHROPIC_API_KEY");
      expect(codexOauth?.name).toBe("Codex OAuth Session");
      expect(codexOauth?.authMode).toBe("oauth_session");
      expect(codexOauth?.tags).toContain("codex");
      expect(claudeCli?.name).toBe("Claude Code Single Owner");
      expect(claudeCli?.authMode).toBe("local_cli");
      expect(claudeCli?.secretAvailability).toBe("available");
      expect(claudeCli?.tags).toEqual(expect.arrayContaining(["claude", "cli", "single-owner"]));
      expect(grok?.authMode).toBe("oauth_session");
      expect(mimoOpenAi?.name).toBe("MiMo Token Plan OpenAI");
      expect(mimoOpenAi?.secretAvailability).toBe("available");
      expect(mimoOpenAi?.defaultModelIds).toContain("mimo-v2.5-pro");
      expect(mimoOpenAi?.trustLevel).toBe("trusted");
      expect(mimoOpenAi?.tags).toEqual(expect.arrayContaining(["mimo", "token-plan"]));
      expect(mimoAnthropic?.name).toBe("MiMo Token Plan Anthropic");
      expect(mimoAnthropic?.defaultModelIds).toContain("mimo-v2.5-pro");
      expect(mimoAnthropic?.trustLevel).toBe("trusted");
      expect(JSON.stringify(registry)).not.toContain("deepseek-test-secret");
      expect(JSON.stringify(registry)).not.toContain("mimo-test-secret");
    } finally {
      if (previousDeepSeekKey === undefined) {
        delete process.env.DEEPSEEK_API_KEY;
      } else {
        process.env.DEEPSEEK_API_KEY = previousDeepSeekKey;
      }
      if (previousAnthropicKey === undefined) {
        delete process.env.ANTHROPIC_API_KEY;
      } else {
        process.env.ANTHROPIC_API_KEY = previousAnthropicKey;
      }
      if (previousAnthropicKeyAlt === undefined) {
        delete process.env.ANTHROPIC_API_KEY_ALT;
      } else {
        process.env.ANTHROPIC_API_KEY_ALT = previousAnthropicKeyAlt;
      }
      if (previousApifunKey === undefined) {
        delete process.env.APIFUN_API_KEY;
      } else {
        process.env.APIFUN_API_KEY = previousApifunKey;
      }
      if (previousApifunKeyFile === undefined) {
        delete process.env.APIFUN_API_KEY_FILE;
      } else {
        process.env.APIFUN_API_KEY_FILE = previousApifunKeyFile;
      }
      if (previousMimoKey === undefined) {
        delete process.env.MIMO_API_KEY;
      } else {
        process.env.MIMO_API_KEY = previousMimoKey;
      }
    }
  });

  it("loads provider keys from the OpenClaw slot env file without exposing raw values", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "ai-orchestrator-env-"));
    const envFile = join(tempRoot, "openclaw-slot.env");
    const previousSlotEnv = process.env.OPENCLAW_SLOT_ENV_FILE;
    const previousDeepSeekKey = process.env.DEEPSEEK_API_KEY;

    delete process.env.DEEPSEEK_API_KEY;
    process.env.OPENCLAW_SLOT_ENV_FILE = envFile;

    try {
      await writeFile(
        envFile,
        [
          'DEEPSEEK_API_KEY="deepseek-env-file-secret"',
          'ANTHROPIC_API_KEY="apikeyfun-claude-a-secret"',
          'ANTHROPIC_API_KEY_ALT="apikeyfun-claude-b-secret"',
          "",
        ].join("\n"),
        "utf8",
      );

      const registry = await createServerProviderRegistrySnapshot({
        now: "2026-05-24T00:00:00.000Z",
      });
      const deepseek = registry.entries.find((entry) => entry.providerProfileId === "provider_deepseek_dgx");
      const claudeA = registry.entries.find((entry) => entry.providerProfileId === "provider_apifun_claude");
      const claudeB = registry.entries.find((entry) => entry.providerProfileId === "provider_apifun_claude_b");

      expect(deepseek?.secretAvailability).toBe("available");
      expect(claudeA?.name).toBe("APIKey.fun Claude A");
      expect(claudeA?.selectedModelId).toBe("claude-opus-4-8");
      expect(claudeA?.defaultModelIds).toContain("claude-opus-4-8");
      expect(claudeA?.secretAvailability).toBe("available");
      expect(claudeA?.secretRefPreview).toBe("dgx-02:ANTHROPIC_API_KEY");
      expect(claudeB?.name).toBe("APIKey.fun Claude B");
      expect(claudeB?.selectedModelId).toBe("claude-opus-4-8");
      expect(claudeB?.defaultModelIds).toContain("claude-opus-4-8");
      expect(claudeB?.secretAvailability).toBe("available");
      expect(claudeB?.secretRefPreview).toBe("dgx-02:ANTHROPIC_API_KEY_ALT");
      expect(JSON.stringify(registry)).not.toContain("deepseek-env-file-secret");
      expect(JSON.stringify(registry)).not.toContain("apikeyfun-claude-a-secret");
      expect(JSON.stringify(registry)).not.toContain("apikeyfun-claude-b-secret");
    } finally {
      if (previousSlotEnv === undefined) {
        delete process.env.OPENCLAW_SLOT_ENV_FILE;
      } else {
        process.env.OPENCLAW_SLOT_ENV_FILE = previousSlotEnv;
      }
      if (previousDeepSeekKey === undefined) {
        delete process.env.DEEPSEEK_API_KEY;
      } else {
        process.env.DEEPSEEK_API_KEY = previousDeepSeekKey;
      }
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("separates Grok OAuth accounts and reports expired sessions without token output", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "ai-orchestrator-grok-"));
    const grok1 = join(tempRoot, "grok1-auth.json");
    const grok2 = join(tempRoot, "grok2-auth.json");
    const previousGrok1 = process.env.GROK_OAUTH_1_AUTH_FILE;
    const previousGrok2 = process.env.GROK_OAUTH_2_AUTH_FILE;

    process.env.GROK_OAUTH_1_AUTH_FILE = grok1;
    process.env.GROK_OAUTH_2_AUTH_FILE = grok2;

    try {
      await writeFile(
        grok1,
        JSON.stringify({
          "https://auth.x.ai::demo": {
            team_id: "team-1",
            refresh_token: "grok-refresh-token-1",
            expires_at: "2026-05-25T00:00:00.000Z",
          },
        }),
        "utf8",
      );
      await writeFile(
        grok2,
        JSON.stringify({
          "https://auth.x.ai::demo": {
            team_id: "team-2",
            refresh_token: "grok-refresh-token-2",
            expires_at: "2026-05-16T00:00:00.000Z",
          },
        }),
        "utf8",
      );

      const registry = await createServerProviderRegistrySnapshot({
        now: "2026-05-24T00:00:00.000Z",
      });
      const grokAccount1 = registry.entries.find((entry) => entry.providerProfileId === "provider_grok_oauth_dgx");
      const grokAccount2 = registry.entries.find((entry) => entry.providerProfileId === "provider_grok_oauth_dgx_2");

      expect(grokAccount1?.name).toBe("Grok OAuth #1");
      expect(grokAccount1?.secretAvailability).toBe("available");
      expect(grokAccount1?.secretSourceRefs).toContain("account:grok-oauth-1");
      expect(grokAccount2?.name).toBe("Grok OAuth #2");
      expect(grokAccount2?.secretAvailability).toBe("expired");
      expect(grokAccount2?.tags).toContain("oauth-expired");
      expect(grokAccount2?.secretSourceRefs).toContain("account:grok-oauth-2");
      expect(JSON.stringify(registry)).not.toContain("grok-refresh-token");
    } finally {
      if (previousGrok1 === undefined) {
        delete process.env.GROK_OAUTH_1_AUTH_FILE;
      } else {
        process.env.GROK_OAUTH_1_AUTH_FILE = previousGrok1;
      }
      if (previousGrok2 === undefined) {
        delete process.env.GROK_OAUTH_2_AUTH_FILE;
      } else {
        process.env.GROK_OAUTH_2_AUTH_FILE = previousGrok2;
      }
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("registers Codex OAuth as a separate DGX session provider without using APIKey.fun", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "ai-orchestrator-codex-oauth-"));
    const codexAuth = join(tempRoot, "codex-auth.json");
    const previousCodexAuthFile = process.env.CODEX_OAUTH_AUTH_FILE;

    process.env.CODEX_OAUTH_AUTH_FILE = codexAuth;

    try {
      await writeFile(
        codexAuth,
        JSON.stringify({
          tokens: {
            access_token: "codex-oauth-access-token",
            refresh_token: "codex-oauth-refresh-token",
          },
        }),
        "utf8",
      );

      const registry = await createServerProviderRegistrySnapshot({
        now: "2026-05-24T00:00:00.000Z",
      });
      const codexOauth = registry.entries.find((entry) => entry.providerProfileId === "provider_codex_oauth");
      const apiKeyFunCodex = registry.entries.find((entry) => entry.providerProfileId === "provider_apikeyfun_codex");

      expect(codexOauth?.name).toBe("Codex OAuth Session");
      expect(codexOauth?.kind).toBe("custom");
      expect(codexOauth?.baseUrl).toBe("codex-oauth://dgx-02");
      expect(codexOauth?.authMode).toBe("oauth_session");
      expect(codexOauth?.secretAvailability).toBe("available");
      expect(codexOauth?.defaultModelIds).toContain("codex-session");
      expect(codexOauth?.secretSourceRefs).toContain("account:codex-oauth");
      expect(codexOauth?.secretSourceRefs).toContain(`file:${codexAuth}`);
      expect(codexOauth?.tags).toEqual(expect.arrayContaining(["oauth", "codex", "dgx", "session"]));
      expect(apiKeyFunCodex?.authMode).toBe("dgx_secret_ref");
      expect(apiKeyFunCodex?.tags).toContain("openai-compatible");
      expect(JSON.stringify(registry)).not.toContain("codex-oauth-access-token");
      expect(JSON.stringify(registry)).not.toContain("codex-oauth-refresh-token");
    } finally {
      if (previousCodexAuthFile === undefined) {
        delete process.env.CODEX_OAUTH_AUTH_FILE;
      } else {
        process.env.CODEX_OAUTH_AUTH_FILE = previousCodexAuthFile;
      }
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("uses static APIFun model allowlist without calling remote /models", async () => {
    const discovery = await createServerProviderModelDiscoveryResponse("provider_apifun_claude", {
      now: "2026-05-24T00:00:00.000Z",
      fetchImpl: async () => {
        throw new Error("should not call APIFun /models");
      },
    });

    expect(discovery.status).toBe("succeeded");
    expect(discovery.source).toBe("static_fallback");
    expect(discovery.models.map((model) => model.id)).toContain("claude-code-compatible");
    expect(discovery.warnings.join(" ")).toContain("static model allowlist");
  });

  it("probes vLLM /models before publishing live health", async () => {
    const fetchImpl = async (url: string) => {
      expect(url).toBe("http://127.0.0.1:8001/v1/models");
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({ data: [{ id: "qwen36-domain-lora-v5-prisma" }] });
        },
      };
    };

    const probe = await probeDgxVllm({
      now: "2026-05-24T00:00:00.000Z",
      vllmBaseUrl: "http://127.0.0.1:8001/v1",
      fetchImpl,
    });
    const health = await createLiveHealthResponse({
      now: "2026-05-24T00:00:00.000Z",
      vllmBaseUrl: "http://127.0.0.1:8001/v1",
      fetchImpl,
    });

    expect(probe.status).toBe("connected");
    expect(health.runtime.dgxStatus).toBe("online");
    expect(health.runtime.runtimeNodes[0]?.models).toContain("qwen36-domain-lora-v5-prisma");
  });

  it("marks the server degraded when vLLM is not reachable", async () => {
    const health = await createLiveHealthResponse({
      now: "2026-05-24T00:00:00.000Z",
      vllmBaseUrl: "http://127.0.0.1:8001/v1",
      fetchImpl: async () => {
        throw new Error("ECONNREFUSED");
      },
    });

    expect(health.runtime.dgxStatus).toBe("degraded");
    expect(health.status).toBe("degraded");
    expect(health.runtime.runtimeNodes[0]?.status).toBe("degraded");
    expect(health.capabilities).toContain("vllm-health-degraded");
    expect(health.capabilities).not.toContain("provider-completion-proxy");
    expect(health.capabilities).not.toContain("remote-run-request");
    expect(health.runtime.recentError).toContain("vLLM probe failed");
  });

  it("accepts Event Storage sync pushes idempotently", () => {
    const state = createServerEventStorageState();
    const event = {
      id: "event_sync_1",
      sessionId: "session_1",
      type: "conversation.message.created",
      payload: { messageId: "message_1", redaction: "applied" },
      createdAt: "2026-05-24T00:00:00.000Z",
      source: "desktop" as const,
      sourceTrust: "trusted" as const,
      redacted: true,
    };
    const request = {
      id: "sync_request_1",
      clientId: "client_macbook",
      sessionId: "session_1",
      events: [event],
      idempotencyKey: "client_macbook:session_1:event_sync_1",
      createdAt: event.createdAt,
    };

    const first = pushEventsToServerStorage(request, state, event.createdAt);
    const duplicate = pushEventsToServerStorage({ ...request, id: "sync_request_2" }, state, event.createdAt);
    const conflict = pushEventsToServerStorage(
      {
        ...request,
        id: "sync_request_3",
        events: [{ ...event, type: "conversation.message.edited" }],
      },
      state,
      event.createdAt,
    );
    const pulled = pullEventsFromServerStorage("session_1", state, event.createdAt);

    expect(first.accepted).toBe(1);
    expect(duplicate.duplicates).toBe(1);
    expect(conflict.conflicts).toBe(1);
    expect(pulled.serverRevision).toBe(1);
    expect(pulled.events[0]?.id).toBe(event.id);
  });

  it("lists Event Storage sessions newest first", () => {
    const state = createServerEventStorageState();
    const firstEvent = {
      id: "event_session_first",
      sessionId: "session_old",
      type: "conversation.message.created",
      payload: { messageId: "message_old", content: "old", redaction: "applied" },
      createdAt: "2026-05-24T00:00:00.000Z",
      source: "desktop" as const,
      sourceTrust: "trusted" as const,
      redacted: true,
    };
    const secondEvent = {
      id: "event_session_second",
      sessionId: "session_new",
      type: "coding_packet.created",
      payload: { goal: "new packet" },
      createdAt: "2026-05-24T00:01:00.000Z",
      source: "agent" as const,
      sourceTrust: "trusted" as const,
      redacted: true,
    };
    const secondCreatedEvent = {
      id: "event_session_new_created",
      sessionId: "session_new",
      type: "session.created",
      payload: { title: "New Session", sourceClient: "client_home_pc" },
      createdAt: "2026-05-24T00:00:30.000Z",
      source: "desktop" as const,
      sourceTrust: "trusted" as const,
      redacted: true,
    };
    const secondRenamedEvent = {
      id: "event_session_new_renamed",
      sessionId: "session_new",
      type: "session.renamed",
      payload: { title: "Renamed Session" },
      createdAt: "2026-05-24T00:00:45.000Z",
      source: "desktop" as const,
      sourceTrust: "trusted" as const,
      redacted: true,
    };

    pushEventsToServerStorage(
      {
        id: "sync_sessions_1",
        clientId: "client_macbook",
        sessionId: firstEvent.sessionId,
        events: [firstEvent],
        idempotencyKey: "client_macbook:session_old:event_session_first",
        createdAt: firstEvent.createdAt,
      },
      state,
      firstEvent.createdAt,
    );
    pushEventsToServerStorage(
      {
        id: "sync_sessions_2",
        clientId: "client_home_pc",
        sessionId: secondEvent.sessionId,
        events: [secondCreatedEvent, secondRenamedEvent, secondEvent],
        idempotencyKey: "client_home_pc:session_new:event_session_new_created,event_session_new_renamed,event_session_second",
        createdAt: secondEvent.createdAt,
      },
      state,
      secondEvent.createdAt,
    );

    const index = listEventStorageSessions(state, "2026-05-24T00:02:00.000Z");

    expect(index.serverRevision).toBe(4);
    expect(index.sessions.map((session) => session.sessionId)).toEqual(["session_new", "session_old"]);
    expect(index.sessions[0]?.lastEventType).toBe("coding_packet.created");
    expect(index.sessions[0]?.title).toBe("Renamed Session");
    expect(index.sessions[0]?.createdByClient).toBe("client_home_pc");
    expect(index.sessions[0]?.sources).toEqual(["desktop", "agent"]);
  });

  it("persists Event Storage records to JSONL and reloads duplicate state", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "ai-orchestrator-events-"));
    try {
      const storage = createJsonlServerEventStorage(tempDir);
      const event = {
        id: "event_persist_1",
        sessionId: "session_persist",
        type: "conversation.message.created",
        payload: { messageId: "message_1", redaction: "applied" },
        createdAt: "2026-05-24T00:00:00.000Z",
        source: "desktop" as const,
        sourceTrust: "trusted" as const,
        redacted: true,
      };
      const request = {
        id: "sync_request_persist_1",
        clientId: "client_macbook",
        sessionId: event.sessionId,
        events: [event],
        idempotencyKey: "client_macbook:session_persist:event_persist_1",
        createdAt: event.createdAt,
      };

      const first = await pushEventsToPersistentServerStorage(request, storage, event.createdAt);
      const reloadedState = await loadServerEventStorageStateFromJsonl(storage.eventLogPath);
      const duplicate = pushEventsToServerStorage(
        { ...request, id: "sync_request_persist_2" },
        reloadedState,
        event.createdAt,
      );
      const pulled = await pullEventsFromPersistentServerStorage(
        "session_persist",
        {
          ...storage,
          statePromise: Promise.resolve(reloadedState),
        },
        event.createdAt,
      );
      const snapshot = createEventStorageSnapshot(reloadedState, {
        mode: "jsonl",
        storageDir: storage.storageDir,
        eventLogPath: storage.eventLogPath,
        loadedAt: storage.loadedAt,
      });

      expect(first.accepted).toBe(1);
      expect(duplicate.duplicates).toBe(1);
      expect(pulled.events[0]?.id).toBe(event.id);
      expect(snapshot.revision).toBe(1);
      expect(snapshot.eventCount).toBe(1);
      expect(snapshot.eventLogPath).toContain("events.jsonl");
    } finally {
      await rm(tempDir, { force: true, recursive: true });
    }
  });

  it("rejects raw secret shaped Event Storage payloads", () => {
    const state = createServerEventStorageState();
    const response = pushEventsToServerStorage(
      {
        id: "sync_request_secret",
        clientId: "client_macbook",
        sessionId: "session_1",
        idempotencyKey: "client_macbook:session_1:event_secret",
        createdAt: "2026-05-24T00:00:00.000Z",
        events: [
          {
            id: "event_secret",
            sessionId: "session_1",
            type: "provider.profile.imported",
            payload: { raw: "sk-secret-should-not-sync" },
            createdAt: "2026-05-24T00:00:00.000Z",
            source: "desktop",
            sourceTrust: "trusted",
            redacted: false,
          },
        ],
      },
      state,
      "2026-05-24T00:00:00.000Z",
    );

    expect(response.failed).toBe(1);
    expect(response.results[0]?.reason).toBe("raw_secret_pattern_detected");
  });
});

describe("CORS allowed origins", () => {
  const originalEnv = process.env.ORCHESTRATOR_ALLOWED_ORIGINS;
  afterAll(() => {
    if (originalEnv === undefined) {
      delete process.env.ORCHESTRATOR_ALLOWED_ORIGINS;
    } else {
      process.env.ORCHESTRATOR_ALLOWED_ORIGINS = originalEnv;
    }
  });

  it("includes common vite dev ports by default", () => {
    delete process.env.ORCHESTRATOR_ALLOWED_ORIGINS;
    const allowed = resolveAllowedOrigins();
    expect(allowed.has("http://localhost:5173")).toBe(true);
    expect(allowed.has("http://127.0.0.1:5173")).toBe(true);
    expect(allowed.has("http://localhost:5174")).toBe(true);
    expect(allowed.has("http://127.0.0.1:5174")).toBe(true);
    expect(allowed.has("http://localhost:5175")).toBe(true);
    expect(allowed.has("http://127.0.0.1:5175")).toBe(true);
    expect(allowed.has("https://orchestrator.endruin.com")).toBe(true);
  });

  it("appends extra origins from ORCHESTRATOR_ALLOWED_ORIGINS env", () => {
    process.env.ORCHESTRATOR_ALLOWED_ORIGINS = "http://localhost:5175, https://staging.example.com ,";
    const allowed = resolveAllowedOrigins();
    expect(allowed.has("http://localhost:5175")).toBe(true);
    expect(allowed.has("https://staging.example.com")).toBe(true);
    // built-ins must still be present
    expect(allowed.has("http://localhost:5174")).toBe(true);
  });

  it("pickAllowedOrigin echoes a matching origin and rejects disallowed origins", () => {
    const allowed = new Set<string>(["http://localhost:5173", "http://localhost:5174"]);
    expect(pickAllowedOrigin("http://localhost:5174", allowed)).toBe("http://localhost:5174");
    expect(pickAllowedOrigin("http://evil.example.com", allowed)).toBeUndefined();
    expect(pickAllowedOrigin(undefined, allowed)).toBe("http://localhost:5173");
  });

  it("allows browser HMAC auth headers for signed orchestrator requests", async () => {
    const server = startServer(0);

    try {
      await new Promise<void>((resolve) => {
        server.once("listening", resolve);
      });
      const address = server.address();
      if (!address || typeof address !== "object") {
        throw new Error("test server did not bind to a TCP port");
      }

      const response = await fetch(`http://127.0.0.1:${address.port}/provider-completions`, {
        headers: {
          "access-control-request-headers": "content-type,x-dgx-signature,x-dgx-timestamp,x-dgx-nonce,x-dgx-body-sha256",
          "access-control-request-method": "POST",
          origin: "http://127.0.0.1:5173",
        },
        method: "OPTIONS",
      });

      expect(response.status).toBe(204);
      expect(response.headers.get("access-control-allow-origin")).toBe("http://127.0.0.1:5173");
      expect(response.headers.get("access-control-allow-headers")).toContain("x-dgx-signature");
      expect(response.headers.get("access-control-allow-headers")).toContain("x-dgx-body-sha256");
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }
  });
});

describe("public health storage redaction", () => {
  it("strips storageDir and eventLogPath while keeping operational fields", () => {
    const original = {
      mode: "jsonl" as const,
      storageDir: "/home/robin/secret-vault",
      eventLogPath: "/home/robin/secret-vault/events.jsonl",
      revision: 42,
      eventCount: 17,
      sessionCount: 3,
      lastStoredAt: "2026-05-25T01:00:00.000Z",
      loadedAt: "2026-05-25T00:00:00.000Z",
    };
    const redacted = redactInternalPathsForPublicHealth(original);
    expect(redacted.storageDir).toBe("");
    expect(redacted.eventLogPath).toBe("");
    expect(redacted.mode).toBe("jsonl");
    expect(redacted.revision).toBe(42);
    expect(redacted.eventCount).toBe(17);
    expect(redacted.sessionCount).toBe(3);
    expect(redacted.lastStoredAt).toBe("2026-05-25T01:00:00.000Z");
    expect(redacted.loadedAt).toBe("2026-05-25T00:00:00.000Z");
    // original must not be mutated
    expect(original.storageDir).toBe("/home/robin/secret-vault");
  });
});

describe("memory sync endpoint", () => {
  const syncInput: MemoryInput = {
    layer: "episode",
    scope: "session",
    kind: "context",
    title: "Session decision",
    content: "Keep memory sync scoped to protocol and server only.",
    sourceChannel: "desktop",
    trustLevel: "trusted",
    sessionId: "session_memory_sync",
    tags: ["memory-sync"],
  };

  function createRecord(input: MemoryInput, id = "mem_sync_record_1"): MemoryRecord {
    return {
      id,
      layer: input.layer,
      scope: input.scope,
      kind: input.kind,
      title: input.title,
      content: input.content,
      sourceChannel: input.sourceChannel,
      trustLevel: input.trustLevel,
      projectId: input.projectId,
      sessionId: input.sessionId,
      tags: input.tags,
      activationState: "suggested",
      createdAt: "2026-06-03T00:00:00.000Z",
      pinned: false,
    };
  }

  function createMemoryAdapter(remember: MemoryAdapter["remember"]): MemoryAdapter {
    return {
      profileId: "test_memory_adapter",
      kind: "mock",
      remember,
      recall: async () => [],
      memoryContext: async () => ({
        id: "memory_context_test",
        sessionId: "session_memory_sync",
        query: "",
        activeRecordIds: [],
        blockedRecordIds: [],
        relationIds: [],
        summary: "",
        createdAt: "2026-06-03T00:00:00.000Z",
      }),
      stats: async () => ({
        totalRecords: 0,
        activeRecords: 0,
        pinnedRecords: 0,
        quarantinedRecords: 0,
        relationCount: 0,
        duplicateCandidates: 0,
        contradictionCandidates: 0,
        staleCandidates: 0,
        health: "good",
      }),
      pin: async () => undefined,
      forget: async () => undefined,
      activateMemories: async () => undefined,
      createRelations: async () => [],
    };
  }

  it("syncs records through the memory adapter and reports mixed item statuses", async () => {
    const calls: Array<{ input: MemoryInput; ctx: MemoryAdapterContext }> = [];
    const adapter = createMemoryAdapter(async (input, ctx) => {
      calls.push({ input, ctx });
      if (input.title === "Promotion pending") {
        throw new MemoryAdapterError("promotion_pending", "Queued for curator promotion.", {
          recordId: "pending_record_1",
        });
      }
      if (input.title === "Backend failure") {
        throw new Error("backend unavailable");
      }
      return createRecord(input, `accepted_${calls.length}`);
    });

    const response = await syncMemoryRecords(
      {
        id: "memory_sync_request_1",
        clientId: "client_desktop",
        sessionId: "session_memory_sync",
        inputs: [
          syncInput,
          { ...syncInput, title: "Promotion pending", trustLevel: "limited" },
          { ...syncInput, title: "Backend failure" },
        ],
        idempotencyKey: "client_desktop:session_memory_sync:memory_sync_request_1",
        createdAt: "2026-06-03T00:00:00.000Z",
      },
      adapter,
      {
        serverRevision: 17,
        now: "2026-06-03T00:00:01.000Z",
      },
    );

    expect(calls).toHaveLength(3);
    expect(calls[0]?.ctx.permissionDecision).toBe("allow");
    expect(calls[0]?.ctx.callerTrustLevel).toBe("trusted");
    expect(response.serverRevision).toBe(17);
    expect(response.accepted).toBe(1);
    expect(response.promotionPending).toBe(1);
    expect(response.failed).toBe(1);
    expect(response.results.map((result) => result.status)).toEqual([
      "accepted",
      "promotion_pending",
      "failed",
    ]);
    expect(response.results[1]?.record?.id).toBe("pending_record_1");
    expect(response.results[2]?.reason).toBe("backend unavailable");
  });

  it("accepts trusted memory sync HTTP requests", async () => {
    const previousToken = process.env.ORCHESTRATOR_API_TOKEN;
    process.env.ORCHESTRATOR_API_TOKEN = "test-orchestrator-token";
    const server = startServer(0);

    try {
      await new Promise<void>((resolve) => {
        server.once("listening", resolve);
      });
      const address = server.address();
      if (typeof address !== "object" || address === null) throw new Error("server did not bind");

      const response = await fetch(`http://127.0.0.1:${address.port}/memory/sync`, {
        method: "POST",
        headers: {
          "authorization": "Bearer test-orchestrator-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          id: "memory_sync_request_http_1",
          clientId: "client_desktop",
          sessionId: "session_memory_sync_http",
          inputs: [{ ...syncInput, sessionId: "session_memory_sync_http" }],
          idempotencyKey: "client_desktop:session_memory_sync_http:memory_sync_request_http_1",
          createdAt: "2026-06-03T00:00:00.000Z",
        }),
      });
      const body = await response.json() as {
        accepted: number;
        failed: number;
        results: Array<{ status: string }>;
      };

      expect(response.status).toBe(202);
      expect(body.accepted).toBe(1);
      expect(body.failed).toBe(0);
      expect(body.results[0]?.status).toBe("accepted");
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      if (previousToken === undefined) {
        delete process.env.ORCHESTRATOR_API_TOKEN;
      } else {
        process.env.ORCHESTRATOR_API_TOKEN = previousToken;
      }
    }
  });
});

describe("DGX orchestrator request authentication", () => {
  async function withRuntimeServer<T>(callback: (baseUrl: string, token: string) => Promise<T>): Promise<T> {
    const previousToken = process.env.ORCHESTRATOR_API_TOKEN;
    const token = "test-orchestrator-token";
    process.env.ORCHESTRATOR_API_TOKEN = token;
    const server = startServer(0);

    try {
      await new Promise<void>((resolve) => {
        server.once("listening", resolve);
      });
      const address = server.address();
      if (typeof address !== "object" || address === null) throw new Error("server did not bind");

      return await callback(`http://127.0.0.1:${address.port}`, token);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      if (previousToken === undefined) {
        delete process.env.ORCHESTRATOR_API_TOKEN;
      } else {
        process.env.ORCHESTRATOR_API_TOKEN = previousToken;
      }
    }
  }

  it("accepts valid HMAC headers for runtime requests", async () => {
    await withRuntimeServer(async (baseUrl, token) => {
      const response = await fetch(`${baseUrl}/runtime`, {
        headers: createDgxRequestSignatureHeaders({
          method: "GET",
          path: "/runtime",
          token,
          timestamp: Date.now().toString(),
          nonce: "runtime-valid",
        }),
      });

      expect(response.status).toBe(200);
    });
  });

  it("rejects HMAC headers outside the timestamp drift window", async () => {
    await withRuntimeServer(async (baseUrl, token) => {
      const staleTimestamp = (Date.now() - 6 * 60_000).toString();
      const response = await fetch(`${baseUrl}/runtime`, {
        headers: createDgxRequestSignatureHeaders({
          method: "GET",
          path: "/runtime",
          token,
          timestamp: staleTimestamp,
          nonce: "runtime-stale",
        }),
      });
      const body = await response.json() as { error: string };

      expect(response.status).toBe(401);
      expect(body.error).toBe("clock_drift_exceeded");
    });
  });

  it("rejects tampered HMAC signatures", async () => {
    await withRuntimeServer(async (baseUrl, token) => {
      const response = await fetch(`${baseUrl}/runtime`, {
        headers: createDgxRequestSignatureHeaders({
          method: "GET",
          path: "/heartbeat",
          token,
          timestamp: Date.now().toString(),
          nonce: "runtime-tampered",
        }),
      });

      expect(response.status).toBe(401);
    });
  });

  it("rejects HMAC requests when the signed query string is changed", async () => {
    await withRuntimeServer(async (baseUrl, token) => {
      const response = await fetch(`${baseUrl}/provider-models?providerProfileId=provider_dgx02_vllm`, {
        headers: createDgxRequestSignatureHeaders({
          method: "GET",
          path: "/provider-models?providerProfileId=provider_deepseek_dgx",
          token,
          timestamp: Date.now().toString(),
          nonce: "runtime-query-tampered",
        }),
      });

      expect(response.status).toBe(401);
    });
  });

  it("rejects HMAC requests when the signed body is changed", async () => {
    await withRuntimeServer(async (baseUrl, token) => {
      const signedBody = JSON.stringify({
        id: "memory_sync_signed_body_1",
        clientId: "client_desktop",
        sessionId: "session_memory_sync_http",
        inputs: [],
        idempotencyKey: "client_desktop:session_memory_sync_http:memory_sync_signed_body_1",
        createdAt: "2026-06-03T00:00:00.000Z",
      });
      const tamperedBody = JSON.stringify({
        id: "memory_sync_signed_body_1",
        clientId: "client_desktop",
        sessionId: "session_memory_sync_http",
        inputs: [{ layer: "episode", scope: "session", kind: "context", title: "tampered", content: "tampered", sourceChannel: "desktop", trustLevel: "trusted" }],
        idempotencyKey: "client_desktop:session_memory_sync_http:memory_sync_signed_body_1",
        createdAt: "2026-06-03T00:00:00.000Z",
      });

      const response = await fetch(`${baseUrl}/memory/sync`, {
        method: "POST",
        headers: {
          ...createDgxRequestSignatureHeaders({
            method: "POST",
            path: "/memory/sync",
            token,
            body: signedBody,
            timestamp: Date.now().toString(),
            nonce: "runtime-body-tampered",
          }),
          "content-type": "application/json",
        },
        body: tamperedBody,
      });

      expect(response.status).toBe(401);
    });
  });

  it("rejects malformed hex signatures without throwing", async () => {
    await withRuntimeServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/runtime`, {
        headers: {
          "x-dgx-timestamp": Date.now().toString(),
          "x-dgx-nonce": "runtime-bad-hex",
          "x-dgx-body-sha256": "0".repeat(64),
          "x-dgx-signature": "z".repeat(64),
        },
      });

      expect(response.status).toBe(401);
    });
  });

  it("rejects replayed HMAC nonces before reading oversized bodies", async () => {
    await withRuntimeServer(async (baseUrl, token) => {
      const timestamp = Date.now().toString();
      const nonce = "runtime-replay-before-body";
      const firstResponse = await fetch(`${baseUrl}/runtime`, {
        headers: createDgxRequestSignatureHeaders({
          method: "GET",
          path: "/runtime",
          token,
          timestamp,
          nonce,
        }),
      });
      expect(firstResponse.status).toBe(200);

      const replayResponse = await fetch(`${baseUrl}/memory/sync`, {
        method: "POST",
        headers: {
          ...createDgxRequestSignatureHeaders({
            method: "POST",
            path: "/memory/sync",
            token,
            timestamp,
            nonce,
          }),
          "content-type": "application/json",
          "content-length": String(1_048_577),
        },
      });
      const replayBody = await replayResponse.json() as { error?: string };

      expect(replayResponse.status).toBe(401);
      expect(replayResponse.headers.get("connection")).toBe("close");
      expect(replayBody.error).toBe("replay_detected");
    });
  });

  it("does not evict unexpired nonces when the replay registry is full", () => {
    let now = 1_700_000_000_000;
    const registry = new NonceRegistry({
      maxNonces: 2,
      now: () => now,
      cleanupIntervalMs: false,
    });

    registry.add("nonce-1", 60_000);
    registry.add("nonce-2", 60_000);

    expect(() => registry.add("nonce-3", 60_000)).toThrow("nonce_registry_capacity_exceeded");
    expect(registry.has("nonce-1")).toBe(true);

    now += 60_001;
    registry.add("nonce-3", 60_000);

    expect(registry.has("nonce-1")).toBe(false);
    expect(registry.has("nonce-3")).toBe(true);
    registry.dispose();
  });

  it("NonceRegistry rejects replay and evicts nonces safely with FIFO optimization", () => {
    let now = 1_700_000_000_000;
    const registry = new NonceRegistry({
      maxNonces: 3,
      now: () => now,
      cleanupIntervalMs: false,
    });

    registry.add("nonce-1", 10_000);
    registry.add("nonce-2", 30_000);
    registry.add("nonce-3", 40_000);

    expect(registry.has("nonce-1")).toBe(true);

    // Advance time so only nonce-1 is expired
    now += 15_000;
    // Map is:
    // nonce-1: expired
    // nonce-2: active
    // nonce-3: active
    // Adding a new nonce triggers cleanup, which will delete nonce-1 and stop at nonce-2.
    registry.add("nonce-4", 10_000);

    expect(registry.has("nonce-1")).toBe(false);
    expect(registry.has("nonce-2")).toBe(true);
    expect(registry.has("nonce-3")).toBe(true);
    expect(registry.has("nonce-4")).toBe(true);

    registry.dispose();
  });

  it("NonceRegistry cleans expired nonces even when expiry order differs from insertion order", () => {
    let now = 1_700_000_000_000;
    const registry = new NonceRegistry({
      maxNonces: 3,
      now: () => now,
      cleanupIntervalMs: false,
    });

    registry.add("long-lived-first", 60_000);
    registry.add("short-lived-second", 10_000);
    registry.add("long-lived-third", 60_000);

    now += 15_000;

    expect(() => registry.add("new-nonce", 10_000)).not.toThrow();
    expect(registry.has("long-lived-first")).toBe(true);
    expect(registry.has("short-lived-second")).toBe(false);
    expect(registry.has("long-lived-third")).toBe(true);
    expect(registry.has("new-nonce")).toBe(true);

    registry.dispose();
  });

  it("NonceRegistry bounds capacity cleanup scans and fails closed under saturation", () => {
    let now = 1_700_000_000_000;
    const registry = new NonceRegistry({
      maxCapacityScan: 2,
      maxNonces: 4,
      now: () => now,
      cleanupIntervalMs: false,
    });

    registry.add("active-1", 60_000);
    registry.add("active-2", 60_000);
    registry.add("expired-after-scan-window", 5_000);
    registry.add("active-4", 60_000);

    now += 10_000;

    expect(() => registry.add("new-nonce", 10_000)).toThrow("nonce_registry_capacity_exceeded");
    expect(registry.has("active-1")).toBe(true);
    expect(registry.has("active-2")).toBe(true);
    expect(registry.has("expired-after-scan-window")).toBe(false);

    registry.dispose();
  });

  it("HMAC timing-safe hash comparison correctly handles different lengths without crashes", async () => {
    await withRuntimeServer(async (baseUrl) => {
      // Send a signature of incorrect length to test requireAuth comparison gracefully returns 401 instead of crashing.
      const response = await fetch(`${baseUrl}/runtime`, {
        headers: {
          "x-dgx-timestamp": Date.now().toString(),
          "x-dgx-nonce": "runtime-diff-len",
          "x-dgx-body-sha256": "0".repeat(64),
          "x-dgx-signature": "abcdef", // 6 chars (diff length)
        },
      });
      expect(response.status).toBe(401);
    });
  });

  it("continues to accept bearer auth for runtime requests", async () => {
    await withRuntimeServer(async (baseUrl, token) => {
      const response = await fetch(`${baseUrl}/runtime`, {
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(response.status).toBe(200);
    });
  });
});

describe("server agent delegation endpoint core", () => {
  const baseDelegationRequest: ServerAgentDelegationExecuteRequest = {
    id: "agent_delegation_test_1",
    sessionId: "session_1",
    caller: {
      agentId: "agent_kurumi",
      role: "companion",
      personaName: "kurumi",
      providerProfileId: "provider_dgx02_vllm",
      modelId: "qwen36-domain-lora-v5-prisma",
      systemPrompt: "You are Kurumi.",
    },
    userMessage: "시장 규모를 확인하고 결론을 줘.",
    targets: [
      {
        key: "researcher",
        agentId: "agent_maomao",
        role: "researcher",
        personaName: "maomao",
        providerProfileId: "provider_dgx02_vllm",
        modelId: "qwen36-domain-lora-v5-prisma",
        systemPrompt: "You are Maomao.",
      },
    ],
    routePreference: "server_proxy" as const,
    createdAt: "2026-05-25T00:00:00.000Z",
  };

  it("resolves a companion delegate tag and records server delegation events", async () => {
    const seenRequests: string[] = [];
    const response = await createServerAgentDelegationExecution(baseDelegationRequest, {
      completeProvider: async (request) => {
        seenRequests.push(request.id);
        if (seenRequests.length === 1) {
          return {
            id: "response_initial",
            requestId: request.id,
            providerProfileId: request.providerProfileId,
            modelId: request.modelId,
            route: request.routePreference,
            status: "succeeded",
            content: '조사 맡길게. <delegate to="researcher">2024 HTV 시장 규모</delegate>',
            createdAt: request.createdAt,
          };
        }
        if (seenRequests.length === 2) {
          return {
            id: "response_researcher",
            requestId: request.id,
            providerProfileId: request.providerProfileId,
            modelId: request.modelId,
            route: request.routePreference,
            status: "succeeded",
            content: "마오마오: 톱5 시장과 리스크를 확인했어.",
            createdAt: request.createdAt,
          };
        }
        return {
          id: "response_followup",
          requestId: request.id,
          providerProfileId: request.providerProfileId,
          modelId: request.modelId,
          route: request.routePreference,
          status: "succeeded",
          content: "쿠루미 최종: 마오마오 확인을 반영해 톱5를 정리했어.",
          createdAt: request.createdAt,
        };
      },
      generateId: () => `id_${seenRequests.length + 1}`,
      now: "2026-05-25T00:00:00.000Z",
    });

    expect(seenRequests).toHaveLength(3);
    expect(response.shortCircuited).toBe(false);
    expect(response.finalContent).toContain("쿠루미 최종");
    expect(response.delegations).toMatchObject([
      {
        kind: "succeeded",
        target: "researcher",
        targetAgentId: "agent_maomao",
      },
    ]);
    expect(response.events.map((event) => event.type)).toEqual([
      "agent.delegation.detected",
      "agent.delegation.dispatched",
      "agent.delegation.succeeded",
      "agent.delegation.followup.completed",
    ]);
    expect(response.events.every((event) => event.redacted)).toBe(true);
    expectValidAgentDelegationEvents(response.events);
  });

  it("records unknown delegation targets before the follow-up turn", async () => {
    const response = await createServerAgentDelegationExecution(
      {
        ...baseDelegationRequest,
        targets: [],
      },
      {
        completeProvider: async (request) => ({
          id: `response_${request.id}`,
          requestId: request.id,
          providerProfileId: request.providerProfileId,
          modelId: request.modelId,
          route: request.routePreference,
          status: "succeeded",
          content:
            request.id.includes("initial")
              ? '<delegate to="researcher">자료 확인</delegate>'
              : "쿠루미 최종: 대상이 없어서 직접 정리했어.",
          createdAt: request.createdAt,
        }),
        now: "2026-05-25T00:00:00.000Z",
      },
    );

    expect(response.delegations).toMatchObject([
      {
        kind: "unknown_target",
        target: "researcher",
      },
    ]);
    expect(response.events.map((event) => event.type)).toContain("agent.delegation.unknown_target");
    expectValidAgentDelegationEvents(response.events);
    expect(response.finalContent).toContain("쿠루미 최종");
  });
});

describe("HTTP request limits", () => {
  it("rejects mock agent delegation unless explicit test opt-in is enabled", async () => {
    const previousToken = process.env.ORCHESTRATOR_API_TOKEN;
    const previousNodeEnv = process.env.NODE_ENV;
    const previousEnableMockDelegation = process.env.ENABLE_MOCK_AGENT_DELEGATION;
    process.env.ORCHESTRATOR_API_TOKEN = "test-orchestrator-token";
    process.env.NODE_ENV = "test";
    delete process.env.ENABLE_MOCK_AGENT_DELEGATION;

    const server = startServer(0);

    try {
      await new Promise<void>((resolve) => {
        server.once("listening", resolve);
      });
      const address = server.address();
      if (!address || typeof address !== "object") {
        throw new Error("test server did not bind to a TCP port");
      }

      const response = await fetch(`http://127.0.0.1:${address.port}/agent-delegations/execute`, {
        body: JSON.stringify({
          id: "agent_delegation_http_mock_without_opt_in",
          sessionId: "session_http",
          executionMode: "mock",
          caller: {
            agentId: "agent_kurumi",
            role: "companion",
            personaName: "kurumi",
            providerProfileId: "provider_dgx02_vllm",
            modelId: "qwen36-domain-lora-v5-prisma",
          },
          userMessage: "마오마오에게 조사 맡겨줘.",
          targets: [
            {
              key: "researcher",
              agentId: "agent_maomao",
              role: "researcher",
              personaName: "maomao",
              providerProfileId: "provider_dgx02_vllm",
              modelId: "qwen36-domain-lora-v5-prisma",
            },
          ],
          routePreference: "server_proxy",
          createdAt: "2026-05-25T00:00:00.000Z",
        }),
        headers: {
          authorization: "Bearer test-orchestrator-token",
          "content-type": "application/json",
        },
        method: "POST",
      });

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({
        error: "mock_delegation_disabled",
      });
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
      if (previousToken === undefined) {
        delete process.env.ORCHESTRATOR_API_TOKEN;
      } else {
        process.env.ORCHESTRATOR_API_TOKEN = previousToken;
      }
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnv;
      }
      if (previousEnableMockDelegation === undefined) {
        delete process.env.ENABLE_MOCK_AGENT_DELEGATION;
      } else {
        process.env.ENABLE_MOCK_AGENT_DELEGATION = previousEnableMockDelegation;
      }
    }
  });

  it("executes mock agent delegation and persists delegation events", async () => {
    const previousToken = process.env.ORCHESTRATOR_API_TOKEN;
    const previousNodeEnv = process.env.NODE_ENV;
    const previousEventStorageDir = process.env.EVENT_STORAGE_DIR;
    const previousEnableMockDelegation = process.env.ENABLE_MOCK_AGENT_DELEGATION;
    const tempDir = await mkdtemp(join(tmpdir(), "ai-orchestrator-agent-delegations-"));
    process.env.ORCHESTRATOR_API_TOKEN = "test-orchestrator-token";
    process.env.NODE_ENV = "test";
    process.env.EVENT_STORAGE_DIR = tempDir;
    process.env.ENABLE_MOCK_AGENT_DELEGATION = "true";

    const server = startServer(0);

    try {
      await new Promise<void>((resolve) => {
        server.once("listening", resolve);
      });
      const address = server.address();
      if (!address || typeof address !== "object") {
        throw new Error("test server did not bind to a TCP port");
      }

      const response = await fetch(`http://127.0.0.1:${address.port}/agent-delegations/execute`, {
        body: JSON.stringify({
          id: "agent_delegation_http_mock",
          sessionId: "session_http",
          executionMode: "mock",
          caller: {
            agentId: "agent_kurumi",
            role: "companion",
            personaName: "kurumi",
            providerProfileId: "provider_dgx02_vllm",
            modelId: "qwen36-domain-lora-v5-prisma",
          },
          userMessage: "마오마오에게 조사 맡겨줘.",
          targets: [
            {
              key: "researcher",
              agentId: "agent_maomao",
              role: "researcher",
              personaName: "maomao",
              providerProfileId: "provider_dgx02_vllm",
              modelId: "qwen36-domain-lora-v5-prisma",
            },
          ],
          routePreference: "server_proxy",
          createdAt: "2026-05-25T00:00:00.000Z",
        }),
        headers: {
          authorization: "Bearer test-orchestrator-token",
          "content-type": "application/json",
        },
        method: "POST",
      });

      expect(response.status).toBe(202);
      const payload = await response.json();
      expect(payload).toMatchObject({
        id: "agent_delegation_http_mock",
        shortCircuited: false,
        delegations: [
          {
            kind: "succeeded",
            target: "researcher",
            targetAgentId: "agent_maomao",
          },
        ],
        eventSync: {
          accepted: 4,
        },
      });

      const eventsResponse = await fetch(`http://127.0.0.1:${address.port}/events?sessionId=session_http`, {
        headers: {
          authorization: "Bearer test-orchestrator-token",
        },
      });
      expect(eventsResponse.status).toBe(200);
      const eventPayload = (await eventsResponse.json()) as { events: Array<{ type: string; payload: unknown }> };
      expect(eventPayload.events.map((event: { type: string }) => event.type)).toContain("agent.delegation.succeeded");
      expectValidAgentDelegationEvents(
        eventPayload.events.filter((event) => event.type.startsWith("agent.delegation.")),
      );
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
      if (previousToken === undefined) {
        delete process.env.ORCHESTRATOR_API_TOKEN;
      } else {
        process.env.ORCHESTRATOR_API_TOKEN = previousToken;
      }
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnv;
      }
      if (previousEventStorageDir === undefined) {
        delete process.env.EVENT_STORAGE_DIR;
      } else {
        process.env.EVENT_STORAGE_DIR = previousEventStorageDir;
      }
      if (previousEnableMockDelegation === undefined) {
        delete process.env.ENABLE_MOCK_AGENT_DELEGATION;
      } else {
        process.env.ENABLE_MOCK_AGENT_DELEGATION = previousEnableMockDelegation;
      }
      await rm(tempDir, { force: true, recursive: true });
    }
  });

  it("rejects mock agent delegation in production", async () => {
    const previousToken = process.env.ORCHESTRATOR_API_TOKEN;
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.ORCHESTRATOR_API_TOKEN = "test-orchestrator-token";
    process.env.NODE_ENV = "production";

    const server = startServer(0);

    try {
      await new Promise<void>((resolve) => {
        server.once("listening", resolve);
      });
      const address = server.address();
      if (!address || typeof address !== "object") {
        throw new Error("test server did not bind to a TCP port");
      }

      const response = await fetch(`http://127.0.0.1:${address.port}/agent-delegations/execute`, {
        body: JSON.stringify({
          id: "agent_delegation_http_mock_prod",
          sessionId: "session_http",
          executionMode: "mock",
          caller: {
            agentId: "agent_kurumi",
            role: "companion",
            personaName: "kurumi",
            providerProfileId: "provider_dgx02_vllm",
            modelId: "qwen36-domain-lora-v5-prisma",
          },
          userMessage: "Ask researcher for a short market scan.",
          targets: [
            {
              key: "researcher",
              agentId: "agent_maomao",
              role: "researcher",
              personaName: "maomao",
              providerProfileId: "provider_dgx02_vllm",
              modelId: "qwen36-domain-lora-v5-prisma",
            },
          ],
          routePreference: "server_proxy",
          createdAt: "2026-05-25T00:00:00.000Z",
        }),
        headers: {
          authorization: "Bearer test-orchestrator-token",
          "content-type": "application/json",
        },
        method: "POST",
      });

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({
        error: "mock_delegation_disabled",
      });
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
      if (previousToken === undefined) {
        delete process.env.ORCHESTRATOR_API_TOKEN;
      } else {
        process.env.ORCHESTRATOR_API_TOKEN = previousToken;
      }
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnv;
      }
    }
  });

  it("queues approval before live agent delegation can call a limited provider", async () => {
    const previousToken = process.env.ORCHESTRATOR_API_TOKEN;
    const previousNodeEnv = process.env.NODE_ENV;
    const previousEventStorageDir = process.env.EVENT_STORAGE_DIR;
    const tempDir = await mkdtemp(join(tmpdir(), "ai-orchestrator-agent-delegation-approval-"));
    process.env.ORCHESTRATOR_API_TOKEN = "test-orchestrator-token";
    process.env.NODE_ENV = "production";
    process.env.EVENT_STORAGE_DIR = tempDir;

    const server = startServer(0);

    try {
      await new Promise<void>((resolve) => {
        server.once("listening", resolve);
      });
      const address = server.address();
      if (!address || typeof address !== "object") {
        throw new Error("test server did not bind to a TCP port");
      }

      const response = await fetch(`http://127.0.0.1:${address.port}/agent-delegations/execute`, {
        body: JSON.stringify({
          id: "agent_delegation_live_permission",
          sessionId: "session_http_permission",
          caller: {
            agentId: "agent_kurumi",
            role: "companion",
            personaName: "kurumi",
            providerProfileId: "provider_apifun_claude",
            modelId: "claude-opus-4-6",
          },
          userMessage: "Ask researcher for a short market scan.",
          targets: [
            {
              key: "researcher",
              agentId: "agent_maomao",
              role: "researcher",
              personaName: "maomao",
              providerProfileId: "provider_apifun_claude",
              modelId: "claude-opus-4-6",
            },
          ],
          routePreference: "server_proxy",
          createdAt: "2026-05-25T00:00:00.000Z",
        }),
        headers: {
          authorization: "Bearer test-orchestrator-token",
          "content-type": "application/json",
        },
        method: "POST",
      });

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({
        error: "permission_required",
        approval: {
          replay: {
            endpoint: "/agent-delegations/execute",
            kind: "agent_delegation",
            method: "POST",
          },
          sourceItemId: expect.stringContaining("agent_delegation_live_permission_initial"),
          state: "required",
        },
        permission: {
          action: "provider_completion",
          approvalState: "required",
          decision: "approval_required",
        },
      });

      const listResponse = await fetch(`http://127.0.0.1:${address.port}/approvals/list`, {
        headers: {
          authorization: "Bearer test-orchestrator-token",
        },
      });
      expect(listResponse.status).toBe(200);
      await expect(listResponse.json()).resolves.toMatchObject({
        summary: {
          pending: 1,
        },
        queue: [
          {
            replayEndpoint: "/agent-delegations/execute",
            replayKind: "agent_delegation",
          },
        ],
      });
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
      if (previousToken === undefined) {
        delete process.env.ORCHESTRATOR_API_TOKEN;
      } else {
        process.env.ORCHESTRATOR_API_TOKEN = previousToken;
      }
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnv;
      }
      if (previousEventStorageDir === undefined) {
        delete process.env.EVENT_STORAGE_DIR;
      } else {
        process.env.EVENT_STORAGE_DIR = previousEventStorageDir;
      }
      await rm(tempDir, { force: true, recursive: true });
    }
  });

  it("replays an approved agent delegation request from the approval record", async () => {
    const previousEventStorageDir = process.env.EVENT_STORAGE_DIR;
    const previousNodeEnv = process.env.NODE_ENV;
    const previousEnableMockDelegation = process.env.ENABLE_MOCK_AGENT_DELEGATION;
    const tempDir = await mkdtemp(join(tmpdir(), "ai-orchestrator-agent-delegation-replay-"));
    process.env.EVENT_STORAGE_DIR = tempDir;
    process.env.NODE_ENV = "test";
    process.env.ENABLE_MOCK_AGENT_DELEGATION = "true";

    const storage = createJsonlServerEventStorage();

    try {
      const approval = {
        id: "approval_agent_delegation_replay",
        sessionId: "session_replay",
        sourceItemId: "agent_delegation_replay_source",
        subjectId: "agent_kurumi:agent_maomao",
        actor: "user" as const,
        channel: "desktop" as const,
        sourceTrust: "trusted" as const,
        action: "provider_completion" as const,
        requestedLevels: ["network_access" as const],
        decision: "approval_required" as const,
        state: "required" as const,
        reason: "test delegation replay approval",
        replay: {
          kind: "agent_delegation" as const,
          endpoint: "/agent-delegations/execute",
          method: "POST" as const,
          payload: {
            id: "agent_delegation_replay",
            sessionId: "session_replay",
            executionMode: "mock",
            caller: {
              agentId: "agent_kurumi",
              role: "companion",
              personaName: "kurumi",
              providerProfileId: "provider_dgx02_vllm",
              modelId: "qwen36-domain-lora-v5-prisma",
            },
            userMessage: "Ask researcher for a short market scan.",
            targets: [
              {
                key: "researcher",
                agentId: "agent_maomao",
                role: "researcher",
                personaName: "maomao",
                providerProfileId: "provider_dgx02_vllm",
                modelId: "qwen36-domain-lora-v5-prisma",
              },
            ],
            routePreference: "server_proxy",
            createdAt: "2026-05-25T00:00:00.000Z",
          } satisfies ServerAgentDelegationExecuteRequest,
        },
        ttlSeconds: 86_400,
        createdAt: "2026-05-25T00:00:00.000Z",
        expiresAt: "2026-05-26T00:00:00.000Z",
      };

      await recordApprovalRequestToPersistentServerStorage(approval, storage, "2026-05-25T00:00:00.000Z");
      await decideApprovalInPersistentServerStorage(
        { approvalId: approval.id, actor: "user", decidedAt: "2026-05-25T00:00:01.000Z" },
        "approved",
        storage,
        "2026-05-25T00:00:01.000Z",
      );

      const replay = await replayApprovedRequestFromPersistentServerStorage(
        { approvalId: approval.id, actor: "user" },
        storage,
        "2026-05-25T00:00:02.000Z",
      );

      expect(replay.statusCode).toBe(202);
      expect(replay.payload).toMatchObject({
        status: "replayed",
        result: {
          id: "agent_delegation_replay",
          shortCircuited: false,
          delegations: [
            {
              kind: "succeeded",
              target: "researcher",
              targetAgentId: "agent_maomao",
            },
          ],
        },
      });
      if (replay.payload.status === "replayed" && "events" in replay.payload.result) {
        expect(replay.payload.eventSync?.accepted).toBe(4);
        expectValidAgentDelegationEvents(replay.payload.result.events);
      }
    } finally {
      if (previousEventStorageDir === undefined) {
        delete process.env.EVENT_STORAGE_DIR;
      } else {
        process.env.EVENT_STORAGE_DIR = previousEventStorageDir;
      }
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnv;
      }
      if (previousEnableMockDelegation === undefined) {
        delete process.env.ENABLE_MOCK_AGENT_DELEGATION;
      } else {
        process.env.ENABLE_MOCK_AGENT_DELEGATION = previousEnableMockDelegation;
      }
      await rm(tempDir, { force: true, recursive: true });
    }
  });

  it("replays approved provider completion requests from the approval record", async () => {
    const previousEventStorageDir = process.env.EVENT_STORAGE_DIR;
    const previousAnthropicKey = process.env.ANTHROPIC_API_KEY;
    const tempDir = await mkdtemp(join(tmpdir(), "ai-orchestrator-provider-replay-"));
    process.env.EVENT_STORAGE_DIR = tempDir;
    delete process.env.ANTHROPIC_API_KEY;

    const storage = createJsonlServerEventStorage();

    try {
      const request = {
        id: "provider_completion_replay",
        sessionId: "session_provider_replay",
        providerProfileId: "provider_apifun_claude",
        modelId: "claude-opus-4-6",
        messages: [{ role: "user" as const, content: "hello" }],
        source: "desktop" as const,
        routePreference: "server_proxy" as const,
        createdAt: "2026-05-25T00:00:00.000Z",
      };
      const permission = evaluateServerProviderCompletionPermission(request);
      expect(permission.decision).toBe("approval_required");
      const approval = createProviderCompletionApprovalRequest(
        request,
        permission,
        "2026-05-25T00:00:00.000Z",
      );

      await recordApprovalRequestToPersistentServerStorage(approval, storage, "2026-05-25T00:00:00.000Z");
      await decideApprovalInPersistentServerStorage(
        { approvalId: approval.id, actor: "user", decidedAt: "2026-05-25T00:00:01.000Z" },
        "approved",
        storage,
        "2026-05-25T00:00:01.000Z",
      );

      const replay = await replayApprovedRequestFromPersistentServerStorage(
        { approvalId: approval.id, actor: "user" },
        storage,
        "2026-05-25T00:00:02.000Z",
      );

      expect(replay.statusCode).toBe(202);
      expect(replay.payload).toMatchObject({
        status: "replayed",
        replay: {
          kind: "provider_completion",
        },
        result: {
          requestId: "provider_completion_replay",
          providerProfileId: "provider_apifun_claude",
          status: "failed",
        },
      });
    } finally {
      if (previousEventStorageDir === undefined) {
        delete process.env.EVENT_STORAGE_DIR;
      } else {
        process.env.EVENT_STORAGE_DIR = previousEventStorageDir;
      }
      if (previousAnthropicKey === undefined) {
        delete process.env.ANTHROPIC_API_KEY;
      } else {
        process.env.ANTHROPIC_API_KEY = previousAnthropicKey;
      }
      await rm(tempDir, { force: true, recursive: true });
    }
  });

  it("returns 403 for provider completions that need approval before proxying", async () => {
    const previousToken = process.env.ORCHESTRATOR_API_TOKEN;
    const previousNodeEnv = process.env.NODE_ENV;
    const previousEventStorageDir = process.env.EVENT_STORAGE_DIR;
    const tempDir = await mkdtemp(join(tmpdir(), "ai-orchestrator-approvals-"));
    process.env.ORCHESTRATOR_API_TOKEN = "test-orchestrator-token";
    process.env.NODE_ENV = "production";
    process.env.EVENT_STORAGE_DIR = tempDir;

    const server = startServer(0);

    try {
      await new Promise<void>((resolve) => {
        server.once("listening", resolve);
      });
      const address = server.address();
      if (!address || typeof address !== "object") {
        throw new Error("test server did not bind to a TCP port");
      }

      const response = await fetch(`http://127.0.0.1:${address.port}/provider-completions`, {
        body: JSON.stringify({
          id: "provider_completion_http_permission",
          sessionId: "session_1",
          providerProfileId: "provider_apifun_claude",
          modelId: "claude-opus-4-6",
          messages: [{ role: "user", content: "hello" }],
          source: "desktop",
          routePreference: "server_proxy",
          createdAt: "2026-05-24T00:00:00.000Z",
        }),
        headers: {
          authorization: "Bearer test-orchestrator-token",
          "content-type": "application/json",
        },
        method: "POST",
      });

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({
        error: "permission_required",
        approval: {
          sourceItemId: "provider_completion_http_permission",
          state: "required",
        },
        permission: {
          action: "provider_completion",
          approvalState: "required",
          decision: "approval_required",
        },
      });

      const listResponse = await fetch(`http://127.0.0.1:${address.port}/approvals/list`, {
        headers: {
          authorization: "Bearer test-orchestrator-token",
        },
      });
      expect(listResponse.status).toBe(200);
      await expect(listResponse.json()).resolves.toMatchObject({
        summary: {
          pending: 1,
        },
        queue: [
          {
            sourceItemId: "provider_completion_http_permission",
            state: "required",
          },
        ],
      });

      const grantResponse = await fetch(`http://127.0.0.1:${address.port}/approvals/grant`, {
        body: JSON.stringify({ sourceItemId: "provider_completion_http_permission", actor: "user" }),
        headers: {
          authorization: "Bearer test-orchestrator-token",
          "content-type": "application/json",
        },
        method: "POST",
      });
      expect(grantResponse.status).toBe(200);
      await expect(grantResponse.json()).resolves.toMatchObject({
        approval: {
          sourceItemId: "provider_completion_http_permission",
          state: "approved",
        },
        status: "approved",
      });
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
      if (previousToken === undefined) {
        delete process.env.ORCHESTRATOR_API_TOKEN;
      } else {
        process.env.ORCHESTRATOR_API_TOKEN = previousToken;
      }
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnv;
      }
      if (previousEventStorageDir === undefined) {
        delete process.env.EVENT_STORAGE_DIR;
      } else {
        process.env.EVENT_STORAGE_DIR = previousEventStorageDir;
      }
      await rm(tempDir, { force: true, recursive: true });
    }
  });

  it("accepts external ingress through the server guard and queues approval", async () => {
    const previousToken = process.env.ORCHESTRATOR_API_TOKEN;
    const previousNodeEnv = process.env.NODE_ENV;
    const previousEventStorageDir = process.env.EVENT_STORAGE_DIR;
    const tempDir = await mkdtemp(join(tmpdir(), "ai-orchestrator-ingress-"));
    process.env.ORCHESTRATOR_API_TOKEN = "test-orchestrator-token";
    process.env.NODE_ENV = "production";
    process.env.EVENT_STORAGE_DIR = tempDir;

    const server = startServer(0);

    try {
      await new Promise<void>((resolve) => {
        server.once("listening", resolve);
      });
      const address = server.address();
      if (!address || typeof address !== "object") {
        throw new Error("test server did not bind to a TCP port");
      }

      const response = await fetch(`http://127.0.0.1:${address.port}/ingress/events`, {
        body: JSON.stringify({
          id: "external_ingress_input_http_test",
          sessionId: "session_ingress_http",
          channel: "external_legacy",
          authorType: "user",
          eventType: "message",
          text: "please run bash and use Bearer abcdefghijklmnopqrstuvwxyz123456",
          receivedAt: "2099-05-25T00:00:00.000Z",
        }),
        headers: {
          authorization: "Bearer test-orchestrator-token",
          "content-type": "application/json",
        },
        method: "POST",
      });

      expect(response.status).toBe(202);
      const body = (await response.json()) as {
        approvals: Array<{ state: string; action: string }>;
        eventSync: { accepted: number };
        snapshot: {
          result: {
            approvalState: string;
            normalizedEvent: { normalizedText: string };
          };
        };
      };
      expect(body.snapshot.result.approvalState).toBe("required");
      expect(body.snapshot.result.normalizedEvent.normalizedText).not.toContain("abcdefghijklmnopqrstuvwxyz");
      expect(body.approvals[0]).toMatchObject({
        state: "required",
        action: "terminal_run",
      });
      expect(body.eventSync.accepted).toBeGreaterThanOrEqual(3);

      const listResponse = await fetch(`http://127.0.0.1:${address.port}/approvals/list`, {
        headers: {
          authorization: "Bearer test-orchestrator-token",
        },
      });
      expect(listResponse.status).toBe(200);
      await expect(listResponse.json()).resolves.toMatchObject({
        queue: [
          {
            sourceItemId: expect.any(String),
          },
        ],
        summary: {
          pending: 1,
        },
      });
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
      if (previousToken === undefined) {
        delete process.env.ORCHESTRATOR_API_TOKEN;
      } else {
        process.env.ORCHESTRATOR_API_TOKEN = previousToken;
      }
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnv;
      }
      if (previousEventStorageDir === undefined) {
        delete process.env.EVENT_STORAGE_DIR;
      } else {
        process.env.EVENT_STORAGE_DIR = previousEventStorageDir;
      }
      await rm(tempDir, { force: true, recursive: true });
    }
  });

  it("rejects client-synced approval events before they can grant server actions", async () => {
    const previousToken = process.env.ORCHESTRATOR_API_TOKEN;
    const previousEventStorageDir = process.env.EVENT_STORAGE_DIR;
    const tempDir = await mkdtemp(join(tmpdir(), "ai-orchestrator-approval-event-injection-"));
    process.env.ORCHESTRATOR_API_TOKEN = "test-orchestrator-token";
    process.env.EVENT_STORAGE_DIR = tempDir;

    const server = startServer(0);

    try {
      await new Promise<void>((resolve) => {
        server.once("listening", resolve);
      });
      const address = server.address();
      if (!address || typeof address !== "object") {
        throw new Error("test server did not bind to a TCP port");
      }

      const response = await fetch(`http://127.0.0.1:${address.port}/events/sync`, {
        body: JSON.stringify({
          id: "sync_forged_approval",
          clientId: "client_macbook",
          sessionId: "session_forged_approval",
          events: [
            {
              id: "event_forged_approval_requested",
              sessionId: "session_forged_approval",
              type: "approval.requested",
              payload: {
                id: "approval_forged",
                sourceItemId: "tmux_dispatch_forged",
                state: "required",
              },
              createdAt: "2026-05-25T00:00:00.000Z",
              source: "desktop",
              sourceTrust: "trusted",
              redacted: true,
            },
          ],
          idempotencyKey: "client_macbook:session_forged_approval:event_forged_approval_requested",
          createdAt: "2026-05-25T00:00:00.000Z",
        }),
        headers: {
          authorization: "Bearer test-orchestrator-token",
          "content-type": "application/json",
        },
        method: "POST",
      });

      expect(response.status).toBe(403);
      const body = await response.json() as { error?: string };
      expect(body.error).toBe("server_owned_event_type");
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
      if (previousToken === undefined) {
        delete process.env.ORCHESTRATOR_API_TOKEN;
      } else {
        process.env.ORCHESTRATOR_API_TOKEN = previousToken;
      }
      if (previousEventStorageDir === undefined) {
        delete process.env.EVENT_STORAGE_DIR;
      } else {
        process.env.EVENT_STORAGE_DIR = previousEventStorageDir;
      }
      await rm(tempDir, { force: true, recursive: true });
    }
  });

  it("records tmux dispatch requests through the approval gate", async () => {
    const previousToken = process.env.ORCHESTRATOR_API_TOKEN;
    const previousNodeEnv = process.env.NODE_ENV;
    const previousEventStorageDir = process.env.EVENT_STORAGE_DIR;
    const previousTmuxDispatch = process.env.ORCHESTRATOR_ENABLE_TMUX_SEND_KEYS;
    const tempDir = await mkdtemp(join(tmpdir(), "ai-orchestrator-tmux-"));
    process.env.ORCHESTRATOR_API_TOKEN = "test-orchestrator-token";
    process.env.NODE_ENV = "production";
    process.env.EVENT_STORAGE_DIR = tempDir;
    delete process.env.ORCHESTRATOR_ENABLE_TMUX_SEND_KEYS;

    const server = startServer(0);

    try {
      await new Promise<void>((resolve) => {
        server.once("listening", resolve);
      });
      const address = server.address();
      if (!address || typeof address !== "object") {
        throw new Error("test server did not bind to a TCP port");
      }

      const response = await fetch(`http://127.0.0.1:${address.port}/tmux/dispatch`, {
        body: JSON.stringify({
          id: "tmux_dispatch_http_test",
          sessionId: "session_tmux_http",
          terminalSessionId: "terminal_session_ai_swarm",
          role: "frontend",
          host: "dgx_02",
          paneId: "%5",
          requestedBy: "user",
          commandPreview: "pnpm typecheck",
          approvalState: "required",
          dispatchMode: "execute_if_approved",
          tmuxSessionName: "ai-swarm",
          createdAt: "2026-05-25T00:00:00.000Z",
        }),
        headers: {
          authorization: "Bearer test-orchestrator-token",
          "content-type": "application/json",
        },
        method: "POST",
      });

      expect(response.status).toBe(202);
      const body = (await response.json()) as {
        approval?: { state: string; action: string };
        dispatch: { status: string; attempted: boolean };
        eventSync: { accepted: number };
        intent: { dispatchState: string; redactedCommandPreview: string };
        permission: { decision: string };
      };
      expect(body.permission.decision).toBe("approval_required");
      expect(body.intent.dispatchState).toBe("pending_approval");
      expect(body.approval).toMatchObject({
        state: "required",
        action: "terminal_run",
      });
      expect(body.dispatch).toMatchObject({
        attempted: false,
        status: "pending_approval",
      });
      expect(body.eventSync.accepted).toBe(2);

      const preRequestResponse = await fetch(`http://127.0.0.1:${address.port}/tmux/dispatch`, {
        body: JSON.stringify({
          id: "tmux_dispatch_http_approved",
          sessionId: "session_tmux_http",
          terminalSessionId: "terminal_session_ai_swarm",
          role: "frontend",
          host: "dgx_02",
          paneId: "%5",
          requestedBy: "user",
          commandPreview: "pnpm test",
          approvalState: "required",
          dispatchMode: "execute_if_approved",
          tmuxSessionName: "ai-swarm",
          createdAt: "2026-05-25T00:00:30.000Z",
        }),
        headers: {
          authorization: "Bearer test-orchestrator-token",
          "content-type": "application/json",
        },
        method: "POST",
      });
      expect(preRequestResponse.status).toBe(202);

      const grantResponse = await fetch(`http://127.0.0.1:${address.port}/approvals/grant`, {
        body: JSON.stringify({ sourceItemId: "tmux_dispatch_http_approved", actor: "user" }),
        headers: {
          authorization: "Bearer test-orchestrator-token",
          "content-type": "application/json",
        },
        method: "POST",
      });
      expect(grantResponse.status).toBe(200);

      const approvedResponse = await fetch(`http://127.0.0.1:${address.port}/tmux/dispatch`, {
        body: JSON.stringify({
          id: "tmux_dispatch_http_approved",
          sessionId: "session_tmux_http",
          terminalSessionId: "terminal_session_ai_swarm",
          role: "frontend",
          host: "dgx_02",
          paneId: "%5",
          requestedBy: "user",
          commandPreview: "pnpm test",
          approvalState: "approved",
          dispatchMode: "execute_if_approved",
          tmuxSessionName: "ai-swarm",
          createdAt: "2026-05-25T00:00:30.000Z",
        }),
        headers: {
          authorization: "Bearer test-orchestrator-token",
          "content-type": "application/json",
        },
        method: "POST",
      });
      expect(approvedResponse.status).toBe(202);
      const approvedBody = (await approvedResponse.json()) as {
        dispatch: { status: string; reason: string };
        dispatchEventSync?: { accepted: number };
        permission: { decision: string };
      };
      expect(approvedBody.permission.decision).toBe("allow");
      expect(approvedBody.dispatch.status).toBe("blocked");
      expect(approvedBody.dispatch.reason).toContain("ORCHESTRATOR_ENABLE_TMUX_SEND_KEYS");
      expect(approvedBody.dispatchEventSync?.accepted).toBe(1);

      const listResponse = await fetch(`http://127.0.0.1:${address.port}/approvals/list`, {
        headers: {
          authorization: "Bearer test-orchestrator-token",
        },
      });
      expect(listResponse.status).toBe(200);
      await expect(listResponse.json()).resolves.toMatchObject({
        queue: [
          {
            action: "terminal_run",
            replayEndpoint: "/tmux/dispatch",
            replayKind: "tmux_dispatch",
            reason: "tmux 디스패치는 send-keys 실행 전 명시적 승인이 필요합니다",
            sourceItemId: "tmux_dispatch_http_test",
            sourceTrust: "trusted",
          },
        ],
        summary: {
          pending: 1,
        },
      });
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
      if (previousToken === undefined) {
        delete process.env.ORCHESTRATOR_API_TOKEN;
      } else {
        process.env.ORCHESTRATOR_API_TOKEN = previousToken;
      }
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnv;
      }
      if (previousEventStorageDir === undefined) {
        delete process.env.EVENT_STORAGE_DIR;
      } else {
        process.env.EVENT_STORAGE_DIR = previousEventStorageDir;
      }
      if (previousTmuxDispatch === undefined) {
        delete process.env.ORCHESTRATOR_ENABLE_TMUX_SEND_KEYS;
      } else {
        process.env.ORCHESTRATOR_ENABLE_TMUX_SEND_KEYS = previousTmuxDispatch;
      }
      await rm(tempDir, { force: true, recursive: true });
    }
  });

  it("dry-runs approved tmux dispatch without send-keys or model engine access", async () => {
    const previousToken = process.env.ORCHESTRATOR_API_TOKEN;
    const previousNodeEnv = process.env.NODE_ENV;
    const previousEventStorageDir = process.env.EVENT_STORAGE_DIR;
    const previousTmuxDispatch = process.env.ORCHESTRATOR_ENABLE_TMUX_SEND_KEYS;
    const previousTmuxDryRun = process.env.ORCHESTRATOR_TMUX_DRY_RUN;
    const tempDir = await mkdtemp(join(tmpdir(), "ai-orchestrator-tmux-dry-run-"));
    process.env.ORCHESTRATOR_API_TOKEN = "test-orchestrator-token";
    process.env.NODE_ENV = "production";
    process.env.EVENT_STORAGE_DIR = tempDir;
    process.env.ORCHESTRATOR_TMUX_DRY_RUN = "1";
    delete process.env.ORCHESTRATOR_ENABLE_TMUX_SEND_KEYS;

    const server = startServer(0);

    try {
      await new Promise<void>((resolve) => {
        server.once("listening", resolve);
      });
      const address = server.address();
      if (!address || typeof address !== "object") {
        throw new Error("test server did not bind to a TCP port");
      }

      const preRequestResponse = await fetch(`http://127.0.0.1:${address.port}/tmux/dispatch`, {
        body: JSON.stringify({
          id: "tmux_dispatch_http_dry_run",
          sessionId: "session_tmux_http",
          terminalSessionId: "terminal_session_ai_swarm",
          role: "qa",
          host: "dgx_02",
          paneId: "%7",
          requestedBy: "user",
          commandPreview: "pnpm test",
          approvalState: "required",
          dispatchMode: "execute_if_approved",
          tmuxSessionName: "ai-swarm",
          createdAt: "2026-05-25T00:02:30.000Z",
        }),
        headers: {
          authorization: "Bearer test-orchestrator-token",
          "content-type": "application/json",
        },
        method: "POST",
      });
      expect(preRequestResponse.status).toBe(202);

      const grantResponse = await fetch(`http://127.0.0.1:${address.port}/approvals/grant`, {
        body: JSON.stringify({ sourceItemId: "tmux_dispatch_http_dry_run", actor: "user" }),
        headers: {
          authorization: "Bearer test-orchestrator-token",
          "content-type": "application/json",
        },
        method: "POST",
      });
      expect(grantResponse.status).toBe(200);

      const response = await fetch(`http://127.0.0.1:${address.port}/tmux/dispatch`, {
        body: JSON.stringify({
          id: "tmux_dispatch_http_dry_run",
          sessionId: "session_tmux_http",
          terminalSessionId: "terminal_session_ai_swarm",
          role: "qa",
          host: "dgx_02",
          paneId: "%7",
          requestedBy: "user",
          commandPreview: "pnpm test",
          approvalState: "approved",
          dispatchMode: "execute_if_approved",
          tmuxSessionName: "ai-swarm",
          createdAt: "2026-05-25T00:02:30.000Z",
        }),
        headers: {
          authorization: "Bearer test-orchestrator-token",
          "content-type": "application/json",
        },
        method: "POST",
      });

      expect(response.status).toBe(202);
      const body = (await response.json()) as {
        dispatch: { attempted: boolean; reason: string; status: string };
        dispatchEventSync?: { accepted: number };
        permission: { decision: string };
      };
      expect(body.permission.decision).toBe("allow");
      expect(body.dispatch).toMatchObject({
        attempted: false,
        status: "dry_run",
      });
      expect(body.dispatch.reason).toContain("ORCHESTRATOR_TMUX_DRY_RUN");
      expect(body.dispatchEventSync?.accepted).toBe(1);

      const pull = await fetch(`http://127.0.0.1:${address.port}/events?sessionId=session_tmux_http`, {
        headers: {
          authorization: "Bearer test-orchestrator-token",
        },
      });
      expect(pull.status).toBe(200);
      const pulled = (await pull.json()) as { events: Array<{ type: string; payload: unknown }> };
      expect(pulled.events.map((event) => event.type)).toContain("terminal.command.dry_run");
      expectValidTerminalCommandEvents(pulled.events.filter((event) => event.type.startsWith("terminal.command.")));
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
      if (previousToken === undefined) {
        delete process.env.ORCHESTRATOR_API_TOKEN;
      } else {
        process.env.ORCHESTRATOR_API_TOKEN = previousToken;
      }
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnv;
      }
      if (previousEventStorageDir === undefined) {
        delete process.env.EVENT_STORAGE_DIR;
      } else {
        process.env.EVENT_STORAGE_DIR = previousEventStorageDir;
      }
      if (previousTmuxDispatch === undefined) {
        delete process.env.ORCHESTRATOR_ENABLE_TMUX_SEND_KEYS;
      } else {
        process.env.ORCHESTRATOR_ENABLE_TMUX_SEND_KEYS = previousTmuxDispatch;
      }
      if (previousTmuxDryRun === undefined) {
        delete process.env.ORCHESTRATOR_TMUX_DRY_RUN;
      } else {
        process.env.ORCHESTRATOR_TMUX_DRY_RUN = previousTmuxDryRun;
      }
      await rm(tempDir, { force: true, recursive: true });
    }
  });

  it("rejects tmux dispatch bypass attempts when not found in the Event Store", async () => {
    const previousToken = process.env.ORCHESTRATOR_API_TOKEN;
    const previousNodeEnv = process.env.NODE_ENV;
    const previousEventStorageDir = process.env.EVENT_STORAGE_DIR;
    const tempDir = await mkdtemp(join(tmpdir(), "ai-orchestrator-tmux-bypass-"));
    process.env.ORCHESTRATOR_API_TOKEN = "test-orchestrator-token";
    process.env.NODE_ENV = "production";
    process.env.EVENT_STORAGE_DIR = tempDir;

    const server = startServer(0);

    try {
      await new Promise<void>((resolve) => {
        server.once("listening", resolve);
      });
      const address = server.address();
      if (!address || typeof address !== "object") {
        throw new Error("test server did not bind to a TCP port");
      }

      // Try to dispatch directly as approved without prior approval in the event store
      const response = await fetch(`http://127.0.0.1:${address.port}/tmux/dispatch`, {
        body: JSON.stringify({
          id: "tmux_dispatch_bypass_attempt",
          sessionId: "session_tmux_bypass",
          terminalSessionId: "terminal_session_ai_swarm",
          role: "qa",
          host: "dgx_02",
          paneId: "%7",
          requestedBy: "user",
          commandPreview: "pnpm test",
          approvalState: "approved", // Client-provided approved state
          dispatchMode: "execute_if_approved",
          tmuxSessionName: "ai-swarm",
          createdAt: "2026-05-25T00:03:00.000Z",
        }),
        headers: {
          authorization: "Bearer test-orchestrator-token",
          "content-type": "application/json",
        },
        method: "POST",
      });

      expect(response.status).toBe(403);
      const body = await response.json() as { error?: string, permission?: { decision: string, reason: string } };
      expect(body.permission?.decision).toBe("deny");
      expect(body.permission?.reason).toContain("bypass attempt detected");
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
      if (previousToken === undefined) {
        delete process.env.ORCHESTRATOR_API_TOKEN;
      } else {
        process.env.ORCHESTRATOR_API_TOKEN = previousToken;
      }
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnv;
      }
      if (previousEventStorageDir === undefined) {
        delete process.env.EVENT_STORAGE_DIR;
      } else {
        process.env.EVENT_STORAGE_DIR = previousEventStorageDir;
      }
      await rm(tempDir, { force: true, recursive: true });
    }
  });

  it("rejects approved tmux dispatch replay when the command payload or timestamp changes", async () => {
    const previousToken = process.env.ORCHESTRATOR_API_TOKEN;
    const previousNodeEnv = process.env.NODE_ENV;
    const previousEventStorageDir = process.env.EVENT_STORAGE_DIR;
    const previousTmuxDispatch = process.env.ORCHESTRATOR_ENABLE_TMUX_SEND_KEYS;
    const previousTmuxDryRun = process.env.ORCHESTRATOR_TMUX_DRY_RUN;
    const tempDir = await mkdtemp(join(tmpdir(), "ai-orchestrator-tmux-payload-tamper-"));
    process.env.ORCHESTRATOR_API_TOKEN = "test-orchestrator-token";
    process.env.NODE_ENV = "production";
    process.env.EVENT_STORAGE_DIR = tempDir;
    process.env.ORCHESTRATOR_TMUX_DRY_RUN = "1";
    delete process.env.ORCHESTRATOR_ENABLE_TMUX_SEND_KEYS;

    const server = startServer(0);

    try {
      await new Promise<void>((resolve) => {
        server.once("listening", resolve);
      });
      const address = server.address();
      if (!address || typeof address !== "object") {
        throw new Error("test server did not bind to a TCP port");
      }

      const requestResponse = await fetch(`http://127.0.0.1:${address.port}/tmux/dispatch`, {
        body: JSON.stringify({
          id: "tmux_dispatch_payload_tamper",
          sessionId: "session_tmux_payload_tamper",
          terminalSessionId: "terminal_session_ai_swarm",
          role: "qa",
          host: "dgx_02",
          paneId: "%7",
          requestedBy: "user",
          commandPreview: "pnpm test -- --runInBand",
          approvalState: "required",
          dispatchMode: "execute_if_approved",
          tmuxSessionName: "ai-swarm",
          createdAt: "2026-05-25T00:05:00.000Z",
        }),
        headers: {
          authorization: "Bearer test-orchestrator-token",
          "content-type": "application/json",
        },
        method: "POST",
      });
      expect(requestResponse.status).toBe(202);

      const grantResponse = await fetch(`http://127.0.0.1:${address.port}/approvals/grant`, {
        body: JSON.stringify({ sourceItemId: "tmux_dispatch_payload_tamper", actor: "user" }),
        headers: {
          authorization: "Bearer test-orchestrator-token",
          "content-type": "application/json",
        },
        method: "POST",
      });
      expect(grantResponse.status).toBe(200);

      const tamperedResponse = await fetch(`http://127.0.0.1:${address.port}/tmux/dispatch`, {
        body: JSON.stringify({
          id: "tmux_dispatch_payload_tamper",
          sessionId: "session_tmux_payload_tamper",
          terminalSessionId: "terminal_session_ai_swarm",
          role: "qa",
          host: "dgx_02",
          paneId: "%7",
          requestedBy: "user",
          commandPreview: "pnpm test && echo tampered",
          approvalState: "approved",
          dispatchMode: "execute_if_approved",
          tmuxSessionName: "ai-swarm",
          createdAt: "2026-05-25T00:06:00.000Z",
        }),
        headers: {
          authorization: "Bearer test-orchestrator-token",
          "content-type": "application/json",
        },
        method: "POST",
      });

      expect(tamperedResponse.status).toBe(403);
      const body = await tamperedResponse.json() as { permission?: { decision: string; reason: string } };
      expect(body.permission?.decision).toBe("deny");
      expect(body.permission?.reason).toContain("payload mismatch");

      const timestampTamperedResponse = await fetch(`http://127.0.0.1:${address.port}/tmux/dispatch`, {
        body: JSON.stringify({
          id: "tmux_dispatch_payload_tamper",
          sessionId: "session_tmux_payload_tamper",
          terminalSessionId: "terminal_session_ai_swarm",
          role: "qa",
          host: "dgx_02",
          paneId: "%7",
          requestedBy: "user",
          commandPreview: "pnpm test -- --runInBand",
          approvalState: "approved",
          dispatchMode: "execute_if_approved",
          tmuxSessionName: "ai-swarm",
          createdAt: "2026-05-25T00:07:00.000Z",
        }),
        headers: {
          authorization: "Bearer test-orchestrator-token",
          "content-type": "application/json",
        },
        method: "POST",
      });

      expect(timestampTamperedResponse.status).toBe(403);
      const timestampBody = await timestampTamperedResponse.json() as {
        permission?: { decision: string; reason: string };
      };
      expect(timestampBody.permission?.decision).toBe("deny");
      expect(timestampBody.permission?.reason).toContain("payload mismatch");
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
      if (previousToken === undefined) {
        delete process.env.ORCHESTRATOR_API_TOKEN;
      } else {
        process.env.ORCHESTRATOR_API_TOKEN = previousToken;
      }
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnv;
      }
      if (previousEventStorageDir === undefined) {
        delete process.env.EVENT_STORAGE_DIR;
      } else {
        process.env.EVENT_STORAGE_DIR = previousEventStorageDir;
      }
      if (previousTmuxDispatch === undefined) {
        delete process.env.ORCHESTRATOR_ENABLE_TMUX_SEND_KEYS;
      } else {
        process.env.ORCHESTRATOR_ENABLE_TMUX_SEND_KEYS = previousTmuxDispatch;
      }
      if (previousTmuxDryRun === undefined) {
        delete process.env.ORCHESTRATOR_TMUX_DRY_RUN;
      } else {
        process.env.ORCHESTRATOR_TMUX_DRY_RUN = previousTmuxDryRun;
      }
      await rm(tempDir, { force: true, recursive: true });
    }
  });

  it("replays approved tmux dispatch requests as dry-run audit events", async () => {
    const previousToken = process.env.ORCHESTRATOR_API_TOKEN;
    const previousNodeEnv = process.env.NODE_ENV;
    const previousEventStorageDir = process.env.EVENT_STORAGE_DIR;
    const previousTmuxDispatch = process.env.ORCHESTRATOR_ENABLE_TMUX_SEND_KEYS;
    const previousTmuxDryRun = process.env.ORCHESTRATOR_TMUX_DRY_RUN;
    const tempDir = await mkdtemp(join(tmpdir(), "ai-orchestrator-tmux-replay-"));
    process.env.ORCHESTRATOR_API_TOKEN = "test-orchestrator-token";
    process.env.NODE_ENV = "production";
    process.env.EVENT_STORAGE_DIR = tempDir;
    process.env.ORCHESTRATOR_TMUX_DRY_RUN = "1";
    delete process.env.ORCHESTRATOR_ENABLE_TMUX_SEND_KEYS;

    const server = startServer(0);

    try {
      await new Promise<void>((resolve) => {
        server.once("listening", resolve);
      });
      const address = server.address();
      if (!address || typeof address !== "object") {
        throw new Error("test server did not bind to a TCP port");
      }

      const dispatchResponse = await fetch(`http://127.0.0.1:${address.port}/tmux/dispatch`, {
        body: JSON.stringify({
          id: "tmux_dispatch_http_replay",
          sessionId: "session_tmux_replay",
          terminalSessionId: "terminal_session_ai_swarm",
          role: "architect",
          host: "dgx_02",
          paneId: "%4",
          requestedBy: "user",
          commandPreview: "pnpm typecheck",
          approvalState: "required",
          dispatchMode: "execute_if_approved",
          tmuxSessionName: "ai-swarm",
          createdAt: "2026-05-25T00:04:00.000Z",
        }),
        headers: {
          authorization: "Bearer test-orchestrator-token",
          "content-type": "application/json",
        },
        method: "POST",
      });
      expect(dispatchResponse.status).toBe(202);
      await expect(dispatchResponse.json()).resolves.toMatchObject({
        approval: {
          replay: {
            endpoint: "/tmux/dispatch",
            kind: "tmux_dispatch",
          },
        },
        dispatch: {
          status: "pending_approval",
        },
      });

      const grantResponse = await fetch(`http://127.0.0.1:${address.port}/approvals/grant`, {
        body: JSON.stringify({ sourceItemId: "tmux_dispatch_http_replay", actor: "user" }),
        headers: {
          authorization: "Bearer test-orchestrator-token",
          "content-type": "application/json",
        },
        method: "POST",
      });
      expect(grantResponse.status).toBe(200);

      const replayResponse = await fetch(`http://127.0.0.1:${address.port}/approvals/replay`, {
        body: JSON.stringify({ sourceItemId: "tmux_dispatch_http_replay", actor: "user" }),
        headers: {
          authorization: "Bearer test-orchestrator-token",
          "content-type": "application/json",
        },
        method: "POST",
      });
      expect(replayResponse.status).toBe(202);
      const replay = (await replayResponse.json()) as {
        result: {
          dispatch: { attempted: boolean; status: string };
          dispatchEventSync?: { accepted: number };
          eventSync: { accepted: number };
        };
        replay: { kind: string };
        status: string;
      };
      expect(replay).toMatchObject({
        replay: {
          kind: "tmux_dispatch",
        },
        result: {
          dispatch: {
            attempted: false,
            status: "dry_run",
          },
        },
        status: "replayed",
      });
      expect(replay.result.eventSync.accepted).toBe(0);
      expect(replay.result.dispatchEventSync?.accepted).toBe(1);

      const pull = await fetch(`http://127.0.0.1:${address.port}/events?sessionId=session_tmux_replay`, {
        headers: {
          authorization: "Bearer test-orchestrator-token",
        },
      });
      expect(pull.status).toBe(200);
      const pulled = (await pull.json()) as { events: Array<{ type: string; payload: unknown }> };
      expect(pulled.events.map((event) => event.type)).toEqual(
        expect.arrayContaining([
          "terminal.command.intent.created",
          "approval.requested",
          "approval.granted",
          "terminal.command.dry_run",
        ]),
      );
      expectValidTerminalCommandEvents(pulled.events.filter((event) => event.type.startsWith("terminal.command.")));
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
      if (previousToken === undefined) {
        delete process.env.ORCHESTRATOR_API_TOKEN;
      } else {
        process.env.ORCHESTRATOR_API_TOKEN = previousToken;
      }
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnv;
      }
      if (previousEventStorageDir === undefined) {
        delete process.env.EVENT_STORAGE_DIR;
      } else {
        process.env.EVENT_STORAGE_DIR = previousEventStorageDir;
      }
      if (previousTmuxDispatch === undefined) {
        delete process.env.ORCHESTRATOR_ENABLE_TMUX_SEND_KEYS;
      } else {
        process.env.ORCHESTRATOR_ENABLE_TMUX_SEND_KEYS = previousTmuxDispatch;
      }
      if (previousTmuxDryRun === undefined) {
        delete process.env.ORCHESTRATOR_TMUX_DRY_RUN;
      } else {
        process.env.ORCHESTRATOR_TMUX_DRY_RUN = previousTmuxDryRun;
      }
      await rm(tempDir, { force: true, recursive: true });
    }
  });

  it("preflights tmux dispatches without recording or executing them", async () => {
    const previousSendKeys = process.env.ORCHESTRATOR_ENABLE_TMUX_SEND_KEYS;
    const previousDryRun = process.env.ORCHESTRATOR_TMUX_DRY_RUN;
    delete process.env.ORCHESTRATOR_ENABLE_TMUX_SEND_KEYS;
    process.env.ORCHESTRATOR_TMUX_DRY_RUN = "1";

    try {
      const request = {
        id: "tmux_preflight_unit",
        sessionId: "session_tmux_preflight",
        terminalSessionId: "terminal_session_ai_swarm",
        role: "architect" as const,
        host: "dgx_02" as const,
        paneId: "%4",
        requestedBy: "user" as const,
        commandPreview: "pnpm test",
        approvalState: "required" as const,
        dispatchMode: "execute_if_approved" as const,
        tmuxSessionName: "ai-swarm",
        createdAt: "2026-05-25T00:00:00.000Z",
      };

      const preflight = createServerTmuxPreflightResponse(request, "2026-05-25T00:00:01.000Z");

      expect(preflight.permission.decision).toBe("approval_required");
      expect(preflight.audit).toMatchObject({
        wouldQueueApproval: true,
        wouldAttemptSendKeys: false,
        dryRunEnabled: true,
        sendKeysEnabled: false,
        replayEndpoint: "/tmux/dispatch",
      });
      expect(preflight.audit.wouldRecordEvents).toEqual([
        "terminal.command.intent.created",
        "approval.requested",
      ]);
      expect(preflight.audit.checks.map((check) => check.id)).toEqual([
        "redaction",
        "permission",
        "dispatch_mode",
        "server_gate",
      ]);
    } finally {
      if (previousSendKeys === undefined) {
        delete process.env.ORCHESTRATOR_ENABLE_TMUX_SEND_KEYS;
      } else {
        process.env.ORCHESTRATOR_ENABLE_TMUX_SEND_KEYS = previousSendKeys;
      }
      if (previousDryRun === undefined) {
        delete process.env.ORCHESTRATOR_TMUX_DRY_RUN;
      } else {
        process.env.ORCHESTRATOR_TMUX_DRY_RUN = previousDryRun;
      }
    }
  });

  it("serves tmux preflight over HTTP without writing approval events", async () => {
    const previousToken = process.env.ORCHESTRATOR_API_TOKEN;
    const previousNodeEnv = process.env.NODE_ENV;
    const previousEventStorageDir = process.env.EVENT_STORAGE_DIR;
    const tempDir = await mkdtemp(join(tmpdir(), "ai-orchestrator-tmux-preflight-"));
    process.env.ORCHESTRATOR_API_TOKEN = "test-orchestrator-token";
    process.env.NODE_ENV = "production";
    process.env.EVENT_STORAGE_DIR = tempDir;

    const server = startServer(0);

    try {
      await new Promise<void>((resolve) => {
        server.once("listening", resolve);
      });
      const address = server.address();
      if (!address || typeof address !== "object") {
        throw new Error("test server did not bind to a TCP port");
      }

      const response = await fetch(`http://127.0.0.1:${address.port}/tmux/preflight`, {
        body: JSON.stringify({
          id: "tmux_preflight_http",
          sessionId: "session_tmux_preflight_http",
          role: "qa",
          host: "dgx_02",
          requestedBy: "user",
          commandPreview: "pnpm typecheck",
          approvalState: "required",
          dispatchMode: "execute_if_approved",
          createdAt: "2026-05-25T00:00:00.000Z",
        }),
        headers: {
          authorization: "Bearer test-orchestrator-token",
          "content-type": "application/json",
        },
        method: "POST",
      });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        audit: {
          wouldQueueApproval: true,
          wouldRecordEvents: ["terminal.command.intent.created", "approval.requested"],
        },
        permission: {
          decision: "approval_required",
        },
      });

      const pull = await fetch(`http://127.0.0.1:${address.port}/events?sessionId=session_tmux_preflight_http`, {
        headers: {
          authorization: "Bearer test-orchestrator-token",
        },
      });
      expect(pull.status).toBe(200);
      await expect(pull.json()).resolves.toMatchObject({
        events: [],
      });
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
      if (previousToken === undefined) {
        delete process.env.ORCHESTRATOR_API_TOKEN;
      } else {
        process.env.ORCHESTRATOR_API_TOKEN = previousToken;
      }
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnv;
      }
      if (previousEventStorageDir === undefined) {
        delete process.env.EVENT_STORAGE_DIR;
      } else {
        process.env.EVENT_STORAGE_DIR = previousEventStorageDir;
      }
      await rm(tempDir, { force: true, recursive: true });
    }
  });

  it("rejects tmux preflight bypass attempts when not found in the Event Store", async () => {
    const previousToken = process.env.ORCHESTRATOR_API_TOKEN;
    const previousNodeEnv = process.env.NODE_ENV;
    const previousEventStorageDir = process.env.EVENT_STORAGE_DIR;
    const tempDir = await mkdtemp(join(tmpdir(), "ai-orchestrator-tmux-preflight-bypass-"));
    process.env.ORCHESTRATOR_API_TOKEN = "test-orchestrator-token";
    process.env.NODE_ENV = "production";
    process.env.EVENT_STORAGE_DIR = tempDir;

    const server = startServer(0);

    try {
      await new Promise<void>((resolve) => {
        server.once("listening", resolve);
      });
      const address = server.address();
      if (!address || typeof address !== "object") {
        throw new Error("test server did not bind to a TCP port");
      }

      const response = await fetch(`http://127.0.0.1:${address.port}/tmux/preflight`, {
        body: JSON.stringify({
          id: "tmux_preflight_bypass_attempt",
          sessionId: "session_tmux_preflight_bypass",
          role: "qa",
          host: "dgx_02",
          requestedBy: "user",
          commandPreview: "pnpm test",
          approvalState: "approved",
          dispatchMode: "execute_if_approved",
          createdAt: "2026-05-25T00:00:00.000Z",
        }),
        headers: {
          authorization: "Bearer test-orchestrator-token",
          "content-type": "application/json",
        },
        method: "POST",
      });

      expect(response.status).toBe(200);
      const body = await response.json() as { permission: { decision: string; reason: string } };
      expect(body.permission.decision).toBe("deny");
      expect(body.permission.reason).toContain("bypass attempt detected");
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
      if (previousToken === undefined) {
        delete process.env.ORCHESTRATOR_API_TOKEN;
      } else {
        process.env.ORCHESTRATOR_API_TOKEN = previousToken;
      }
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnv;
      }
      if (previousEventStorageDir === undefined) {
        delete process.env.EVENT_STORAGE_DIR;
      } else {
        process.env.EVENT_STORAGE_DIR = previousEventStorageDir;
      }
      await rm(tempDir, { force: true, recursive: true });
    }
  });

  it("keeps tmux capture disabled until the server explicitly enables it", async () => {
    const previousToken = process.env.ORCHESTRATOR_API_TOKEN;
    const previousNodeEnv = process.env.NODE_ENV;
    const previousEventStorageDir = process.env.EVENT_STORAGE_DIR;
    const previousTmuxCapture = process.env.ORCHESTRATOR_ENABLE_TMUX_CAPTURE;
    const tempDir = await mkdtemp(join(tmpdir(), "ai-orchestrator-tmux-capture-"));
    process.env.ORCHESTRATOR_API_TOKEN = "test-orchestrator-token";
    process.env.NODE_ENV = "production";
    process.env.EVENT_STORAGE_DIR = tempDir;
    delete process.env.ORCHESTRATOR_ENABLE_TMUX_CAPTURE;

    const server = startServer(0);

    try {
      await new Promise<void>((resolve) => {
        server.once("listening", resolve);
      });
      const address = server.address();
      if (!address || typeof address !== "object") {
        throw new Error("test server did not bind to a TCP port");
      }

      const response = await fetch(`http://127.0.0.1:${address.port}/tmux/capture`, {
        body: JSON.stringify({
          id: "tmux_capture_http_disabled",
          sessionId: "session_tmux_http",
          terminalSessionId: "terminal_session_ai_swarm",
          role: "qa",
          host: "dgx_02",
          paneId: "%7",
          requestedBy: "user",
          lines: 80,
          tmuxSessionName: "ai-swarm",
          createdAt: "2026-05-25T00:02:00.000Z",
        }),
        headers: {
          authorization: "Bearer test-orchestrator-token",
          "content-type": "application/json",
        },
        method: "POST",
      });

      expect(response.status).toBe(202);
      await expect(response.json()).resolves.toMatchObject({
        status: "disabled",
        reason: expect.stringContaining("ORCHESTRATOR_ENABLE_TMUX_CAPTURE"),
      });
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
      if (previousToken === undefined) {
        delete process.env.ORCHESTRATOR_API_TOKEN;
      } else {
        process.env.ORCHESTRATOR_API_TOKEN = previousToken;
      }
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnv;
      }
      if (previousEventStorageDir === undefined) {
        delete process.env.EVENT_STORAGE_DIR;
      } else {
        process.env.EVENT_STORAGE_DIR = previousEventStorageDir;
      }
      if (previousTmuxCapture === undefined) {
        delete process.env.ORCHESTRATOR_ENABLE_TMUX_CAPTURE;
      } else {
        process.env.ORCHESTRATOR_ENABLE_TMUX_CAPTURE = previousTmuxCapture;
      }
      await rm(tempDir, { force: true, recursive: true });
    }
  });

  it("returns 413 for oversized authorized JSON bodies without dropping the socket", async () => {
    const previousToken = process.env.ORCHESTRATOR_API_TOKEN;
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.ORCHESTRATOR_API_TOKEN = "test-orchestrator-token";
    process.env.NODE_ENV = "production";

    const server = startServer(0);

    try {
      await new Promise<void>((resolve) => {
        server.once("listening", resolve);
      });
      const address = server.address();
      if (!address || typeof address !== "object") {
        throw new Error("test server did not bind to a TCP port");
      }

      const response = await fetch(`http://127.0.0.1:${address.port}/provider-completions`, {
        body: JSON.stringify({ x: "a".repeat(2_000_000) }),
        headers: {
          authorization: "Bearer test-orchestrator-token",
          "content-type": "application/json",
        },
        method: "POST",
      });

      expect(response.status).toBe(413);
      await expect(response.json()).resolves.toMatchObject({
        error: "payload_too_large",
        limit: 1_048_576,
      });
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
      if (previousToken === undefined) {
        delete process.env.ORCHESTRATOR_API_TOKEN;
      } else {
        process.env.ORCHESTRATOR_API_TOKEN = previousToken;
      }
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnv;
      }
    }
  });

  function createVerifyPacketDependencies(
    body: unknown,
    overrides: Partial<VerifyPacketRouteDependencies> = {},
  ) {
    const responses: Array<{ statusCode: number; payload: unknown }> = [];
    const dependencies: VerifyPacketRouteDependencies = {
      request: {} as IncomingMessage,
      pathname: "/verify-packet",
      method: "POST",
      readJsonBody: async () => body,
      isRequestBodyTooLargeError: (error): error is { limit: number } =>
        Boolean(error && typeof error === "object" && "limit" in error),
      respondJson: (statusCode, payload) => {
        responses.push({ statusCode, payload });
      },
      ...overrides,
    };

    return { dependencies, responses };
  }

  const verifyPacketFixture = {
    goal: "Test execution gate",
    context: ["context_1"],
    decisions: ["decision_1"],
    rejectedOptions: ["option_1"],
    constraints: ["constraint_1"],
    filesToInspect: [],
    implementationPlan: ["plan_1"],
    verificationPlan: ["pnpm --filter @ai-orchestrator/protocol test"],
    reviewerNotes: [],
  };

  it("runs allowlisted verification commands through an injected verification runner", async () => {
    const previousAutorun = process.env.ORCHESTRATOR_ENABLE_EXPERIMENTAL_AUTORUN;
    process.env.ORCHESTRATOR_ENABLE_EXPERIMENTAL_AUTORUN = "1";
    const calls: Array<{ command: string; attempt: number }> = [];
    const { dependencies, responses } = createVerifyPacketDependencies(verifyPacketFixture, {
      runVerificationCommand: async (command, attempt) => {
        calls.push({ command, attempt });
        return {
          label: command,
          status: "pass",
          stdout: "Test Output",
          stderr: "",
          attempt,
        };
      },
    });

    try {
      await handleVerifyPacketRoute(dependencies);

      expect(calls).toEqual([
        { command: "pnpm --filter @ai-orchestrator/protocol test", attempt: 1 },
      ]);
      expect(responses[0]?.statusCode).toBe(200);
      const data = responses[0]?.payload as any;
      expect(data).toMatchObject({
        status: "passed",
        exitCode: 0,
        checks: [
          { label: "pnpm --filter @ai-orchestrator/protocol test", status: "pass" },
        ],
      });
      expect(data.stdout).toContain("Test Output");
    } finally {
      if (previousAutorun === undefined) {
        delete process.env.ORCHESTRATOR_ENABLE_EXPERIMENTAL_AUTORUN;
      } else {
        process.env.ORCHESTRATOR_ENABLE_EXPERIMENTAL_AUTORUN = previousAutorun;
      }
    }
  });

  it("blocks experimental autorun routes until explicitly enabled", async () => {
    const previousToken = process.env.ORCHESTRATOR_API_TOKEN;
    const previousNodeEnv = process.env.NODE_ENV;
    const previousAutorun = process.env.ORCHESTRATOR_ENABLE_EXPERIMENTAL_AUTORUN;
    process.env.ORCHESTRATOR_API_TOKEN = "test-orchestrator-token";
    process.env.NODE_ENV = "production";
    delete process.env.ORCHESTRATOR_ENABLE_EXPERIMENTAL_AUTORUN;

    const server = startServer(0);

    try {
      await new Promise<void>((resolve) => {
        server.once("listening", resolve);
      });
      const address = server.address();
      if (!address || typeof address !== "object") {
        throw new Error("test server did not bind to a TCP port");
      }

      const packet = {
        goal: "Test autorun gate",
        context: ["context_1"],
        decisions: ["decision_1"],
        rejectedOptions: ["option_1"],
        constraints: ["constraint_1"],
        filesToInspect: [],
        implementationPlan: ["plan_1"],
        verificationPlan: ["corepack pnpm --filter @ai-orchestrator/protocol typecheck"],
        reviewerNotes: [],
      };

      const response = await fetch(`http://127.0.0.1:${address.port}/verify-packet`, {
        body: JSON.stringify(packet),
        headers: {
          authorization: "Bearer test-orchestrator-token",
          "content-type": "application/json",
        },
        method: "POST",
      });

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({
        error: "experimental_autorun_disabled",
      });
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
      if (previousToken === undefined) {
        delete process.env.ORCHESTRATOR_API_TOKEN;
      } else {
        process.env.ORCHESTRATOR_API_TOKEN = previousToken;
      }
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnv;
      }
      if (previousAutorun === undefined) {
        delete process.env.ORCHESTRATOR_ENABLE_EXPERIMENTAL_AUTORUN;
      } else {
        process.env.ORCHESTRATOR_ENABLE_EXPERIMENTAL_AUTORUN = previousAutorun;
      }
    }
  });

  it("rejects shell metacharacters and node eval commands without invoking the runner", async () => {
    const previousAutorun = process.env.ORCHESTRATOR_ENABLE_EXPERIMENTAL_AUTORUN;
    process.env.ORCHESTRATOR_ENABLE_EXPERIMENTAL_AUTORUN = "1";
    const rejectedCommands = [
      "pnpm --filter @ai-orchestrator/protocol test && whoami",
      "pnpm --filter @ai-orchestrator/protocol test --additional-flag",
      "node -e \"process.exit(0)\"",
    ];

    try {
      for (const command of rejectedCommands) {
        const { dependencies, responses } = createVerifyPacketDependencies({
          ...verifyPacketFixture,
          verificationPlan: [command],
        });

        await handleVerifyPacketRoute(dependencies);

        expect(responses[0]).toMatchObject({
          statusCode: 200,
          payload: { status: "warning", exitCode: 1 },
        });
      }
    } finally {
      if (previousAutorun === undefined) {
        delete process.env.ORCHESTRATOR_ENABLE_EXPERIMENTAL_AUTORUN;
      } else {
        process.env.ORCHESTRATOR_ENABLE_EXPERIMENTAL_AUTORUN = previousAutorun;
      }
    }
  });

  it("blocks packet verification unless experimental autorun is explicitly enabled", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousAutorun = process.env.ORCHESTRATOR_ENABLE_EXPERIMENTAL_AUTORUN;

    const testEnvironments = [
      "production",
      "prod",
      "staging",
      undefined,
      "",
      "development",
      "dev",
      "test",
      "local",
    ];

    try {
      delete process.env.ORCHESTRATOR_ENABLE_EXPERIMENTAL_AUTORUN;
      for (const env of testEnvironments) {
        if (env === undefined) {
          delete process.env.NODE_ENV;
        } else {
          process.env.NODE_ENV = env;
        }

        let runnerCalled = false;
        const { dependencies, responses } = createVerifyPacketDependencies(verifyPacketFixture, {
          runVerificationCommand: async () => {
            runnerCalled = true;
            return {
              label: "pnpm --filter @ai-orchestrator/protocol test",
              status: "pass",
              stdout: "success",
              stderr: "",
              attempt: 1,
            };
          },
        });

        await handleVerifyPacketRoute(dependencies);

        expect(runnerCalled).toBe(false);
        expect(responses[0]).toMatchObject({
          statusCode: 403,
          payload: { error: "experimental_autorun_disabled" },
        });
      }

      process.env.NODE_ENV = "production";
      process.env.ORCHESTRATOR_ENABLE_EXPERIMENTAL_AUTORUN = "1";
      let runnerCalled = false;
      const { dependencies, responses } = createVerifyPacketDependencies(verifyPacketFixture, {
        runVerificationCommand: async () => {
          runnerCalled = true;
          return {
            label: "pnpm --filter @ai-orchestrator/protocol test",
            status: "pass",
            stdout: "success",
            stderr: "",
            attempt: 1,
          };
        },
      });

      await handleVerifyPacketRoute(dependencies);
      expect(runnerCalled).toBe(true);
      expect(responses[0]?.statusCode).toBe(200);
    } finally {
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnv;
      }
      if (previousAutorun === undefined) {
        delete process.env.ORCHESTRATOR_ENABLE_EXPERIMENTAL_AUTORUN;
      } else {
        process.env.ORCHESTRATOR_ENABLE_EXPERIMENTAL_AUTORUN = previousAutorun;
      }
    }
  });

  it("returns injected runner output through the verification report", async () => {
    const previousAutorun = process.env.ORCHESTRATOR_ENABLE_EXPERIMENTAL_AUTORUN;
    process.env.ORCHESTRATOR_ENABLE_EXPERIMENTAL_AUTORUN = "1";
    const { dependencies, responses } = createVerifyPacketDependencies(verifyPacketFixture, {
      runVerificationCommand: async (command, attempt) => ({
        label: command,
        status: "pass",
        stdout: "runner output",
        stderr: "",
        attempt,
      }),
    });

    try {
      await handleVerifyPacketRoute(dependencies);

      const data = responses[0]?.payload as any;
      expect(responses[0]?.statusCode).toBe(200);
      expect(data.stdout).toContain("runner output");
    } finally {
      if (previousAutorun === undefined) {
        delete process.env.ORCHESTRATOR_ENABLE_EXPERIMENTAL_AUTORUN;
      } else {
        process.env.ORCHESTRATOR_ENABLE_EXPERIMENTAL_AUTORUN = previousAutorun;
      }
    }
  });

  describe("getFilteredSubprocessEnv", () => {
    it("filters process.env and customEnv to only contain allowlisted environment variables", () => {
      const previousEnv = { ...process.env };

      // Setup temporary clean env
      for (const key of Object.keys(process.env)) {
        delete process.env[key];
      }

      process.env.PATH = "/usr/bin";
      process.env.HOME = "/home/test";
      process.env.ORCHESTRATOR_API_TOKEN = "sensitive-api-token";
      process.env.SECRET_KEY = "another-sensitive-key";

      try {
        const filtered = getFilteredSubprocessEnv({
          AI_SWARM_SESSION: "session_123",
          INVALID_CUSTOM_ENV: "should_be_filtered_out",
        });

        expect(filtered.PATH).toBe("/usr/bin");
        expect(filtered.HOME).toBe("/home/test");
        expect(filtered.AI_SWARM_SESSION).toBe("session_123");

        // These should be filtered out
        expect(filtered.ORCHESTRATOR_API_TOKEN).toBeUndefined();
        expect(filtered.SECRET_KEY).toBeUndefined();
        expect(filtered.INVALID_CUSTOM_ENV).toBeUndefined();
      } finally {
        // Restore process.env
        for (const key of Object.keys(process.env)) {
          delete process.env[key];
        }
        Object.assign(process.env, previousEnv);
      }
    });
  });

  describe("HMAC-SHA256 Request Signing Authentication", () => {
    it("authorizes request with valid signature headers and rejects drift/replay/invalid signatures", async () => {
      const previousToken = process.env.ORCHESTRATOR_API_TOKEN;
      const previousNodeEnv = process.env.NODE_ENV;
      const previousEventStorageDir = process.env.EVENT_STORAGE_DIR;
      const tempDir = await mkdtemp(join(tmpdir(), "ai-orchestrator-hmac-auth-"));
      const apiToken = "test-hmac-orchestrator-token";
      process.env.ORCHESTRATOR_API_TOKEN = apiToken;
      process.env.NODE_ENV = "production";
      process.env.EVENT_STORAGE_DIR = tempDir;

      const server = startServer(0);

      try {
        await new Promise<void>((resolve) => {
          server.once("listening", resolve);
        });
        const address = server.address();
        if (!address || typeof address !== "object") {
          throw new Error("test server did not bind to a TCP port");
        }

        const port = address.port;
        const path = "/runtime";
        const method = "GET";
        const bodyHash = createHash("sha256").update("").digest("hex");

        const signRequest = (timestamp: string, nonce: string, token: string) => {
          const message = [method, path, bodyHash, timestamp, nonce].join("\n");
          return createHmac("sha256", token).update(message).digest("hex");
        };

        // 1. Test Valid HMAC Signature
        const validTimestamp = Date.now().toString();
        const validNonce = "valid-nonce-123";
        const validSignature = signRequest(validTimestamp, validNonce, apiToken);

        const resValid = await fetch(`http://127.0.0.1:${port}${path}`, {
          headers: {
            "x-dgx-signature": validSignature,
            "x-dgx-timestamp": validTimestamp,
            "x-dgx-nonce": validNonce,
            "x-dgx-body-sha256": bodyHash,
          },
          method,
        });
        expect(resValid.status).toBe(200);

        // 2. Test Clock Drift Rejected (> 5 minutes)
        const oldTimestamp = (Date.now() - 360_000).toString();
        const oldNonce = "old-nonce-456";
        const oldSignature = signRequest(oldTimestamp, oldNonce, apiToken);

        const resDrift = await fetch(`http://127.0.0.1:${port}${path}`, {
          headers: {
            "x-dgx-signature": oldSignature,
            "x-dgx-timestamp": oldTimestamp,
            "x-dgx-nonce": oldNonce,
            "x-dgx-body-sha256": bodyHash,
          },
          method,
        });
        expect(resDrift.status).toBe(401);
        const driftBody = await resDrift.json() as { error?: string };
        expect(driftBody.error).toBe("clock_drift_exceeded");

        // 3. Test Replay Attack Rejected
        const replayRes = await fetch(`http://127.0.0.1:${port}${path}`, {
          headers: {
            "x-dgx-signature": validSignature,
            "x-dgx-timestamp": validTimestamp,
            "x-dgx-nonce": validNonce,
            "x-dgx-body-sha256": bodyHash,
          },
          method,
        });
        expect(replayRes.status).toBe(401);
        const replayBody = await replayRes.json() as { error?: string };
        expect(replayBody.error).toBe("replay_detected");

        // 4. Test Invalid Signature Rejected
        const badSignature = signRequest(validTimestamp, "different-nonce", apiToken);
        const resBadSig = await fetch(`http://127.0.0.1:${port}${path}`, {
          headers: {
            "x-dgx-signature": badSignature,
            "x-dgx-timestamp": validTimestamp,
            "x-dgx-nonce": "different-nonce-mismatch-header",
            "x-dgx-body-sha256": bodyHash,
          },
          method,
        });
        expect(resBadSig.status).toBe(401);

        // 5. Test Legacy Bearer Token Still Works
        const resLegacy = await fetch(`http://127.0.0.1:${port}${path}`, {
          headers: {
            authorization: `Bearer ${apiToken}`,
          },
          method,
        });
        expect(resLegacy.status).toBe(200);

      } finally {
        await new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error) reject(error);
            else resolve();
          });
        });
        if (previousToken === undefined) {
          delete process.env.ORCHESTRATOR_API_TOKEN;
        } else {
          process.env.ORCHESTRATOR_API_TOKEN = previousToken;
        }
        if (previousNodeEnv === undefined) {
          delete process.env.NODE_ENV;
        } else {
          process.env.NODE_ENV = previousNodeEnv;
        }
        if (previousEventStorageDir === undefined) {
          delete process.env.EVENT_STORAGE_DIR;
        } else {
          process.env.EVENT_STORAGE_DIR = previousEventStorageDir;
        }
        await rm(tempDir, { force: true, recursive: true });
      }
    });
  });
});

describe("RMAS routes auth gate", () => {
  it("enforces the single top-level auth gate on /rmas paths and passes authorized requests to the handler", async () => {
    const previousToken = process.env.ORCHESTRATOR_API_TOKEN;
    const previousEventStorageDir = process.env.EVENT_STORAGE_DIR;
    const tempDir = await mkdtemp(join(tmpdir(), "rmas-auth-"));
    process.env.ORCHESTRATOR_API_TOKEN = "rmas-test-token";
    process.env.EVENT_STORAGE_DIR = tempDir;
    const server = startServer(0);

    try {
      await new Promise<void>((resolve) => {
        server.once("listening", resolve);
      });
      const address = server.address();
      if (!address || typeof address !== "object") {
        throw new Error("test server did not bind to a TCP port");
      }
      const base = `http://127.0.0.1:${address.port}`;

      // Unauthenticated → 401 on every /rmas surface (same gate as /missions).
      const noAuthPost = await fetch(`${base}/rmas/runs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      expect(noAuthPost.status).toBe(401);

      const noAuthList = await fetch(`${base}/rmas/runs`);
      expect(noAuthList.status).toBe(401);

      const noAuthStream = await fetch(`${base}/rmas/runs/anything/trace/stream`);
      expect(noAuthStream.status).toBe(401);

      // Authenticated → gate passes through to the RMAS handler.
      const authList = await fetch(`${base}/rmas/runs`, {
        headers: { authorization: "Bearer rmas-test-token" },
      });
      expect(authList.status).toBe(200);
      const listBody = (await authList.json()) as { runs: unknown[] };
      expect(Array.isArray(listBody.runs)).toBe(true);
      expect(listBody.runs).toHaveLength(0);

      const authMissing = await fetch(`${base}/rmas/runs/nope`, {
        headers: { authorization: "Bearer rmas-test-token" },
      });
      expect(authMissing.status).toBe(404);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
      if (previousToken === undefined) {
        delete process.env.ORCHESTRATOR_API_TOKEN;
      } else {
        process.env.ORCHESTRATOR_API_TOKEN = previousToken;
      }
      if (previousEventStorageDir === undefined) {
        delete process.env.EVENT_STORAGE_DIR;
      } else {
        process.env.EVENT_STORAGE_DIR = previousEventStorageDir;
      }
      await rm(tempDir, { force: true, recursive: true });
    }
  });
});
