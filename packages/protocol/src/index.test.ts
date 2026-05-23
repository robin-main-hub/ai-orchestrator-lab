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
  type RemoteExecutionRequest,
  type RemoteExecutionResponse,
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
});
