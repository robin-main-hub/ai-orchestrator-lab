import { describe, expect, it } from "vitest";
import type { ConversationMessage, EventEnvelope } from "@ai-orchestrator/protocol";
import {
  mergeConversationMessages,
  mergeEventReplayLogs,
  pullAndReplayDgxEventStorage,
  rebuildConversationMessagesFromEvents,
} from "./stage18EventReplay";

const userEvent: EventEnvelope = {
  id: "event_replay_user",
  sessionId: "session_desktop_001",
  type: "conversation.message.created",
  payload: {
    messageId: "message_user_1",
    role: "user",
    content: "DGX-02에서 다시 불러오기",
    contentLength: 14,
    redaction: "applied",
  },
  createdAt: "2026-05-24T00:00:00.000Z",
  source: "desktop",
  sourceTrust: "trusted",
  redacted: false,
};

const assistantEvent: EventEnvelope = {
  id: "event_replay_assistant",
  sessionId: "session_desktop_001",
  type: "conversation.message.created",
  payload: {
    messageId: "message_assistant_1",
    role: "assistant",
    content: "복원 준비 완료.",
    agentName: "지휘자",
    providerProfileId: "provider_dgx02_vllm",
    redaction: "applied",
  },
  createdAt: "2026-05-24T00:00:01.000Z",
  source: "agent",
  sourceTrust: "trusted",
  redacted: false,
};

describe("stage18 Event Storage replay", () => {
  it("rebuilds conversation messages from redacted message events", () => {
    const messages = rebuildConversationMessagesFromEvents([assistantEvent, userEvent]);

    expect(messages.map((message) => message.id)).toEqual(["message_user_1", "message_assistant_1"]);
    expect(messages[0]?.content).toBe("DGX-02에서 다시 불러오기");
    expect(messages[1]?.metadata?.agentName).toBe("지휘자");
  });

  it("dedupes replayed messages and keeps chronological order", () => {
    const currentMessage: ConversationMessage = {
      id: "message_user_1",
      sessionId: "session_desktop_001",
      role: "user",
      content: "기존 메시지",
      createdAt: "2026-05-24T00:00:00.000Z",
    };

    const merged = mergeConversationMessages(currentMessage ? [currentMessage] : [], [
      {
        id: "message_user_1",
        sessionId: "session_desktop_001",
        role: "user",
        content: "DGX-02에서 다시 불러오기",
        createdAt: "2026-05-24T00:00:00.000Z",
      },
      {
        id: "message_assistant_1",
        sessionId: "session_desktop_001",
        role: "assistant",
        content: "복원 준비 완료.",
        createdAt: "2026-05-24T00:00:01.000Z",
      },
    ]);

    expect(merged).toHaveLength(2);
    expect(merged[0]?.content).toBe("DGX-02에서 다시 불러오기");
    expect(merged[1]?.id).toBe("message_assistant_1");
  });

  it("merges event logs newest first", () => {
    const merged = mergeEventReplayLogs([userEvent], [assistantEvent, userEvent]);

    expect(merged.map((event) => event.id)).toEqual(["event_replay_assistant", "event_replay_user"]);
  });

  it("pulls DGX events and returns replayable messages", async () => {
    const result = await pullAndReplayDgxEventStorage({
      sessionId: "session_desktop_001",
      serverBaseUrl: "http://dgx-02:4317",
      fetchImpl: async (url, init) => {
        expect(url).toBe("http://dgx-02:4317/events?sessionId=session_desktop_001");
        expect(init?.method).toBe("GET");
        return {
          ok: true,
          status: 200,
          async text() {
            return JSON.stringify({
              sessionId: "session_desktop_001",
              serverRevision: 8,
              events: [assistantEvent, userEvent],
              createdAt: "2026-05-24T00:00:02.000Z",
            });
          },
        } as Response;
      },
    });

    expect(result.status).toBe("restored");
    expect(result.serverRevision).toBe(8);
    expect(result.messages).toHaveLength(2);
  });

  it("reports failed replay without dropping local state", async () => {
    const result = await pullAndReplayDgxEventStorage({
      fetchImpl: async () => {
        throw new Error("ECONNREFUSED");
      },
    });

    expect(result.status).toBe("failed");
    expect(result.events).toEqual([]);
    expect(result.error).toContain("ECONNREFUSED");
  });
});

