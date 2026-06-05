import type { OperatorCockpitSnapshot } from "@ai-orchestrator/protocol";

export const mockSnapshot: OperatorCockpitSnapshot = {
  id: "snap_mock_001",
  timestamp: new Date().toISOString(),
  fleet: [
    {
      workerId: "w-1",
      role: "companion",
      status: "blocked",
      statusRingColor: "yellow",
      worktree: "/tmp/wt-ui-mock",
      branch: "feat/mock-first",
      blockedReason: "Waiting for user approval to execute rm -rf",
      securityTier: "container"
    },
    {
      workerId: "w-2",
      role: "orchestrator",
      status: "working",
      statusRingColor: "green",
      worktree: "/tmp/wt-ui-mock",
      branch: "feat/mock-first",
      securityTier: "firecracker"
    }
  ],
  approvals: [
    {
      blockReason: "High-risk command execution",
      evidenceRefs: [
        { kind: "file_reference", id: "app.ts", summary: "Command modifies root directory", reference: "app.ts" }
      ],
      commandPreview: "rm -rf /dist",
      payloadBindingStatus: "bound"
    }
  ],
  handoffs: [
    {
      ownerAgentId: "w-1",
      nextAction: "Run tests",
      missingInfoSlots: [
        { id: "db_creds", label: "Test database credentials", reason: "Required for test", status: "missing", required: true }
      ]
    }
  ],
  memory: {
    contextReasons: ["Retrieved from conversation history", "Matched 'test' keyword"],
    macBookAuthorityEnabled: true,
    dgxMirrorHealth: "healthy",
    contradictionWarnings: []
  },
  routing: {
    selectedModelId: "claude-3-5-sonnet",
    fallbackStatus: "available",
    costBadge: "medium",
    speedBadge: "fast",
    trustBadge: "trusted"
  },
  recovery: {
    offlineResumeSupported: true,
    outboxSyncStatus: "synced",
    healthIndicators: ["db-ok", "network-ok"]
  },
  dispatchHistory: [
    {
      dispatchId: "d-1",
      requesterAgentId: "Operator",
      approvalState: "approved",
      replayPayloadDigest: "HMAC-SHA256: 8a9f2c...",
      tamperWarning: false,
      createdAt: new Date(Date.now() - 3600000).toISOString()
    }
  ]
};
