import { describe, expect, it } from "vitest";
import type { AgentProfile, ConversationMessage, ProviderProfile } from "@ai-orchestrator/protocol";
import {
  InMemoryEventStore,
  buildMockAssistantReply,
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
  configSource: "internal",
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
      env: "DEEPSEEK_API_KEY=deepseek-secret APIFUN_API_KEY=apifun-secret",
      pem: "-----BEGIN PRIVATE KEY-----\nabc123\n-----END PRIVATE KEY-----",
    });

    expect(JSON.stringify(redacted)).not.toContain("sk-thisshouldnotpersist");
    expect(JSON.stringify(redacted)).not.toContain("abc.def.ghi");
    expect(JSON.stringify(redacted)).not.toContain("deepseek-secret");
    expect(JSON.stringify(redacted)).not.toContain("apifun-secret");
    expect(JSON.stringify(redacted)).not.toContain("abc123");
  });

  it("creates coding packets from the current conversation state", () => {
    const packet = createCodingPacketFromConversation({ messages, agent, provider });

    expect(packet.goal).toBe("Build the stage2 event flow");
    expect(packet.filesToInspect).toContain("apps/desktop/src/runtime/stage2Runtime.ts");
    expect(packet.decisions.join(" ")).toContain("Event Store");
  });

  it("mock 답변은 명시된 실행 모델명을 agent 고정 모델보다 우선 표시한다", () => {
    const reply = buildMockAssistantReply({
      agent: {
        ...agent,
        modelId: "mimo-v2.5-pro",
      },
      content: "fallback 확인",
      modelId: "mock-orchestrator",
      provider,
    });

    expect(reply).toContain("Mock Provider / mock-orchestrator");
    expect(reply).not.toContain("mimo-v2.5-pro");
  });

  it("carries attachment processing summaries into coding packet context", () => {
    const packet = createCodingPacketFromConversation({
      agent,
      provider,
      messages: [
        {
          id: "message_attachment",
          sessionId: "session_desktop_001",
          role: "user",
          content: "이 화면 기준으로 수정해줘",
          createdAt: "2026-05-24T00:01:00.000Z",
          metadata: {
            attachmentProcessingPlans: [
              {
                kind: "image",
                name: "screen.png",
                processingMode: "vision_candidate",
                size: 120_000,
                status: "accepted",
                storage: "metadata_only",
              },
              {
                kind: "document",
                name: "secret.pdf",
                processingMode: "metadata_only",
                reason: "파일 크기 제한 초과",
                size: 20_000_000,
                status: "rejected",
                storage: "metadata_only",
              },
            ],
          },
        },
      ],
    });

    expect(packet.context.join("\n")).toContain("screen.png");
    expect(packet.context.join("\n")).toContain("vision_candidate");
    expect(packet.reviewerNotes.join("\n")).toContain("secret.pdf");
    expect(packet.reviewerNotes.join("\n")).toContain("파일 크기 제한 초과");
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