// Characterization tests for the deterministic replay/projection invariants
// (no behavior change). These pin existing behavior on previously-uncovered
// branches: non-conversation/invalid-event dropping, provenance tagging,
// id-collision precedence + limit truncation, and incremental pull params.
describe("stage18 replay — projection invariants characterization", () => {
  it("drops non-conversation and structurally-invalid events without throwing", () => {
    const nonConversation: EventEnvelope = {
      ...userEvent,
      id: "event_runtime_health",
      type: "runtime.health.updated",
      payload: { note: "ignore me" },
      createdAt: "2026-05-24T00:00:05.000Z",
    };
    const missingMessageId: EventEnvelope = {
      ...userEvent,
      id: "event_missing_id",
      payload: { role: "user", content: "no messageId" },
      createdAt: "2026-05-24T00:00:06.000Z",
    };
    const invalidRole: EventEnvelope = {
      ...userEvent,
      id: "event_invalid_role",
      payload: { messageId: "message_bad_role", role: "robot", content: "x" },
      createdAt: "2026-05-24T00:00:07.000Z",
    };

    const messages = rebuildConversationMessagesFromEvents([
      nonConversation,
      missingMessageId,
      invalidRole,
      userEvent,
    ]);

    expect(messages).toHaveLength(1);
    expect(messages[0]?.id).toBe("message_user_1");
  });

  it("tags rebuilt messages with provenance and falls back to event sourceTrust", () => {
    const [message] = rebuildConversationMessagesFromEvents([userEvent]);

    expect(message?.metadata?.replayedFromEventId).toBe("event_replay_user");
    expect(message?.metadata?.sourceTrust).toBe("trusted");
  });

  it("lets replayed events win on id collision (server replay precedence)", () => {
    const localVersion: EventEnvelope = {
      ...userEvent,
      redacted: false,
      payload: { ...(userEvent.payload as object), content: "CURRENT" },
    };
    const replayedVersion: EventEnvelope = {
      ...userEvent,
      redacted: true,
      payload: { ...(userEvent.payload as object), content: "REPLAYED" },
    };

    const merged = mergeEventReplayLogs([localVersion], [replayedVersion]);

    expect(merged).toHaveLength(1);
    expect(merged[0]?.redacted).toBe(true);
    expect((merged[0]?.payload as { content: string }).content).toBe("REPLAYED");
  });

  it("truncates merged logs to the limit, keeping newest first", () => {
    const older: EventEnvelope = { ...userEvent, id: "event_older", createdAt: "2026-05-24T00:00:00.000Z" };
    const middle: EventEnvelope = { ...userEvent, id: "event_middle", createdAt: "2026-05-24T00:00:01.000Z" };
    const newest: EventEnvelope = { ...userEvent, id: "event_newest", createdAt: "2026-05-24T00:00:02.000Z" };

    const merged = mergeEventReplayLogs([], [older, middle, newest], 2);

    expect(merged.map((event) => event.id)).toEqual(["event_newest", "event_middle"]);
  });

  it("reports empty status and sends afterRevision on an incremental pull", async () => {
    let capturedUrl = "";
    const result = await pullAndReplayDgxEventStorage({
      sessionId: "session_desktop_001",
      serverBaseUrl: "http://dgx-02:4317",
      afterRevision: 5,
      fetchImpl: async (url) => {
        capturedUrl = String(url);
        return {
          ok: true,
          status: 200,
          async text() {
            return JSON.stringify({
              sessionId: "session_desktop_001",
              serverRevision: 5,
              events: [],
              createdAt: "2026-05-24T00:00:02.000Z",
            });
          },
        } as Response;
      },
    });

    expect(capturedUrl).toContain("sessionId=session_desktop_001");
    expect(capturedUrl).toContain("afterRevision=5");
    expect(result.status).toBe("empty");
    expect(result.importedCount).toBe(0);
    expect(result.messages).toEqual([]);
  });
});
