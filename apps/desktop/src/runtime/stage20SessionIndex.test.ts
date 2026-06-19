import { describe, expect, it } from "vitest";
import { createInitialSessionIndexState, fetchDgxSessionIndex } from "./stage20SessionIndex";

function expectHttpHmacHeaders(headers: Record<string, string>) {
  expect(headers.authorization).toBeUndefined();
  expect(headers["x-dgx-signature"]).toMatch(/^[a-f0-9]{64}$/);
  expect(headers["x-dgx-timestamp"]).toMatch(/^\d+$/);
  expect(headers["x-dgx-nonce"]).toBeTruthy();
}

describe("stage20 session index", () => {
  it("loads DGX-02 Event Storage sessions", async () => {
    const result = await fetchDgxSessionIndex({
      serverBaseUrl: "http://dgx-02:4317",
      fetchImpl: async (url, init) => {
        expect(url).toBe("http://dgx-02:4317/sessions");
        expect(init?.method).toBe("GET");
        expectHttpHmacHeaders(init?.headers as Record<string, string>);
        return {
          ok: true,
          status: 200,
          async text() {
            return JSON.stringify({
              serverRevision: 9,
              createdAt: "2026-05-24T00:00:00.000Z",
              sessions: [
                {
                  sessionId: "session_desktop_001",
                  title: "Desktop Workbench",
                  createdByClient: "client_macbook",
                  eventCount: 7,
                  firstEventAt: "2026-05-24T00:00:00.000Z",
                  lastEventAt: "2026-05-24T00:01:00.000Z",
                  lastEventType: "coding_packet.created",
                  sources: ["desktop"],
                  sourceTrust: ["trusted"],
                },
              ],
            });
          },
        } as Response;
      },
    });

    expect(result.status).toBe("loaded");
    expect(result.serverRevision).toBe(9);
    expect(result.sessions[0]?.sessionId).toBe("session_desktop_001");
    expect(result.sessions[0]?.title).toBe("Desktop Workbench");
  });

  it("returns failed when DGX-02 is unavailable", async () => {
    const result = await fetchDgxSessionIndex({
      fetchImpl: async () => {
        throw new Error("ECONNREFUSED");
      },
    });

    expect(result.status).toBe("failed");
    expect(result.error).toContain("ECONNREFUSED");
  });
});

// Characterization tests for the session-index projection edges (no behavior
// change, no real network). These pin previously-uncovered branches: the
// initial empty state, an empty-but-ok server response, a non-ok HTTP status,
// multi-endpoint replica failover ordering, and error aggregation when every
// replica endpoint fails (all via injected fetchImpl / pure functions).
describe("stage20 session index — projection edge characterization", () => {
  it("starts from an empty session index state", () => {
    expect(createInitialSessionIndexState()).toEqual({ status: "empty", sessions: [] });
  });

  it("maps an ok response with no sessions to the empty status", async () => {
    const result = await fetchDgxSessionIndex({
      serverBaseUrl: "http://dgx-02:4317",
      fetchImpl: async () =>
        ({
          ok: true,
          status: 200,
          async text() {
            return JSON.stringify({
              serverRevision: 4,
              createdAt: "2026-05-24T00:00:00.000Z",
              sessions: [],
            });
          },
        }) as Response,
    });

    expect(result.status).toBe("empty");
    expect(result.sessions).toEqual([]);
    expect(result.serverRevision).toBe(4);
  });

  it("treats a non-ok HTTP response as a failed load carrying the status code", async () => {
    const result = await fetchDgxSessionIndex({
      serverBaseUrl: "http://dgx-02:4317",
      fetchImpl: async () =>
        ({
          ok: false,
          status: 500,
          async text() {
            return "upstream boom";
          },
        }) as Response,
    });

    expect(result.status).toBe("failed");
    expect(result.error).toContain("500");
    expect(result.error).toContain("upstream boom");
  });

  it("fails over to the next replica endpoint when the first is unreachable", async () => {
    const attempted: string[] = [];
    const result = await fetchDgxSessionIndex({
      serverBaseUrl: ["http://dgx-unreachable:4317", "http://dgx-02:4317"],
      fetchImpl: async (url) => {
        attempted.push(String(url));
        if (String(url).startsWith("http://dgx-unreachable")) {
          throw new Error("ECONNREFUSED");
        }
        return {
          ok: true,
          status: 200,
          async text() {
            return JSON.stringify({
              serverRevision: 12,
              createdAt: "2026-05-24T00:00:00.000Z",
              sessions: [
                {
                  sessionId: "session_desktop_001",
                  title: "Failover Workbench",
                  createdByClient: "client_macbook",
                  eventCount: 1,
                  firstEventAt: "2026-05-24T00:00:00.000Z",
                  lastEventAt: "2026-05-24T00:00:00.000Z",
                  lastEventType: "conversation.message.created",
                  sources: ["desktop"],
                  sourceTrust: ["trusted"],
                },
              ],
            });
          },
        } as Response;
      },
    });

    expect(attempted).toEqual([
      "http://dgx-unreachable:4317/sessions",
      "http://dgx-02:4317/sessions",
    ]);
    expect(result.status).toBe("loaded");
    expect(result.serverRevision).toBe(12);
    expect(result.error).toBeUndefined();
  });

  it("aggregates errors from every replica endpoint when all fail", async () => {
    const result = await fetchDgxSessionIndex({
      serverBaseUrl: ["http://dgx-a:4317", "http://dgx-b:4317"],
      fetchImpl: async (url) => {
        throw new Error(`down ${String(url)}`);
      },
    });

    expect(result.status).toBe("failed");
    expect(result.error).toContain("http://dgx-a:4317");
    expect(result.error).toContain("http://dgx-b:4317");
    expect(result.error).toContain(" | ");
  });
});
