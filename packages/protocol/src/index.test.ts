import { describe, expect, it } from "vitest";
import {
  agentProfileSchema,
  conversationSessionSchema,
  agentDelegationDetectedPayloadSchema,
  agentDelegationDispatchedPayloadSchema,
  agentDelegationEventTypeSchema,
  agentDelegationFollowupCompletedPayloadSchema,
  agentDelegationSucceededPayloadSchema,
  agentDelegationAuthorityLevelSchema,
  agentDelegationCompletionRouteSchema,
  agentDelegationBasePayloadSchema,
  agentDelegationBlockedPayloadSchema,
  agentDelegationSelfBlockedPayloadSchema,
  agentDelegationUnknownTargetPayloadSchema,
  agentDelegationEventPayloadSchemaByType,
  agentSessionSchema,
  agentSessionStatusSchema,
  tmuxPaneRoleSchema,
  approvalDecisionRequestSchema,
  approvalRequestSchema,
  approvalReplayKindSchema,
  approvalReplayRequestSchema,
  approvalStateSchema,
  permissionActionSchema,
  permissionActorSchema,
  permissionDecisionSchema,
  permissionLevelSchema,
  permissionRequestSchema,
  assistantDraftSchema,
  codingPacketSchema,
  debateRoundSchema,
  evidenceRefSchema,
  eventEnvelopeSchema,
  eventStorageSessionIndexResponseSchema,
  eventSyncStatusSchema,
  eventSyncItemResultSchema,
  eventSyncPushRequestSchema,
  eventSyncPushResponseSchema,
  eventSyncPullResponseSchema,
  executionSlotSchema,
  executionRuntimeBackendSchema,
  executionSlotStatusSchema,
  remoteExecutionKindSchema,
  remoteExecutionRequestSchema,
  operatorCockpitHandoffSchema,
  operatorCockpitWorkerStatusSchema,
  operatorCockpitWorkerFleetSchema,
  operatorCockpitApprovalEvidenceSchema,
  operatorCockpitMemoryRecallSchema,
  operatorCockpitProviderRoutingSchema,
  operatorCockpitRecoverySchema,
  operatorCockpitDispatchHistorySchema,
  operatorCockpitSnapshotSchema,
  parseAgentDelegationEventPayload,
  projectAgentDelegationTimeline,
  providerCompletionRequestSchema,
  providerProfileSchema,
  providerKindSchema,
  providerTrustLevelSchema,
  secretRefSchema,
  modelDescriptorSchema,
  modelInputModalitySchema,
  redactionRuleSchema,
  redactionPhaseSchema,
  redactionRuleScopeSchema,
  eventSourceSchema,
  sourceTrustSchema,
  parseTerminalCommandEventPayload,
  terminalCommandIntentSchema,
  terminalCommandEventTypeSchema,
  terminalPaneSchema,
  terminalPaneTimelineSchema,
  tmuxSessionRefSchema,
  workLaneSchema,
  workItemHandoffSchema,
  workItemKindSchema,
  workItemSchema,
  workSurfaceSchema,
  workSourceSchema,
  type BackupProjectionArtifact,
  type CodingPacket,
  type EventEnvelope,
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

  it("parses provider completion request context for single-owner routes", () => {
    const request = providerCompletionRequestSchema.parse({
      id: "req_single_owner",
      sessionId: "session_single_owner",
      providerProfileId: "provider_claude_code_single_owner",
      modelId: "claude-cli-session",
      messages: [{ role: "user", content: "review this" }],
      source: "desktop",
      routePreference: "server_proxy",
      requestContext: {
        userId: "owner-robin",
        routeType: "trusted_remote_device",
        trustedDeviceId: "tailscale-laptop",
        humanInitiated: true,
      },
      createdAt: "2026-05-28T00:00:00.000Z",
    });

    expect(request.requestContext?.routeType).toBe("trusted_remote_device");
    expect(request.requestContext?.userId).toBe("owner-robin");
  });

  it("tracks debate provenance without forcing UI-specific layout", () => {
    const round = debateRoundSchema.parse({
      id: "round_critique",
      debateId: "debate_1",
      kind: "cross_critique",
      title: "상호 비판",
      status: "completed",
      utterances: [
        {
          id: "utterance_architect_1",
          agentId: "agent_architect",
          roundId: "round_initial",
          content: "Event Storage를 먼저 고정하자.",
          tags: ["evidence", "coding_impact"],
          acceptedBy: ["utterance_orchestrator_2"],
          decisionId: "decision_event_storage_first",
          evidenceRefIds: ["evidence_docs_13"],
          createdAt: "2026-05-26T00:00:00.000Z",
        },
        {
          id: "utterance_reviewer_1",
          agentId: "agent_reviewer",
          roundId: "round_critique",
          parentUtteranceId: "utterance_architect_1",
          content: "동의하지만 outbox race를 먼저 막아야 한다.",
          tags: ["objection", "risk"],
          rejectedBy: ["utterance_orchestrator_2"],
          codingImpactRefs: ["coding_packet.verificationPlan"],
          createdAt: "2026-05-26T00:01:00.000Z",
        },
      ],
    });

    expect(round.utterances[0]?.acceptedBy).toEqual(["utterance_orchestrator_2"]);
    expect(round.utterances[1]?.parentUtteranceId).toBe("utterance_architect_1");
    expect(round.utterances[1]?.codingImpactRefs).toEqual(["coding_packet.verificationPlan"]);
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

  it("persists multi-persona selection metadata on agent profiles and sessions", () => {
    const agent = agentProfileSchema.parse({
      id: "agent_skeptic_yohane",
      name: "츠시마 요시코",
      kind: "virtual",
      role: "skeptic",
      soulMode: "summary",
      configSource: "markdown",
      enabled: true,
      personaName: "yohane",
      isCanonical: false,
      isDefault: true,
      priority: 75,
    });

    expect(agent.isDefault).toBe(true);
    expect(agent.priority).toBe(75);

    const session = conversationSessionSchema.parse({
      id: "session_1",
      mode: "conversation",
      channel: "desktop",
      primaryAgentId: "agent_orchestrator",
      messages: [],
      linkedRuns: [],
      linkedDebates: [],
      memoryTraceIds: [],
      backupStatus: "pending",
      activePersonaOverrides: { skeptic: "agent_skeptic_yohane" },
      rolePersonaPriorities: { skeptic: ["agent_skeptic_yohane", "agent_skeptic_asuka"] },
      allowMultiPersonaRoles: ["skeptic"],
    });

    expect(session.activePersonaOverrides?.skeptic).toBe("agent_skeptic_yohane");
    expect(session.rolePersonaPriorities?.skeptic).toEqual(["agent_skeptic_yohane", "agent_skeptic_asuka"]);
    expect(session.allowMultiPersonaRoles).toEqual(["skeptic"]);
  });

  it("requires a source trust level for persisted events", () => {
    const event = eventEnvelopeSchema.parse({
      id: "event_1",
      sessionId: "session_1",
      type: "conversation.message.created",
      payload: { text: "토론으로 돌려봐" },
      createdAt: new Date("2026-05-24T00:00:00.000Z").toISOString(),
      source: "external_legacy",
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

  it("validates delegation event payloads for companion sub-agent routing", () => {
    const detected = agentDelegationDetectedPayloadSchema.parse({
      sourceAgentId: "agent_kurumi",
      sourceAgentName: "쿠루미",
      sourceRole: "companion",
      sourcePersonaName: "kurumi",
      authorityLevel: "orchestrator_plus",
      targets: ["researcher", "executor"],
      count: 2,
      depthLimit: 1,
    });
    const dispatched = agentDelegationDispatchedPayloadSchema.parse({
      sourceAgentId: "agent_kurumi",
      sourceAgentName: "쿠루미",
      targetAgentId: "agent_maomao",
      targetAgentName: "Maomao",
      targetRole: "researcher",
      targetPersonaName: "maomao",
      providerProfileId: "provider_codex_oauth",
      modelId: "codex-session",
      promptLength: 88,
      authorityLevel: "orchestrator_plus",
      depthLimit: 1,
    });
    const succeeded = agentDelegationSucceededPayloadSchema.parse({
      sourceAgentId: "agent_kurumi",
      targetAgentId: "agent_maomao",
      targetAgentName: "Maomao",
      targetRole: "researcher",
      providerProfileId: "provider_codex_oauth",
      modelId: "codex-session",
      responseLength: 240,
      route: "server_proxy",
      realProviderCall: true,
    });
    const followup = agentDelegationFollowupCompletedPayloadSchema.parse({
      sourceAgentId: "agent_kurumi",
      sourceAgentName: "쿠루미",
      outcomeCount: 2,
      succeededCount: 1,
      blockedCount: 1,
      responseLength: 420,
    });

    const envelope = eventEnvelopeSchema.parse({
      id: "event_delegation_dispatched_1",
      sessionId: "session_desktop_001",
      type: agentDelegationEventTypeSchema.parse("agent.delegation.dispatched"),
      payload: dispatched,
      createdAt: "2026-05-25T00:00:00.000Z",
      source: "desktop",
      sourceTrust: "trusted",
      redacted: true,
    });
    const parsedPayload = parseAgentDelegationEventPayload("agent.delegation.dispatched", envelope.payload);

    expect(detected.authorityLevel).toBe("orchestrator_plus");
    expect(succeeded.route).toBe("server_proxy");
    expect(followup.blockedCount).toBe(1);
    expect(parsedPayload).toEqual(dispatched);
  });

  it("projects delegation events into a reusable timeline", () => {
    const baseEvent = {
      sessionId: "session_desktop_001",
      source: "desktop" as const,
      sourceTrust: "trusted" as const,
      redacted: true,
    };
    const delegationEvent = (input: unknown) => eventEnvelopeSchema.parse(input) as EventEnvelope;
    const events: EventEnvelope[] = [
      delegationEvent({
        ...baseEvent,
        id: "event_detected",
        type: "agent.delegation.detected",
        payload: {
          sourceAgentId: "agent_kurumi",
          sourceAgentName: "쿠루미",
          sourceRole: "companion",
          sourcePersonaName: "kurumi",
          authorityLevel: "orchestrator_plus",
          targets: ["researcher", "ghost"],
          count: 2,
          depthLimit: 1,
        },
        createdAt: "2026-05-25T00:00:00.000Z",
      }),
      delegationEvent({
        ...baseEvent,
        id: "event_unknown",
        type: "agent.delegation.unknown_target",
        payload: {
          sourceAgentId: "agent_kurumi",
          target: "ghost",
          promptLength: 12,
        },
        createdAt: "2026-05-25T00:00:01.000Z",
      }),
      delegationEvent({
        ...baseEvent,
        id: "event_dispatch",
        type: "agent.delegation.dispatched",
        payload: {
          sourceAgentId: "agent_kurumi",
          sourceAgentName: "쿠루미",
          targetAgentId: "agent_maomao",
          targetAgentName: "Maomao",
          targetRole: "researcher",
          targetPersonaName: "maomao",
          providerProfileId: "provider_codex_oauth",
          modelId: "codex-session",
          promptLength: 88,
          authorityLevel: "orchestrator_plus",
          depthLimit: 1,
        },
        createdAt: "2026-05-25T00:00:02.000Z",
      }),
      delegationEvent({
        ...baseEvent,
        id: "event_success",
        type: "agent.delegation.succeeded",
        payload: {
          sourceAgentId: "agent_kurumi",
          targetAgentId: "agent_maomao",
          targetAgentName: "Maomao",
          targetRole: "researcher",
          providerProfileId: "provider_codex_oauth",
          modelId: "codex-session",
          responseLength: 240,
          route: "server_proxy",
          realProviderCall: true,
        },
        createdAt: "2026-05-25T00:00:03.000Z",
      }),
      delegationEvent({
        ...baseEvent,
        id: "event_followup",
        type: "agent.delegation.followup.completed",
        payload: {
          sourceAgentId: "agent_kurumi",
          sourceAgentName: "쿠루미",
          outcomeCount: 2,
          succeededCount: 1,
          blockedCount: 1,
          responseLength: 420,
        },
        createdAt: "2026-05-25T00:00:04.000Z",
      }),
    ];

    const projection = projectAgentDelegationTimeline(events);
    const maomao = projection.items.find((item) => item.targetAgentId === "agent_maomao");
    const ghost = projection.items.find((item) => item.target === "ghost");

    expect(projection.summary).toMatchObject({
      blocked: 1,
      failed: 0,
      inFlight: 0,
      pending: 0,
      succeeded: 1,
      total: 2,
    });
    expect(maomao).toMatchObject({
      authorityLevel: "orchestrator_plus",
      eventIds: ["event_detected", "event_dispatch", "event_success"],
      providerProfileId: "provider_codex_oauth",
      route: "server_proxy",
      status: "succeeded",
      targetRole: "researcher",
    });
    expect(ghost).toMatchObject({
      eventIds: ["event_detected", "event_unknown"],
      reason: "unknown delegation target",
      status: "unknown_target",
    });
    expect(projection.followups[0]).toMatchObject({
      eventId: "event_followup",
      status: "completed",
      succeededCount: 1,
    });
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
      modelId: "qwen36-gio-lora-v5-prisma",
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
      inputId: "external_ingress_input_1",
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
        channel: "external_legacy",
        source: "external_legacy",
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
          channel: "external_legacy",
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
          action: "terminal_run",
          reason: "external command waits for approval",
          sourceTrust: "untrusted",
          permissions: ["run_safe_commands"],
          state: "required",
          createdAt: "2026-05-24T00:00:00.000Z",
        },
      ],
    };

    expect(snapshot.queue[0]?.permissions).toContain("run_safe_commands");
    expect(snapshot.queue[0]?.action).toBe("terminal_run");
    expect(snapshot.queue[0]?.sourceTrust).toBe("untrusted");
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
      source: "external_legacy",
      externalId: "external_ingress_input_1",
      observedAt: "2026-05-24T00:00:00.000Z",
      contentHash: "sha256:demo",
    };

    expect(workSourceSchema.parse(source.source)).toBe("external_legacy");
    expect(() => workSourceSchema.parse("external")).toThrow();
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
      kind: "internal_coord",
      lane: "check",
      status: "triaged",
      summary: "Check provider profile handling before live calls.",
      surface: "conversation",
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
    expect(item.surface).toBe("conversation");
    expect(item.evidenceRefs[0]?.summary).toContain("Provider keys");
    expect(() => workLaneSchema.parse("review")).toThrow();
    expect(() => workItemKindSchema.parse("coding_packet")).toThrow();
    expect(workSurfaceSchema.parse("coding_packet")).toBe("coding_packet");
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

  it("keeps operator cockpit handoff routing metadata for executable CTAs", () => {
    const parsed = operatorCockpitHandoffSchema.parse({
      id: "handoff_packet_1",
      ownerAgentId: "agent_executor",
      nextAction: "코딩 패킷 실행 슬롯 인계",
      targetSurface: "execution_slot",
      payloadRef: "coding_packet://session_desktop_001",
      approvalState: "required",
      missingInfoSlots: [],
      evidenceRefs: [],
    });

    expect(parsed).toMatchObject({
      id: "handoff_packet_1",
      targetSurface: "execution_slot",
      payloadRef: "coding_packet://session_desktop_001",
      approvalState: "required",
    });
  });

  it("supports PR1 assistant inbox routing without broad source sprawl", () => {
    const askItem = workItemSchema.parse({
      id: "work_item_ask_1",
      sessionId: "session_1",
      title: "Ask for missing lead time",
      kind: "lead_time",
      lane: "ask",
      status: "waiting_input",
      summary: "Need confirmed lead time before sending an external reply.",
      sourceRefs: [
        {
          source: "desktop_manual",
          observedAt: "2026-05-24T00:00:00.000Z",
          contentHash: "sha256:lead-time-request",
        },
      ],
      evidenceRefs: [
        {
          id: "evidence_previous_answer_1",
          kind: "event",
          reference: "event://message_1",
          summary: "Customer asked for delivery timing; no raw message body is stored.",
          observedAt: "2026-05-24T00:00:00.000Z",
        },
      ],
      missingInfo: [
        {
          id: "missing_lead_time",
          label: "Lead time",
          reason: "Required before external send",
          required: true,
          status: "missing",
        },
      ],
      createdAt: "2026-05-24T00:00:00.000Z",
    });

    expect(askItem.lane).toBe("ask");
    expect(askItem.status).toBe("waiting_input");
    expect(askItem.kind).toBe("lead_time");
    expect(workSourceSchema.options).toEqual(["desktop_manual", "mobile_manual", "external_legacy"]);
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

  it("validates tmux command audit events before persistence", () => {
    const base = {
      intentId: "terminal_intent_1",
      terminalSessionId: "terminal_session_ai_swarm",
      paneId: "%8",
      role: "research",
      host: "local_mac",
    };
    const intent = terminalCommandIntentSchema.parse({
      id: base.intentId,
      sessionId: "session_1",
      terminalSessionId: base.terminalSessionId,
      paneId: base.paneId,
      requestedBy: "agent",
      commandPreview: "codex 'dry run this'",
      redactedCommandPreview: "codex 'dry run this'",
      requestedPermissions: ["run_safe_commands"],
      approvalState: "approved",
      dispatchState: "dry_run",
      createdAt: "2026-05-24T00:00:00.000Z",
    });
    const cases = [
      {
        type: "terminal.command.intent.created",
        payload: {
          intent,
          role: "research",
          host: "local_mac",
          tmuxSessionName: "ai-swarm",
          rawCommandQuarantined: true,
        },
      },
      {
        type: "terminal.command.blocked",
        payload: {
          ...base,
          reason: "approval required",
          redactedCommandPreview: "codex 'dry run this'",
        },
      },
      {
        type: "terminal.command.dry_run",
        payload: {
          ...base,
          reason: "dry run",
          attempted: false,
          redactedCommandPreview: "codex 'dry run this'",
        },
      },
      {
        type: "terminal.command.sent",
        payload: {
          ...base,
          stdoutPreview: "ok",
          stderrPreview: "",
        },
      },
      {
        type: "terminal.command.failed",
        payload: {
          ...base,
          reason: "script failed",
          stdoutPreview: "",
          stderrPreview: "no tmux",
        },
      },
    ] as const;

    for (const event of cases) {
      const type = terminalCommandEventTypeSchema.parse(event.type);
      expect(() => parseTerminalCommandEventPayload(type, event.payload)).not.toThrow();
    }
  });

  it("models tmux pane timelines as blocks before real execution", () => {
    const timeline = terminalPaneTimelineSchema.parse({
      id: "timeline_frontend_pane",
      sessionId: "session_tmux",
      terminalSessionId: "terminal_session_ai_swarm",
      paneId: "%5",
      role: "frontend",
      host: "dgx_02",
      lastBlockId: "block_dry_run",
      updatedAt: "2026-05-26T00:03:00.000Z",
      blocks: [
        {
          id: "block_intent",
          sessionId: "session_tmux",
          terminalSessionId: "terminal_session_ai_swarm",
          paneId: "%5",
          role: "frontend",
          host: "dgx_02",
          kind: "command_intent",
          status: "pending_approval",
          title: "Frontend pane command intent",
          summary: "pnpm typecheck dispatch is waiting for approval.",
          commandIntentId: "tmux_dispatch_1",
          approvalId: "approval_tmux_dispatch_1",
          relatedEventIds: ["event_tmux_intent_tmux_dispatch_1", "event_approval_tmux_dispatch_1"],
          redactionApplied: true,
          createdAt: "2026-05-26T00:00:00.000Z",
        },
        {
          id: "block_dry_run",
          sessionId: "session_tmux",
          terminalSessionId: "terminal_session_ai_swarm",
          paneId: "%5",
          role: "frontend",
          host: "dgx_02",
          kind: "dry_run",
          status: "dry_run",
          title: "Dry-run accepted",
          summary: "Approval replay produced an audit event without send-keys.",
          parentBlockId: "block_intent",
          commandIntentId: "tmux_dispatch_1",
          relatedEventIds: ["event_tmux_dry_run_tmux_dispatch_1"],
          outputPreview: "ORCHESTRATOR_TMUX_DRY_RUN accepted approved tmux dispatch",
          redactionApplied: true,
          startedAt: "2026-05-26T00:02:00.000Z",
          completedAt: "2026-05-26T00:02:00.000Z",
          createdAt: "2026-05-26T00:02:00.000Z",
        },
      ],
    });

    expect(timeline.blocks.map((block) => block.kind)).toEqual(["command_intent", "dry_run"]);
    expect(timeline.blocks[1]?.parentBlockId).toBe("block_intent");
    expect(timeline.blocks[1]?.status).toBe("dry_run");
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

  it("validates approval requests and redaction rules for the permission engine", () => {
    const approval = approvalRequestSchema.parse({
      id: "approval_provider_1",
      sessionId: "session_desktop_001",
      sourceItemId: "permission_provider_reseller",
      subjectId: "provider_apifun_claude_a",
      actor: "agent",
      channel: "agent",
      sourceTrust: "limited",
      action: "provider_completion",
      requestedLevels: ["network_access", "secret_access"],
      decision: "approval_required",
      state: "required",
      reason: "reseller provider requires approval before prompt send",
      costEstimateTokens: 12_000,
      ttlSeconds: 900,
      createdAt: "2026-05-24T00:00:00.000Z",
    });
    const rule = redactionRuleSchema.parse({
      id: "redact_secret_like_token",
      phase: "pre_store",
      name: "Secret-like token redaction",
      scope: "event",
      enabled: true,
      pattern: "(sk-|claude-|grok-|deepseek-|pat-)[A-Za-z0-9_-]{20,}",
      replacement: "[REDACTED_SECRET]",
      reason: "event store must not persist raw credentials",
    });

    expect(approval.decision).toBe("approval_required");
    expect(approval.requestedLevels).toContain("secret_access");
    expect(approvalDecisionRequestSchema.parse({ sourceItemId: "permission_provider_reseller" }).sourceItemId).toBe(
      "permission_provider_reseller",
    );
    expect(() => approvalDecisionRequestSchema.parse({ reason: "missing target" })).toThrow();
    expect(rule.phase).toBe("pre_store");
  });
});

// The PERMISSION-AUTHORITY enums underpinning every approval flow are themselves
// unpinned. approvalRequest/approvalDecisionRequest are exercised above, but the
// six primitives they compose from — the least-privilege LEVEL ladder, the
// three-way DECISION gate, the approval STATE lifecycle, the closed ACTION
// vocabulary with its honest unknown catch-all, the ACTOR set, and the
// permissionRequest envelope — never have their membership or contract pinned. A
// silent reordering, a dropped `deny`, or a smuggled super-actor would pass today.
//   (1) permissionLevel is a closed 7-rung capability ladder — read_only is the
//       floor and the dangerous grants (run_dangerous_commands/network_access/
//       remote_workspace/secret_access) are SEPARATE rungs, none implied by another.
//   (2) permissionDecision is an explicit THREE-way gate (allow / approval_required
//       / deny) — the middle gate and an explicit deny both exist; it is not a
//       allow/deny binary, so deny-by-default and "needs approval" are representable.
//   (3) approvalState is a 5-state lifecycle with the not_required escape hatch and
//       terminal rejected/expired (a request can lapse, not just be answered).
//   (4) permissionAction is a closed vocabulary ENDING in unknown_external_effect —
//       an unrecognized effect maps to that honest catch-all, never to a silently
//       allowed/absent action; an arbitrary action string is rejected.
//   (5) permissionActor is exactly {user,agent,external_channel,mobile,server} — no
//       "root"/"anonymous"/"admin" super-actor can be named.
//   (6) permissionRequest requires level+state+reason; expiresAt stays undefined
//       when omitted (a TTL is never fabricated).
// Expected values are read off the schemas (self-consistent), never magic.
describe("index — permission authority primitives: least-privilege ladder, three-way gate, honest catch-all", () => {
  it("(1) permissionLevel is a closed 7-rung ladder with read_only floor and separate dangerous rungs", () => {
    expect(permissionLevelSchema.options).toEqual([
      "read_only",
      "write_files",
      "run_safe_commands",
      "run_dangerous_commands",
      "network_access",
      "remote_workspace",
      "secret_access",
    ]);
    expect(permissionLevelSchema.options[0]).toBe("read_only"); // the floor is the least privilege
    // each dangerous grant is its own rung — none is a superset alias of another
    for (const danger of ["run_dangerous_commands", "network_access", "remote_workspace", "secret_access"]) {
      expect(permissionLevelSchema.options).toContain(danger);
    }
    expect(permissionLevelSchema.safeParse("root").success).toBe(false);
    expect(permissionLevelSchema.safeParse("all").success).toBe(false);
  });

  it("(2) permissionDecision is an explicit three-way gate — allow / approval_required / deny", () => {
    expect(permissionDecisionSchema.options).toEqual(["allow", "approval_required", "deny"]);
    expect(permissionDecisionSchema.options).toContain("deny"); // explicit deny exists (not just absence-of-allow)
    expect(permissionDecisionSchema.options).toContain("approval_required"); // the middle gate exists
    expect(permissionDecisionSchema.safeParse("allow_all").success).toBe(false);
  });

  it("(3) approvalState is a 5-state lifecycle with not_required escape hatch and terminal rejected/expired", () => {
    expect(approvalStateSchema.options).toEqual(["not_required", "required", "approved", "rejected", "expired"]);
    for (const terminal of ["approved", "rejected", "expired"]) {
      expect(approvalStateSchema.options).toContain(terminal);
    }
    expect(approvalStateSchema.safeParse("pending").success).toBe(false); // not a recognized state
  });

  it("(4) permissionAction is a closed vocabulary that ENDS in the honest unknown_external_effect catch-all", () => {
    const opts = permissionActionSchema.options;
    expect(opts[opts.length - 1]).toBe("unknown_external_effect"); // the catch-all is the last, deliberate rung
    expect(opts).toContain("payment_action");
    expect(opts).toContain("secret_view");
    expect(opts).toContain("git_push");
    // an unrecognized effect is REJECTED at the schema — it must be mapped to the catch-all, not smuggled raw
    expect(permissionActionSchema.safeParse("wire_transfer").success).toBe(false);
    expect(permissionActionSchema.safeParse("unknown_external_effect").success).toBe(true);
  });

  it("(5) permissionActor names exactly five principals — no root/anonymous/admin super-actor", () => {
    expect(permissionActorSchema.options).toEqual(["user", "agent", "external_channel", "mobile", "server"]);
    for (const forged of ["root", "anonymous", "admin", "superuser"]) {
      expect(permissionActorSchema.safeParse(forged).success).toBe(false);
    }
  });

  it("(6) permissionRequest requires level+state+reason and never fabricates an expiry", () => {
    const base = {
      id: "pr1",
      sessionId: "s1",
      requestedBy: "agent_builder",
      level: "secret_access" as const,
      reason: "needs vault read",
      state: "required" as const,
      createdAt: "2026-06-21T00:00:00.000Z",
    };
    const parsed = permissionRequestSchema.parse(base);
    expect(parsed.expiresAt).toBeUndefined(); // optional — no TTL invented when absent
    for (const key of ["level", "state", "reason"]) {
      const { [key]: _omit, ...partial } = base as Record<string, unknown>;
      expect(permissionRequestSchema.safeParse(partial).success, `${key} must be mandatory`).toBe(false);
    }
    // level and state must be drawn from their closed enums (a request can't claim an unknown grant/state)
    expect(permissionRequestSchema.safeParse({ ...base, level: "root" }).success).toBe(false);
    expect(permissionRequestSchema.safeParse({ ...base, state: "pending" }).success).toBe(false);
  });
});

// The PROVIDER-TRUST / CREDENTIAL authority primitives are unpinned at the contract
// level. One existing test round-trips a fully-specified profile (and checks the
// redacted preview survives), but it always passes trustLevel EXPLICITLY — so the
// load-bearing default (an undeclared provider is "limited", never "trusted") is
// never exercised, and neither enum's membership, the secret-ref shape, nor the
// model capability flags are pinned. A reordered trust ladder, a secretRef that
// grew a raw `value` field, or a profile that silently defaulted to trusted would
// all pass today.
//   (1) providerKind is a closed 6-vocab incl the LOCAL backends (ollama/lmstudio)
//       and the explicit `custom` escape — an unknown provider kind is rejected.
//   (2) providerTrustLevel is a closed 3-rung ladder {trusted,limited,untrusted} —
//       no "full"/"admin" tier above trusted.
//   (3) providerProfile.trustLevel DEFAULTS to "limited" (deny-by-default: an
//       undeclared provider is not trusted); id/name/kind/enabled/tags are
//       mandatory and every credential field stays optional/undefined when absent.
//   (4) secretRef exposes a redactedPreview only — there is no raw secret field;
//       `transient` is a mandatory declaration and `scope` is a closed 3-enum;
//       z.object strips any smuggled `value`/`raw` key.
//   (5) modelDescriptor states capabilities EXPLICITLY (supportsStreaming/
//       supportsTools required booleans), inputModalities is the closed
//       {text,image,document} set, and contextWindow is a positive int when given.
// Expected values are read off the schemas (self-consistent), never magic.
describe("index — provider-trust authority: default-limited trust, redacted-only secrets, explicit model capability", () => {
  it("(1) providerKind is a closed 6-vocab including local backends and the custom escape", () => {
    expect(providerKindSchema.options).toEqual(["openai", "anthropic", "openrouter", "ollama", "lmstudio", "custom"]);
    for (const local of ["ollama", "lmstudio"]) expect(providerKindSchema.options).toContain(local);
    expect(providerKindSchema.safeParse("custom").success).toBe(true);
    expect(providerKindSchema.safeParse("gemini").success).toBe(false); // unknown kind rejected
  });

  it("(2) providerTrustLevel is a closed 3-rung ladder with no tier above trusted", () => {
    expect(providerTrustLevelSchema.options).toEqual(["trusted", "limited", "untrusted"]);
    for (const forged of ["full", "admin", "root", "all"]) {
      expect(providerTrustLevelSchema.safeParse(forged).success).toBe(false);
    }
  });

  it("(3) providerProfile.trustLevel defaults to limited — an undeclared provider is NOT trusted", () => {
    const base = { id: "p1", name: "n", kind: "custom" as const, enabled: true, tags: [] };
    const parsed = providerProfileSchema.parse(base);
    expect(parsed.trustLevel).toBe("limited"); // deny-by-default — never silently trusted
    // credential fields are all absent → undefined, never fabricated
    for (const cred of ["baseUrl", "secretRef", "apiKeyRef", "authHeader", "modelDiscoveryEndpoint", "defaultModel"]) {
      expect((parsed as Record<string, unknown>)[cred]).toBeUndefined();
    }
    // id/name/kind/enabled/tags are mandatory
    for (const key of ["id", "name", "kind", "enabled", "tags"]) {
      const { [key]: _omit, ...partial } = base as Record<string, unknown>;
      expect(providerProfileSchema.safeParse(partial).success, `${key} must be mandatory`).toBe(false);
    }
  });

  it("(4) secretRef is redacted-only — no raw value field, transient mandatory, scope closed, extras stripped", () => {
    const base = { id: "s1", label: "key", scope: "session" as const, redactedPreview: "sk-...42f0", transient: true };
    const parsed = secretRefSchema.parse(base);
    expect(parsed.redactedPreview).toBe("sk-...42f0");
    // transient must be declared — you cannot omit whether the secret persists
    const { transient: _t, ...withoutTransient } = base as Record<string, unknown>;
    expect(secretRefSchema.safeParse(withoutTransient).success).toBe(false);
    // scope is a closed 3-enum
    expect(secretRefSchema.safeParse({ ...base, scope: "global" }).success).toBe(false);
    for (const scope of ["session", "profile", "workspace"]) {
      expect(secretRefSchema.safeParse({ ...base, scope }).success).toBe(true);
    }
    // a smuggled raw secret key is dropped — it never rides through the schema
    const smuggled = secretRefSchema.parse({ ...base, value: "sk-live-raw-secret", raw: "sk-live-raw-secret" });
    expect(JSON.stringify(smuggled)).not.toContain("sk-live-raw-secret");
    expect("value" in smuggled).toBe(false);
  });

  it("(5) modelDescriptor states capabilities explicitly and constrains modalities/contextWindow", () => {
    const base = { id: "m1", name: "n", providerProfileId: "p1", supportsStreaming: true, supportsTools: false, tags: [] };
    const parsed = modelDescriptorSchema.parse(base);
    expect(parsed.inputModalities).toBeUndefined(); // optional — not fabricated when absent
    expect(parsed.contextWindow).toBeUndefined();
    // capability booleans are required — a model can't omit whether it streams/uses tools
    for (const key of ["supportsStreaming", "supportsTools"]) {
      const { [key]: _omit, ...partial } = base as Record<string, unknown>;
      expect(modelDescriptorSchema.safeParse(partial).success, `${key} must be mandatory`).toBe(false);
    }
    expect(modelInputModalitySchema.options).toEqual(["text", "image", "document"]);
    expect(modelDescriptorSchema.safeParse({ ...base, inputModalities: ["audio"] }).success).toBe(false);
    expect(modelDescriptorSchema.safeParse({ ...base, contextWindow: 0 }).success).toBe(false); // positive int only
    expect(modelDescriptorSchema.safeParse({ ...base, contextWindow: 128_000 }).success).toBe(true);
  });
});

// AGENT-DELEGATION is the OS's authority-propagation channel: one agent asking
// another to act. Its happy-path payloads (detected/dispatched/succeeded/followup)
// and the timeline projection are already exercised, but the AUTHORITY contract
// underneath them is not: the authority-level ladder, the closed completion-route
// vocabulary (incl the honest "mock" non-call marker), the strict no-smuggle base,
// the fact that authority is NAMED exactly when exercised, the three DENY branches,
// and the totality of the type->payload dispatch map. A delegation payload that
// smuggled an extra authorityLevel key, a block with no justification, or a
// dispatch map missing a branch would all pass today.
//   (1) authorityLevel is a closed 3-rung ladder {agent,orchestrator,orchestrator_plus}
//       — no admin/root/super tier — and completionRoute is the closed
//       {server_proxy,direct_provider,local_fallback,mock} set, where "mock" is the
//       honest "this was not a real provider call" marker.
//   (2) every event type has a payload schema — the by-type dispatch map is TOTAL
//       over the 9-event enum (parseAgentDelegationEventPayload can never miss).
//   (3) the base payload is .strict() (no smuggled keys) with authorityLevel
//       OPTIONAL — but the authority-EXERCISING events (detected/dispatched) make it
//       REQUIRED, so authority is named exactly when it is used.
//   (4) the three DENY branches: a block must carry a non-empty justification
//       (reason min 1), self_blocked/unknown_target need only the target, all are
//       strict; and a success never fabricates realProviderCall/route when absent.
// Expected values are read off the schemas (self-consistent), never magic.
describe("index — agent-delegation authority: bounded ladder, total dispatch map, justified denials", () => {
  it("(1) authorityLevel is a closed 3-rung ladder and completionRoute carries the honest mock marker", () => {
    expect(agentDelegationAuthorityLevelSchema.options).toEqual(["agent", "orchestrator", "orchestrator_plus"]);
    for (const forged of ["admin", "root", "super", "system"]) {
      expect(agentDelegationAuthorityLevelSchema.safeParse(forged).success).toBe(false);
    }
    expect(agentDelegationCompletionRouteSchema.options).toEqual([
      "server_proxy",
      "direct_provider",
      "local_fallback",
      "mock",
    ]);
    expect(agentDelegationCompletionRouteSchema.options).toContain("mock"); // a non-real call is nameable, not disguised
  });

  it("(2) the type->payload dispatch map is total over the 9-event enum (parse can never miss a branch)", () => {
    const events = agentDelegationEventTypeSchema.options;
    expect(events).toHaveLength(9);
    // every event type resolves to a payload schema — the map keys === the enum members
    expect(Object.keys(agentDelegationEventPayloadSchemaByType).sort()).toEqual([...events].sort());
    for (const type of events) {
      expect(agentDelegationEventPayloadSchemaByType[type]).toBeDefined();
    }
  });

  it("(3) base is strict with optional authorityLevel; the authority-exercising events make it required", () => {
    // base parses with just the source, but rejects a smuggled key (.strict())
    expect(agentDelegationBasePayloadSchema.safeParse({ sourceAgentId: "a1" }).success).toBe(true);
    expect(agentDelegationBasePayloadSchema.safeParse({ sourceAgentId: "a1", authorityLevel: "orchestrator" }).success).toBe(true);
    expect(agentDelegationBasePayloadSchema.safeParse({ sourceAgentId: "a1", smuggled: "x" }).success).toBe(false);
    expect(agentDelegationBasePayloadSchema.safeParse({ sourceAgentId: "" }).success).toBe(false); // min 1
    // detected EXERCISES authority → authorityLevel is required there
    const detectedBase = {
      sourceAgentId: "a1",
      sourceAgentName: "n",
      sourceRole: "builder" as const,
      targets: ["b1"],
      count: 1,
      depthLimit: 2,
    };
    expect(agentDelegationDetectedPayloadSchema.safeParse(detectedBase).success).toBe(false); // authorityLevel missing
    expect(agentDelegationDetectedPayloadSchema.safeParse({ ...detectedBase, authorityLevel: "orchestrator" }).success).toBe(true);
    // dispatched also requires authorityLevel
    const dispatchBase = {
      sourceAgentId: "a1",
      sourceAgentName: "n",
      targetAgentId: "b1",
      targetAgentName: "B",
      targetRole: "builder" as const,
      providerProfileId: "p1",
      modelId: "m1",
      promptLength: 10,
      depthLimit: 2,
    };
    expect(agentDelegationDispatchedPayloadSchema.safeParse(dispatchBase).success).toBe(false); // authorityLevel missing
    expect(agentDelegationDispatchedPayloadSchema.safeParse({ ...dispatchBase, authorityLevel: "agent" }).success).toBe(true);
  });

  it("(4) deny branches require a justified target, are strict, and a success never fabricates realProviderCall/route", () => {
    // a block must be justified — empty or missing reason is rejected; authorityLevel is NOT required to deny
    expect(agentDelegationBlockedPayloadSchema.safeParse({ sourceAgentId: "a1", target: "b1", reason: "depth exceeded" }).success).toBe(true);
    expect(agentDelegationBlockedPayloadSchema.safeParse({ sourceAgentId: "a1", target: "b1", reason: "" }).success).toBe(false);
    expect(agentDelegationBlockedPayloadSchema.safeParse({ sourceAgentId: "a1", target: "b1" }).success).toBe(false); // reason missing
    expect(agentDelegationBlockedPayloadSchema.safeParse({ sourceAgentId: "a1", target: "b1", reason: "x", smuggled: 1 }).success).toBe(false); // strict
    // self_blocked / unknown_target need only the target
    expect(agentDelegationSelfBlockedPayloadSchema.safeParse({ sourceAgentId: "a1", target: "a1" }).success).toBe(true);
    expect(agentDelegationUnknownTargetPayloadSchema.safeParse({ sourceAgentId: "a1", target: "ghost" }).success).toBe(true);
    // a success that omits route/realProviderCall leaves them undefined — never upgraded to a real call
    const succeeded = agentDelegationSucceededPayloadSchema.parse({
      sourceAgentId: "a1",
      targetAgentId: "b1",
      targetAgentName: "B",
      targetRole: "builder",
      providerProfileId: "p1",
      modelId: "m1",
      responseLength: 42,
    });
    expect(succeeded.route).toBeUndefined();
    expect(succeeded.realProviderCall).toBeUndefined();
  });
});

// EXECUTION AUTHORITY — where code may run (the runtime backend), the slot
// lifecycle that gates it, and the remote-dispatch request — is only touched by a
// single happy-path parse (one slot, asserting status==="placeholder"). The
// enum memberships, the required-vs-optional contract, the binding of a slot to the
// permission ladder + approval gate, and the remote request's structural approval
// gate are all unpinned. A backend that grew an "ssh" rung, a slot that dropped its
// approvalState, or a remote request with an optional gate would all pass today.
//   (1) executionRuntimeBackend is the closed 4-set {ui_stub,tmux,local_cli,
//       dgx_remote} where ui_stub is the inert "no real execution" default; an
//       unknown backend is rejected. remoteExecutionKind is the closed 3-set
//       {model_inference,workspace_run,event_sync} — only these reach a remote node.
//   (2) executionSlotStatus is a gated lifecycle: it STARTS at placeholder
//       (not-yet-real), carries an explicit pending_approval gate and terminal
//       failed/blocked — no silent done/ok.
//   (3) an executionSlot binds execution to authority — status/backend/approvalState/
//       requestedPermissions/decisionRequired are all mandatory, requestedPermissions
//       is drawn from the permission ladder, and commandPreview/blockedReason stay
//       undefined when absent (never fabricated).
//   (4) remoteExecutionRequest makes the approval gate STRUCTURAL (approvalState
//       required, not optional), bounds commandPreview to <=10000, and requires
//       id/runId/kind/targetNodeId — a remote dispatch cannot omit its gate.
// Expected values are read off the schemas (self-consistent), never magic.
describe("index — execution authority: closed backends, gated slot lifecycle, structural remote approval", () => {
  it("(1) runtime backend is a closed 4-set (ui_stub inert) and remoteExecutionKind a closed 3-set", () => {
    expect(executionRuntimeBackendSchema.options).toEqual(["ui_stub", "tmux", "local_cli", "dgx_remote"]);
    expect(executionRuntimeBackendSchema.options[0]).toBe("ui_stub"); // the inert no-real-execution default
    expect(executionRuntimeBackendSchema.safeParse("ssh").success).toBe(false);
    expect(executionRuntimeBackendSchema.safeParse("docker").success).toBe(false);
    expect(remoteExecutionKindSchema.options).toEqual(["model_inference", "workspace_run", "event_sync"]);
    expect(remoteExecutionKindSchema.safeParse("shell_exec").success).toBe(false);
  });

  it("(2) executionSlotStatus is a gated lifecycle starting at placeholder with a pending_approval gate", () => {
    expect(executionSlotStatusSchema.options).toEqual([
      "placeholder",
      "idle",
      "pending_approval",
      "running",
      "completed",
      "failed",
      "blocked",
    ]);
    expect(executionSlotStatusSchema.options[0]).toBe("placeholder"); // not-yet-real start
    expect(executionSlotStatusSchema.options).toContain("pending_approval"); // explicit approval gate
    for (const terminal of ["completed", "failed", "blocked"]) {
      expect(executionSlotStatusSchema.options).toContain(terminal);
    }
    for (const forged of ["done", "ok", "approved"]) {
      expect(executionSlotStatusSchema.options).not.toContain(forged);
    }
  });

  it("(3) an executionSlot binds execution to the permission ladder + approval gate and fabricates no preview/reason", () => {
    const base = {
      id: "slot1",
      sessionId: "s1",
      label: "Architect",
      role: "architect" as const,
      backend: "ui_stub" as const,
      status: "placeholder" as const,
      approvalState: "required" as const,
      requestedPermissions: ["run_safe_commands"],
      decisionRequired: true,
      createdAt: "2026-06-21T00:00:00.000Z",
    };
    const parsed = executionSlotSchema.parse(base);
    expect(parsed.commandPreview).toBeUndefined(); // optional — not fabricated
    expect(parsed.blockedReason).toBeUndefined();
    for (const key of ["status", "backend", "approvalState", "requestedPermissions", "decisionRequired"]) {
      const { [key]: _omit, ...partial } = base as Record<string, unknown>;
      expect(executionSlotSchema.safeParse(partial).success, `${key} must be mandatory`).toBe(false);
    }
    // requestedPermissions is drawn from the permission ladder — an unknown grant is rejected
    expect(executionSlotSchema.safeParse({ ...base, requestedPermissions: ["root"] }).success).toBe(false);
    expect(executionSlotSchema.safeParse({ ...base, requestedPermissions: ["secret_access"] }).success).toBe(true);
  });

  it("(4) remoteExecutionRequest makes the approval gate structural and bounds the command preview", () => {
    const base = {
      id: "rex1",
      runId: "run1",
      kind: "workspace_run" as const,
      targetNodeId: "dgx-02",
      commandPreview: "pnpm test",
      approvalState: "required" as const,
      createdAt: "2026-06-21T00:00:00.000Z",
    };
    expect(remoteExecutionRequestSchema.safeParse(base).success).toBe(true);
    // the approval gate is not optional — a remote dispatch cannot omit it
    for (const key of ["approvalState", "kind", "targetNodeId", "runId", "id"]) {
      const { [key]: _omit, ...partial } = base as Record<string, unknown>;
      expect(remoteExecutionRequestSchema.safeParse(partial).success, `${key} must be mandatory`).toBe(false);
    }
    // commandPreview is bounded so the operator always sees a finite, reviewable command
    expect(remoteExecutionRequestSchema.safeParse({ ...base, commandPreview: "x".repeat(10_000) }).success).toBe(true);
    expect(remoteExecutionRequestSchema.safeParse({ ...base, commandPreview: "x".repeat(10_001) }).success).toBe(false);
    // kind is constrained to the closed remote-execution set
    expect(remoteExecutionRequestSchema.safeParse({ ...base, kind: "shell_exec" }).success).toBe(false);
  });
});

// INGRESS PROVENANCE + the REDACTION BOUNDARY are the OS's trust/leak frontier:
// where an event came from, how far it is trusted, and at which boundaries data is
// scrubbed. sourceTrust/eventSource have zero coverage; redactionRule is touched
// once (a single parse asserting phase==="pre_store") so neither the phase/scope
// memberships nor the rule's all-mandatory contract is pinned. A new untrusted
// origin, a dropped redaction boundary, or a rule that silently omitted its reason
// would all pass today.
//   (1) eventSource is the closed 6-provenance set incl external_legacy (the
//       imported / not-natively-trusted origin); sourceTrust is the closed 3-rung
//       trust ladder — no "verified"/"full" tier above trusted.
//   (2) redactionPhase pins the 5 scrub boundaries: post_receive (ingress) plus the
//       four pre_* egress/persistence points (send/store/backup/share); redactionRuleScope
//       pins the 5 data planes {input,output,event,backup,share}. Unknowns rejected.
//   (3) a redactionRule fully declares itself — phase+scope drawn from the closed
//       enums and id/name/enabled/pattern/replacement/reason ALL mandatory (a rule
//       can't be a silent no-op: it must say what it matches, what it writes, and why).
// Expected values are read off the schemas (self-consistent), never magic.
describe("index — ingress provenance + redaction boundary: closed trust ladder, fully-declared scrub rules", () => {
  it("(1) eventSource is the closed 6-provenance set and sourceTrust the closed 3-rung ladder", () => {
    expect(eventSourceSchema.options).toEqual(["desktop", "server", "external_legacy", "mobile", "agent", "api"]);
    expect(eventSourceSchema.options).toContain("external_legacy"); // imported / not-natively-trusted origin
    expect(eventSourceSchema.safeParse("slack").success).toBe(false);
    expect(sourceTrustSchema.options).toEqual(["trusted", "limited", "untrusted"]);
    for (const forged of ["verified", "full", "admin"]) {
      expect(sourceTrustSchema.safeParse(forged).success).toBe(false);
    }
  });

  it("(2) redactionPhase pins the 5 scrub boundaries and redactionRuleScope the 5 data planes", () => {
    expect(redactionPhaseSchema.options).toEqual(["pre_send", "post_receive", "pre_store", "pre_backup", "pre_share"]);
    expect(redactionPhaseSchema.options).toContain("post_receive"); // the one ingress boundary
    expect(redactionPhaseSchema.options.filter((p) => p.startsWith("pre_"))).toHaveLength(4); // four egress/persistence points
    expect(redactionRuleScopeSchema.options).toEqual(["input", "output", "event", "backup", "share"]);
    expect(redactionPhaseSchema.safeParse("post_send").success).toBe(false);
    expect(redactionRuleScopeSchema.safeParse("memory").success).toBe(false);
  });

  it("(3) a redactionRule fully declares itself — phase+scope closed, every field mandatory", () => {
    const base = {
      id: "r1",
      phase: "pre_store" as const,
      name: "mask api keys",
      scope: "event" as const,
      enabled: true,
      pattern: "sk-[a-z0-9]+",
      replacement: "sk-***",
      reason: "never persist raw provider keys",
    };
    expect(redactionRuleSchema.safeParse(base).success).toBe(true);
    // a rule cannot be a silent no-op — pattern/replacement/reason/enabled are all required
    for (const key of ["id", "phase", "name", "scope", "enabled", "pattern", "replacement", "reason"]) {
      const { [key]: _omit, ...partial } = base as Record<string, unknown>;
      expect(redactionRuleSchema.safeParse(partial).success, `${key} must be mandatory`).toBe(false);
    }
    // phase/scope are drawn from the closed enums — a rule can't target an unknown boundary or plane
    expect(redactionRuleSchema.safeParse({ ...base, phase: "post_send" }).success).toBe(false);
    expect(redactionRuleSchema.safeParse({ ...base, scope: "memory" }).success).toBe(false);
  });
});

// The pre-existing happy-path test (line ~1297) parses ONE approvalRequest with
// NO replay attached and never inspects the replay surface: the closed set of
// replayable kinds, the request envelope's .strict()/POST-only/bounded-endpoint
// guard, the convergence of authority primitives the approval is built from, or
// the honesty of its optional fields. A replay aimed at an unknown kind, a GET
// smuggled past the POST-only gate, an approval whose actor/channel/decision came
// from outside its closed enum, or a fabricated ttl/replay would all pass today.
// Pin the replay boundary + approval composition, self-consistent (kinds/enums
// derived from the schemas' own declared options). Generic OS only.
describe("index — approval-replay authority: closed replay kinds, POST-only strict envelope, honest composition", () => {
  it("pins the 4 replayable kinds and the strict, POST-only, bounded replay envelope", () => {
    expect(approvalReplayKindSchema.options).toEqual([
      "provider_completion",
      "agent_delegation",
      "remote_run",
      "tmux_dispatch",
    ]);
    const replay = {
      kind: "provider_completion" as const,
      endpoint: "/internal/replay/provider",
      method: "POST" as const,
      payload: { prompt: "redacted" },
    };
    expect(approvalReplayRequestSchema.safeParse(replay).success).toBe(true);
    // payload is z.unknown() — optional, never fabricated when absent
    const { payload: _omitPayload, ...withoutPayload } = replay;
    expect(approvalReplayRequestSchema.safeParse(withoutPayload).success).toBe(true);
    // method is POST-only — no other verb may replay a once-approved effect
    expect(approvalReplayRequestSchema.safeParse({ ...replay, method: "GET" }).success).toBe(false);
    // a replay can't aim at an unknown kind
    expect(approvalReplayRequestSchema.safeParse({ ...replay, kind: "ad_hoc" }).success).toBe(false);
    // endpoint is bounded: empty and >512 are rejected, both ends honored
    expect(approvalReplayRequestSchema.safeParse({ ...replay, endpoint: "" }).success).toBe(false);
    expect(approvalReplayRequestSchema.safeParse({ ...replay, endpoint: "/".padEnd(512, "x") }).success).toBe(true);
    expect(approvalReplayRequestSchema.safeParse({ ...replay, endpoint: "/".padEnd(513, "x") }).success).toBe(false);
    // .strict() — an unknown key cannot ride along inside the replay envelope
    expect(approvalReplayRequestSchema.safeParse({ ...replay, headers: { auth: "x" } }).success).toBe(false);
  });

  it("composes an approval from closed authority primitives — each cross-typed field rejects an out-of-vocabulary value", () => {
    const base = {
      id: "approval_1",
      sessionId: "session_1",
      subjectId: "subject_1",
      actor: "agent" as const,
      channel: "agent" as const,
      sourceTrust: "limited" as const,
      action: "provider_completion" as const,
      requestedLevels: ["network_access"],
      decision: "approval_required" as const,
      state: "required" as const,
      reason: "needs approval",
      createdAt: "2026-06-21T00:00:00.000Z",
    };
    expect(approvalRequestSchema.safeParse(base).success).toBe(true);
    // every authority-typed field is drawn from a closed enum — a stranger value is rejected
    expect(approvalRequestSchema.safeParse({ ...base, actor: "ghost" }).success).toBe(false);
    expect(approvalRequestSchema.safeParse({ ...base, channel: "carrier_pigeon" }).success).toBe(false);
    expect(approvalRequestSchema.safeParse({ ...base, sourceTrust: "absolute" }).success).toBe(false);
    expect(approvalRequestSchema.safeParse({ ...base, action: "launch_missile" }).success).toBe(false);
    expect(approvalRequestSchema.safeParse({ ...base, decision: "maybe" }).success).toBe(false);
    expect(approvalRequestSchema.safeParse({ ...base, state: "limbo" }).success).toBe(false);
    expect(approvalRequestSchema.safeParse({ ...base, requestedLevels: ["root_access"] }).success).toBe(false);
    // the identity/justification spine is mandatory — none of it may be silently dropped
    for (const key of ["id", "sessionId", "subjectId", "actor", "channel", "sourceTrust", "action", "decision", "state", "reason", "createdAt"]) {
      const { [key]: _omit, ...partial } = base as Record<string, unknown>;
      expect(approvalRequestSchema.safeParse(partial).success, `${key} must be mandatory`).toBe(false);
    }
  });

  it("never fabricates optional fields and round-trips an attached replay with positive-int ttl", () => {
    const base = {
      id: "approval_2",
      sessionId: "session_2",
      subjectId: "subject_2",
      actor: "user" as const,
      channel: "desktop" as const,
      sourceTrust: "trusted" as const,
      action: "deploy" as const,
      requestedLevels: ["network_access"],
      decision: "allow" as const,
      state: "approved" as const,
      reason: "operator approved",
      createdAt: "2026-06-21T00:00:00.000Z",
    };
    const minimal = approvalRequestSchema.parse(base);
    // optional fields stay undefined — an approval invents neither a replay nor a budget/expiry
    expect(minimal.replay).toBeUndefined();
    expect(minimal.ttlSeconds).toBeUndefined();
    expect(minimal.costEstimateTokens).toBeUndefined();
    expect(minimal.expiresAt).toBeUndefined();
    expect(minimal.sourceItemId).toBeUndefined();
    // ttlSeconds is a positive int — 0 and fractions are not a window
    expect(approvalRequestSchema.safeParse({ ...base, ttlSeconds: 0 }).success).toBe(false);
    expect(approvalRequestSchema.safeParse({ ...base, ttlSeconds: 1.5 }).success).toBe(false);
    // an attached replay survives the round-trip intact
    const withReplay = approvalRequestSchema.parse({
      ...base,
      ttlSeconds: 600,
      replay: { kind: "remote_run", endpoint: "/internal/replay/remote", method: "POST", payload: { runId: "r1" } },
    });
    expect(withReplay.ttlSeconds).toBe(600);
    expect(withReplay.replay).toEqual({
      kind: "remote_run",
      endpoint: "/internal/replay/remote",
      method: "POST",
      payload: { runId: "r1" },
    });
  });
});

// The pre-existing test (line ~273) parses ONE happy push request/response with
// every counter at its all-accepted value and never inspects the reconciliation
// authority: the closed disposition vocabulary every sync outcome must fall into,
// the honesty of an item result (serverRevision/reason only when the server
// actually has them), the nonnegative-int guards on the revision + the four
// counters (a negative "accepted" or fractional revision would pass today), or
// the pull response at all. Pin the event-sync reconciliation contract,
// self-consistent (vocabulary/counters derived from the schemas' own shape).
describe("index — event-sync reconciliation authority: closed dispositions, honest item results, nonnegative monotonic counters", () => {
  it("pins the 4 sync dispositions — every reconcile outcome is accepted/duplicate/conflict/failed, nothing else", () => {
    expect(eventSyncStatusSchema.options).toEqual(["accepted", "duplicate", "conflict", "failed"]);
    expect(eventSyncStatusSchema.safeParse("merged").success).toBe(false);
  });

  it("an item result needs eventId + a closed-vocabulary status; serverRevision/reason are never fabricated", () => {
    const minimal = eventSyncItemResultSchema.parse({ eventId: "e1", status: "accepted" });
    // optional fields stay undefined — a result invents neither a revision nor a reason
    expect(minimal.serverRevision).toBeUndefined();
    expect(minimal.reason).toBeUndefined();
    // eventId + status are mandatory
    expect(eventSyncItemResultSchema.safeParse({ status: "accepted" }).success).toBe(false);
    expect(eventSyncItemResultSchema.safeParse({ eventId: "e1" }).success).toBe(false);
    // status must come from the closed disposition set
    expect(eventSyncItemResultSchema.safeParse({ eventId: "e1", status: "merged" }).success).toBe(false);
    // serverRevision, when present, is a nonnegative int — no negative/fractional revision
    expect(eventSyncItemResultSchema.safeParse({ eventId: "e1", status: "conflict", serverRevision: -1 }).success).toBe(false);
    expect(eventSyncItemResultSchema.safeParse({ eventId: "e1", status: "conflict", serverRevision: 1.5 }).success).toBe(false);
    const full = eventSyncItemResultSchema.parse({ eventId: "e1", status: "conflict", serverRevision: 7, reason: "revision drift" });
    expect(full).toEqual({ eventId: "e1", status: "conflict", serverRevision: 7, reason: "revision drift" });
  });

  it("the push response guards serverRevision and all four counters as nonnegative ints", () => {
    const base = {
      id: "resp_1",
      requestId: "req_1",
      sessionId: "session_1",
      serverRevision: 0,
      accepted: 0,
      duplicates: 0,
      conflicts: 0,
      failed: 0,
      results: [],
      createdAt: "2026-06-21T00:00:00.000Z",
    };
    expect(eventSyncPushResponseSchema.safeParse(base).success).toBe(true); // all-zero is a legitimate empty reconcile
    for (const counter of ["serverRevision", "accepted", "duplicates", "conflicts", "failed"]) {
      expect(eventSyncPushResponseSchema.safeParse({ ...base, [counter]: -1 }).success, `${counter} cannot be negative`).toBe(false);
      expect(eventSyncPushResponseSchema.safeParse({ ...base, [counter]: 1.5 }).success, `${counter} cannot be fractional`).toBe(false);
    }
    // the response spine is mandatory — no counter or revision may be silently dropped
    for (const key of ["id", "requestId", "sessionId", "serverRevision", "accepted", "duplicates", "conflicts", "failed", "results", "createdAt"]) {
      const { [key]: _omit, ...partial } = base as Record<string, unknown>;
      expect(eventSyncPushResponseSchema.safeParse(partial).success, `${key} must be mandatory`).toBe(false);
    }
  });

  it("the pull response carries a nonnegative server revision and an events array as its reconcile cursor", () => {
    const base = { sessionId: "session_1", serverRevision: 0, events: [], createdAt: "2026-06-21T00:00:00.000Z" };
    const parsed = eventSyncPullResponseSchema.parse(base);
    expect(parsed.serverRevision).toBe(0);
    expect(parsed.events).toEqual([]);
    // revision is a nonnegative int — a pull cursor can't go backwards or fractional
    expect(eventSyncPullResponseSchema.safeParse({ ...base, serverRevision: -1 }).success).toBe(false);
    expect(eventSyncPullResponseSchema.safeParse({ ...base, serverRevision: 2.5 }).success).toBe(false);
    // sessionId/serverRevision/events/createdAt are all mandatory
    for (const key of ["sessionId", "serverRevision", "events", "createdAt"]) {
      const { [key]: _omit, ...partial } = base as Record<string, unknown>;
      expect(eventSyncPullResponseSchema.safeParse(partial).success, `${key} must be mandatory`).toBe(false);
    }
  });
});

// The pre-existing test (line ~919) parses ONE happy operator-cockpit handoff
// and never inspects the rest of the read-model: the worker-fleet panel's closed
// status/ring/security vocabularies and its optional-field honesty, the
// tamper/replay authority carried by approval-evidence + dispatch-history (the
// tamperWarning bool and replayPayloadDigest are REQUIRED — a snapshot can't hide
// whether a dispatch was tampered with), the closed health/badge enums on the
// memory/routing/recovery status panels, or the snapshot composition root whose 8
// sections are all mandatory. A read-model is an observation surface: pinning it
// guards against a panel silently fabricating optional context or dropping a
// tamper signal. Self-consistent (vocabularies derived from the schemas' shape).
describe("index — operator-cockpit read-model authority: closed panel vocabularies, mandatory tamper signals, complete snapshot root", () => {
  it("worker-fleet panel: closed status/ring/security vocabularies, only identity+status mandatory, context never fabricated", () => {
    expect(operatorCockpitWorkerStatusSchema.options).toEqual(["idle", "working", "blocked", "waiting_approval", "error"]);
    const base = {
      workerId: "worker_1",
      role: "architect" as const,
      status: "working" as const,
      statusRingColor: "green" as const,
    };
    const minimal = operatorCockpitWorkerFleetSchema.parse(base);
    // lane/surface/worktree/branch/blockedReason/securityTier are optional — a fleet row invents no placement
    for (const field of ["lane", "surface", "worktree", "branch", "blockedReason", "securityTier"]) {
      expect((minimal as Record<string, unknown>)[field]).toBeUndefined();
    }
    // the closed ring + security-tier vocabularies reject a stranger value
    expect(operatorCockpitWorkerFleetSchema.safeParse({ ...base, statusRingColor: "blue" }).success).toBe(false);
    expect(operatorCockpitWorkerFleetSchema.safeParse({ ...base, status: "napping" }).success).toBe(false);
    expect(operatorCockpitWorkerFleetSchema.safeParse({ ...base, securityTier: "vm" }).success).toBe(false);
    expect(operatorCockpitWorkerFleetSchema.safeParse({ ...base, securityTier: "gvisor" }).success).toBe(true);
    // identity + status spine is mandatory
    for (const key of ["workerId", "role", "status", "statusRingColor"]) {
      const { [key]: _omit, ...partial } = base as Record<string, unknown>;
      expect(operatorCockpitWorkerFleetSchema.safeParse(partial).success, `${key} must be mandatory`).toBe(false);
    }
  });

  it("approval-evidence + dispatch-history carry mandatory tamper/replay signals that cannot be silently dropped", () => {
    const evidence = {
      blockReason: "secret_access requires approval",
      evidenceRefs: [],
      payloadBindingStatus: "bound" as const,
    };
    expect(operatorCockpitApprovalEvidenceSchema.safeParse(evidence).success).toBe(true);
    // payloadBindingStatus is a closed 3-set — binding can only be bound/unbound/expired
    expect(operatorCockpitApprovalEvidenceSchema.safeParse({ ...evidence, payloadBindingStatus: "partial" }).success).toBe(false);
    // blockReason + evidenceRefs + payloadBindingStatus are mandatory — evidence can't be a blank stub
    for (const key of ["blockReason", "evidenceRefs", "payloadBindingStatus"]) {
      const { [key]: _omit, ...partial } = evidence as Record<string, unknown>;
      expect(operatorCockpitApprovalEvidenceSchema.safeParse(partial).success, `${key} must be mandatory`).toBe(false);
    }
    const dispatch = {
      dispatchId: "dispatch_1",
      requesterAgentId: "agent_1",
      approvalState: "approved" as const,
      replayPayloadDigest: "sha256:abc",
      tamperWarning: false,
      createdAt: "2026-06-21T00:00:00.000Z",
    };
    expect(operatorCockpitDispatchHistorySchema.safeParse(dispatch).success).toBe(true);
    // the tamper signal and the replay digest are REQUIRED — a history row cannot hide them
    for (const key of ["dispatchId", "requesterAgentId", "approvalState", "replayPayloadDigest", "tamperWarning", "createdAt"]) {
      const { [key]: _omit, ...partial } = dispatch as Record<string, unknown>;
      expect(operatorCockpitDispatchHistorySchema.safeParse(partial).success, `${key} must be mandatory`).toBe(false);
    }
    // approvalState is the closed 5-state ladder
    expect(operatorCockpitDispatchHistorySchema.safeParse({ ...dispatch, approvalState: "maybe" }).success).toBe(false);
  });

  it("memory/routing/recovery status panels are fully-declared with closed health/badge vocabularies", () => {
    const memory = {
      contextReasons: [],
      macBookAuthorityEnabled: true,
      dgxMirrorHealth: "healthy" as const,
      contradictionWarnings: [],
    };
    expect(operatorCockpitMemoryRecallSchema.safeParse(memory).success).toBe(true);
    expect(operatorCockpitMemoryRecallSchema.safeParse({ ...memory, dgxMirrorHealth: "unknown" }).success).toBe(false);
    for (const key of ["contextReasons", "macBookAuthorityEnabled", "dgxMirrorHealth", "contradictionWarnings"]) {
      const { [key]: _omit, ...partial } = memory as Record<string, unknown>;
      expect(operatorCockpitMemoryRecallSchema.safeParse(partial).success, `${key} must be mandatory`).toBe(false);
    }
    const routing = {
      selectedModelId: "model_1",
      fallbackStatus: "active" as const,
      costBadge: "low" as const,
      speedBadge: "fast" as const,
      trustBadge: "limited" as const,
    };
    expect(operatorCockpitProviderRoutingSchema.safeParse(routing).success).toBe(true);
    // every badge is a closed vocabulary; trustBadge reuses the source-trust ladder
    expect(operatorCockpitProviderRoutingSchema.safeParse({ ...routing, fallbackStatus: "maybe" }).success).toBe(false);
    expect(operatorCockpitProviderRoutingSchema.safeParse({ ...routing, costBadge: "free" }).success).toBe(false);
    expect(operatorCockpitProviderRoutingSchema.safeParse({ ...routing, speedBadge: "instant" }).success).toBe(false);
    expect(operatorCockpitProviderRoutingSchema.safeParse({ ...routing, trustBadge: "absolute" }).success).toBe(false);
    const recovery = { offlineResumeSupported: true, outboxSyncStatus: "synced" as const, healthIndicators: [] };
    expect(operatorCockpitRecoverySchema.safeParse(recovery).success).toBe(true);
    expect(operatorCockpitRecoverySchema.safeParse({ ...recovery, outboxSyncStatus: "queued" }).success).toBe(false);
  });

  it("the snapshot composition root requires all 8 read-model sections — none defaults to empty", () => {
    const snapshot = {
      id: "snap_1",
      timestamp: "2026-06-21T00:00:00.000Z",
      fleet: [],
      approvals: [],
      handoffs: [],
      memory: { contextReasons: [], macBookAuthorityEnabled: true, dgxMirrorHealth: "healthy", contradictionWarnings: [] },
      routing: { selectedModelId: "m", fallbackStatus: "none", costBadge: "low", speedBadge: "fast", trustBadge: "trusted" },
      recovery: { offlineResumeSupported: false, outboxSyncStatus: "synced", healthIndicators: [] },
      dispatchHistory: [],
    };
    expect(operatorCockpitSnapshotSchema.safeParse(snapshot).success).toBe(true);
    // every section is mandatory — a snapshot can't ship with a panel silently missing
    for (const key of ["id", "timestamp", "fleet", "approvals", "handoffs", "memory", "routing", "recovery", "dispatchHistory"]) {
      const { [key]: _omit, ...partial } = snapshot as Record<string, unknown>;
      expect(operatorCockpitSnapshotSchema.safeParse(partial).success, `${key} must be mandatory`).toBe(false);
    }
  });
});

// The pre-existing test (line ~810) parses ONE happy agentSession (architect /
// planned) only to assert role === "architect"; it never pins the closed
// pane-role vocabulary, the closed 6-state session lifecycle, the mandatory
// session spine, the honesty of its optionals (agentId/paneId/lastEventAt — a
// not-yet-spawned session has no pane), or that role/backend/status each come
// from a closed enum. A session that claimed an unknown role/backend or a
// fabricated lifecycle state would pass today. Pin the agent-session lifecycle
// contract, self-consistent (vocabularies derived from the schemas' own options).
describe("index — agent-session lifecycle authority: closed pane roles, closed 6-state lifecycle, honest session spine", () => {
  it("pins the 10 pane roles and the closed 6-state session lifecycle", () => {
    expect(tmuxPaneRoleSchema.options).toEqual([
      "discussion",
      "orchestrator",
      "status",
      "code",
      "architect",
      "frontend",
      "backend",
      "qa",
      "research",
      "memory",
    ]);
    expect(agentSessionStatusSchema.options).toEqual(["planned", "spawned", "running", "yielded", "completed", "failed"]);
    // strangers outside either closed vocabulary are rejected
    expect(tmuxPaneRoleSchema.safeParse("devops").success).toBe(false);
    expect(agentSessionStatusSchema.safeParse("paused").success).toBe(false);
  });

  it("requires the session spine and never fabricates agentId/paneId/lastEventAt for a not-yet-spawned session", () => {
    const base = {
      id: "agent_session_1",
      sessionId: "session_1",
      role: "architect" as const,
      backend: "ui_stub" as const,
      status: "planned" as const,
      createdAt: "2026-06-21T00:00:00.000Z",
    };
    const minimal = agentSessionSchema.parse(base);
    // a planned session has not been placed in a pane yet — these stay undefined, never invented
    expect(minimal.agentId).toBeUndefined();
    expect(minimal.paneId).toBeUndefined();
    expect(minimal.lastEventAt).toBeUndefined();
    // the identity/role/backend/status/createdAt spine is mandatory
    for (const key of ["id", "sessionId", "role", "backend", "status", "createdAt"]) {
      const { [key]: _omit, ...partial } = base as Record<string, unknown>;
      expect(agentSessionSchema.safeParse(partial).success, `${key} must be mandatory`).toBe(false);
    }
  });

  it("draws role/backend/status from closed enums — an out-of-vocabulary value is rejected", () => {
    const base = {
      id: "agent_session_2",
      sessionId: "session_1",
      role: "backend" as const,
      backend: "tmux" as const,
      status: "running" as const,
      createdAt: "2026-06-21T00:00:00.000Z",
    };
    expect(agentSessionSchema.safeParse(base).success).toBe(true);
    expect(agentSessionSchema.safeParse({ ...base, role: "devops" }).success).toBe(false);
    expect(agentSessionSchema.safeParse({ ...base, backend: "kubernetes" }).success).toBe(false);
    expect(agentSessionSchema.safeParse({ ...base, status: "paused" }).success).toBe(false);
  });
});
