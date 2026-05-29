import { afterAll, describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  agentDelegationEventTypeSchema,
  parseAgentDelegationEventPayload,
  parseTerminalCommandEventPayload,
  terminalCommandEventTypeSchema,
} from "@ai-orchestrator/protocol";
import type { ServerAgentDelegationExecuteRequest } from "./index";
import {
  createEventStorageSnapshot,
  createDgxProviderCompletionResponse,
  createDgxHeartbeat,
  createDgxModelDiscovery,
  createHealthResponse,
  createJsonlServerEventStorage,
  createLiveHealthResponse,
  createProviderCompletionApprovalRequest,
  createServerIngressSnapshot,
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
  encryptToken,
  decryptToken,
  getFreshOAuthTokenWithNotion,
  clearLocalTokenCaches,
  writeWAL,
  readWAL,
  deleteWAL,
  fetchNotionTokenRow,
  writeNotionTokenRow,
  getNotionSyncedNow,
  grokSessionManager,
  createServerProviderProxyCompletionWithHotSwap,
  serverEventBroker,
  wrapStreamWithRedaction,
  getLocalDb,
} from "./index";

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
      id: "telegram_input_server_test",
      sessionId: "session_ingress_test",
      channel: "legacy_telegram",
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

  it("publishes a DGX-02 provider registry without raw secrets", async () => {
    const previousDeepSeekKey = process.env.DEEPSEEK_API_KEY;
    const previousAnthropicKey = process.env.ANTHROPIC_API_KEY;
    const previousAnthropicKeyAlt = process.env.ANTHROPIC_API_KEY_ALT;
    const previousApifunKey = process.env.APIFUN_API_KEY;
    const previousApifunKeyFile = process.env.APIFUN_API_KEY_FILE;
    process.env.DEEPSEEK_API_KEY = "deepseek-test-secret";
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
      expect(JSON.stringify(registry)).not.toContain("deepseek-test-secret");
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
      expect(claudeA?.selectedModelId).toBe("claude-opus-4-6");
      expect(claudeA?.secretAvailability).toBe("available");
      expect(claudeA?.secretRefPreview).toBe("dgx-02:ANTHROPIC_API_KEY");
      expect(claudeB?.name).toBe("APIKey.fun Claude B");
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
    expect(health.runtime.runtimeNodes[0]?.status).toBe("degraded");
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

  it("includes both 5173 and 5174 vite dev ports by default", () => {
    delete process.env.ORCHESTRATOR_ALLOWED_ORIGINS;
    const allowed = resolveAllowedOrigins();
    expect(allowed.has("http://localhost:5173")).toBe(true);
    expect(allowed.has("http://127.0.0.1:5173")).toBe(true);
    expect(allowed.has("http://localhost:5174")).toBe(true);
    expect(allowed.has("http://127.0.0.1:5174")).toBe(true);
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

  it("pickAllowedOrigin echoes a matching origin and falls back otherwise", () => {
    const allowed = new Set<string>(["http://localhost:5173", "http://localhost:5174"]);
    expect(pickAllowedOrigin("http://localhost:5174", allowed)).toBe("http://localhost:5174");
    expect(pickAllowedOrigin("http://evil.example.com", allowed)).toBe("http://localhost:5173");
    expect(pickAllowedOrigin(undefined, allowed)).toBe("http://localhost:5173");
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

describe("server agent delegation endpoint core", () => {
  const baseDelegationRequest: ServerAgentDelegationExecuteRequest = {
    id: "agent_delegation_test_1",
    sessionId: "session_1",
    caller: {
      agentId: "agent_chaerin",
      role: "companion",
      personaName: "chaerin",
      providerProfileId: "provider_dgx02_vllm",
      modelId: "qwen36-domain-lora-v5-prisma",
      systemPrompt: "You are Chaerin.",
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
          content: "채아린 최종: 마오마오 확인을 반영해 톱5를 정리했어.",
          createdAt: request.createdAt,
        };
      },
      generateId: () => `id_${seenRequests.length + 1}`,
      now: "2026-05-25T00:00:00.000Z",
    });

    expect(seenRequests).toHaveLength(3);
    expect(response.shortCircuited).toBe(false);
    expect(response.finalContent).toContain("채아린 최종");
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
              : "채아린 최종: 대상이 없어서 직접 정리했어.",
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
    expect(response.finalContent).toContain("채아린 최종");
  });
});

describe("HTTP request limits", () => {
  it("executes mock agent delegation and persists delegation events", async () => {
    const previousToken = process.env.ORCHESTRATOR_API_TOKEN;
    const previousNodeEnv = process.env.NODE_ENV;
    const previousEventStorageDir = process.env.EVENT_STORAGE_DIR;
    const tempDir = await mkdtemp(join(tmpdir(), "ai-orchestrator-agent-delegations-"));
    process.env.ORCHESTRATOR_API_TOKEN = "test-orchestrator-token";
    process.env.NODE_ENV = "test";
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
          id: "agent_delegation_http_mock",
          sessionId: "session_http",
          executionMode: "mock",
          caller: {
            agentId: "agent_chaerin",
            role: "companion",
            personaName: "chaerin",
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
            agentId: "agent_chaerin",
            role: "companion",
            personaName: "chaerin",
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
            agentId: "agent_chaerin",
            role: "companion",
            personaName: "chaerin",
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
    const tempDir = await mkdtemp(join(tmpdir(), "ai-orchestrator-agent-delegation-replay-"));
    process.env.EVENT_STORAGE_DIR = tempDir;
    process.env.NODE_ENV = "test";

    const storage = createJsonlServerEventStorage();

    try {
      const approval = {
        id: "approval_agent_delegation_replay",
        sessionId: "session_replay",
        sourceItemId: "agent_delegation_replay_source",
        subjectId: "agent_chaerin:agent_maomao",
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
              agentId: "agent_chaerin",
              role: "companion",
              personaName: "chaerin",
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
          id: "telegram_input_http_test",
          sessionId: "session_ingress_http",
          channel: "legacy_telegram",
          authorType: "user",
          eventType: "message",
          text: "please run bash and use Bearer abcdefghijklmnopqrstuvwxyz123456",
          receivedAt: new Date().toISOString(),
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
          createdAt: "2026-05-25T00:01:00.000Z",
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
            reason: "tmux dispatch requires explicit approval before send-keys can run",
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
          createdAt: "2026-05-25T00:03:00.000Z",
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

  it("runs package verification for Coding Packet and captures subprocess output", async () => {
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

      const packet = {
        goal: "Test execution gate",
        context: ["context_1"],
        decisions: ["decision_1"],
        rejectedOptions: ["option_1"],
        constraints: ["constraint_1"],
        filesToInspect: [],
        implementationPlan: ["plan_1"],
        verificationPlan: ["plan_test_1"],
        reviewerNotes: [],
      };

      const response = await fetch(`http://127.0.0.1:${address.port}/verify-packet`, {
        body: JSON.stringify({
          ...packet,
          command: "node -e \"process.exit(0)\""
        }),
        headers: {
          authorization: "Bearer test-orchestrator-token",
          "content-type": "application/json",
        },
        method: "POST",
      });

      if (response.status !== 200) {
        console.log("RESPONSE ERROR BODY:", await response.json());
      }
      expect(response.status).toBe(200);
      const data = (await response.json()) as any;
      expect(data).toMatchObject({
        status: "passed",
        exitCode: 0,
        checks: [
          { label: "Compiler checks", status: "pass" },
          { label: "Unit test coverage", status: "pass" }
        ]
      });
      expect(data.stdout).toBeDefined();

      const failResponse = await fetch(`http://127.0.0.1:${address.port}/verify-packet`, {
        body: JSON.stringify({
          ...packet,
          command: "node -e \"process.exit(1)\""
        }),
        headers: {
          authorization: "Bearer test-orchestrator-token",
          "content-type": "application/json",
        },
        method: "POST",
      });

      expect(failResponse.status).toBe(200);
      const failData = (await failResponse.json()) as any;
      expect(failData).toMatchObject({
        status: "failed",
        checks: [
          { label: "Compiler checks", status: "fail" },
          { label: "Unit test coverage", status: "warn" }
        ]
      });
      expect(failData.exitCode).toBe(1);

      // Security sanitization test cases
      const unsafeCommands = [
        "pnpm-shell",
        "pnpm install",
        "pnpm i",
        "pnpm --filter package exec calc",
        "pnpm test; calc",
        "pnpm test && calc",
        "npx something vitest",
        "npm run install",
      ];

      for (const cmd of unsafeCommands) {
        const unsafeResponse = await fetch(`http://127.0.0.1:${address.port}/verify-packet`, {
          body: JSON.stringify({
            ...packet,
            command: cmd,
          }),
          headers: {
            authorization: "Bearer test-orchestrator-token",
            "content-type": "application/json",
          },
          method: "POST",
        });

        expect(unsafeResponse.status).toBe(400);
        const unsafeData = (await unsafeResponse.json()) as any;
        expect(unsafeData.error).toBe("unsafe_command");
      }

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
});

describe("Notion OAuth Token Sync & Lock Integration", () => {
  let originalEnv: Record<string, string | undefined>;

  // MockNotionServer helper to represent a stateful mocked Notion API instance.
  class MockNotionServer {
    public dbRow: any;
    public calls: { url: string; init?: any }[] = [];
    public clockSkewOffsetMs = 0;
    public rateLimitAttempts = 0;
    public maxRateLimitAttempts = 0;
    private testKey: string;

    constructor(slot: string, initialBundle: any, testKey: string) {
      this.testKey = testKey;
      const enc = encryptToken(JSON.stringify(initialBundle), testKey);

      this.dbRow = {
        id: "page-123",
        properties: {
          slot: { type: "title", title: [{ text: { content: slot } }] },
          encrypted_token_bundle: { type: "rich_text", rich_text: [{ text: { content: enc.ciphertext } }] },
          nonce: { type: "rich_text", rich_text: [{ text: { content: enc.nonce } }] },
          key_id: { type: "rich_text", rich_text: [{ text: { content: enc.tag } }] },
          expires_at: { type: "rich_text", rich_text: [{ text: { content: initialBundle.expires_at } }] },
          token_version: { type: "number", number: 1 },
          lock_owner: { type: "rich_text", rich_text: [] },
          lock_until: { type: "rich_text", rich_text: [] },
          last_verified_by: { type: "rich_text", rich_text: [] },
          last_test_result: { type: "rich_text", rich_text: [] },
        }
      };
    }

    public getFetch() {
      return async (url: string, init?: any) => {
        this.calls.push({ url, init });

        if (this.rateLimitAttempts < this.maxRateLimitAttempts) {
          this.rateLimitAttempts++;
          return {
            ok: false,
            status: 429,
            headers: {
              get: (k: string) => k.toLowerCase() === "retry-after" ? "1" : null
            },
            text: async () => "Rate Limited",
            json: async () => ({}),
          };
        }

        const serverDate = new Date(Date.now() + this.clockSkewOffsetMs).toUTCString();
        const responseHeaders = {
          get: (k: string) => k.toLowerCase() === "date" ? serverDate : null
        };

        if (url.includes("/databases/") && url.includes("/query")) {
          return {
            ok: true,
            status: 200,
            headers: responseHeaders,
            text: async () => JSON.stringify({ results: [this.dbRow] }),
            json: async () => ({ results: [this.dbRow] }),
          };
        }

        if (url.includes("/pages/page-123") || url.includes("/pages")) {
          if (init && init.body) {
            const body = JSON.parse(init.body);
            const props = body.properties;

            if (props.lock_owner !== undefined) {
              const val = props.lock_owner.rich_text?.[0]?.text?.content ?? "";
              this.dbRow.properties.lock_owner = { type: "rich_text", rich_text: val ? [{ text: { content: val } }] : [] };
            }
            if (props.lock_until !== undefined) {
              const val = props.lock_until.rich_text?.[0]?.text?.content ?? "";
              this.dbRow.properties.lock_until = { type: "rich_text", rich_text: val ? [{ text: { content: val } }] : [] };
            }
            if (props.encrypted_token_bundle !== undefined) {
              this.dbRow.properties.encrypted_token_bundle = { type: "rich_text", rich_text: [{ text: { content: props.encrypted_token_bundle.rich_text[0].text.content } }] };
              this.dbRow.properties.nonce = { type: "rich_text", rich_text: [{ text: { content: props.nonce.rich_text[0].text.content } }] };
              this.dbRow.properties.key_id = { type: "rich_text", rich_text: [{ text: { content: props.key_id.rich_text[0].text.content } }] };
              this.dbRow.properties.expires_at = { type: "rich_text", rich_text: [{ text: { content: props.expires_at.rich_text[0].text.content } }] };
              this.dbRow.properties.token_version = { type: "number", number: props.token_version.number };
            }
            if (props.last_test_result !== undefined) {
              const val = props.last_test_result.rich_text?.[0]?.text?.content ?? "";
              this.dbRow.properties.last_test_result = { type: "rich_text", rich_text: val ? [{ text: { content: val } }] : [] };
            }
          }
          return {
            ok: true,
            status: 200,
            headers: responseHeaders,
            text: async () => JSON.stringify(this.dbRow),
            json: async () => this.dbRow,
          };
        }

        if (url.includes("/oauth2/token")) {
          const resPayload = {
            access_token: "new-access-token",
            refresh_token: "new-refresh-token",
            expires_in: 3600,
            tier: 5,
          };
          return {
            ok: true,
            status: 200,
            headers: responseHeaders,
            text: async () => JSON.stringify(resPayload),
            json: async () => resPayload,
          };
        }

        if (url.includes("/chat/completions")) {
          const resPayload = { choices: [{ message: { content: "pong" } }] };
          return {
            ok: true,
            status: 200,
            headers: responseHeaders,
            text: async () => JSON.stringify(resPayload),
            json: async () => resPayload,
          };
        }

        return {
          ok: false,
          status: 404,
          headers: responseHeaders,
          text: async () => "Not Found",
          json: async () => ({}),
        };
      };
    }
  }

  const cleanL1Files = async () => {
    const slot = "grok-oauth-test";
    const cachePath = join(tmpdir(), `grok-oauth-local-cache-${slot}.json`);
    const lockPath = join(tmpdir(), `grok-oauth-local-lock-${slot}.lock`);
    await rm(cachePath, { force: true });
    await rm(lockPath, { force: true });
  };

  beforeEach(async () => {
    originalEnv = { ...process.env };
    process.env.NOTION_DATABASE_ID = "test-db-id";
    process.env.NOTION_API_KEY = "test-api-key";
    process.env.SHARED_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef"; // 32 chars hex key
    process.env.MY_DEVICE_ID = "device-test-1";
    clearLocalTokenCaches();
    await cleanL1Files();
  });

  afterEach(async () => {
    process.env = originalEnv;
    // Clean up test WAL files
    await deleteWAL("grok-oauth-test");
    clearLocalTokenCaches();
    await cleanL1Files();
  });

  it("Notion Happy Path: locks, refreshes from xAI, writes back, and releases lock", async () => {
    const testKey = "0123456789abcdef0123456789abcdef";
    const oldBundle = {
      access_token: "old-access",
      refresh_token: "old-refresh",
      expires_at: new Date(Date.now() - 5000).toISOString(),
    };

    const server = new MockNotionServer("grok-oauth-test", oldBundle, testKey);
    const mockFetch = server.getFetch();

    const token = await getFreshOAuthTokenWithNotion("grok-oauth-test", { fetchImpl: mockFetch });
    expect(token).toBe("new-access-token");
    expect(server.dbRow.properties.token_version.number).toBe(2);
    expect(server.dbRow.properties.last_test_result.rich_text[0].text.content).toBe("valid");
  }, 15000);

  it("Lock wait: backs off when lock is active, then uses token updated by peer", async () => {
    const testKey = "0123456789abcdef0123456789abcdef";
    const oldBundle = {
      access_token: "old-access",
      refresh_token: "old-refresh",
      expires_at: new Date(Date.now() - 5000).toISOString(),
    };

    const server = new MockNotionServer("grok-oauth-test", oldBundle, testKey);
    // Simulate peer holding the lock
    server.dbRow.properties.lock_owner = { type: "rich_text", rich_text: [{ text: { content: "device-peer" } }] };
    server.dbRow.properties.lock_until = { type: "rich_text", rich_text: [{ text: { content: new Date(Date.now() + 1000).toISOString() } }] };

    let queryCount = 0;
    const originalFetch = server.getFetch();
    const mockFetch = async (url: string, init?: any) => {
      const isReadRequest = (url.includes("/databases/") && url.includes("/query")) ||
                            (url.includes("/pages/page-123") && (!init || init.method === "GET" || !init.method));
      if (isReadRequest) {
        queryCount++;
        if (queryCount >= 2) {
          // Simulate peer finished refresh and wrote new token, releasing lock
          const peerBundle = {
            access_token: "peer-refreshed-access",
            refresh_token: "peer-refreshed-refresh",
            expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
          };
          const enc = encryptToken(JSON.stringify(peerBundle), testKey);
          server.dbRow.properties.encrypted_token_bundle = { type: "rich_text", rich_text: [{ text: { content: enc.ciphertext } }] };
          server.dbRow.properties.nonce = { type: "rich_text", rich_text: [{ text: { content: enc.nonce } }] };
          server.dbRow.properties.key_id = { type: "rich_text", rich_text: [{ text: { content: enc.tag } }] };
          server.dbRow.properties.expires_at = { type: "rich_text", rich_text: [{ text: { content: peerBundle.expires_at } }] };
          server.dbRow.properties.token_version = { type: "number", number: 2 };
          server.dbRow.properties.lock_owner = { type: "rich_text", rich_text: [] };
          server.dbRow.properties.lock_until = { type: "rich_text", rich_text: [] };
        }
      }
      return originalFetch(url, init);
    };

    const token = await getFreshOAuthTokenWithNotion("grok-oauth-test", { fetchImpl: mockFetch });
    expect(token).toBe("peer-refreshed-access");
    expect(queryCount).toBeGreaterThanOrEqual(2);
  }, 15000);

  it("WAL Recovery: recovers local pending WAL, writes it to Notion under lock", async () => {
    const testKey = "0123456789abcdef0123456789abcdef";

    // 1. Setup local WAL
    const walData = {
      access_token: "wal-recovered-access",
      refresh_token: "wal-recovered-refresh",
      expires_at: new Date(Date.now() + 1800 * 1000).toISOString(),
      label: "grok-oauth-test",
      tier: 5,
    };
    await writeWAL("grok-oauth-test", walData);

    // Notion has stale data
    const staleBundle = {
      access_token: "stale-access",
      refresh_token: "stale-refresh",
      expires_at: new Date(Date.now() - 10000).toISOString(),
    };

    const server = new MockNotionServer("grok-oauth-test", staleBundle, testKey);
    const mockFetch = server.getFetch();

    const token = await getFreshOAuthTokenWithNotion("grok-oauth-test", { fetchImpl: mockFetch });
    expect(token).toBe("wal-recovered-access");
    expect(server.dbRow.properties.token_version.number).toBe(2);

    const checkWAL = await readWAL("grok-oauth-test");
    expect(checkWAL).toBeNull();
  }, 15000);

  it("Notion Retry & Clock Skew: handles 429 with retry-after header and updates clockSkewMs", async () => {
    const testKey = "0123456789abcdef0123456789abcdef";
    const validBundle = {
      access_token: "test-access",
      refresh_token: "test-refresh",
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
    };

    const server = new MockNotionServer("grok-oauth-test", validBundle, testKey);
    server.maxRateLimitAttempts = 1;
    server.clockSkewOffsetMs = 60000; // Server is 60 seconds fast
    const mockFetch = server.getFetch();

    const token = await getFreshOAuthTokenWithNotion("grok-oauth-test", { fetchImpl: mockFetch });
    expect(token).toBe("test-access");
    expect(server.rateLimitAttempts).toBe(1);

    const syncedNow = getNotionSyncedNow();
    const timeDiff = syncedNow.getTime() - Date.now();
    expect(timeDiff).toBeGreaterThan(50_000);
    expect(timeDiff).toBeLessThan(70_000);
  }, 15000);
});

describe("SSE events/stream and GrokSessionManager Hot-Swap", () => {
  const previousToken = process.env.ORCHESTRATOR_API_TOKEN;

  beforeEach(() => {
    process.env.ORCHESTRATOR_API_TOKEN = "test-orchestrator-token";
    // Reset grok slots to active
    for (const slot of grokSessionManager.getSlots()) {
      grokSessionManager.restoreSlot(slot.profileId);
    }
    clearLocalTokenCaches();
  });

  afterEach(() => {
    if (previousToken === undefined) {
      delete process.env.ORCHESTRATOR_API_TOKEN;
    } else {
      process.env.ORCHESTRATOR_API_TOKEN = previousToken;
    }
    clearLocalTokenCaches();
  });

  it("SSE events/stream: keeps connection open, sends heartbeat, triggers properly, and cleans up on close", async () => {
    const server = startServer(0);
    const sessionId = `sse-test-session-${crypto.randomUUID()}`;

    try {
      await new Promise<void>((resolve) => {
        server.once("listening", resolve);
      });
      const address = server.address();
      if (!address || typeof address !== "object") {
        throw new Error("test server did not bind to a TCP port");
      }

      // Start a fetch request to /events/stream
      const abortController = new AbortController();
      const sseUrl = `http://127.0.0.1:${address.port}/events/stream?sessionId=${sessionId}`;
      
      const responsePromise = fetch(sseUrl, {
        headers: {
          authorization: "Bearer test-orchestrator-token",
        },
        signal: abortController.signal,
      });

      // Wait briefly for connection setup
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Verify that a listener was added to serverEventBroker
      expect(serverEventBroker.listenerCount(`events:${sessionId}`)).toBe(1);

      const response = await responsePromise;
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/event-stream");

      const reader = response.body?.getReader();
      expect(reader).toBeDefined();

      // Read first chunk (should be heartbeat)
      const firstRead = await reader!.read();
      const firstText = new TextDecoder().decode(firstRead.value);
      expect(firstText).toContain("event: heartbeat");

      // Publish an event
      const testEvent = {
        id: `evt_test_${crypto.randomUUID()}`,
        sessionId,
        type: "work_item.created",
        payload: { id: "item_1" },
        createdAt: new Date().toISOString(),
      };
      serverEventBroker.publishEvents(sessionId, [testEvent]);

      // Read second chunk
      const secondRead = await reader!.read();
      const secondText = new TextDecoder().decode(secondRead.value);
      expect(secondText).toContain("event: work_item_update");
      expect(secondText).toContain(testEvent.id);

      // Now close the client connection
      abortController.abort();
      reader?.releaseLock();

      // Wait for server to process request close event
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Verify that the listener was cleaned up to prevent leaks
      expect(serverEventBroker.listenerCount(`events:${sessionId}`)).toBe(0);

    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }
  });

  it("GrokSessionManager Hot-Swap: recovers session failure gracefully via slot swapping", async () => {
    let attemptCount = 0;
    
    // We will set up mock environment for Notion Sync
    process.env.NOTION_DATABASE_ID = "test-db-id";
    process.env.NOTION_API_KEY = "test-api-key";
    process.env.SHARED_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef";
    process.env.MY_DEVICE_ID = "device-test-1";

    const mockRequest = {
      id: "req_grok_test",
      sessionId: "session_grok_test",
      providerProfileId: "provider_grok_oauth_dgx",
      modelId: "grok-4",
      messages: [{ role: "user" as const, content: "hello" }],
      source: "desktop" as const,
      routePreference: "server_proxy" as const,
      createdAt: new Date().toISOString(),
    };

    const statefulSlots: Record<string, {
      lock_owner?: string | null;
      lock_until?: string | null;
      accessToken: string;
      refreshToken: string;
      expiresAt: string;
      tokenVersion: number;
    }> = {
      "grok-oauth-1": {
        accessToken: "token-grok-oauth-1-old",
        refreshToken: "refresh-grok-oauth-1-old",
        expiresAt: new Date(Date.now() - 10000).toISOString(),
        tokenVersion: 1,
      },
      "grok-oauth-2": {
        accessToken: "token-grok-oauth-2-old",
        refreshToken: "refresh-grok-oauth-2-old",
        expiresAt: new Date(Date.now() - 10000).toISOString(),
        tokenVersion: 1,
      },
    };

    // Stateful mock fetch implementation
    const mockFetch = async (url: string, init?: any) => {
      attemptCount++;

      // Notion page query or db query
      if (url.includes("/databases/") && url.includes("/query")) {
        const body = init?.body ? JSON.parse(init.body) : {};
        const slotName = body.filter?.rich_text?.equals || (url.includes("grok-oauth-2") ? "grok-oauth-2" : "grok-oauth-1");
        const slotData = (statefulSlots[slotName] || statefulSlots["grok-oauth-1"])!;
        const enc = encryptToken(
          JSON.stringify({
            access_token: slotData.accessToken,
            refresh_token: slotData.refreshToken,
            expires_at: slotData.expiresAt,
          }),
          "0123456789abcdef0123456789abcdef"
        );
        const row = {
          id: `page-${slotName}`,
          properties: {
            slot: { type: "title", title: [{ text: { content: slotName } }] },
            encrypted_token_bundle: { type: "rich_text", rich_text: [{ text: { content: enc.ciphertext } }] },
            nonce: { type: "rich_text", rich_text: [{ text: { content: enc.nonce } }] },
            key_id: { type: "rich_text", rich_text: [{ text: { content: enc.tag } }] },
            expires_at: { type: "rich_text", rich_text: [{ text: { content: slotData.expiresAt } }] },
            token_version: { type: "number", number: slotData.tokenVersion },
            lock_owner: { type: "rich_text", rich_text: slotData.lock_owner ? [{ text: { content: slotData.lock_owner } }] : [] },
            lock_until: { type: "rich_text", rich_text: slotData.lock_until ? [{ text: { content: slotData.lock_until } }] : [] },
            last_verified_by: { type: "rich_text", rich_text: [] },
            last_test_result: { type: "rich_text", rich_text: [] },
          }
        };
        return new Response(JSON.stringify({ results: [row] }), { status: 200 });
      }
 
      if (url.includes("/pages/page-grok-oauth-1") || url.includes("/pages/page-grok-oauth-2")) {
        const slotName = url.includes("page-grok-oauth-2") ? "grok-oauth-2" : "grok-oauth-1";
        const slotData = statefulSlots[slotName]!;
        if (init && init.method === "PATCH" && init.body) {
          const body = JSON.parse(init.body);
          const props = body.properties;
          if (props.lock_owner !== undefined) {
            slotData.lock_owner = props.lock_owner.rich_text?.[0]?.text?.content ?? null;
          }
          if (props.lock_until !== undefined) {
            slotData.lock_until = props.lock_until.rich_text?.[0]?.text?.content ?? null;
          }
          if (props.encrypted_token_bundle !== undefined && props.encrypted_token_bundle.rich_text?.[0]) {
            const encBundle = props.encrypted_token_bundle.rich_text[0].text.content;
            const nonce = props.nonce.rich_text[0].text.content;
            const tag = props.key_id.rich_text[0].text.content;
            const decStr = decryptToken(encBundle, nonce, tag, "0123456789abcdef0123456789abcdef");
            const dec = JSON.parse(decStr);
            slotData.accessToken = dec.access_token;
            slotData.refreshToken = dec.refresh_token;
            slotData.expiresAt = dec.expires_at;
            slotData.tokenVersion = props.token_version.number;
          }
        }
        const enc = encryptToken(
          JSON.stringify({
            access_token: slotData.accessToken,
            refresh_token: slotData.refreshToken,
            expires_at: slotData.expiresAt,
          }),
          "0123456789abcdef0123456789abcdef"
        );
        const row = {
          id: `page-${slotName}`,
          properties: {
            slot: { type: "title", title: [{ text: { content: slotName } }] },
            encrypted_token_bundle: { type: "rich_text", rich_text: [{ text: { content: enc.ciphertext } }] },
            nonce: { type: "rich_text", rich_text: [{ text: { content: enc.nonce } }] },
            key_id: { type: "rich_text", rich_text: [{ text: { content: enc.tag } }] },
            expires_at: { type: "rich_text", rich_text: [{ text: { content: slotData.expiresAt } }] },
            token_version: { type: "number", number: slotData.tokenVersion },
            lock_owner: { type: "rich_text", rich_text: slotData.lock_owner ? [{ text: { content: slotData.lock_owner } }] : [] },
            lock_until: { type: "rich_text", rich_text: slotData.lock_until ? [{ text: { content: slotData.lock_until } }] : [] },
            last_verified_by: { type: "rich_text", rich_text: [] },
            last_test_result: { type: "rich_text", rich_text: [] },
          }
        };
        return new Response(JSON.stringify(row), { status: 200 });
      }

      if (url.includes("/oauth2/token")) {
        const bodyStr = init?.body || "";
        const slotName = bodyStr.includes("grok-oauth-2") ? "grok-oauth-2" : "grok-oauth-1";
        return new Response(JSON.stringify({
          access_token: `token-${slotName}-new`,
          refresh_token: `refresh-${slotName}-new`,
          expires_in: 3600,
        }), { status: 200 });
      }

      // xAI completions
      if (url.includes("api.x.ai/v1/chat/completions") || url.includes("/chat/completions")) {
        const auth = init?.headers?.Authorization || init?.headers?.authorization || "";
        if (auth.includes("token-grok-oauth-1-new")) {
          // Simulate 401 Unauthorized for the first slot to trigger hot-swap
          return new Response("Unauthorized session expired", { status: 401 });
        }
        return new Response(JSON.stringify({
          choices: [{ message: { content: "Success from slot 2" } }],
        }), { status: 200 });
      }

      return new Response("Not Found", { status: 404 });
    };

    const response = await createServerProviderProxyCompletionWithHotSwap(mockRequest, {
      fetchImpl: mockFetch as any,
    });

    expect(response.status).toBe("succeeded");
    expect(response.content).toBe("Success from slot 2");

    // Verify slot status in grokSessionManager
    const slots = grokSessionManager.getSlots();
    const slot1 = slots.find(s => s.slotName === "grok-oauth-1");
    const slot2 = slots.find(s => s.slotName === "grok-oauth-2");

    expect(slot1?.status).toBe("invalid");
    expect(slot2?.status).toBe("active");
  });

  it("GrokSessionManager Absolute Failure: auto-generates block lane item when all slots fail", async () => {
    // We will set up mock environment for Notion Sync
    process.env.NOTION_DATABASE_ID = "test-db-id";
    process.env.NOTION_API_KEY = "test-api-key";
    process.env.SHARED_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef";
    process.env.MY_DEVICE_ID = "device-test-1";

    // Both slots return 401, causing absolute failure
    const mockRequest = {
      id: "req_grok_absolute_fail",
      sessionId: "session_grok_block_test",
      providerProfileId: "provider_grok_oauth_dgx",
      modelId: "grok-4",
      messages: [{ role: "user" as const, content: "hello" }],
      source: "desktop" as const,
      routePreference: "server_proxy" as const,
      createdAt: new Date().toISOString(),
    };

    const statefulSlots: Record<string, {
      lock_owner?: string | null;
      lock_until?: string | null;
      accessToken: string;
      refreshToken: string;
      expiresAt: string;
      tokenVersion: number;
    }> = {
      "grok-oauth-1": {
        accessToken: "token-grok-oauth-1-old",
        refreshToken: "refresh-grok-oauth-1-old",
        expiresAt: new Date(Date.now() - 10000).toISOString(),
        tokenVersion: 1,
      },
      "grok-oauth-2": {
        accessToken: "token-grok-oauth-2-old",
        refreshToken: "refresh-grok-oauth-2-old",
        expiresAt: new Date(Date.now() - 10000).toISOString(),
        tokenVersion: 1,
      },
    };

    const mockFetch = async (url: string, init?: any) => {
      // Notion page query or db query
      if (url.includes("/databases/") && url.includes("/query")) {
        const body = init?.body ? JSON.parse(init.body) : {};
        const slotName = body.filter?.rich_text?.equals || (url.includes("grok-oauth-2") ? "grok-oauth-2" : "grok-oauth-1");
        const slotData = (statefulSlots[slotName] || statefulSlots["grok-oauth-1"])!;
        const enc = encryptToken(
          JSON.stringify({
            access_token: slotData.accessToken,
            refresh_token: slotData.refreshToken,
            expires_at: slotData.expiresAt,
          }),
          "0123456789abcdef0123456789abcdef"
        );
        const row = {
          id: `page-${slotName}`,
          properties: {
            slot: { type: "title", title: [{ text: { content: slotName } }] },
            encrypted_token_bundle: { type: "rich_text", rich_text: [{ text: { content: enc.ciphertext } }] },
            nonce: { type: "rich_text", rich_text: [{ text: { content: enc.nonce } }] },
            key_id: { type: "rich_text", rich_text: [{ text: { content: enc.tag } }] },
            expires_at: { type: "rich_text", rich_text: [{ text: { content: slotData.expiresAt } }] },
            token_version: { type: "number", number: slotData.tokenVersion },
            lock_owner: { type: "rich_text", rich_text: slotData.lock_owner ? [{ text: { content: slotData.lock_owner } }] : [] },
            lock_until: { type: "rich_text", rich_text: slotData.lock_until ? [{ text: { content: slotData.lock_until } }] : [] },
            last_verified_by: { type: "rich_text", rich_text: [] },
            last_test_result: { type: "rich_text", rich_text: [] },
          }
        };
        return new Response(JSON.stringify({ results: [row] }), { status: 200 });
      }

      if (url.includes("/pages/page-grok-oauth-1") || url.includes("/pages/page-grok-oauth-2")) {
        const slotName = url.includes("page-grok-oauth-2") ? "grok-oauth-2" : "grok-oauth-1";
        const slotData = statefulSlots[slotName]!;
        if (init && init.method === "PATCH" && init.body) {
          const body = JSON.parse(init.body);
          const props = body.properties;
          if (props.lock_owner !== undefined) {
            slotData.lock_owner = props.lock_owner.rich_text?.[0]?.text?.content ?? null;
          }
          if (props.lock_until !== undefined) {
            slotData.lock_until = props.lock_until.rich_text?.[0]?.text?.content ?? null;
          }
          if (props.encrypted_token_bundle !== undefined && props.encrypted_token_bundle.rich_text?.[0]) {
            const encBundle = props.encrypted_token_bundle.rich_text[0].text.content;
            const nonce = props.nonce.rich_text[0].text.content;
            const tag = props.key_id.rich_text[0].text.content;
            const decStr = decryptToken(encBundle, nonce, tag, "0123456789abcdef0123456789abcdef");
            const dec = JSON.parse(decStr);
            slotData.accessToken = dec.access_token;
            slotData.refreshToken = dec.refresh_token;
            slotData.expiresAt = dec.expires_at;
            slotData.tokenVersion = props.token_version.number;
          }
        }
        const enc = encryptToken(
          JSON.stringify({
            access_token: slotData.accessToken,
            refresh_token: slotData.refreshToken,
            expires_at: slotData.expiresAt,
          }),
          "0123456789abcdef0123456789abcdef"
        );
        const row = {
          id: `page-${slotName}`,
          properties: {
            slot: { type: "title", title: [{ text: { content: slotName } }] },
            encrypted_token_bundle: { type: "rich_text", rich_text: [{ text: { content: enc.ciphertext } }] },
            nonce: { type: "rich_text", rich_text: [{ text: { content: enc.nonce } }] },
            key_id: { type: "rich_text", rich_text: [{ text: { content: enc.tag } }] },
            expires_at: { type: "rich_text", rich_text: [{ text: { content: slotData.expiresAt } }] },
            token_version: { type: "number", number: slotData.tokenVersion },
            lock_owner: { type: "rich_text", rich_text: slotData.lock_owner ? [{ text: { content: slotData.lock_owner } }] : [] },
            lock_until: { type: "rich_text", rich_text: slotData.lock_until ? [{ text: { content: slotData.lock_until } }] : [] },
            last_verified_by: { type: "rich_text", rich_text: [] },
            last_test_result: { type: "rich_text", rich_text: [] },
          }
        };
        return new Response(JSON.stringify(row), { status: 200 });
      }

      if (url.includes("/oauth2/token")) {
        return new Response("Invalid grant", { status: 400 });
      }

      // completions call fails on all tokens
      if (url.includes("/chat/completions")) {
        return new Response("Unauthorized session expired", { status: 401 });
      }

      return new Response("Not Found", { status: 404 });
    };

    const tempStorage = createJsonlServerEventStorage();

    const response = await createServerProviderProxyCompletionWithHotSwap(mockRequest, {
      fetchImpl: mockFetch as any,
      eventStorage: tempStorage,
    });

    expect(response.status).toBe("failed");
    expect(response.error).toContain("All available Grok OAuth session slots failed");

    // Retrieve state and check for blocked work item
    const state = await tempStorage.statePromise;
    const sessionEvents = state.eventsBySession.get("session_grok_block_test") || [];
    const events = sessionEvents.map(id => state.eventsById.get(id)).filter(Boolean);

    const blockEvent = events.find(e => e?.type === "work_item.created");
    expect(blockEvent).toBeDefined();
    expect((blockEvent?.payload as any)?.lane).toBe("blocked");
    expect((blockEvent?.payload as any)?.metadata?.actionRequired).toBe("re_auth_grok");
  }, 15000);

  it("GrokSessionManager Loop Exhaustion: auto-generates block lane item when retry attempts are exhausted", async () => {
    process.env.NOTION_DATABASE_ID = "test-db-id";
    process.env.NOTION_API_KEY = "test-api-key";
    process.env.SHARED_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef";
    process.env.MY_DEVICE_ID = "device-test-1";

    const mockRequest = {
      id: "req_grok_exhaust_fail",
      sessionId: "session_grok_exhaust_test",
      providerProfileId: "provider_grok_oauth_dgx",
      modelId: "grok-4",
      messages: [{ role: "user" as const, content: "hello" }],
      source: "desktop" as const,
      routePreference: "server_proxy" as const,
      createdAt: new Date().toISOString(),
    };

    const statefulSlots: Record<string, {
      lock_owner?: string | null;
      lock_until?: string | null;
      accessToken: string;
      refreshToken: string;
      expiresAt: string;
      tokenVersion: number;
    }> = {
      "grok-oauth-1": {
        accessToken: "token-grok-oauth-1-old",
        refreshToken: "refresh-grok-oauth-1-old",
        expiresAt: new Date(Date.now() - 10000).toISOString(),
        tokenVersion: 1,
      },
      "grok-oauth-2": {
        accessToken: "token-grok-oauth-2-old",
        refreshToken: "refresh-grok-oauth-2-old",
        expiresAt: new Date(Date.now() - 10000).toISOString(),
        tokenVersion: 1,
      },
    };

    const mockFetch = async (url: string, init?: any) => {
      if (url.includes("/databases/") && url.includes("/query")) {
        const body = init?.body ? JSON.parse(init.body) : {};
        const slotName = body.filter?.rich_text?.equals || (url.includes("grok-oauth-2") ? "grok-oauth-2" : "grok-oauth-1");
        const slotData = statefulSlots[slotName]!;
        const enc = encryptToken(
          JSON.stringify({
            access_token: slotData.accessToken,
            refresh_token: slotData.refreshToken,
            expires_at: slotData.expiresAt,
          }),
          "0123456789abcdef0123456789abcdef"
        );
        const row = {
          id: `page-${slotName}`,
          properties: {
            slot: { type: "title", title: [{ text: { content: slotName } }] },
            encrypted_token_bundle: { type: "rich_text", rich_text: [{ text: { content: enc.ciphertext } }] },
            nonce: { type: "rich_text", rich_text: [{ text: { content: enc.nonce } }] },
            key_id: { type: "rich_text", rich_text: [{ text: { content: enc.tag } }] },
            expires_at: { type: "rich_text", rich_text: [{ text: { content: slotData.expiresAt } }] },
            token_version: { type: "number", number: slotData.tokenVersion },
            lock_owner: { type: "rich_text", rich_text: slotData.lock_owner ? [{ text: { content: slotData.lock_owner } }] : [] },
            lock_until: { type: "rich_text", rich_text: slotData.lock_until ? [{ text: { content: slotData.lock_until } }] : [] },
            last_verified_by: { type: "rich_text", rich_text: [] },
            last_test_result: { type: "rich_text", rich_text: [] },
          }
        };
        return new Response(JSON.stringify({ results: [row] }), { status: 200 });
      }

      if (url.includes("/pages/page-grok-oauth-1") || url.includes("/pages/page-grok-oauth-2")) {
        const slotName = url.includes("page-grok-oauth-2") ? "grok-oauth-2" : "grok-oauth-1";
        const slotData = statefulSlots[slotName]!;
        if (init && init.method === "PATCH" && init.body) {
          const body = JSON.parse(init.body);
          const props = body.properties;
          if (props.lock_owner !== undefined) {
            slotData.lock_owner = props.lock_owner.rich_text?.[0]?.text?.content ?? null;
          }
          if (props.lock_until !== undefined) {
            slotData.lock_until = props.lock_until.rich_text?.[0]?.text?.content ?? null;
          }
          if (props.encrypted_token_bundle !== undefined && props.encrypted_token_bundle.rich_text?.[0]) {
            const encBundle = props.encrypted_token_bundle.rich_text[0].text.content;
            const nonce = props.nonce.rich_text[0].text.content;
            const tag = props.key_id.rich_text[0].text.content;
            const decStr = decryptToken(encBundle, nonce, tag, "0123456789abcdef0123456789abcdef");
            const dec = JSON.parse(decStr);
            slotData.accessToken = dec.access_token;
            slotData.refreshToken = dec.refresh_token;
            slotData.expiresAt = dec.expires_at;
            slotData.tokenVersion = props.token_version.number;
          }
        }
        const enc = encryptToken(
          JSON.stringify({
            access_token: slotData.accessToken,
            refresh_token: slotData.refreshToken,
            expires_at: slotData.expiresAt,
          }),
          "0123456789abcdef0123456789abcdef"
        );
        const row = {
          id: `page-${slotName}`,
          properties: {
            slot: { type: "title", title: [{ text: { content: slotName } }] },
            encrypted_token_bundle: { type: "rich_text", rich_text: [{ text: { content: enc.ciphertext } }] },
            nonce: { type: "rich_text", rich_text: [{ text: { content: enc.nonce } }] },
            key_id: { type: "rich_text", rich_text: [{ text: { content: enc.tag } }] },
            expires_at: { type: "rich_text", rich_text: [{ text: { content: slotData.expiresAt } }] },
            token_version: { type: "number", number: slotData.tokenVersion },
            lock_owner: { type: "rich_text", rich_text: slotData.lock_owner ? [{ text: { content: slotData.lock_owner } }] : [] },
            lock_until: { type: "rich_text", rich_text: slotData.lock_until ? [{ text: { content: slotData.lock_until } }] : [] },
            last_verified_by: { type: "rich_text", rich_text: [] },
            last_test_result: { type: "rich_text", rich_text: [] },
          }
        };
        return new Response(JSON.stringify(row), { status: 200 });
      }

      if (url.includes("/oauth2/token")) {
        const slotName = url.includes("grok-oauth-2") ? "grok-oauth-2" : "grok-oauth-1";
        return new Response(JSON.stringify({
          access_token: `token-refreshed-${slotName}`,
          refresh_token: `refresh-new-${slotName}`,
          expires_in: 3600,
        }), { status: 200 });
      }

      if (url.includes("/chat/completions")) {
        return new Response("Unauthorized session expired", { status: 401 });
      }

      return new Response("Not Found", { status: 404 });
    };

    const tempStorage = createJsonlServerEventStorage();

    const response = await createServerProviderProxyCompletionWithHotSwap(mockRequest, {
      fetchImpl: mockFetch as any,
      eventStorage: tempStorage,
    });

    expect(response.status).toBe("failed");
    expect(response.error).toContain("Grok OAuth hot-swap failed after maximum retry attempts");

    // Retrieve state and check for blocked work item
    const state = await tempStorage.statePromise;
    const sessionEvents = state.eventsBySession.get("session_grok_exhaust_test") || [];
    const events = sessionEvents.map(id => state.eventsById.get(id)).filter(Boolean);

    const blockEvent = events.find(e => e?.type === "work_item.created");
    expect(blockEvent).toBeDefined();
    expect((blockEvent?.payload as any)?.lane).toBe("blocked");
    expect((blockEvent?.payload as any)?.metadata?.errorReason).toContain("Grok OAuth hot-swap failed after maximum retry attempts");
  }, 15000);
});

describe("Control Queue API", () => {
  const previousToken = process.env.ORCHESTRATOR_API_TOKEN;
  const previousNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.ORCHESTRATOR_API_TOKEN = "test-orchestrator-token";
    process.env.NODE_ENV = "production";
  });

  afterEach(() => {
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
  });

  it("lists active work items and processes control queue actions", async () => {
    const server = startServer(0);
    const sessionId = `test-session-cq-${crypto.randomUUID()}`;

    try {
      await new Promise<void>((resolve) => {
        server.once("listening", resolve);
      });
      const address = server.address();
      if (!address || typeof address !== "object") {
        throw new Error("test server did not bind to a TCP port");
      }

      // 1. GET /control-queue/items - Initially empty
      const initRes = await fetch(`http://127.0.0.1:${address.port}/control-queue/items?sessionId=${sessionId}`, {
        headers: {
          authorization: "Bearer test-orchestrator-token",
        },
      });
      expect(initRes.status).toBe(200);
      const initItems = await initRes.json() as any[];
      expect(initItems.length).toBe(0);

      // 2. Push work_item.created event via event sync
      const workItemId = `work_item_test_${crypto.randomUUID()}`;
      const now = new Date().toISOString();
      const workItemCreatedEvent = {
        id: `evt_created_${crypto.randomUUID()}`,
        sessionId: sessionId,
        type: "work_item.created",
        createdAt: now,
        source: "server",
        sourceTrust: "trusted",
        redacted: false,
        payload: {
          id: workItemId,
          sessionId: sessionId,
          title: "Test Input Request",
          kind: "approval",
          lane: "ask",
          status: "waiting_input",
          summary: "Need input context",
          sourceRefs: [],
          evidenceRefs: [],
          missingInfo: [],
          createdAt: now,
        },
      };

      const syncRes = await fetch(`http://127.0.0.1:${address.port}/events/sync`, {
        method: "POST",
        headers: {
          authorization: "Bearer test-orchestrator-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          id: "sync_001",
          clientId: "test_client",
          sessionId: sessionId,
          events: [workItemCreatedEvent],
          idempotencyKey: "idemp_test_sync_cq_1",
          createdAt: now,
        }),
      });
      const syncResult = await syncRes.json() as any;
      expect(syncRes.status).toBe(202);
      expect(syncResult.results[0]).toMatchObject({
        status: "accepted",
      });

      // 3. GET /control-queue/items - Should contain 1 active item
      const listRes = await fetch(`http://127.0.0.1:${address.port}/control-queue/items?sessionId=${sessionId}`, {
        headers: {
          authorization: "Bearer test-orchestrator-token",
        },
      });
      expect(listRes.status).toBe(200);
      const activeItems = await listRes.json() as any[];
      expect(activeItems.length).toBe(1);
      expect(activeItems[0].id).toBe(workItemId);
      expect(activeItems[0].status).toBe("waiting_input");

      // 4. POST /control-queue/action - resolve work item
      const actionRes = await fetch(`http://127.0.0.1:${address.port}/control-queue/action`, {
        method: "POST",
        headers: {
          authorization: "Bearer test-orchestrator-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          sessionId: sessionId,
          workItemId: workItemId,
          action: "provide_input",
          payload: {
            inputValue: "Resolved user input here",
          },
        }),
      });
      expect(actionRes.status).toBe(200);
      const actionResult = await actionRes.json() as any;
      expect(actionResult.success).toBe(true);
      expect(actionResult.nextStatus).toBe("in_progress");

      // 5. GET /control-queue/items - Should be empty again (since status became in_progress)
      const afterActionRes = await fetch(`http://127.0.0.1:${address.port}/control-queue/items?sessionId=${sessionId}`, {
        headers: {
          authorization: "Bearer test-orchestrator-token",
        },
      });
      expect(afterActionRes.status).toBe(200);
      const activeItemsAfter = await afterActionRes.json() as any[];
      expect(activeItemsAfter.length).toBe(1);
      expect(activeItemsAfter[0].status).toBe("in_progress");

      // 6. Test with invalid workItemId - should return 404
      const invalidActionRes = await fetch(`http://127.0.0.1:${address.port}/control-queue/action`, {
        method: "POST",
        headers: {
          authorization: "Bearer test-orchestrator-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          sessionId: sessionId,
          workItemId: "non_existent_item",
          action: "provide_input",
          payload: {},
        }),
      });
      expect(invalidActionRes.status).toBe(404);

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

describe("Swarm advanced security, locks, and reasoning features", () => {
  it("extracts thinking tokens and redacts secrets in RedactStreamTransformer", async () => {
    const inputChunks: any[] = [
      { type: "delta" as const, delta: "Normal text. ", requestId: "req-1", sequence: 1 },
      { type: "delta" as const, delta: "<thinking>Checking api-key sk-abc123XYZ987654321...", requestId: "req-1", sequence: 2 },
      { type: "delta" as const, delta: " and processing...", requestId: "req-1", sequence: 3 },
      { type: "delta" as const, delta: "</thinking>Done.", requestId: "req-1", sequence: 4 }
    ];

    async function* makeStream() {
      for (const chunk of inputChunks) {
        yield chunk;
      }
    }

    const stream = wrapStreamWithRedaction(makeStream());
    const results: any[] = [];
    for await (const chunk of stream) {
      results.push(chunk);
    }

    expect(results.length).toBe(4);
    expect(results[0]).toMatchObject({ delta: "Normal text. " });
    expect(results[1].reasoningSnippet).toBe("Checking api-key <redacted>...");
    expect(results[2].reasoningSnippet).toBe("Checking api-key <redacted>... and processing...");
    expect(results[3].reasoningSnippet).toBe("Checking api-key <redacted>... and processing...");
    expect(results[1].delta).toBe("");
  });

  it("exposes /api/cluster-locks with mapped L1 SQLite locks", async () => {
    const previousToken = process.env.ORCHESTRATOR_API_TOKEN;
    process.env.ORCHESTRATOR_API_TOKEN = "test-orchestrator-token";

    try {
      const db = getLocalDb();
      const nowStr = new Date().toISOString();
      db.prepare(`
        INSERT OR REPLACE INTO local_locks (slot, lock_owner, lock_until, token_version, clock_skew_ms, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run("test-lock-slot", "12345:device-test", nowStr, 42, 250, nowStr);

      const server = startServer(0);
      try {
        await new Promise<void>((resolve) => server.once("listening", resolve));
        const address = server.address() as any;

        const res = await fetch(`http://127.0.0.1:${address.port}/api/cluster-locks`, {
          headers: {
            authorization: "Bearer test-orchestrator-token",
          },
        });
        expect(res.status).toBe(200);
        const data = await res.json() as any[];
        const testLock = data.find((l) => l.slot === "test-lock-slot");
        expect(testLock).toBeDefined();
        expect(testLock.lockOwner).toBe("12345:device-test");
        expect(testLock.tokenVersion).toBe(42);
        expect(testLock.clockSkewMs).toBe(250);
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    } finally {
      if (previousToken === undefined) {
        delete process.env.ORCHESTRATOR_API_TOKEN;
      } else {
        process.env.ORCHESTRATOR_API_TOKEN = previousToken;
      }
    }
  });
});
