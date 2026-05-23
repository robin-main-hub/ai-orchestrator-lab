import { describe, expect, it } from "vitest";
import type { MobileActionPolicy, RuntimeSnapshot, TerminalSlot } from "@ai-orchestrator/protocol";
import { createStage4AgentRun } from "./stage4Runtime";
import { createTelegramDemoInput, createStage8IngressSnapshot } from "./stage8Ingress";
import { createStage9PermissionSnapshot, nextRequiredPermission } from "./stage9Permission";

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
    eventStoreMode: "server_authoritative_with_local_outbox",
    offlineWritePolicy: "append_local_outbox",
    conflictPolicy: "server_revision_lww_with_conflict_events",
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
  },
];

const agentRun = createStage4AgentRun({
  packet: {
    goal: "Build permission matrix",
    context: ["event store first"],
    decisions: ["gate execution"],
    rejectedOptions: ["run commands from Telegram directly"],
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
      enabled: true,
    },
  ],
  messages: [],
  events: [],
  createdAt,
});

describe("stage9 permission matrix", () => {
  it("merges external approvals, terminal slots, run steps, and mobile policy", () => {
    const ingress = createStage8IngressSnapshot(createTelegramDemoInput(createdAt));
    const snapshot = createStage9PermissionSnapshot({
      sessionId: "session_desktop_001",
      externalApprovals: ingress.approvals,
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

  it("applies operator approval decisions without removing denied mobile boundaries", () => {
    const ingress = createStage8IngressSnapshot(createTelegramDemoInput(createdAt));
    const pendingSnapshot = createStage9PermissionSnapshot({
      sessionId: "session_desktop_001",
      externalApprovals: ingress.approvals,
      terminalSlots,
      agentRun,
      runtime,
      mobilePolicy,
      createdAt,
    });
    const firstPending = nextRequiredPermission(pendingSnapshot);

    const approvedSnapshot = createStage9PermissionSnapshot({
      sessionId: "session_desktop_001",
      externalApprovals: ingress.approvals,
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
});
