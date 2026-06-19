import { describe, expect, it } from "vitest";
import type { CodingPacket, EventEnvelope } from "@ai-orchestrator/protocol";
import { extractLatestCodingPacketFromEvents } from "./stage19CodingPacketReplay";

const packet: CodingPacket = {
  goal: "대화 결과를 코딩 작업으로 넘긴다.",
  context: ["Conversation Workbench"],
  decisions: ["CodingPacket은 구조화해서 저장한다."],
  rejectedOptions: ["markdown 요약만 저장"],
  constraints: ["redaction layer 이후 저장"],
  filesToInspect: ["apps/desktop/src/App.tsx"],
  implementationPlan: ["payload.packet을 복원한다."],
  verificationPlan: ["unit test"],
  reviewerNotes: ["DGX replay compatible"],
};

function createPacketEvent(id: string, createdAt: string, payloadPacket: unknown): EventEnvelope {
  return {
    id,
    sessionId: "session_desktop_001",
    type: "coding_packet.created",
    payload: {
      packet: payloadPacket,
      goal: "legacy display goal",
    },
    createdAt,
    source: "desktop",
    sourceTrust: "trusted",
    redacted: false,
  };
}

describe("stage19 CodingPacket replay", () => {
  it("restores the newest valid packet event", () => {
    const older = createPacketEvent("event_packet_old", "2026-05-24T00:00:00.000Z", {
      ...packet,
      goal: "old packet",
    });
    const newer = createPacketEvent("event_packet_new", "2026-05-24T00:01:00.000Z", packet);

    const result = extractLatestCodingPacketFromEvents([older, newer]);

    expect(result.status).toBe("restored");
    expect(result.eventId).toBe("event_packet_new");
    expect(result.packet?.goal).toBe(packet.goal);
  });

  it("skips legacy count-only packet events", () => {
    const result = extractLatestCodingPacketFromEvents([
      {
        id: "event_packet_legacy",
        sessionId: "session_desktop_001",
        type: "coding_packet.created",
        payload: { goal: packet.goal, decisionCount: 1 },
        createdAt: "2026-05-24T00:00:00.000Z",
        source: "desktop",
        sourceTrust: "trusted",
        redacted: false,
      },
    ]);

    expect(result.status).toBe("missing");
  });

  it("reports invalid packet payloads explicitly", () => {
    const result = extractLatestCodingPacketFromEvents([
      createPacketEvent("event_packet_invalid", "2026-05-24T00:00:00.000Z", {
        goal: packet.goal,
      }),
    ]);

    expect(result.status).toBe("invalid");
    expect(result.eventId).toBe("event_packet_invalid");
    expect(result.error).toBeTruthy();
  });

  it("falls back to an older valid packet when the newest packet payload is invalid", () => {
    const validOlder = createPacketEvent("event_packet_valid_old", "2026-05-24T00:00:00.000Z", {
      ...packet,
      goal: "older valid packet",
    });
    const invalidNewer = createPacketEvent("event_packet_invalid_new", "2026-05-24T00:01:00.000Z", {
      goal: packet.goal,
    });

    const result = extractLatestCodingPacketFromEvents([validOlder, invalidNewer]);

    expect(result.status).toBe("restored");
    expect(result.eventId).toBe("event_packet_valid_old");
    expect(result.packet?.goal).toBe("older valid packet");
  });
});

// Characterization tests for the CodingPacket replay projection (no behavior
// change). These pin previously-uncovered branches: empty/non-packet inputs,
// invalid-event precedence when every packet payload is invalid, the
// no-packet-payload skip that does NOT mark a result invalid, and the
// no-mutation (deterministic copy-before-sort) invariant.
describe("stage19 replay — projection selection characterization", () => {
  it("returns missing for an empty event list", () => {
    expect(extractLatestCodingPacketFromEvents([])).toEqual({ status: "missing" });
  });

  it("ignores non-coding_packet event types when selecting the latest packet", () => {
    const conversationEvent: EventEnvelope = {
      id: "event_conversation_newer",
      sessionId: "session_desktop_001",
      type: "conversation.message.created",
      payload: { content: "newer but not a packet" },
      createdAt: "2026-05-24T00:05:00.000Z",
      source: "desktop",
      sourceTrust: "trusted",
      redacted: false,
    };
    const packetEvent = createPacketEvent("event_packet_only", "2026-05-24T00:00:00.000Z", packet);

    const result = extractLatestCodingPacketFromEvents([conversationEvent, packetEvent]);

    expect(result.status).toBe("restored");
    expect(result.eventId).toBe("event_packet_only");
  });

  it("reports the newest invalid event when every packet payload is invalid", () => {
    const invalidOlder = createPacketEvent("event_packet_invalid_old", "2026-05-24T00:00:00.000Z", {
      goal: packet.goal,
    });
    const invalidNewer = createPacketEvent("event_packet_invalid_new", "2026-05-24T00:01:00.000Z", {
      context: ["not a goal"],
    });

    const result = extractLatestCodingPacketFromEvents([invalidOlder, invalidNewer]);

    expect(result.status).toBe("invalid");
    expect(result.eventId).toBe("event_packet_invalid_new");
  });

  it("skips a newest event that carries no packet payload and restores an older valid packet", () => {
    const validOlder = createPacketEvent("event_packet_valid_old", "2026-05-24T00:00:00.000Z", packet);
    const noPacketNewer: EventEnvelope = {
      id: "event_packet_no_payload",
      sessionId: "session_desktop_001",
      type: "coding_packet.created",
      payload: { goal: "display only, no packet" },
      createdAt: "2026-05-24T00:01:00.000Z",
      source: "desktop",
      sourceTrust: "trusted",
      redacted: false,
    };

    const result = extractLatestCodingPacketFromEvents([validOlder, noPacketNewer]);

    expect(result.status).toBe("restored");
    expect(result.eventId).toBe("event_packet_valid_old");
  });

  it("does not mutate the caller's event array order", () => {
    const older = createPacketEvent("event_packet_old", "2026-05-24T00:00:00.000Z", packet);
    const newer = createPacketEvent("event_packet_new", "2026-05-24T00:01:00.000Z", packet);
    const input = [older, newer];

    extractLatestCodingPacketFromEvents(input);

    expect(input.map((event) => event.id)).toEqual(["event_packet_old", "event_packet_new"]);
  });
});
