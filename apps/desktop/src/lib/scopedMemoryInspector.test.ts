import { describe, expect, it } from "vitest";
import type { CodingPacket, ConversationMessage, EventEnvelope, MemoryRecord, ProviderProfile } from "@ai-orchestrator/protocol";
import { createStage6MemoryInspector } from "../runtime/stage6Memory";
import { resolveScopedMemoryInspector } from "./scopedMemoryInspector";
import type { AgentChannelMemoryScope } from "./agentConversationChannels";

const createdAt = "2026-06-06T00:00:00.000Z";

const provider: ProviderProfile = {
  id: "provider_mimo",
  name: "MiMo",
  kind: "custom",
  enabled: true,
  tags: [],
  trustLevel: "trusted",
};

const packet: CodingPacket = {
  goal: "reviewer private context",
  context: [],
  decisions: [],
  rejectedOptions: [],
  constraints: [],
  filesToInspect: [],
  implementationPlan: [],
  verificationPlan: [],
  reviewerNotes: [],
};

const messages: ConversationMessage[] = [
  {
    id: "message_user",
    sessionId: "session_desktop_001",
    role: "user",
    content: "reviewer private context",
    createdAt,
  },
];

const events: EventEnvelope[] = [];

const orchestratorScope: AgentChannelMemoryScope = {
  agentId: "agent_orchestrator",
  providerProfileId: "provider_mimo",
  roomId: "room_session_desktop_001_agent_orchestrator",
  roomLabel: "에이전트 전용 방",
  sessionId: "session_desktop_001",
  namespace: "agent:agent_orchestrator/session:session_desktop_001/provider:provider_mimo",
  recallTraceId: "recall_agent_orchestrator_session_desktop_001_provider_mimo",
};

const reviewerScope: AgentChannelMemoryScope = {
  agentId: "agent_reviewer",
  providerProfileId: "provider_mimo",
  roomId: "room_session_desktop_001_agent_reviewer",
  roomLabel: "에이전트 전용 방",
  sessionId: "session_desktop_001",
  namespace: "agent:agent_reviewer/session:session_desktop_001/provider:provider_mimo",
  recallTraceId: "recall_agent_reviewer_session_desktop_001_provider_mimo",
};

function memoryRecord(id: string, agentId: string): MemoryRecord {
  return {
    id,
    layer: "episode",
    scope: "session",
    kind: "context",
    title: "reviewer private context",
    content: "reviewer private context",
    sourceChannel: "desktop",
    trustLevel: "trusted",
    sessionId: "session_desktop_001",
    tags: [`agent:${agentId}`, "provider:provider_mimo"],
    activationState: "active",
    createdAt,
    pinned: false,
  };
}

describe("resolveScopedMemoryInspector", () => {
  it("reuses the current inspector when the target scope is already active", async () => {
    let recallCount = 0;
    const currentInspector = createStage6MemoryInspector({
      records: [memoryRecord("memory_orchestrator", "agent_orchestrator")],
      messages,
      packet,
      events,
      provider,
      createdAt,
    });

    const resolved = await resolveScopedMemoryInspector({
      currentInspector,
      currentScope: orchestratorScope,
      targetScope: orchestratorScope,
      recallRecords: async () => {
        recallCount++;
        return [memoryRecord("memory_reviewer", "agent_reviewer")];
      },
      messages,
      packet,
      events,
      provider,
      createdAt,
    });

    expect(resolved).toBe(currentInspector);
    expect(recallCount).toBe(0);
  });

  it("builds a fresh inspector from the requested target scope recall", async () => {
    const currentInspector = createStage6MemoryInspector({
      records: [memoryRecord("memory_orchestrator", "agent_orchestrator")],
      messages,
      packet,
      events,
      provider,
      createdAt,
    });

    const resolved = await resolveScopedMemoryInspector({
      currentInspector,
      currentScope: orchestratorScope,
      targetScope: reviewerScope,
      recallRecords: async (scope) => {
        expect(scope).toBe(reviewerScope);
        return [memoryRecord("memory_reviewer", "agent_reviewer")];
      },
      messages,
      packet,
      events,
      provider,
      createdAt,
    });

    expect(resolved).not.toBe(currentInspector);
    expect(resolved.trace.results.map((result) => result.record.id)).toContain("memory_reviewer");
    expect(resolved.trace.results.map((result) => result.record.id)).not.toContain("memory_orchestrator");
  });
});
