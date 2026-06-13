import type { IncomingMessage } from "node:http";
import type { ServerMissionRecord } from "@ai-orchestrator/protocol";
import { describe, expect, it } from "vitest";
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

function deps(store: MissionStore, pathname: string, method: string) {
  let status = 0;
  let payload: unknown = null;
  return {
    args: {
      store,
      request: {} as IncomingMessage,
      pathname,
      method,
      readJsonBody: async () => ({}),
      isRequestBodyTooLargeError: (_e: unknown): _e is { limit: number } => false,
      respondJson: (code: number, body: unknown) => {
        status = code;
        payload = body;
      },
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
});
