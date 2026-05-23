import { describe, expect, it } from "vitest";
import type {
  AgentProfile,
  ConversationMessage,
  EventEnvelope,
  ProviderProfile,
  RuntimeSnapshot,
} from "@ai-orchestrator/protocol";
import { createStage3DebateSession } from "./stage3Runtime";

const messages: ConversationMessage[] = [
  {
    id: "message_user_1",
    sessionId: "session_desktop_001",
    role: "user",
    content: "토론으로 돌려보고 코딩 패킷으로 넘기자",
    createdAt: "2026-05-24T00:00:00.000Z",
  },
];

const agents: AgentProfile[] = [
  {
    id: "agent_orchestrator",
    name: "Orchestrator",
    kind: "virtual",
    role: "orchestrator",
    providerProfileId: "provider_mock",
    modelId: "mock-orchestrator",
    soulMode: "summary",
    enabled: true,
  },
  {
    id: "agent_architect",
    name: "Architect",
    kind: "virtual",
    role: "architect",
    providerProfileId: "provider_mock",
    modelId: "mock-architect",
    soulMode: "summary",
    enabled: true,
  },
  {
    id: "agent_reviewer",
    name: "Reviewer",
    kind: "virtual",
    role: "reviewer",
    providerProfileId: "provider_mock",
    modelId: "mock-reviewer",
    soulMode: "retrieved",
    enabled: true,
  },
];

const providers: ProviderProfile[] = [
  {
    id: "provider_mock",
    name: "Mock Provider",
    kind: "custom",
    enabled: true,
    tags: ["mock"],
    trustLevel: "trusted",
  },
  {
    id: "provider_proxy",
    name: "Proxy Provider",
    kind: "custom",
    enabled: true,
    tags: ["proxy"],
    trustLevel: "untrusted",
  },
];

const events: EventEnvelope[] = [
  {
    id: "event_1",
    sessionId: "session_desktop_001",
    type: "conversation.message.created",
    payload: {},
    createdAt: "2026-05-24T00:00:00.000Z",
    source: "desktop",
    sourceTrust: "trusted",
    redacted: false,
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
  updatedAt: "2026-05-24T00:00:00.000Z",
};

describe("stage3 debate runtime", () => {
  it("promotes conversation context into a tagged debate session", () => {
    const session = createStage3DebateSession({
      messages,
      agents,
      providers,
      events,
      runtime,
      createdAt: "2026-05-24T00:00:00.000Z",
    });

    expect(session.problem).toBe("토론으로 돌려보고 코딩 패킷으로 넘기자");
    expect(session.rounds).toHaveLength(7);
    expect(session.rounds.flatMap((round) => round.utterances).some((utterance) => utterance.tags.includes("risk"))).toBe(true);
    expect(session.humanPeek).toHaveLength(3);
    expect(session.statusHub.find((item) => item.id === "providers")?.value).toBe("2 active / 1 risky");
  });
});
