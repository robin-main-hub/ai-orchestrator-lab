import type { IncomingMessage } from "node:http";
import type { ScaffoldPlan, ServerMissionRecord } from "@ai-orchestrator/protocol";
import { describe, expect, it } from "vitest";
import type { MissionStore } from "../missions/missionStore.js";
import { handleMissionRoute } from "./missions.js";

/**
 * GET /missions/:id/scaffold/latest 라우트 — Publish Flow file prefill의 정직 source.
 *
 * 적대적 체크리스트:
 *  - mission 없음 → 404 mission_not_found
 *  - mission 있지만 scaffold plan 0개 → 200 + status=not_found, files=[]
 *  - plan 여러 개 → 마지막 plan으로 응답, planId 반영
 *  - plan의 templateId+input으로 결정적 재생성 — 같은 plan 반복 호출 시 동일 응답(idempotent read)
 *  - 응답에 토큰/secret 포함된 콘텐츠는 자동 secret_suspect로 skipped (W1 가드 거울)
 *  - W1/W2/W3/W4 write 라우트는 호출되지 않는다(이건 read-only)
 */

function record(id: string, plans: ScaffoldPlan[] = []): ServerMissionRecord {
  return {
    mission: {
      missionId: id,
      title: `미션 ${id}`,
      goal: "publish flow prefill",
      truthStatus: "planned",
      createdBy: "robin",
      createdAt: "2026-06-14T12:00:00.000Z",
    },
    status: "running",
    truthStatus: "planned",
    workers: [],
    artifacts: [],
    verificationReports: [],
    mergeQueueItems: [],
    scaffoldPlans: plans,
    updatedAt: "2026-06-14T12:00:00.000Z",
  } as unknown as ServerMissionRecord;
}

function makePlan(over: Partial<ScaffoldPlan> = {}): ScaffoldPlan {
  return {
    id: "plan_default",
    missionId: "mission_x",
    workspaceId: "ws_x",
    templateId: "react_vite_app",
    input: { appName: "demo" },
    repoRootRef: "/tmp/demo",
    files: [],
    hasOverwrites: false,
    truthStatus: "planned",
    createdAt: "2026-06-14T12:00:00.000Z",
    ...over,
  };
}

function fakeStore(records: ServerMissionRecord[]): MissionStore {
  return {
    list: async () => records,
    get: async (id: string) => records.find((r) => r.mission.missionId === id) ?? null,
  } as unknown as MissionStore;
}

async function callRoute(store: MissionStore, missionId: string) {
  let status = 0;
  let payload: any = null;
  const handled = await handleMissionRoute({
    store,
    request: {} as IncomingMessage,
    pathname: `/missions/${encodeURIComponent(missionId)}/scaffold/latest`,
    method: "GET",
    readJsonBody: async () => ({}),
    isRequestBodyTooLargeError: (_e: unknown): _e is { limit: number } => false,
    respondJson: (code: number, body: unknown) => {
      status = code;
      payload = body;
    },
  } as Parameters<typeof handleMissionRoute>[0]);
  return { handled, status, payload };
}

describe("GET /missions/:id/scaffold/latest", () => {
  it("(#1) mission 없음 → 404 mission_not_found", async () => {
    const store = fakeStore([record("mission_other")]);
    const { handled, status, payload } = await callRoute(store, "mission_missing");
    expect(handled).toBe(true);
    expect(status).toBe(404);
    expect(payload.error).toBe("mission_not_found");
  });

  it("(#2) mission 있지만 plan 없음 → 200 + status=not_found, files=[]", async () => {
    const store = fakeStore([record("mission_a", [])]);
    const { status, payload } = await callRoute(store, "mission_a");
    expect(status).toBe(200);
    expect(payload.status).toBe("not_found");
    expect(payload.files).toEqual([]);
    expect(payload.skipped).toEqual([]);
    expect(payload.message).toContain("등록된 scaffold plan이 없습니다");
  });

  it("(#3) plan 1개(react_vite_app) → status=found, 5개 파일 모두 안전 + planId 반환", async () => {
    const plan = makePlan({ id: "plan_v1" });
    const store = fakeStore([record("mission_a", [plan])]);
    const { status, payload } = await callRoute(store, "mission_a");
    expect(status).toBe(200);
    expect(payload.status).toBe("found");
    expect(payload.planId).toBe("plan_v1");
    expect(payload.truthStatus).toBe("planned");
    expect(payload.files.map((file: { path: string }) => file.path).sort()).toEqual(
      ["README.md", "index.html", "package.json", "src/App.tsx", "src/main.tsx"].sort(),
    );
    // 모든 파일 source는 scaffold_plan, createdAt은 plan의 그것을 따른다.
    for (const file of payload.files) {
      expect(file.source).toBe("scaffold_plan");
      expect(file.createdAt).toBe(plan.createdAt);
    }
  });

  it("(#4) plan 여러 개 → 가장 마지막 plan으로 응답(event 도착 순서)", async () => {
    const earlier = makePlan({ id: "plan_old", createdAt: "2026-06-14T10:00:00.000Z", input: { appName: "old" } });
    const later = makePlan({ id: "plan_new", createdAt: "2026-06-14T11:00:00.000Z", input: { appName: "new" } });
    const store = fakeStore([record("mission_a", [earlier, later])]);
    const { payload } = await callRoute(store, "mission_a");
    expect(payload.planId).toBe("plan_new");
    const pkg = payload.files.find((file: { path: string }) => file.path === "package.json");
    expect(pkg.content).toContain('"name": "new"');
  });

  it("(#5) 결정적 idempotent — 같은 mission 두 번 호출하면 동일 응답", async () => {
    const store = fakeStore([record("mission_a", [makePlan()])]);
    const first = await callRoute(store, "mission_a");
    const second = await callRoute(store, "mission_a");
    expect(JSON.stringify(first.payload)).toBe(JSON.stringify(second.payload));
  });

  it("(#6) 다른 HTTP 메서드는 처리되지 않는다(write 표면 회귀 방지)", async () => {
    // POST는 이 라우트가 처리하지 않아야 한다 — 호출자가 false를 받아야 함.
    const store = fakeStore([record("mission_a", [makePlan()])]);
    let status = 0;
    let payload: any = null;
    const handled = await handleMissionRoute({
      store,
      request: {} as IncomingMessage,
      pathname: "/missions/mission_a/scaffold/latest",
      method: "POST",
      readJsonBody: async () => ({}),
      isRequestBodyTooLargeError: (_e: unknown): _e is { limit: number } => false,
      respondJson: (code: number, body: unknown) => { status = code; payload = body; },
    } as Parameters<typeof handleMissionRoute>[0]);
    // POST 경로는 이 라우트로 들어오지 않으므로 false. 다른 라우트가 잡거나 404로 떨어진다.
    expect(handled).toBe(false);
    expect(status).toBe(0);
    expect(payload).toBeNull();
  });
});
