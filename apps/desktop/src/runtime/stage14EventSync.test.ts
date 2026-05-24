import { describe, expect, it } from "vitest";
import type { EventEnvelope } from "@ai-orchestrator/protocol";
import {
  createEventSyncPushRequest,
  createInitialEventSyncState,
  pushEventsToDgxEventStorage,
  reduceEventSyncState,
} from "./stage14EventSync";

const event: EventEnvelope = {
  id: "event_sync_1",
  sessionId: "session_1",
  type: "conversation.message.created",
  payload: { contentLength: 4, redaction: "applied" },
  createdAt: "2026-05-24T00:00:00.000Z",
  source: "desktop",
  sourceTrust: "trusted",
  redacted: true,
};

describe("stage14 Event Storage sync", () => {
  it("builds a deterministic client push envelope", () => {
    const request = createEventSyncPushRequest({
      events: [event],
      clientId: "macbook",
      sessionId: "session_1",
      createdAt: event.createdAt,
    });

    expect(request.sessionId).toBe("session_1");
    expect(request.idempotencyKey).toBe("macbook:session_1:event_sync_1");
    expect(request.events[0]?.redacted).toBe(true);
  });

  it("marks accepted and duplicate events as synced", async () => {
    const result = await pushEventsToDgxEventStorage({
      events: [event],
      serverBaseUrl: "http://dgx-02:4317",
      fetchImpl: async (url, init) => {
        expect(url).toBe("http://dgx-02:4317/events/sync");
        expect(init?.method).toBe("POST");
        expect(String(init?.body)).not.toContain("sk-secret");
        return {
          ok: true,
          status: 202,
          async text() {
            return JSON.stringify({
              id: "event_sync_response_1",
              requestId: "event_sync_push_1",
              sessionId: "session_1",
              serverRevision: 7,
              accepted: 1,
              duplicates: 0,
              conflicts: 0,
              failed: 0,
              results: [{ eventId: "event_sync_1", status: "accepted", serverRevision: 7 }],
              createdAt: event.createdAt,
            });
          },
        } as Response;
      },
      createdAt: event.createdAt,
    });
    const state = reduceEventSyncState(createInitialEventSyncState(1), result);

    expect(result.status).toBe("synced");
    expect(result.syncedEventIds).toContain("event_sync_1");
    expect(state.outboxCount).toBe(0);
    expect(state.serverRevision).toBe(7);
  });

  it("keeps local outbox when the DGX server is unreachable", async () => {
    const result = await pushEventsToDgxEventStorage({
      events: [event],
      fetchImpl: async () => {
        throw new Error("ECONNREFUSED");
      },
    });

    expect(result.status).toBe("queued");
    expect(result.queuedEvents[0]?.id).toBe(event.id);
    expect(result.error).toContain("ECONNREFUSED");
  });
});
