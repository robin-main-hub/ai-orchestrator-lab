import { describe, expect, it } from "vitest";
import { DEFAULT_SESSION_ID } from "../runtime/stage2Runtime";
import { initialConversationMessages, initialEventLog } from "./conversation";

// Characterization tests (no behavior change, pure, no I/O) for the seeded event
// log. initialEventLog is a DERIVED projection — it is built by mapping each
// initialConversationMessages entry through createStage2Event("conversation.message
// .created", ...). Both seeds are 0-ref across the test tree, yet the derivation is
// load-bearing: the event log is what the stage5 reducer / event store replays at
// boot, so it must stay the exact in-order, one-event-per-message projection of the
// conversation seed (a hand-edited event that drifts from its message would replay a
// phantom that never appears in the transcript). We assert the projection contract
// only (count/order/id-linkage/envelope stamping), and derive every expectation from
// the source messages themselves (self-consistent, no magic literals).

// the slice of payload the projection is contracted to carry per message.
type MessageEventPayload = { messageId: string; role: string; redaction: string };

describe("seeded conversation event log — derived projection", () => {
  it("emits exactly one event per conversation message, in source order, linked by messageId", () => {
    expect(initialEventLog).toHaveLength(initialConversationMessages.length);
    initialEventLog.forEach((event, index) => {
      const payload = event.payload as MessageEventPayload;
      expect(payload.messageId).toBe(initialConversationMessages[index]!.id);
      expect(payload.role).toBe(initialConversationMessages[index]!.role);
    });
  });

  it("stamps every event as a conversation.message.created event marked redaction-applied", () => {
    for (const event of initialEventLog) {
      expect(event.type).toBe("conversation.message.created");
      expect((event.payload as MessageEventPayload).redaction).toBe("applied");
    }
  });

  it("carries the source message createdAt onto each derived event (no clock drift)", () => {
    initialEventLog.forEach((event, index) => {
      expect(event.createdAt).toBe(initialConversationMessages[index]!.createdAt);
    });
  });

  it("stamps a unique event_-prefixed id and the desktop session envelope on every event", () => {
    const ids = initialEventLog.map((event) => event.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const event of initialEventLog) {
      expect(event.id.startsWith("event_")).toBe(true);
      expect(event.sessionId).toBe(DEFAULT_SESSION_ID);
      expect(event.source).toBe("desktop");
      expect(event.sourceTrust).toBe("trusted");
    }
  });
});
