import { describe, expect, it } from "vitest";
import type { AgentProfile, ConversationMessage, ProviderProfile } from "@ai-orchestrator/protocol";
import {
  InMemoryEventStore,
  createCodingPacketFromConversation,
  createStage2Event,
  redactForEventStore,
  renderObsidianMarkdown,
} from "./stage2Runtime";

const agent: AgentProfile = {
  id: "agent_orchestrator",
  name: "Orchestrator",
  kind: "virtual",
  role: "orchestrator",
  soulMode: "summary",
  enabled: true,
};

const provider: ProviderProfile = {
  id: "provider_mock",
  name: "Mock Provider",
  kind: "custom",
  defaultModel: "mock-orchestrator",
  enabled: true,
  tags: ["mock"],
  trustLevel: "trusted",
};

const messages: ConversationMessage[] = [
  {
    id: "message_1",
    sessionId: "session_desktop_001",
    role: "user",
    content: "Build the stage2 event flow",
    createdAt: "2026-05-24T00:00:00.000Z",
  },
];

describe("stage2 runtime helpers", () => {
  it("redacts obvious secrets before event persistence", () => {
    const redacted = redactForEventStore({
      apiKey: "sk-thisshouldnotpersist",
      command: "Authorization: Bearer abc.def.ghi",
    });

    expect(JSON.stringify(redacted)).not.toContain("sk-thisshouldnotpersist");
    expect(JSON.stringify(redacted)).not.toContain("abc.def.ghi");
  });

  it("creates coding packets from the current conversation state", () => {
    const packet = createCodingPacketFromConversation({ messages, agent, provider });

    expect(packet.goal).toBe("Build the stage2 event flow");
    expect(packet.filesToInspect).toContain("apps/desktop/src/runtime/stage2Runtime.ts");
    expect(packet.decisions.join(" ")).toContain("Event Store");
  });

  it("renders Obsidian markdown as an event-store projection", () => {
    const packet = createCodingPacketFromConversation({ messages, agent, provider });
    const event = createStage2Event({
      type: "coding_packet.created",
      payload: { packet, apiKey: "sk-thisshouldnotpersist" },
      createdAt: "2026-05-24T00:00:00.000Z",
    });
    const markdown = renderObsidianMarkdown({
      messages,
      packet,
      events: [event],
      createdAt: "2026-05-24T00:00:00.000Z",
    });

    expect(markdown).toContain("source: event-store-projection");
    expect(markdown).toContain("coding_packet.created");
    expect(markdown).not.toContain("sk-thisshouldnotpersist");
  });

  it("keeps an in-memory event store compatible with the protocol interface", async () => {
    const store = new InMemoryEventStore();
    const event = createStage2Event({
      type: "conversation.message.created",
      payload: { content: "hello" },
    });

    await store.append(event, { redactBeforePersist: true });

    await expect(store.getEvent(event.id)).resolves.toMatchObject({ id: event.id });
    await expect(store.listBySession("session_desktop_001")).resolves.toHaveLength(1);
  });
});
