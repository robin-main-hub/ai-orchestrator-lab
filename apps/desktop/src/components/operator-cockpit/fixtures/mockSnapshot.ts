import type { OperatorCockpitSnapshot } from "@ai-orchestrator/protocol";

export const mockSnapshot: OperatorCockpitSnapshot = {
  id: "snap_mock_001",
  timestamp: new Date().toISOString(),
  fleet: [
    {
      workerId: "makima",
      role: "orchestrator",
      status: "working",
      statusRingColor: "green",
      worktree: "worktrees/operator-cockpit",
      branch: "feat/desktop-cockpit-mock",
      securityTier: "firecracker"
    },
    {
      workerId: "shinobu",
      role: "architect",
      status: "idle",
      statusRingColor: "green",
      worktree: "worktrees/operator-cockpit",
      branch: "architecture",
      securityTier: "container"
    },
    {
      workerId: "kagura",
      role: "reviewer",
      status: "blocked",
      statusRingColor: "red",
      worktree: "worktrees/review",
      branch: "review",
      blockedReason: "Waiting for code completion from Builder",
      securityTier: "container"
    },
    {
      workerId: "rem",
      role: "executor",
      status: "waiting_approval",
      statusRingColor: "yellow",
      worktree: "worktrees/prod-dispatch",
      branch: "main",
      securityTier: "gvisor"
    },
    {
      workerId: "yoshiko",
      role: "skeptic",
      status: "idle",
      statusRingColor: "gray",
      worktree: "worktrees/ideas",
      branch: "concepts",
      securityTier: "tmux"
    },
    {
      workerId: "mao",
      role: "researcher",
      status: "working",
      statusRingColor: "green",
      worktree: "worktrees/research",
      branch: "references",
      securityTier: "container"
    },
    {
      workerId: "herta",
      role: "domain_expert",
      status: "idle",
      statusRingColor: "yellow",
      worktree: "worktrees/domain",
      branch: "spec-review",
      securityTier: "container"
    }
  ],
  approvals: [
    {
      blockReason: "Production deployment requires explicit approval. Changes include authentication middleware and session management updates.",
      evidenceRefs: [
        { kind: "artifact", id: "security-review", summary: "Security Review", reference: "tests/security.log" },
        { kind: "artifact", id: "test-results", summary: "Test Results", reference: "vitest" }
      ],
      commandPreview: "deploy --env=prod --tag=v2.1.0",
      payloadBindingStatus: "bound"
    },
    {
      blockReason: "Code review requires additional context from original author.",
      evidenceRefs: [
        { kind: "file_reference", id: "design-discussion", summary: "Design Discussion", reference: "docs/operator-cockpit.md" }
      ],
      commandPreview: "review --pr=142 --request-changes",
      payloadBindingStatus: "unbound"
    }
  ],
  handoffs: [
    {
      ownerAgentId: "kagura",
      nextAction: "Re-check the premium cockpit visual patch after Builder finishes screenshot verification.",
      missingInfoSlots: [
        { id: "desktop-screenshot", label: "Desktop screenshot", reason: "Required for visual QA", status: "missing", required: true },
        { id: "mobile-screenshot", label: "Mobile screenshot", reason: "Needed for responsive review", status: "missing", required: false }
      ]
    }
  ],
  memory: {
    contextReasons: [
      "Kimi premium UI research favors an Obsidian glass command deck.",
      "MiMo context audit requires read-only snapshot consumption.",
      "Claude guardrail review forbids optimistic mutation paths."
    ],
    macBookAuthorityEnabled: true,
    dgxMirrorHealth: "degraded",
    contradictionWarnings: ["DGX continuity mirror is stale by 2 sync windows."]
  },
  routing: {
    selectedModelId: "provider_apifun_claude:claude-opus-4-8",
    fallbackStatus: "active",
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
      dispatchId: "dispatch-248",
      requesterAgentId: "rem",
      approvalState: "approved",
      replayPayloadDigest: "sha256:a13c2f0b934d6f7a8df63a912b7d4e2fcab901224b56e7d8069d162d4f928dc1",
      tamperWarning: false,
      createdAt: new Date(Date.now() - 5 * 60000).toISOString()
    },
    {
      dispatchId: "dispatch-249",
      requesterAgentId: "kagura",
      approvalState: "required",
      replayPayloadDigest: "sha256:9f7ef82231e862f70a14fedb28e6747aa83413ce91a6cafdc715ee72821c1170",
      tamperWarning: true,
      createdAt: new Date(Date.now() - 12 * 60000).toISOString()
    }
  ]
};
