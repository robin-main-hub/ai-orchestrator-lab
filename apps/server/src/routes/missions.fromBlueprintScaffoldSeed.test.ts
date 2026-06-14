import type { IncomingMessage } from "node:http";
import type {
  DesignBlueprintInput,
  ScaffoldPlan,
  ServerMissionRecord,
} from "@ai-orchestrator/protocol";
import { describe, expect, it, vi } from "vitest";
import type { MissionStore } from "../missions/missionStore.js";
import { handleMissionRoute } from "./missions.js";

/**
 * App Builder → Publish Flow file prefill을 위한 seed scaffold 자동 생성 검증.
 *
 * 사용자 contract:
 *   1) POST /missions/from-blueprint 성공 시 mission record에 ScaffoldPlan이 자동으로 남는다.
 *      → GET /missions/:id/scaffold/latest가 status="found" + path+content 있는 files 반환.
 *   2) POST /missions/from-debate도 동일하게 seed scaffold 남긴다.
 *   3) seed scaffold는 placeholder workspace/repoRoot 표식이므로 apply 시점엔 사용자 명시 plan이
 *      필요(seed는 prefill source일 뿐).
 *   4) seed 실패는 미션 생성을 막지 않는다(편의 기능, 본 흐름 안 가림).
 */

const BLUEPRINT: DesignBlueprintInput = {
  title: "내 작업 보드",
  userIntent: "한눈에 보기",
  targetSurface: "mission_board",
  screens: [
    {
      name: "보드",
      purpose: "현황 확인",
      primaryAction: "열기",
      secondaryActions: [],
      dataNeeded: [],
      emptyState: "없음",
      errorState: "실패",
    },
  ],
  designTokens: { density: "balanced", tone: "clean_builder", motion: "subtle" },
  acceptanceCriteria: [],
};

function emptyRecord(missionId: string): ServerMissionRecord {
  return {
    mission: {
      missionId,
      title: `미션 ${missionId}`,
      goal: "g",
      truthStatus: "planned",
      createdBy: "test",
      createdAt: "2026-06-14T12:00:00.000Z",
    },
    status: "running",
    truthStatus: "planned",
    workers: [],
    artifacts: [],
    verificationReports: [],
    mergeQueueItems: [],
    scaffoldPlans: [],
    updatedAt: "2026-06-14T12:00:00.000Z",
  } as unknown as ServerMissionRecord;
}

/** Stateful 미션 store — recordScaffoldPlan 한 번에 mission record의 scaffoldPlans 누적. */
function statefulStore(): MissionStore & { records: Map<string, ServerMissionRecord> } {
  const records = new Map<string, ServerMissionRecord>();
  return {
    records,
    create: vi.fn(async (req: { id: string }) => {
      const rec = emptyRecord(req.id);
      records.set(req.id, rec);
      return rec;
    }),
    attachDesignBlueprint: vi.fn(async (missionId: string, blueprint: DesignBlueprintInput) => {
      const rec = records.get(missionId);
      if (!rec) return null;
      return { mission: rec.mission, blueprint };
    }),
    recordScaffoldPlan: vi.fn(async (missionId: string, plan: ScaffoldPlan) => {
      const rec = records.get(missionId);
      if (!rec) return undefined;
      rec.scaffoldPlans = [...(rec.scaffoldPlans ?? []), plan];
      return rec;
    }),
    get: vi.fn(async (id: string) => records.get(id) ?? null),
  } as unknown as MissionStore & { records: Map<string, ServerMissionRecord> };
}

function callRoute(store: MissionStore, pathname: string, method: string, body: unknown = {}, now = () => "2026-06-14T12:00:00.000Z") {
  let status = 0;
  let payload: any = null;
  return {
    promise: handleMissionRoute({
      store,
      request: {} as IncomingMessage,
      pathname,
      method,
      readJsonBody: async () => body,
      isRequestBodyTooLargeError: (_e: unknown): _e is { limit: number } => false,
      respondJson: (code: number, b: unknown) => { status = code; payload = b; },
      now,
    } as Parameters<typeof handleMissionRoute>[0]),
    read: () => ({ status, payload }),
  };
}

