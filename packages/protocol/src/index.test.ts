import { describe, expect, it } from "vitest";
import {
  codingPacketSchema,
  eventEnvelopeSchema,
  providerProfileSchema,
  type BackupProjectionArtifact,
  type CodingPacket,
  type IngressGuardResult,
  type MobileActionPolicy,
  type MemoryTrace,
  type ModelDiscoverySnapshot,
  type PermissionMatrixSnapshot,
  type ProviderCredentialParseResult,
  type ProviderCompletionRequest,
  type ProviderCompletionResponse,
  type ProviderRuntimeReadiness,
  type RemoteExecutionRequest,
  type RemoteExecutionResponse,
  type SecretVaultSnapshot,
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

  it("requires a source trust level for persisted events", () => {
    const event = eventEnvelopeSchema.parse({
      id: "event_1",
      sessionId: "session_1",
      type: "conversation.message.created",
      payload: { text: "토론으로 돌려봐" },
      createdAt: new Date("2026-05-24T00:00:00.000Z").toISOString(),
      source: "telegram",
      sourceTrust: "untrusted",
    });

    expect(event.redacted).toBe(false);
    expect(event.sourceTrust).toBe("untrusted");
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
        channel: "telegram",
        source: "telegram",
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
          channel: "telegram",
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
