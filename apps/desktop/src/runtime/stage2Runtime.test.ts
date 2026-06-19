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
  configSource: "internal",
  enabled: true,
};

const provider: ProviderProfile = {
  id: "provider_mimo_token_openai",
  name: "MiMo Token Plan OpenAI",
  kind: "openai",
  defaultModel: "mimo-v2.5-pro",
  enabled: true,
  tags: ["mimo", "token-plan", "server-proxy"],
  trustLevel: "limited",
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

// Characterization tests for the redaction boundary (no behavior change).
// These pin existing redactForEventStore / createStage2Event behavior on paths
// the suite above did not cover: url basic-auth, generic env-var secrets,
// nested recursion, content-independent key redaction, primitive preservation,
// and the createStage2Event `redacted` flag.
describe("redactForEventStore — redaction boundary characterization", () => {
  it("strips basic-auth credentials embedded in URLs", () => {
    const redacted = redactForEventStore({
      note: "clone https://alice:s3cr3t@github.com/repo.git now",
    }) as { note: string };

    expect(redacted.note).toBe(
      "clone https://[REDACTED:url_auth]@github.com/repo.git now",
    );
    expect(redacted.note).not.toContain("s3cr3t");
    expect(redacted.note).not.toContain("alice");
  });

  it("redacts generic uppercase secret env assignments (not only named keys)", () => {
    const redacted = redactForEventStore({
      command: "export DEPLOY_TOKEN=placeholder",
    }) as { command: string };

    expect(redacted.command).toBe("export [REDACTED:env_secret]");
    expect(redacted.command).not.toContain("placeholder");
  });

  it("recurses through nested arrays and objects, preserving structure", () => {
    const redacted = redactForEventStore({
      items: [{ password: "hunter2", note: "ok" }, "sk-deadbeefcafe1234"],
    }) as { items: [{ password: string; note: string }, string] };

    expect(redacted.items).toHaveLength(2);
    expect(redacted.items[0].password).toBe("[REDACTED:secret_ref_only]");
    expect(redacted.items[0].note).toBe("ok");
    expect(redacted.items[1]).toBe("[REDACTED:api_key]");
    expect(JSON.stringify(redacted)).not.toContain("hunter2");
    expect(JSON.stringify(redacted)).not.toContain("deadbeefcafe1234");
  });

  it("redacts by sensitive key name regardless of value content", () => {
    const redacted = redactForEventStore({
      token: "literally-anything-even-not-secret-looking",
    }) as { token: string };

    expect(redacted.token).toBe("[REDACTED:secret_ref_only]");
  });

  it("leaves non-string primitives untouched", () => {
    const input = { count: 42, enabled: true, missing: null, ratio: 3.14 };

    expect(redactForEventStore(input)).toEqual(input);
  });

  it("flags createStage2Event payloads as redacted when a secret is present", () => {
    const event = createStage2Event({
      type: "conversation.message.created",
      payload: { apiKey: "sk-deadbeefcafe1234" },
    });

    expect(event.redacted).toBe(true);
    expect((event.payload as { apiKey: string }).apiKey).toBe(
      "[REDACTED:secret_ref_only]",
    );
  });

  it("does not flag createStage2Event payloads with no redactable content", () => {
    const payload = { content: "hello world", count: 3 };
    const event = createStage2Event({
      type: "conversation.message.created",
      payload,
    });

    expect(event.redacted).toBe(false);
    expect(event.payload).toEqual(payload);
  });
});
