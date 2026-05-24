import { describe, expect, it } from "vitest";
import {
  agentProfileSchema,
  agentSessionSchema,
  assistantDraftSchema,
  codingPacketSchema,
  evidenceRefSchema,
  eventEnvelopeSchema,
  eventStorageSessionIndexResponseSchema,
  eventSyncPushRequestSchema,
  eventSyncPushResponseSchema,
  executionSlotSchema,
  providerProfileSchema,
  terminalCommandIntentSchema,
  terminalPaneSchema,
  tmuxSessionRefSchema,
  workItemHandoffSchema,
  workItemSchema,
  workSourceSchema,
  type BackupProjectionArtifact,
  type CodingPacket,
  type TerminalPaneOutputCapturedEventPayload,
  type RunCompletedEventPayload,
  type RunRequestedEventPayload,
  type IngressGuardResult,
  type MobileActionPolicy,
  type MemoryTrace,
  type ModelDiscoverySnapshot,
  type PermissionMatrixSnapshot,
  type ProviderCredentialParseResult,
  type ProviderCompletionRequest,
  type ProviderCompletionResponse,
  type ProviderRegistrySnapshot,
  type ProviderRuntimeReadiness,
  type RemoteExecutionRequest,
  type RemoteExecutionResponse,
  type SecretVaultSnapshot,
  type WorkSourceRef,
} from "./index";

