import { describe, expect, it } from "vitest";
import type {
  AgentProfile,
  ConversationMessage,
  EventEnvelope,
  ProviderProfile,
  RuntimeSnapshot,
} from "@ai-orchestrator/protocol";
import { runStage4AgentPipeline } from "./stage4Runtime";
import { createLocalClientEventCache } from "./stage29LocalEventStore";

const messages: ConversationMessage[] = [
  {
    id: "message_user_1",
    sessionId: "session_desktop_001",
    role: "user",
    content: "안티그래비티 프로젝트 토론을 구동해보자.",
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
    configSource: "internal",
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
    configSource: "internal",
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
];

const events: EventEnvelope[] = [];

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
  updatedAt: "2026-05-24T00:00:00.000Z",
};

describe("stage4 agent runtime integration pipeline", () => {
  it("runs the full pipeline: live debate -> extract coding packet -> create agent run -> emit to event store", async () => {
    // 1. Setup mock fetch for LLM completion
    let apiCallCount = 0;
    const fakeFetch = async (url: string, init?: RequestInit) => {
      apiCallCount++;
      return {
        ok: true,
        text: async () =>
          JSON.stringify({
            status: "succeeded",
            content: `에이전트 제안문입니다. [[tag:evidence]]`,
            route: "server_proxy",
          }),
      } as Response;
    };

    // 2. Setup mock local event storage cache
    const localStorageMock: Record<string, string> = {};
    const mockStorage = {
      getItem: (key: string) => localStorageMock[key] ?? null,
      setItem: (key: string, value: string) => {
        localStorageMock[key] = value;
      },
      removeItem: (key: string) => {
        delete localStorageMock[key];
      },
      clear: () => {
        Object.keys(localStorageMock).forEach((k) => delete localStorageMock[k]);
      },
      key: (index: number) => Object.keys(localStorageMock)[index] ?? null,
      length: Object.keys(localStorageMock).length,
    };
    const eventCache = createLocalClientEventCache(mockStorage);

    // 3. Execute integrated pipeline
    const pipelineResult = await runStage4AgentPipeline({
      stage3Input: {
        messages,
        agents,
        providers,
        events,
        runtime,
      },
      eventCache,
      debateId: "debate_pipeline_test",
      fetchImpl: fakeFetch as any,
      createdAt: "2026-05-24T00:00:00.000Z",
    });

    // 4. Verify Debate Session
    expect(pipelineResult.debateSession.id).toBe("debate_pipeline_test");
    expect(pipelineResult.debateSession.rounds).toHaveLength(7);
    expect(apiCallCount).toBeGreaterThan(0);

    // 5. Verify Coding Packet
    const packet = pipelineResult.codingPacket;
    expect(packet.goal).toBe("안티그래비티 프로젝트 토론을 구동해보자.");
    expect(packet.context).toContain("(agent_orchestrator) 에이전트 제안문입니다.");

    // 6. Verify Agent Run
    const run = pipelineResult.agentRun;
    expect(run.status).toBe("ready_for_approval"); // Steps with no terminal execution defaults to planned
    expect(run.soulSummary).toContain("Orchestrator summary soul");

    // 7. Verify Event Store emission
    const sessionEvents = await eventCache.listBySession("session_desktop_001");
    expect(sessionEvents).toHaveLength(2);

    const codingPacketEvent = sessionEvents.find((e) => e.type === "coding_packet.created");
    expect(codingPacketEvent).toBeDefined();
    expect(codingPacketEvent?.payload).toEqual(packet);

    const agentRunEvent = sessionEvents.find((e) => e.type === "agent_run.created");
    expect(agentRunEvent).toBeDefined();
    expect(agentRunEvent?.payload).toEqual(run);
  });
});
