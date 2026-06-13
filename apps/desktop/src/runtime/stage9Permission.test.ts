import { describe, expect, it } from "vitest";
import type { MobileActionPolicy, ProviderRuntimeReadiness, RuntimeSnapshot, TerminalSlot, PermissionLevel } from "@ai-orchestrator/protocol";
import { createStage4AgentRun } from "./stage4Runtime";
import { createExternalIngressDemoInput, createStage8IngressSnapshot } from "./stage8Ingress";
import { createStage9PermissionSnapshot, evaluatePermissionGate, nextRequiredPermission } from "./stage9Permission";

const createdAt = "2026-05-24T00:30:00.000Z";

const runtime: RuntimeSnapshot = {
  status: "degraded",
  dgxStatus: "offline",
  localModelStatus: "online",
  memorySyncStatus: "syncing",
  runtimeNodes: [],
  localModels: [],
  syncTopology: {
    authorityNodeId: "dgx-02",
    authorityLabel: "DGX-02",
    eventStoreMode: "dgx02_authoritative_with_client_cache",
    offlineWritePolicy: "append_local_outbox_when_offline",
    conflictPolicy: "dgx02_authority_wins",
    clients: [],
  },
  updatedAt: createdAt,
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

const terminalSlots: TerminalSlot[] = [
  {
    id: "slot_local",
    label: "Local CLI",
    status: "idle",
    permissionState: "not_required",
  },
  {
    id: "slot_dgx",
    label: "DGX Remote",
    status: "pending_approval",
    permissionState: "required",
    lastCommandPreview: "pnpm -w test",
  },
];

const agentRun = createStage4AgentRun({
  packet: {
    goal: "Build permission matrix",
    context: ["event store first"],
    decisions: ["gate execution"],
    rejectedOptions: ["run commands from external ingress directly"],
    constraints: ["no real terminal execution"],
    filesToInspect: ["apps/desktop/src/runtime/stage9Permission.ts"],
    implementationPlan: ["create permission snapshot"],
    verificationPlan: ["unit test pending queue"],
    reviewerNotes: [],
  },
  agents: [
    {
      id: "agent_orchestrator",
      name: "Orchestrator",
      kind: "virtual",
      role: "orchestrator",
      soulMode: "summary",
      configSource: "internal",
      enabled: true,
    },
  ],
  messages: [],
  events: [],
  createdAt,
});

describe("stage9 permission matrix", () => {
  it("merges external approvals, terminal slots, run steps, and mobile policy", () => {
    const externalApprovals = [
      {
        id: "external_approval_demo",
        ingressEventId: "ingress_event_demo",
        channel: "webhook" as const,
        summary: "do external ingress thing",
        permissions: ["run_safe_commands", "secret_access"] as PermissionLevel[],
        state: "required" as const,
        createdAt,
      },
    ];
    const snapshot = createStage9PermissionSnapshot({
      sessionId: "session_desktop_001",
      externalApprovals,
      terminalSlots,
      agentRun,
      runtime,
      mobilePolicy,
      createdAt,
    });

    expect(snapshot.queue.length).toBeGreaterThanOrEqual(3);
    expect(snapshot.summary.pending).toBe(snapshot.queue.length);
    expect(snapshot.summary.denied).toBe(2);
    expect(snapshot.items.some((item) => item.actor === "external_channel" && item.sourceTrust === "untrusted")).toBe(true);
    expect(snapshot.items.some((item) => item.action === "remote_workspace")).toBe(true);
    expect(nextRequiredPermission(snapshot)?.state).toBe("required");
  });

  it("터미널 슬롯의 실제 lastCommandPreview만 commandPreview로 싣고, 명령 없는 항목엔 비워 둔다(정직)", () => {
    const snapshot = createStage9PermissionSnapshot({
      sessionId: "session_desktop_cmd",
      externalApprovals: [],
      terminalSlots,
      agentRun,
      runtime,
      mobilePolicy,
      providerReadiness: {
        id: "provider_readiness_mimo",
        providerProfileId: "provider_mimo",
        status: "needs_approval",
        executionMode: "remote",
        modelCount: 1,
        secretAvailability: "available",
        canRunCompletion: false,
        canUseAutomaticMemory: false,
        reason: "원격 호출 승인 필요",
        warnings: [],
        createdAt,
      },
      createdAt,
    });

    const terminalItem = snapshot.queue.find((item) => item.sourceItemId === "permission_terminal_slot_dgx");
    expect(terminalItem?.commandPreview).toBe("pnpm -w test");

    // provider 항목은 명령이 없으니 commandPreview를 합성하지 않는다
    const providerItem = snapshot.queue.find((item) => item.sourceItemId === "permission_provider_provider_mimo");
    expect(providerItem).toBeDefined();
    expect(providerItem?.commandPreview).toBeUndefined();
  });

  it("applies operator approval decisions without removing denied mobile boundaries", () => {
    const externalApprovals = [
      {
        id: "external_approval_demo",
        ingressEventId: "ingress_event_demo",
        channel: "webhook" as const,
        summary: "do external ingress thing",
        permissions: ["run_safe_commands", "secret_access"] as PermissionLevel[],
        state: "required" as const,
        createdAt,
      },
    ];
    const pendingSnapshot = createStage9PermissionSnapshot({
      sessionId: "session_desktop_001",
      externalApprovals,
      terminalSlots,
      agentRun,
      runtime,
      mobilePolicy,
      createdAt,
    });
    const firstPending = nextRequiredPermission(pendingSnapshot);

    const approvedSnapshot = createStage9PermissionSnapshot({
      sessionId: "session_desktop_001",
      externalApprovals,
      terminalSlots,
      agentRun,
      runtime,
      mobilePolicy,
      decisions: firstPending ? { [firstPending.sourceItemId]: "approved" } : {},
      createdAt,
    });

    expect(approvedSnapshot.summary.approved).toBe(1);
    expect(approvedSnapshot.summary.denied).toBe(2);
    expect(approvedSnapshot.queue.length).toBe(pendingSnapshot.queue.length - 1);
  });

  it("requires approval for customer replies and email sends from external channels", () => {
    const snapshot = createStage9PermissionSnapshot({
      sessionId: "session_desktop_001",
      externalApprovals: [
        {
          id: "approval_customer_reply",
          ingressEventId: "ingress_customer_reply",
          channel: "webhook",
          summary: "send customer reply about refund policy",
          permissions: [],
          state: "required",
          createdAt,
        },
        {
          id: "approval_email_send",
          ingressEventId: "ingress_email_send",
          channel: "api",
          summary: "email the customer a status update",
          permissions: [],
          state: "required",
          createdAt,
        },
      ],
      terminalSlots: [],
      agentRun,
      runtime,
      mobilePolicy,
      createdAt,
    });

    const actions = snapshot.items.map((item) => item.action);
    expect(actions).toContain("customer_reply");
    expect(actions).toContain("email_send");
    expect(snapshot.items.find((item) => item.action === "customer_reply")?.decision).toBe("approval_required");
    expect(snapshot.items.find((item) => item.action === "email_send")?.decision).toBe("approval_required");
  });

  it("denies unknown external effects by default", () => {
    const snapshot = createStage9PermissionSnapshot({
      sessionId: "session_desktop_001",
      externalApprovals: [
        {
          id: "approval_unknown_effect",
          ingressEventId: "ingress_unknown_effect",
          channel: "webhook",
          summary: "do the strange outside thing",
          permissions: [],
          state: "required",
          createdAt,
        },
      ],
      terminalSlots: [],
      agentRun,
      runtime,
      mobilePolicy,
      createdAt,
    });

    const unknown = snapshot.items.find((item) => item.action === "unknown_external_effect");
    expect(unknown?.state).toBe("rejected");
    expect(unknown?.decision).toBe("deny");
    expect(snapshot.queue.some((item) => item.sourceItemId === unknown?.id)).toBe(false);
  });

  it("adds provider completion approval when runtime readiness needs approval", () => {
    const providerReadiness: ProviderRuntimeReadiness = {
      id: "provider_readiness_apifun",
      providerProfileId: "provider_apifun_claude",
      status: "needs_approval",
      executionMode: "remote",
      modelCount: 4,
      selectedModelId: "claude-code-compatible",
      secretAvailability: "available",
      canRunCompletion: true,
      canUseAutomaticMemory: false,
      reason: "untrusted provider can run only after explicit approval and reduced memory context",
      warnings: ["prompt and memory may pass through a custom/reseller endpoint"],
      createdAt,
    };

    const snapshot = createStage9PermissionSnapshot({
      sessionId: "session_desktop_001",
      externalApprovals: [],
      terminalSlots: [],
      agentRun,
      runtime,
      mobilePolicy,
      providerReadiness,
      createdAt,
    });

    const providerItem = snapshot.items.find((item) => item.action === "provider_completion");
    expect(providerItem?.state).toBe("required");
    expect(providerItem?.requestedLevels).toEqual(["network_access", "secret_access"]);
    expect(snapshot.queue.some((item) => item.sourceItemId === providerItem?.id)).toBe(true);
  });

  it("evaluates a provider completion through the common permission gate", () => {
    const result = evaluatePermissionGate({
      sessionId: "session_desktop_001",
      subjectId: "provider_apifun_claude_a",
      actor: "agent",
      channel: "agent",
      sourceTrust: "limited",
      action: "provider_completion",
      requestedLevels: ["network_access", "secret_access"],
      createdAt,
    });

    expect(result.requiresApproval).toBe(true);
    expect(result.queueItem?.sourceItemId).toBe(result.item.id);
    expect(result.queueItem).toEqual(
      expect.objectContaining({
        action: "provider_completion",
        reason: result.item.reason,
        sourceTrust: "limited",
      }),
    );
    expect(result.item.reason).toContain("승인이 필요");
  });

  it("denies dangerous mobile actions in the common permission gate", () => {
    const result = evaluatePermissionGate({
      sessionId: "session_desktop_001",
      subjectId: "mobile_terminal",
      actor: "mobile",
      channel: "mobile",
      sourceTrust: "limited",
      action: "terminal_run",
      requestedLevels: ["run_dangerous_commands"],
      createdAt,
    });

    expect(result.denied).toBe(true);
    expect(result.queueItem).toBeUndefined();
  });

  it("routes token budget overflow to approval instead of direct execution", () => {
    const result = evaluatePermissionGate({
      sessionId: "session_desktop_001",
      subjectId: "provider_codex_oauth",
      actor: "agent",
      channel: "agent",
      sourceTrust: "trusted",
      action: "provider_completion",
      requestedLevels: ["network_access"],
      costEstimateTokens: 120_000,
      maxAllowedTokens: 64_000,
      createdAt,
    });

    expect(result.requiresApproval).toBe(true);
    expect(result.item.reason).toContain("예산");
    expect(result.queueItem?.costEstimateTokens).toBe(120_000);
  });

  it("keeps replay metadata on queued gate approvals", () => {
    const gateInput = {
      sessionId: "session_desktop_001",
      subjectId: "tmux_dispatch",
      actor: "agent" as const,
      channel: "desktop" as const,
      sourceTrust: "trusted" as const,
      action: "terminal_run" as const,
      requestedLevels: ["run_safe_commands"] as PermissionLevel[],
      replayKind: "tmux_dispatch" as const,
      replayEndpoint: "/tmux/dispatch",
      createdAt,
    };

    const result = evaluatePermissionGate(gateInput);

    expect(result.requiresApproval).toBe(true);
    expect(result.queueItem).toEqual(
      expect.objectContaining({
        replayKind: "tmux_dispatch",
        replayEndpoint: "/tmux/dispatch",
      }),
    );
  });
});