describe("protocol schemas", () => {
  it("validates a structured coding packet", () => {
    const packet: CodingPacket = {
      goal: "오케스트레이터 골격 생성",
      context: ["문서 기반 첫 구현"],
      decisions: ["protocol-first"],
      rejectedOptions: ["채팅 UI만 먼저 만들기"],
      constraints: ["실제 API 호출 제외"],
      filesToInspect: ["packages/protocol/src/index.ts"],
      implementationPlan: ["workspace 생성", "UI stub 구현"],
      verificationPlan: ["typecheck", "test"],
      reviewerNotes: ["secretRef 사용"],
    };

    expect(codingPacketSchema.parse(packet).goal).toBe("오케스트레이터 골격 생성");
  });

  it("keeps provider credentials behind a secret reference", () => {
    const profile = providerProfileSchema.parse({
      id: "provider_custom_reseller",
      name: "리셀러 호환 API",
      kind: "custom",
      baseUrl: "https://api.example.test",
      secretRef: {
        id: "secret_session_1",
        label: "임시 키",
        scope: "session",
        redactedPreview: "sk-...42f0",
        transient: true,
      },
      enabled: true,
      tags: ["reseller", "untrusted"],
      trustLevel: "untrusted",
    });

    expect(profile.secretRef?.redactedPreview).toBe("sk-...42f0");
    expect(JSON.stringify(profile)).not.toContain("raw");
  });

  it("requires one active agent config source", () => {
    const agent = agentProfileSchema.parse({
      id: "agent_orchestrator",
      name: "Orchestrator",
      kind: "virtual",
      role: "orchestrator",
      soulMode: "summary",
      configSource: "markdown",
      enabled: true,
    });

    expect(agent.configSource).toBe("markdown");
    expect(() =>
      agentProfileSchema.parse({
        ...agent,
        configSource: "internal+markdown",
      }),
    ).toThrow();
  });

  it("requires a source trust level for persisted events", () => {
    const event = eventEnvelopeSchema.parse({
      id: "event_1",
      sessionId: "session_1",
      type: "conversation.message.created",
      payload: { text: "토론으로 돌려봐" },
      createdAt: new Date("2026-05-24T00:00:00.000Z").toISOString(),
      source: "legacy_telegram",
      sourceTrust: "untrusted",
    });

    expect(event.redacted).toBe(false);
    expect(event.sourceTrust).toBe("untrusted");
  });

  it("models Event Storage push sync with per-event outcomes", () => {
    const event = eventEnvelopeSchema.parse({
      id: "event_sync_1",
      sessionId: "session_1",
      type: "conversation.message.created",
      payload: { contentLength: 12, redaction: "applied" },
      createdAt: "2026-05-24T00:00:00.000Z",
      source: "desktop",
      sourceTrust: "trusted",
      redacted: true,
    });
    const request = eventSyncPushRequestSchema.parse({
      id: "event_sync_request_1",
      clientId: "client_macbook",
      sessionId: "session_1",
      events: [event],
      idempotencyKey: "client_macbook:session_1:event_sync_1",
      createdAt: event.createdAt,
    });
    const response = eventSyncPushResponseSchema.parse({
      id: "event_sync_response_1",
      requestId: request.id,
      sessionId: request.sessionId,
      serverRevision: 1,
      accepted: 1,
      duplicates: 0,
      conflicts: 0,
      failed: 0,
      results: [{ eventId: event.id, status: "accepted", serverRevision: 1 }],
      createdAt: event.createdAt,
    });

    expect(response.accepted).toBe(1);
    expect(response.results[0]?.status).toBe("accepted");
  });

  it("models Event Storage session index responses", () => {
    const index = eventStorageSessionIndexResponseSchema.parse({
      serverRevision: 3,
      createdAt: "2026-05-24T00:00:00.000Z",
      sessions: [
        {
          sessionId: "session_desktop_001",
          title: "Desktop Workbench",
          createdByClient: "client_macbook",
          eventCount: 2,
          firstEventAt: "2026-05-24T00:00:00.000Z",
          lastEventAt: "2026-05-24T00:00:03.000Z",
          lastEventType: "coding_packet.created",
          sources: ["desktop", "agent"],
          sourceTrust: ["trusted"],
        },
      ],
    });

    expect(index.sessions[0]?.sessionId).toBe("session_desktop_001");
    expect(index.sessions[0]?.title).toBe("Desktop Workbench");
    expect(index.sessions[0]?.sources).toContain("desktop");
  });

  it("separates client offline queues from DGX-02 authority", () => {
    const macbook = {
      id: "client_macbook",
      label: "MacBook",
      kind: "macbook" as const,
      status: "online" as const,
      syncRole: "cache_client" as const,
      localStore: "sqlite" as const,
      outboxMode: "offline_cache_outbox" as const,
      failurePolicy: "continue_locally" as const,
      outboxCount: 2,
    };
    const homePc = {
      id: "client_home_pc",
      label: "Home PC",
      kind: "desktop_pc" as const,
      status: "online" as const,
      syncRole: "cache_client" as const,
      localStore: "sqlite" as const,
      outboxMode: "offline_cache_outbox" as const,
      failurePolicy: "unavailable_without_dgx" as const,
      outboxCount: 0,
    };

    expect(macbook.outboxMode).toBe("offline_cache_outbox");
    expect(homePc.failurePolicy).toBe("unavailable_without_dgx");
    expect(homePc.outboxCount).toBe(0);
  });

  it("models remote execution without raw command execution", () => {
    const request: RemoteExecutionRequest = {
      id: "remote_request_1",
      runId: "run_1",
      kind: "workspace_run",
      targetNodeId: "dgx-02",
      commandPreview: "pnpm test",
      approvalState: "required",
      createdAt: "2026-05-24T00:00:00.000Z",
    };
    const response: RemoteExecutionResponse = {
      id: "remote_response_1",
      requestId: request.id,
      status: "blocked",
      targetNodeId: request.targetNodeId,
      fallbackMode: "local_cli",
      message: "approval required before remote execution",
      createdAt: request.createdAt,
    };

    expect(response.status).toBe("blocked");
    expect(response.fallbackMode).toBe("local_cli");
  });

  it("models provider completion through the DGX server proxy", () => {
    const request: ProviderCompletionRequest = {
      id: "provider_completion_request_1",
      sessionId: "session_1",
      providerProfileId: "provider_dgx02_vllm",
      modelId: "qwen36-gio-wiki-rag-prisma",
      messages: [{ role: "user", content: "Reply OK only" }],
      source: "desktop",
      routePreference: "server_proxy",
      createdAt: "2026-05-24T00:00:00.000Z",
    };
    const response: ProviderCompletionResponse = {
      id: "provider_completion_response_1",
      requestId: request.id,
      providerProfileId: request.providerProfileId,
      modelId: request.modelId,
      route: "server_proxy",
      status: "succeeded",
      content: "OK",
      endpoint: "dgx-02:4317/provider-completions",
      usage: { inputTokens: 12, outputTokens: 2, totalTokens: 14 },
      createdAt: request.createdAt,
    };

    expect(request.routePreference).toBe("server_proxy");
    expect(response.route).toBe("server_proxy");
    expect(JSON.stringify(request)).not.toContain("http://dgx-02:8001");
  });

  it("models DGX provider registry sources without raw API keys", () => {
    const registry: ProviderRegistrySnapshot = {
      id: "provider_registry_1",
      authorityNodeId: "dgx-02",
      entries: [
        {
          providerProfileId: "provider_apifun_claude",
          name: "APIKey.fun Claude A",
          kind: "anthropic",
          baseUrl: "https://api.apikey.fun",
          trustLevel: "untrusted",
          tags: ["dgx-secret-ref", "server-proxy", "apikey.fun", "reseller"],
          defaultModelIds: ["claude-opus-4-6"],
          selectedModelId: "claude-opus-4-6",
          supportsModelList: false,
          apiStyle: "anthropic_messages",
          authMode: "dgx_secret_ref",
          secretAvailability: "available",
          secretRefPreview: "dgx-02:ANTHROPIC_API_KEY",
          secretSourceRefs: ["env:ANTHROPIC_API_KEY", "file:~/openclaws/2/env"],
          updatedAt: "2026-05-24T00:00:00.000Z",
        },
      ],
      summary: {
        total: 1,
        ready: 1,
        missingSecrets: 0,
        dgxVaultBacked: 1,
        oauthSessions: 0,
        noAuth: 0,
      },
      rawSecretPersisted: false,
      createdAt: "2026-05-24T00:00:00.000Z",
    };

    expect(registry.entries[0]?.name).toBe("APIKey.fun Claude A");
    expect(registry.entries[0]?.secretSourceRefs).toContain("env:ANTHROPIC_API_KEY");
    expect(JSON.stringify(registry)).not.toContain("sk-");
  });

  it("models memory recall policy and trace visibility", () => {
    const trace: MemoryTrace = {
      id: "memory_trace_1",
      sessionId: "session_1",
      query: "DGX local fallback",
      createdAt: "2026-05-24T00:00:00.000Z",
      policy: {
        providerProfileId: "provider_reseller",
        providerTrustLevel: "untrusted",
        autoRecallAllowed: false,
        blockedLayers: ["project_memory", "user_memory"],
        reason: "untrusted provider blocks project/user memory auto recall",
      },
      results: [
        {
          record: {
            id: "memory_1",
            layer: "project_memory",
            title: "DGX authority",
            content: "DGX-02 owns the server event store.",
            sourceChannel: "desktop",
            trustLevel: "trusted",
            createdAt: "2026-05-24T00:00:00.000Z",
            pinned: true,
          },
          score: 0.92,
          usedInDecision: false,
          reason: "blocked by provider trust policy",
        },
      ],
    };

    expect(trace.policy.blockedLayers).toContain("project_memory");
    expect(trace.results[0]?.usedInDecision).toBe(false);
  });

  it("models backup projection artifacts and mobile restrictions", () => {
    const artifact: BackupProjectionArtifact = {
      id: "backup_artifact_1",
      sessionId: "session_1",
      target: "obsidian",
      kind: "session_log",
      format: "markdown",
      title: "Session Log",
      destination: "AI-Orchestrator/projects/lab/sessions/session_1.md",
      redactionApplied: true,
      status: "ready",
      byteLength: 512,
      createdAt: "2026-05-24T00:00:00.000Z",
      contentPreview: "# Session",
    };
    const mobilePolicy: MobileActionPolicy = {
      canRead: true,
      canApprove: true,
      canStop: true,
      canRetry: true,
      canTypeTerminal: false,
      canViewSecrets: false,
      canMergeOrPush: false,
    };

    expect(artifact.redactionApplied).toBe(true);
    expect(mobilePolicy.canTypeTerminal).toBe(false);
    expect(mobilePolicy.canViewSecrets).toBe(false);
  });

  it("models guarded external ingress before session handoff", () => {
    const result: IngressGuardResult = {
      id: "ingress_result_1",
      inputId: "telegram_input_1",
      accepted: true,
      earlyReturn: false,
      confidence: "low",
      approvalState: "required",
      reason: "external command requests terminal execution",
      createdAt: "2026-05-24T00:00:00.000Z",
      guardSteps: [
        {
          name: "shape_unification",
          status: "passed",
          reason: "payload normalized",
        },
        {
          name: "pii_secret_block",
          status: "queued",
          reason: "approval required before secret or terminal handling",
        },
      ],
      normalizedEvent: {
        id: "ingress_event_1",
        channel: "legacy_telegram",
        source: "legacy_telegram",
        sourceTrust: "untrusted",
        authorType: "user",
        rawText: "run pnpm test",
        normalizedText: "run pnpm test",
        eventType: "message",
        requestedPermissions: ["run_safe_commands"],
        confidence: "low",
        requiresApproval: true,
        redacted: false,
        createdAt: "2026-05-24T00:00:00.000Z",
      },
    };

    expect(result.normalizedEvent?.sourceTrust).toBe("untrusted");
    expect(result.approvalState).toBe("required");
    expect(result.guardSteps.some((step) => step.name === "pii_secret_block")).toBe(true);
  });

  it("models permission matrix decisions and approval queue", () => {
    const snapshot: PermissionMatrixSnapshot = {
      id: "permission_snapshot_1",
      sessionId: "session_1",
      createdAt: "2026-05-24T00:00:00.000Z",
      summary: {
        allowed: 1,
        pending: 1,
        approved: 0,
        denied: 1,
      },
      items: [
        {
          id: "permission_external_1",
          sessionId: "session_1",
          subjectId: "ingress_event_1",
          actor: "external_channel",
          channel: "legacy_telegram",
          sourceTrust: "untrusted",
          action: "terminal_run",
          requestedLevels: ["run_safe_commands"],
          state: "required",
          decision: "approval_required",
          reason: "external command waits for approval",
          createdAt: "2026-05-24T00:00:00.000Z",
        },
        {
          id: "permission_mobile_secret",
          sessionId: "session_1",
          subjectId: "mobile_dashboard",
          actor: "mobile",
          channel: "mobile",
          sourceTrust: "limited",
          action: "secret_view",
          requestedLevels: ["secret_access"],
          state: "rejected",
          decision: "deny",
          reason: "phone cannot view raw secrets",
          createdAt: "2026-05-24T00:00:00.000Z",
        },
      ],
      queue: [
        {
          id: "queue_permission_external_1",
          sourceItemId: "permission_external_1",
          summary: "terminal_run from external_channel",
          requestedBy: "external_channel",
          permissions: ["run_safe_commands"],
          state: "required",
          createdAt: "2026-05-24T00:00:00.000Z",
        },
      ],
    };

    expect(snapshot.queue[0]?.permissions).toContain("run_safe_commands");
    expect(snapshot.items[1]?.decision).toBe("deny");
  });

  it("models future tmux execution slots without allowing raw execution", () => {
    const agentSession = agentSessionSchema.parse({
      id: "agent_session_architect",
      sessionId: "session_1",
      role: "architect",
      backend: "tmux",
      paneId: "%4",
      status: "planned",
      createdAt: "2026-05-24T00:00:00.000Z",
    });
    const slot = executionSlotSchema.parse({
      id: "slot_architect",
      sessionId: "session_1",
      label: "Agent - Architect",
      role: "architect",
      backend: "ui_stub",
      status: "placeholder",
      approvalState: "required",
      requestedPermissions: ["run_safe_commands", "write_files"],
      commandPreview: "codex 'Review packages/protocol'",
      decisionRequired: true,
      blockedReason: "real tmux execution is gated until Event Store and Permission Matrix are stable",
      createdAt: "2026-05-24T00:00:00.000Z",
    });
    const requested: RunRequestedEventPayload = {
      runId: "run_1",
      sessionId: "session_1",
      executionSlotId: slot.id,
      requestedBy: "agent",
      backend: "tmux",
      commandPreview: slot.commandPreview ?? "",
      requestedPermissions: slot.requestedPermissions,
      approvalState: slot.approvalState,
      redactionApplied: true,
    };
    const completed: RunCompletedEventPayload = {
      runId: "run_1",
      executionSlotId: slot.id,
      status: "blocked",
      outputPreview: "permission required",
      redactionApplied: true,
    };

    expect(agentSession.role).toBe("architect");
    expect(slot.status).toBe("placeholder");
    expect(requested.redactionApplied).toBe(true);
    expect(completed.status).toBe("blocked");
  });

  it("uses narrow work source references for manual and legacy ingress", () => {
    const source: WorkSourceRef = {
      source: "legacy_telegram",
      externalId: "telegram_input_1",
      observedAt: "2026-05-24T00:00:00.000Z",
      contentHash: "sha256:demo",
    };

    expect(workSourceSchema.parse(source.source)).toBe("legacy_telegram");
    expect(() => workSourceSchema.parse("telegram")).toThrow();
  });

  it("models work items without storing raw SSOT evidence bodies", () => {
    const evidence = evidenceRefSchema.parse({
      id: "evidence_ssot_1",
      kind: "ssot_reference",
      reference: "linear://AI-123",
      title: "Provider policy",
      summary: "Provider keys must not be persisted raw.",
      contentHash: "sha256:policy",
      revision: "rev-7",
      observedAt: "2026-05-24T00:00:00.000Z",
    });
    const item = workItemSchema.parse({
      id: "work_item_1",
      sessionId: "session_1",
      title: "Review provider credential flow",
      kind: "review",
      lane: "review",
      status: "triaged",
      summary: "Check provider profile handling before live calls.",
      sourceRefs: [
        {
          source: "desktop_manual",
          observedAt: "2026-05-24T00:00:00.000Z",
        },
      ],
      evidenceRefs: [evidence],
      missingInfo: [
        {
          id: "missing_1",
          label: "DGX vault path",
          reason: "Needed before real secret persistence",
          required: true,
          status: "missing",
        },
      ],
      createdAt: "2026-05-24T00:00:00.000Z",
    });

    expect(item.priority).toBe("normal");
    expect(item.evidenceRefs[0]?.summary).toContain("Provider keys");
    expect(() =>
      evidenceRefSchema.parse({
        id: "bad_evidence",
        kind: "ssot_reference",
        reference: "linear://AI-999",
        summary: "should reject raw body",
        rawBody: "full SSOT body must not be stored here",
      }),
    ).toThrow();
  });

  it("models assistant drafts and handoffs to target surfaces", () => {
    const evidence = {
      id: "evidence_event_1",
      kind: "event" as const,
      reference: "event://event_1",
      summary: "User asked to create a coding packet.",
    };
    const missingInfo = {
      id: "missing_approval",
      label: "Operator approval",
      reason: "External send target requires approval",
      required: true,
      status: "missing" as const,
    };
    const draft = assistantDraftSchema.parse({
      id: "draft_1",
      workItemId: "work_item_1",
      sessionId: "session_1",
      title: "Customer reply draft",
      body: "I will check this and follow up.",
      targetSurface: "conversation",
      status: "ready_for_review",
      confidence: "medium",
      evidenceRefs: [evidence],
      missingInfo: [missingInfo],
      createdAt: "2026-05-24T00:00:00.000Z",
    });
    const handoff = workItemHandoffSchema.parse({
      id: "handoff_1",
      workItemId: draft.workItemId,
      targetSurface: "coding_packet",
      summary: "Convert reviewed decision into a coding packet.",
      payloadRef: "coding_packet://packet_1",
      evidenceRefs: [evidence],
      missingInfo: [],
      approvalState: "required",
      createdAt: "2026-05-24T00:00:00.000Z",
    });

    expect(draft.status).toBe("ready_for_review");
    expect(handoff.targetSurface).toBe("coding_packet");
    expect(handoff.approvalState).toBe("required");
  });

  it("models tmux terminal sessions, panes, command intents and captured output", () => {
    const tmuxSession = tmuxSessionRefSchema.parse({
      id: "terminal_session_ai_swarm",
      sessionName: "ai-swarm",
      host: "local_mac",
      backend: "tmux",
      attachCommand: "tmux attach -t ai-swarm",
      controlMode: false,
      paneCount: 10,
      createdAt: "2026-05-24T00:00:00.000Z",
      status: "detached",
    });
    const pane = terminalPaneSchema.parse({
      id: "terminal_pane_research",
      sessionId: "session_1",
      terminalSessionId: tmuxSession.id,
      role: "research",
      host: "local_mac",
      paneId: "%8",
      title: "Agent - Research Scout",
      status: "idle",
      createdAt: "2026-05-24T00:00:00.000Z",
    });
    const intent = terminalCommandIntentSchema.parse({
      id: "terminal_intent_1",
      sessionId: "session_1",
      terminalSessionId: tmuxSession.id,
      paneId: pane.paneId,
      requestedBy: "agent",
      commandPreview: "codex 'Read tmux docs and summarize'",
      redactedCommandPreview: "codex 'Read tmux docs and summarize'",
      requestedPermissions: ["run_safe_commands", "network_access"],
      approvalState: "required",
      dispatchState: "pending_approval",
      createdAt: "2026-05-24T00:00:00.000Z",
    });
    const captured: TerminalPaneOutputCapturedEventPayload = {
      terminalSessionId: tmuxSession.id,
      paneId: pane.paneId,
      role: pane.role,
      outputPreview: "[REDACTED:api_key] captured from pane",
      lineCount: 20,
      redactionApplied: true,
      capturedAt: "2026-05-24T00:00:00.000Z",
    };

    expect(tmuxSession.paneCount).toBe(10);
    expect(pane.role).toBe("research");
    expect(intent.dispatchState).toBe("pending_approval");
    expect(captured.redactionApplied).toBe(true);
  });

  it("models provider credential parsing and model discovery without raw keys", () => {
    const parse: ProviderCredentialParseResult = {
      id: "provider_parse_1",
      format: "claude_code_settings_json",
      providerKind: "anthropic",
      profileName: "Claude Code 호환 프로파일",
      baseUrl: "https://api.apikey.fun",
      secretRef: {
        id: "secret_1",
        label: "session secret",
        scope: "session",
        redactedPreview: "sk-...42f0",
        transient: true,
      },
      defaultModel: "claude-code-compatible",
      tags: ["claude_code_settings_json", "untrusted"],
      trustLevel: "untrusted",
      warnings: ["custom or reseller endpoint blocks automatic sensitive memory recall"],
      createdAt: "2026-05-24T00:00:00.000Z",
    };
    const discovery: ModelDiscoverySnapshot = {
      id: "model_discovery_1",
      providerProfileId: "provider_1",
      status: "succeeded",
      source: "remote_stub",
      selectedModelId: "claude-code-compatible",
      redactionApplied: true,
      warnings: ["remote model list is a stub until trusted"],
      createdAt: "2026-05-24T00:00:00.000Z",
      models: [
        {
          id: "claude-code-compatible",
          name: "claude-code-compatible",
          providerProfileId: "provider_1",
          supportsStreaming: true,
          supportsTools: true,
          tags: ["anthropic", "untrusted"],
        },
      ],
    };

    expect(parse.secretRef?.redactedPreview).toBe("sk-...42f0");
    expect(JSON.stringify(parse)).not.toContain("sk-bf59");
    expect(discovery.models[0]?.providerProfileId).toBe("provider_1");
  });

  it("models secret vault and provider runtime readiness", () => {
    const vault: SecretVaultSnapshot = {
      id: "secret_vault_1",
      rawSecretPersisted: false,
      createdAt: "2026-05-24T00:00:00.000Z",
      summary: {
        available: 1,
        missing: 1,
        transient: 1,
        keychainReady: 0,
        dgxVaultReady: 0,
      },
      entries: [
        {
          id: "vault_entry_1",
          providerProfileId: "provider_reseller",
          secretRefId: "secret_1",
          storage: "session_memory",
          availability: "available",
          redactedPreview: "sk-...42f0",
          transient: true,
          createdAt: "2026-05-24T00:00:00.000Z",
        },
      ],
    };
    const readiness: ProviderRuntimeReadiness = {
      id: "provider_readiness_1",
      providerProfileId: "provider_reseller",
      status: "needs_approval",
      executionMode: "remote",
      modelCount: 4,
      selectedModelId: "claude-code-compatible",
      secretAvailability: "available",
      canRunCompletion: true,
      canUseAutomaticMemory: false,
      reason: "untrusted provider can run only after explicit approval and reduced memory context",
      warnings: ["automatic project/user memory recall is blocked for this provider"],
      createdAt: "2026-05-24T00:00:00.000Z",
    };

    expect(vault.rawSecretPersisted).toBe(false);
    expect(vault.entries[0]?.storage).toBe("session_memory");
    expect(readiness.canUseAutomaticMemory).toBe(false);
    expect(readiness.status).toBe("needs_approval");
  });
});
