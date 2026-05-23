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
    eventStoreMode: "server_authoritative_with_local_outbox",
    offlineWritePolicy: "append_local_outbox",
    conflictPolicy: "server_revision_lww_with_conflict_events",
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
    expect(obsidian?.status).toBe("ready");
    expect(obsidian?.contentPreview).toContain("[REDACTED:api_key]");
    expect(obsidianContent).not.toContain("sk-super-secret-token");
    expect(snapshot.artifacts.find((artifact) => artifact.target === "notion")?.status).toBe("queued");
    expect(snapshot.mobilePolicy.canTypeTerminal).toBe(false);
    expect(snapshot.mobilePolicy.canViewSecrets).toBe(false);
  });

  it("maps projection artifact states back to backup status chips", () => {
    const snapshot = createStage7BackupSnapshot({
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
    expect(updated.find((projection) => projection.target === "obsidian")?.status).toBe("synced");
    expect(updated.find((projection) => projection.target === "notion")?.status).toBe("synced");
  });
});
