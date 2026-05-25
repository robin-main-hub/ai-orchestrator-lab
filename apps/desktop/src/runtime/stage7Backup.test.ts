import { describe, expect, it } from "vitest";
import type { BackupProjection, CodingPacket, ConversationMessage, EventEnvelope, RuntimeSnapshot } from "@ai-orchestrator/protocol";
import { createSeedMemoryRecords, createStage6MemoryInspector } from "./stage6Memory";
import {
  applyStage7ProjectionStatuses,
  createStage7BackupSnapshot,
  getArtifactContent,
  getObsidianArtifact,
} from "./stage7Backup";

const createdAt = "2026-05-24T00:00:00.000Z";

const packet: CodingPacket = {
  goal: "Backup projections",
  context: ["Event Store source of truth"],
  decisions: ["Obsidian, Notion, Mobile are projections"],
  rejectedOptions: ["Use Notion as source of truth"],
  constraints: ["Redact sk-secret-token before export"],
  filesToInspect: ["apps/desktop/src/runtime/stage7Backup.ts"],
  implementationPlan: ["Create projection artifacts"],
  verificationPlan: ["typecheck", "test"],
  reviewerNotes: ["Mobile must not expose terminal typing"],
};

const messages: ConversationMessage[] = [
  {
    id: "message_1",
    sessionId: "session_desktop_001",
    role: "user",
    content: "export this with sk-super-secret-token",
    createdAt,
  },
];

const events: EventEnvelope[] = [
  {
    id: "event_1",
    sessionId: "session_desktop_001",
    type: "conversation.message.created",
    payload: {
      text: "Bearer abcdefghijk",
    },
    createdAt,
    source: "desktop",
    sourceTrust: "trusted",
    redacted: false,
  },
  {
    id: "event_delegation_detected",
    sessionId: "session_desktop_001",
    type: "agent.delegation.detected",
    payload: {
      sourceAgentId: "agent_chaerin",
      sourceRole: "companion",
      authorityLevel: "orchestrator_plus",
      targets: ["researcher"],
    },
    createdAt,
    source: "agent",
    sourceTrust: "trusted",
    redacted: false,
  },
  {
    id: "event_delegation_succeeded",
    sessionId: "session_desktop_001",
    type: "agent.delegation.succeeded",
    payload: {
      sourceAgentId: "agent_chaerin",
      target: "researcher",
      targetAgentId: "agent_researcher",
      targetRole: "researcher",
      route: "server_proxy",
      responsePreview: "research done with sk-delegation-secret-token",
    },
    createdAt,
    source: "agent",
    sourceTrust: "trusted",
    redacted: false,
  },
  {
    id: "event_delegation_blocked",
    sessionId: "session_desktop_001",
    type: "agent.delegation.blocked",
    payload: {
      sourceAgentId: "agent_builder",
      target: "executor",
      reason: "target role executor requires orchestrator_plus authority",
    },
    createdAt,
    source: "agent",
    sourceTrust: "trusted",
    redacted: false,
  },
];

const projections: BackupProjection[] = [
  {
    id: "backup_obsidian",
    sessionId: "session_desktop_001",
    target: "obsidian",
    status: "pending",
    redactionApplied: true,
  },
  {
    id: "backup_notion",
    sessionId: "session_desktop_001",
    target: "notion",
    status: "pending",
    redactionApplied: true,
  },
  {
    id: "backup_mobile",
    sessionId: "session_desktop_001",
    target: "mobile",
    status: "failed",
    redactionApplied: true,
  },
];

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

const memoryInspector = createStage6MemoryInspector({
  records: createSeedMemoryRecords(createdAt),
  messages,
  packet,
  events,
  createdAt,
});

describe("stage7 backup projections", () => {
  it("creates redacted projection artifacts with offline queue boundaries", () => {
    const snapshot = createStage7BackupSnapshot({
      messages,
      packet,
      events,
      projections,
      runtime,
      memoryInspector,
      createdAt,
    });
    const obsidian = getObsidianArtifact(snapshot);
    const obsidianContent = getArtifactContent(snapshot, obsidian?.id);

    expect(snapshot.artifacts).toHaveLength(3);
    expect(snapshot.sessionId).toBe("session_desktop_001");
    expect(obsidian?.status).toBe("ready");
    expect(obsidian?.destination).toContain("session_desktop_001.md");
    expect(obsidian?.contentPreview).toContain("[REDACTED:api_key]");
    expect(obsidianContent).not.toContain("sk-super-secret-token");
    expect(obsidianContent).toContain("## Memory Context");
    expect(obsidianContent).toContain("## Memory Relations");
    expect(obsidianContent).toContain("## Memory Reflection Issues");
    expect(obsidianContent).toContain("## Delegation Timeline");
    expect(obsidianContent).toContain("agent_chaerin -> agent_researcher");
    expect(obsidianContent).toContain("blocked :: agent_builder -> executor");
    expect(obsidianContent).not.toContain("sk-delegation-secret-token");
    expect(snapshot.artifacts.find((artifact) => artifact.target === "notion")?.status).toBe("queued");
    expect(snapshot.mobilePolicy.canTypeTerminal).toBe(false);
    expect(snapshot.mobilePolicy.canViewSecrets).toBe(false);
  });

  it("maps projection artifact states back to backup status chips", () => {
    const snapshot = createStage7BackupSnapshot({
      sessionId: "session_custom_001",
      messages,
      packet,
      events,
      projections,
      runtime: { ...runtime, dgxStatus: "online" },
      memoryInspector,
      createdAt,
    });
    const updated = applyStage7ProjectionStatuses(projections, snapshot);

    expect(updated.every((projection) => projection.redactionApplied)).toBe(true);
    expect(updated.every((projection) => projection.sessionId === "session_custom_001")).toBe(true);
    expect(updated.find((projection) => projection.target === "obsidian")?.status).toBe("synced");
    expect(updated.find((projection) => projection.target === "notion")?.status).toBe("synced");
  });

  it("includes memento context, relation and health metadata in remote summaries", () => {
    const snapshot = createStage7BackupSnapshot({
      messages,
      packet,
      events,
      projections,
      runtime: { ...runtime, dgxStatus: "online" },
      memoryInspector,
      createdAt,
    });
    const notionArtifact = snapshot.artifacts.find((artifact) => artifact.target === "notion");
    const mobileArtifact = snapshot.artifacts.find((artifact) => artifact.target === "mobile");
    const notionContent = getArtifactContent(snapshot, notionArtifact?.id);
    const mobileContent = getArtifactContent(snapshot, mobileArtifact?.id);

    expect(notionContent).toContain("memoryContext");
    expect(notionContent).toContain("memoryRelations");
    expect(notionContent).toContain("memoryIssues");
    expect(notionContent).toContain("\"delegation\"");
    expect(notionContent).toContain("\"succeeded\": 1");
    expect(notionContent).not.toContain("sk-delegation-secret-token");
    expect(mobileContent).toContain("relationLinks");
    expect(mobileContent).toContain("health");
    expect(mobileContent).toContain("\"delegation\"");
    expect(mobileContent).toContain("\"total\": 3");
  });
});
