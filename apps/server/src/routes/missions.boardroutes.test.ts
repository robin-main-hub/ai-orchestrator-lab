import type { IncomingMessage } from "node:http";
import type { ServerMissionRecord } from "@ai-orchestrator/protocol";
import { describe, expect, it, vi } from "vitest";
import type { MissionStore } from "../missions/missionStore.js";
import { handleMissionRoute } from "./missions.js";

function record(id: string, status: ServerMissionRecord["status"]): ServerMissionRecord {
  return {
    mission: {
      missionId: id,
      title: `미션 ${id}`,
      goal: "g",
      truthStatus: "planned",
      createdBy: "kurumi",
      createdAt: "2026-06-13T00:00:00.000Z",
    },
    status,
    truthStatus: "planned",
    workers: [],
    artifacts: [],
    verificationReports: [],
    mergeQueueItems: [],
    updatedAt: "2026-06-13T00:00:00.000Z",
  } as unknown as ServerMissionRecord;
}

function fakeStore(records: ServerMissionRecord[]): MissionStore {
  return {
    list: async () => records,
    get: async (id: string) => records.find((r) => r.mission.missionId === id) ?? null,
  } as unknown as MissionStore;
}

function deps(store: MissionStore, pathname: string, method: string, body: unknown = {}, extra: Record<string, unknown> = {}) {
  let status = 0;
  let payload: unknown = null;
  return {
    args: {
      store,
      request: {} as IncomingMessage,
      pathname,
      method,
      readJsonBody: async () => body,
      isRequestBodyTooLargeError: (_e: unknown): _e is { limit: number } => false,
      respondJson: (code: number, body2: unknown) => {
        status = code;
        payload = body2;
      },
      ...extra,
    },
    result: () => ({ status, payload }),
  };
}

