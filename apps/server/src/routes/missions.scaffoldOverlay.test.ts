import type { IncomingMessage } from "node:http";
import type {
  DesignBlueprintInput,
  ScaffoldOverlay,
  ScaffoldPlan,
  ServerMissionRecord,
} from "@ai-orchestrator/protocol";
import { describe, expect, it, vi } from "vitest";
import type { MissionStore } from "../missions/missionStore.js";
import { handleMissionRoute } from "./missions.js";

/**
 * AppFix overlay vertical:
 *   POST /missions/:id/scaffold/overlay → 미션 record에 overlay 추가 →
 *   GET /missions/:id/scaffold/latest가 base scaffold 위에 overlay를 덮어쓴 결과(source=scaffold_overlay)를 반환.
 *
 * 정직성:
 *   - overlay 같은 path 여러 번이면 마지막이 이긴다.
 *   - 가드(secret/binary/too_large) 통과 못한 overlay 파일은 skipped에 들어가고 base가 보존된다.
 *   - 자동 적용/자동 GitHub write 0(여긴 record만 갱신).
 */

const BLUEPRINT: DesignBlueprintInput = {
  title: "tasks",
  userIntent: "vertical smoke",
  targetSurface: "new_app",
  screens: [
    { name: "오늘", purpose: "오늘 할 일", primaryAction: "추가", secondaryActions: [], dataNeeded: [], emptyState: "x", errorState: "x" },
  ],
  designTokens: { density: "balanced", tone: "clean_builder", motion: "subtle" },
  acceptanceCriteria: ["c1"],
};

function emptyRecord(missionId: string): ServerMissionRecord {
  return {
    mission: { missionId, title: `m ${missionId}`, goal: "g", truthStatus: "planned", createdBy: "t", createdAt: "2026-06-14T12:00:00.000Z" },
    status: "running",
    truthStatus: "planned",
    workers: [],
    artifacts: [],
    verificationReports: [],
    mergeQueueItems: [],
    scaffoldPlans: [],
    scaffoldOverlays: [],
    updatedAt: "2026-06-14T12:00:00.000Z",
  } as unknown as ServerMissionRecord;
}

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
    recordScaffoldOverlay: vi.fn(async (missionId: string, overlay: ScaffoldOverlay) => {
      const rec = records.get(missionId);
      if (!rec) return undefined;
      rec.scaffoldOverlays = [...(rec.scaffoldOverlays ?? []), overlay];
      return rec;
    }),
    get: vi.fn(async (id: string) => records.get(id) ?? null),
  } as unknown as MissionStore & { records: Map<string, ServerMissionRecord> };
}

function callRoute(
  store: MissionStore,
  pathname: string,
  method: string,
  body: unknown = {},
) {
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
      now: () => "2026-06-14T13:00:00.000Z",
    } as Parameters<typeof handleMissionRoute>[0]),
    read: () => ({ status, payload }),
  };
}

describe("POST /missions/:id/scaffold/overlay — AppFix vertical", () => {
  it("(vertical) overlay 적용 → scaffold/latest가 새 content를 source=\"scaffold_overlay\"로 반환", async () => {
    const store = statefulStore();
    const missionId = "mission_overlay_vertical";
    // 1) blueprint 미션 → seed scaffold 자동 생성.
    await callRoute(store, "/missions/from-blueprint", "POST", { blueprint: BLUEPRINT, missionId }).promise;

    // 2) GET scaffold/latest — base만 있음. styles.css는 source="scaffold_plan".
    const before = await callRoute(store, `/missions/${missionId}/scaffold/latest`, "GET");
    expect(await before.promise).toBe(true);
    const baseStyles = before.read().payload.files.find((f: { path: string }) => f.path === "src/styles.css");
    expect(baseStyles.source).toBe("scaffold_plan");

    // 3) POST scaffold/overlay — styles.css만 덮어쓰는 새 content.
    const newStyles = `.app-shell {\n  background: tomato;\n}\n`;
    const overlayCall = await callRoute(
      store,
      `/missions/${missionId}/scaffold/overlay`,
      "POST",
      {
        source: "appfix",
        files: [{ path: "src/styles.css", content: newStyles }],
        evidenceRef: "qa_test_1",
      },
    );
    expect(await overlayCall.promise).toBe(true);
    expect(overlayCall.read().status).toBe(200);
    expect(overlayCall.read().payload.outcome).toBe("recorded");
    expect(overlayCall.read().payload.overlay.id).toContain("overlay_");

    // 4) GET scaffold/latest — styles.css가 새 content + source="scaffold_overlay"로 보임.
    //    다른 파일(src/App.tsx 등)은 그대로 scaffold_plan으로 남는다.
    const after = await callRoute(store, `/missions/${missionId}/scaffold/latest`, "GET");
    expect(await after.promise).toBe(true);
    const afterFiles = after.read().payload.files;
    const styles = afterFiles.find((f: { path: string }) => f.path === "src/styles.css");
    expect(styles.content).toBe(newStyles);
    expect(styles.source).toBe("scaffold_overlay");
    const app = afterFiles.find((f: { path: string }) => f.path === "src/App.tsx");
    expect(app.source).toBe("scaffold_plan");
    // status는 found 또는 partial(가드 통과한 base 파일들 + overlay 1개).
    expect(["found", "partial"]).toContain(after.read().payload.status);
  });

  it("(가드) overlay 파일에 secret이 들어 있으면 skipped로 분류 + base가 보존된다", async () => {
    const store = statefulStore();
    const missionId = "mission_overlay_secret";
    await callRoute(store, "/missions/from-blueprint", "POST", { blueprint: BLUEPRINT, missionId }).promise;

    const overlayCall = await callRoute(
      store,
      `/missions/${missionId}/scaffold/overlay`,
      "POST",
      {
        source: "appfix",
        files: [
          { path: "src/styles.css", content: "/* ghp_abcdefghij1234567890abcdef */ .x{}\n" },
        ],
      },
    );
    expect(await overlayCall.promise).toBe(true);
    expect(overlayCall.read().payload.outcome).toBe("recorded");

    const after = await callRoute(store, `/missions/${missionId}/scaffold/latest`, "GET");
    expect(await after.promise).toBe(true);
    const styles = after.read().payload.files.find((f: { path: string }) => f.path === "src/styles.css");
    // 가드에 걸려 overlay 적용 안 됨 — base가 보존되어야 한다.
    expect(styles.source).toBe("scaffold_plan");
    expect(styles.content).not.toContain("ghp_");
    // skipped에 secret_suspect로 노출.
    const skippedReasons = after.read().payload.skipped.map((s: { reason: string }) => s.reason);
    expect(skippedReasons).toContain("secret_suspect");
  });
});