describe("from-blueprint → seed scaffold → GET /missions/:id/scaffold/latest end-to-end", () => {
  it("(#1) from-blueprint 성공 직후 scaffoldPlans가 1개 자동 추가된다", async () => {
    const store = statefulStore();
    const missionId = "mission_seed_smoke_1";
    const { promise, read } = callRoute(store, "/missions/from-blueprint", "POST", {
      blueprint: BLUEPRINT,
      missionId,
    });
    expect(await promise).toBe(true);
    expect(read().status).toBe(201);
    expect(store.recordScaffoldPlan).toHaveBeenCalledTimes(1);
    const rec = store.records.get(missionId)!;
    expect(rec.scaffoldPlans.length).toBe(1);
    expect(rec.scaffoldPlans[0]!.id).toBe(`plan_${missionId}_seed`);
    expect(rec.scaffoldPlans[0]!.templateId).toBe("react_vite_app");
    // placeholder 표식 — seed임을 정직하게 보여줌(실제 fs apply 대상 아님).
    expect(rec.scaffoldPlans[0]!.repoRootRef).toBe("<from-blueprint-seed>");
    expect(rec.scaffoldPlans[0]!.workspaceId).toBe(`workspace_seed_${missionId}`);
  });

  it("(#2) 같은 미션에 대해 scaffold/latest GET이 status='found' + react_vite_app 파일들 반환", async () => {
    const store = statefulStore();
    const missionId = "mission_seed_smoke_2";
    await callRoute(store, "/missions/from-blueprint", "POST", { blueprint: BLUEPRINT, missionId }).promise;

    const { promise, read } = callRoute(store, `/missions/${missionId}/scaffold/latest`, "GET");
    expect(await promise).toBe(true);
    const { status, payload } = read();
    expect(status).toBe(200);
    expect(payload.status).toBe("found");
    // react_vite_app 템플릿의 표준 파일 5종이 모두 들어 있고 prefill에서 사용 가능
    const paths = payload.files.map((f: { path: string }) => f.path).sort();
    expect(paths).toEqual(["README.md", "index.html", "package.json", "src/App.tsx", "src/main.tsx"].sort());
    // 모든 파일 content가 0보다 길고 source는 scaffold_plan
    for (const file of payload.files) {
      expect(file.content.length).toBeGreaterThan(0);
      expect(file.source).toBe("scaffold_plan");
    }
    // appName이 blueprint 제목에서 슬러그 — package.json content에서 확인
    const pkg = payload.files.find((f: { path: string }) => f.path === "package.json");
    expect(pkg.content).toContain('"name"');
  });

  it("(#3) from-debate도 동일하게 seed scaffold가 남는다", async () => {
    const store = statefulStore();
    const missionId = "mission_debate_seed_1";
    const debatePacket = {
      id: "dp_seed",
      debateId: "debate_seed_1",
      kind: "design",
      summary: "보드 개편",
      adoptedDecisions: ["상단 신호 1개"],
      rejectedOptions: [],
      openQuestions: [],
    };
    const { promise, read } = callRoute(store, "/missions/from-debate", "POST", {
      packet: debatePacket,
      missionId,
      targetSurface: "mission_board",
    });
    expect(await promise).toBe(true);
    expect(read().status).toBe(201);
    expect(store.recordScaffoldPlan).toHaveBeenCalledTimes(1);
    const rec = store.records.get(missionId)!;
    expect(rec.scaffoldPlans.length).toBe(1);
    expect(rec.scaffoldPlans[0]!.id).toBe(`plan_${missionId}_seed`);
  });

  it("(#4) seed 실패는 mission 생성을 막지 않는다 — recordScaffoldPlan이 throw해도 201", async () => {
    const store = statefulStore();
    store.recordScaffoldPlan = vi.fn(async () => {
      throw new Error("seed failure simulation");
    }) as any;
    const missionId = "mission_seed_resilient";
    const { promise, read } = callRoute(store, "/missions/from-blueprint", "POST", {
      blueprint: BLUEPRINT,
      missionId,
    });
    expect(await promise).toBe(true);
    expect(read().status).toBe(201); // mission은 그대로 만들어진다
  });
});
