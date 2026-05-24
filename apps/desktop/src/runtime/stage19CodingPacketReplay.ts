import { codingPacketSchema, type CodingPacket, type EventEnvelope } from "@ai-orchestrator/protocol";

export type Stage19CodingPacketReplayResult = {
  status: "restored" | "missing" | "invalid";
  packet?: CodingPacket;
  eventId?: string;
  createdAt?: string;
  error?: string;
};

type CodingPacketCreatedPayload = {
  packet?: unknown;
};

export function extractLatestCodingPacketFromEvents(events: EventEnvelope[]): Stage19CodingPacketReplayResult {
  const packetEvents = [...events]
    .filter((event) => event.type === "coding_packet.created")
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  if (packetEvents.length === 0) {
    return {
      status: "missing",
    };
  }

  for (const event of packetEvents) {
    const payload = event.payload as CodingPacketCreatedPayload;
    if (!payload?.packet) {
      continue;
    }

    const parsed = codingPacketSchema.safeParse(payload.packet);
    if (!parsed.success) {
      return {
        status: "invalid",
        eventId: event.id,
        createdAt: event.createdAt,
        error: parsed.error.issues.map((issue) => issue.message).join("; "),
      };
    }

    return {
      status: "restored",
      packet: parsed.data,
      eventId: event.id,
      createdAt: event.createdAt,
    };
  }

  return {
    status: "missing",
  };
}
