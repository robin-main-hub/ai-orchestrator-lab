import { describe, expect, it } from "vitest";
import type { AgentProfile, ConversationMessage, ProviderProfile } from "@ai-orchestrator/protocol";
import {
  DEFAULT_SESSION_ID,
  InMemoryEventStore,
  appendEventToLog,
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

// Characterization tests (no behavior change, pure, no I/O) for two previously
// unreferenced stage2 exports: appendEventToLog and DEFAULT_SESSION_ID. The suites
// above never import either. appendEventToLog is the in-memory, newest-first event
// LOG buffer (a display/projection cap, NOT the persistent EventStore) — its
// `[event, ...events].slice(0, limit)` does two load-bearing things never pinned:
// it prepends the newest event at the head and caps the buffer at `limit` (default
// 48) by dropping the OLDEST tail, never mutating the caller's array. A regression
// to either (append at tail, or cap from the wrong end) would silently reorder or
// evict the wrong events in the live log view. DEFAULT_SESSION_ID is the default
// session id; the store test above exercises it only via the hardcoded literal
// "session_desktop_001", never tied to the const — so we pin the value AND that
// createStage2Event's `sessionId =` default arm derives from it (and an explicit
// sessionId overrides), so a const rename can't silently desync the default event
// session from callers that compare against the const.
describe("appendEventToLog — capped newest-first log buffer", () => {
  const ev = (marker: string) =>
    createStage2Event({ type: marker, payload: {}, createdAt: "2026-05-24T00:00:00.000Z" });

  it("prepends the newest event at the head, preserving prior order", () => {
    const e1 = ev("e1");
    const e2 = ev("e2");
    const e3 = ev("e3");
    const log = appendEventToLog(appendEventToLog([e1], e2), e3);
    expect(log.map((e) => e.type)).toEqual(["e3", "e2", "e1"]);
  });

  it("caps at the default limit of 48 by dropping the oldest tail", () => {
    // seed 48 events oldest→newest into the buffer (each append prepends)
    let log = [] as ReturnType<typeof appendEventToLog>;
    for (let i = 0; i < 48; i += 1) log = appendEventToLog(log, ev(`e${i}`));
    expect(log).toHaveLength(48);
    expect(log[0]!.type).toBe("e47"); // newest at head
    expect(log[47]!.type).toBe("e0"); // oldest at tail

    // one more push stays at 48 and evicts the oldest (e0), newest now at head
    const overflowed = appendEventToLog(log, ev("e48"));
    expect(overflowed).toHaveLength(48);
    expect(overflowed[0]!.type).toBe("e48");
    expect(overflowed.some((e) => e.type === "e0")).toBe(false);
    expect(overflowed[47]!.type).toBe("e1");
  });

  it("honors a custom limit and a limit of 0 yields an empty buffer", () => {
    const e1 = ev("e1");
    const e2 = ev("e2");
    const e3 = ev("e3");
    expect(appendEventToLog([e2, e1], e3, 2).map((e) => e.type)).toEqual(["e3", "e2"]);
    expect(appendEventToLog([e1], e2, 0)).toEqual([]);
  });

  it("returns the full buffer when under the limit and never mutates the input", () => {
    const e1 = ev("e1");
    const e2 = ev("e2");
    const input = [e1];
    const out = appendEventToLog(input, e2);
    expect(out.map((e) => e.type)).toEqual(["e2", "e1"]);
    // pure: the caller's array is untouched
    expect(input).toEqual([e1]);
    expect(input).toHaveLength(1);
  });
});

describe("DEFAULT_SESSION_ID — default session contract", () => {
  it("is the canonical desktop session id", () => {
    expect(DEFAULT_SESSION_ID).toBe("session_desktop_001");
  });

  it("createStage2Event's omitted sessionId defaults to the const (explicit overrides)", () => {
    // default arm — derived from the const, not the hardcoded literal the store test uses
    expect(createStage2Event({ type: "t", payload: {} }).sessionId).toBe(DEFAULT_SESSION_ID);
    // an explicit sessionId takes precedence over the default
    expect(
      createStage2Event({ sessionId: "session_custom_42", type: "t", payload: {} }).sessionId,
    ).toBe("session_custom_42");
  });
});