describe("mission board routes", () => {
  it("GET /missions/kanban derives a column board", async () => {
    const store = fakeStore([record("m1", "merged"), record("m2", "verifying"), record("m3", "failed")]);
    const { args, result } = deps(store, "/missions/kanban", "GET");
    const handled = await handleMissionRoute(args);
    expect(handled).toBe(true);
    const { status, payload } = result();
    expect(status).toBe(200);
    const board = (payload as { board: { total: number; columns: Array<{ id: string; cards: unknown[] }> } }).board;
    expect(board.total).toBe(3);
    expect(board.columns.find((c) => c.id === "merged")?.cards).toHaveLength(1);
    expect(board.columns.find((c) => c.id === "blocked")?.cards).toHaveLength(1);
  });

  it("GET /missions/:id/trace returns a derived lifecycle trace", async () => {
    const store = fakeStore([record("m1", "planned")]);
    const { args, result } = deps(store, "/missions/m1/trace", "GET");
    expect(await handleMissionRoute(args)).toBe(true);
    const { status, payload } = result();
    expect(status).toBe(200);
    const trace = (payload as { trace: Array<{ type: string }> }).trace;
    expect(trace[0]?.type).toBe("mission.created");
  });

  it("GET /missions/:id/trace 404s an unknown mission", async () => {
    const store = fakeStore([]);
    const { args, result } = deps(store, "/missions/none/trace", "GET");
    expect(await handleMissionRoute(args)).toBe(true);
    expect(result().status).toBe(404);
  });

  it("POST /missions/:id/checkpoints returns the created checkpoint", async () => {
    const store = fakeStore([record("m1", "running")]);
    const runCheckpoint = vi.fn(async () => ({
      ok: true as const,
      checkpoint: { id: "cp1", missionId: "m1", repoRootRef: "/repo", gitRef: "HEAD", headSha: "abc1234", reason: "manual" as const, createdAt: "t", truthStatus: "observed" as const },
    }));
    const { args, result } = deps(store, "/missions/m1/checkpoints", "POST", { repoRoot: "/repo" }, { runCheckpoint });
    expect(await handleMissionRoute(args)).toBe(true);
    expect(result().status).toBe(201);
    expect(runCheckpoint).toHaveBeenCalled();
  });

  it("POST /missions/:id/checkpoints 501 when not configured", async () => {
    const store = fakeStore([record("m1", "running")]);
    const { args, result } = deps(store, "/missions/m1/checkpoints", "POST", { repoRoot: "/repo" });
    expect(await handleMissionRoute(args)).toBe(true);
    expect(result().status).toBe(501);
  });

  it("POST /missions/:id/rollback maps blocked → 409", async () => {
    const store = fakeStore([record("m1", "running")]);
    const runRollback = vi.fn(async () => ({
      missionId: "m1", status: "blocked" as const, reason: "not approved", observed: true, completedAt: "t",
    }));
    const { args, result } = deps(store, "/missions/m1/rollback", "POST", { repoRoot: "/repo", targetSha: "abc1234", approvalId: "a1" }, { runRollback });
    expect(await handleMissionRoute(args)).toBe(true);
    expect(result().status).toBe(409);
  });

  it("GET /missions/:id/skills returns the curator queue", async () => {
    const store = { get: async () => record("m1", "merged"), skills: async () => [{ id: "skill_1", trustStatus: "suggested" }] } as unknown as MissionStore;
    const { args, result } = deps(store, "/missions/m1/skills", "GET");
    expect(await handleMissionRoute(args)).toBe(true);
    const { status, payload } = result();
    expect(status).toBe(200);
    expect((payload as { candidates: unknown[] }).candidates).toHaveLength(1);
  });

  it("POST /missions/:id/skills/:cid/curate applies a curator decision", async () => {
    const curateSkill = vi.fn(async () => ({ id: "skill_1", trustStatus: "curator_approved" }));
    const store = { get: async () => record("m1", "merged"), curateSkill } as unknown as MissionStore;
    const { args, result } = deps(store, "/missions/m1/skills/skill_1/curate", "POST", { decision: "approve" });
    expect(await handleMissionRoute(args)).toBe(true);
    expect(result().status).toBe(200);
    expect(curateSkill).toHaveBeenCalledWith("m1", "skill_1", "approve");
  });

  it("POST curate 404s an unknown candidate", async () => {
    const store = { get: async () => record("m1", "merged"), curateSkill: async () => undefined } as unknown as MissionStore;
    const { args, result } = deps(store, "/missions/m1/skills/ghost/curate", "POST", { decision: "approve" });
    expect(await handleMissionRoute(args)).toBe(true);
    expect(result().status).toBe(404);
  });

  const HTV_INPUT = { productType: "x", material: "y", quantity: 1, size: "A4", color: "s", leadTime: "30d", incoterms: "FOB" };

  it("POST /missions/from-template creates a mission and attaches planned artifacts", async () => {
    const create = vi.fn(async () => record("m_tpl_1", "running"));
    const appendEvent = vi.fn(async () => record("m_tpl_1", "running"));
    const store = { create, appendEvent } as unknown as MissionStore;
    const { args, result } = deps(store, "/missions/from-template", "POST", { templateId: "example-domain_htv_quote", missionId: "m_tpl_1", input: HTV_INPUT });
    expect(await handleMissionRoute(args)).toBe(true);
    expect(result().status).toBe(201);
    expect(create).toHaveBeenCalled();
    expect(appendEvent).toHaveBeenCalled(); // planned artifacts attached
    expect((result().payload as { verificationPlan: unknown[] }).verificationPlan.length).toBeGreaterThan(0);
  });

  it("POST /missions/from-template 404s an unknown template", async () => {
    const store = {} as unknown as MissionStore;
    const { args, result } = deps(store, "/missions/from-template", "POST", { templateId: "nope", input: {} });
    expect(await handleMissionRoute(args)).toBe(true);
    expect(result().status).toBe(404);
  });

  it("POST /missions/from-template 400s with the missing required fields", async () => {
    const store = {} as unknown as MissionStore;
    const { args, result } = deps(store, "/missions/from-template", "POST", { templateId: "example-domain_htv_quote", input: { productType: "x" } });
    expect(await handleMissionRoute(args)).toBe(true);
    const { status, payload } = result();
    expect(status).toBe(400);
    expect((payload as { missingFields: string[] }).missingFields).toContain("material");
  });
});
