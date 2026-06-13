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
