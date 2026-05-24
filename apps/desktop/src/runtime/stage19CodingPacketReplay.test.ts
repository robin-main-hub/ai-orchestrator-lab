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
});
