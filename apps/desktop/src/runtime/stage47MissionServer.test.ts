import { describe, expect, it, vi } from "vitest";
import {
  curateDgxMissionSkill,
  fetchDgxMissionKanban,
  fetchDgxMissionTrace,
  probeDgxPreview,
} from "./stage47MissionServer";

function mockFetch(payload: unknown, capture?: { urls: string[]; bodies: string[] }) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    capture?.urls.push(url);
    if (init?.body) capture?.bodies.push(String(init.body));
    return { ok: true, status: 200, text: async () => JSON.stringify(payload) } as Response;
  }) as unknown as typeof fetch;
}

const BASE = "http://127.0.0.1:4317";

describe("stage47 mission server — Coding/Design OS surfacing wrappers", () => {
  it("fetchDgxMissionKanban GETs /missions/kanban", async () => {
    const cap = { urls: [] as string[], bodies: [] as string[] };
    const res = await fetchDgxMissionKanban({ serverBaseUrl: BASE, fetchImpl: mockFetch({ board: { columns: [], total: 0 } }, cap) });
    expect(res.board.total).toBe(0);
    expect(cap.urls[0]).toContain("/missions/kanban");
  });

  it("fetchDgxMissionTrace GETs the mission trace", async () => {
    const cap = { urls: [] as string[], bodies: [] as string[] };
    const res = await fetchDgxMissionTrace({ missionId: "m1", serverBaseUrl: BASE, fetchImpl: mockFetch({ trace: [] }, cap) });
    expect(Array.isArray(res.trace)).toBe(true);
    expect(cap.urls[0]).toContain("/missions/m1/trace");
  });

  it("curateDgxMissionSkill POSTs the decision to the curate path", async () => {
    const cap = { urls: [] as string[], bodies: [] as string[] };
    const res = await curateDgxMissionSkill({
      missionId: "m1",
      candidateId: "s1",
      decision: "approve",
      serverBaseUrl: BASE,
      fetchImpl: mockFetch({ candidate: { id: "s1", trustStatus: "curator_approved" } }, cap),
    });
    expect(res.candidate.trustStatus).toBe("curator_approved");
    expect(cap.urls[0]).toContain("/missions/m1/skills/s1/curate");
    expect(cap.bodies[0]).toContain("approve");
  });

  it("probeDgxPreview POSTs to the preview path and surfaces observed honesty", async () => {
    const cap = { urls: [] as string[], bodies: [] as string[] };
    const res = await probeDgxPreview({
      missionId: "m1",
      workspaceId: "ws1",
      serverBaseUrl: BASE,
      fetchImpl: mockFetch({ mission: {}, preview: { status: "running", port: 4401, truthStatus: "observed" } }, cap),
    });
    expect(res.preview.truthStatus).toBe("observed");
    expect(cap.urls[0]).toContain("/missions/m1/workspace/ws1/preview");
  });
});

// Characterization tests for previously-uncovered stage47 mission-server
// transport branches (no behavior change, no real network, no secret). These
// pin the authority-adjacent mission client's shared requestMissionServerJson
// seam: a non-ok status throws with the status code and a body truncated to
// 180 chars, a 403 is NOT carved out (throws like any non-ok — unlike stage33's
// tmux dispatch), a non-ok first base URL fails over to the next, an all-
// endpoints-failed aggregate joins each base URL's error with " | ", GET sends
// no body while POST serializes one, and every request is signed with HMAC
// headers (no bearer authorization).
function makeResponse(body: string, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, text: async () => body } as Response;
}

describe("stage47 mission server — transport seam characterization", () => {
  const base1 = "http://127.0.0.1:4317";
  const base2 = "http://127.0.0.1:4318";

  it("throws with the status code and a 180-char-truncated body on a non-ok response", async () => {
    const error = (await fetchDgxMissionKanban({
      serverBaseUrl: base1,
      fetchImpl: vi.fn(async () => makeResponse("E".repeat(300), 500)) as unknown as typeof fetch,
    }).catch((caught) => caught)) as Error;

    expect(error.message).toContain("failed: 500");
    expect(error.message).toContain("E".repeat(180));
    expect(error.message).not.toContain("E".repeat(181));
  });

  it("treats a 403 like any other non-ok status (no permission carve-out)", async () => {
    const error = (await fetchDgxMissionKanban({
      serverBaseUrl: base1,
      fetchImpl: vi.fn(async () => makeResponse('{"error":"forbidden"}', 403)) as unknown as typeof fetch,
    }).catch((caught) => caught)) as Error;

    expect(error.message).toContain("failed: 403");
    expect(error.message).toContain("forbidden");
  });

  it("fails over to the next base URL when the first returns a non-ok status", async () => {
    const urls: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      urls.push(url);
      if (urls.length === 1) return makeResponse("upstream draining", 503);
      return makeResponse(JSON.stringify({ board: { columns: [], total: 7 } }));
    }) as unknown as typeof fetch;

    const res = await fetchDgxMissionKanban({ serverBaseUrl: [base1, base2], fetchImpl });

    expect(urls).toEqual([`${base1}/missions/kanban`, `${base2}/missions/kanban`]);
    expect(res.board.total).toBe(7);
  });

  it("aggregates every base URL's failure with a ' | ' separator when all endpoints fail", async () => {
    const error = (await fetchDgxMissionKanban({
      serverBaseUrl: [base1, base2],
      fetchImpl: vi.fn(async () => makeResponse("boom", 500)) as unknown as typeof fetch,
    }).catch((caught) => caught)) as Error;

    expect(error.message).toContain(`${base1}:`);
    expect(error.message).toContain(`${base2}:`);
    expect(error.message).toContain(" | ");
    expect(error.message).toContain("failed: 500");
  });

  it("signs GET requests with HMAC headers and sends no request body", async () => {
    let observedBody: unknown = "sentinel";
    let headers: Record<string, string> = {};
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      observedBody = init?.body;
      headers = init?.headers as Record<string, string>;
      return makeResponse(JSON.stringify({ board: { columns: [], total: 0 } }));
    }) as unknown as typeof fetch;

    await fetchDgxMissionKanban({ serverBaseUrl: base1, fetchImpl });

    expect(observedBody).toBeUndefined();
    expect(headers.authorization).toBeUndefined();
    expect(headers["x-dgx-signature"]).toMatch(/^[a-f0-9]{64}$/);
    expect(headers["x-dgx-timestamp"]).toMatch(/^\d+$/);
    expect(headers["x-dgx-nonce"]).toBeTruthy();
  });

  it("serializes and signs POST request bodies", async () => {
    let observedBody: unknown;
    let headers: Record<string, string> = {};
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      observedBody = init?.body;
      headers = init?.headers as Record<string, string>;
      return makeResponse(JSON.stringify({ candidate: { id: "s1", trustStatus: "curator_approved" } }));
    }) as unknown as typeof fetch;

    await curateDgxMissionSkill({
      missionId: "m1",
      candidateId: "s1",
      decision: "approve",
      serverBaseUrl: base1,
      fetchImpl,
    });

    expect(JSON.parse(String(observedBody))).toEqual({ decision: "approve" });
    expect(headers["x-dgx-signature"]).toMatch(/^[a-f0-9]{64}$/);
  });
});
