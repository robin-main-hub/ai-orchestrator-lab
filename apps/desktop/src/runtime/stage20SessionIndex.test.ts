import { describe, expect, it } from "vitest";
import { fetchDgxSessionIndex } from "./stage20SessionIndex";

describe("stage20 session index", () => {
  it("loads DGX-02 Event Storage sessions", async () => {
    const result = await fetchDgxSessionIndex({
      serverBaseUrl: "http://dgx-02:4317",
      fetchImpl: async (url, init) => {
        expect(url).toBe("http://dgx-02:4317/sessions");
        expect(init?.method).toBe("GET");
        expect((init?.headers as Record<string, string>).authorization).toMatch(/^Bearer \S+/);
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
