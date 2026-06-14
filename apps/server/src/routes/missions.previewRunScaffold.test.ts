import type { IncomingMessage } from "node:http";
import type {
  AppWorkspace,
  AppWorkspacePreview,
  DesignBlueprintInput,
  ScaffoldPlan,
  ServerMissionRecord,
} from "@ai-orchestrator/protocol";
import { describe, expect, it, vi } from "vitest";
import type { MissionStore } from "../missions/missionStore.js";
import { handleMissionRoute } from "./missions.js";

/**
 * Preview Run vertical:
 *   사용자 한 번 클릭으로 scaffold/latest → tmp dir materialize → workspace attach →
 *   startPreview(observed/failed)까지. UI는 그 결과만 보면 된다.
 *
 * 정직성:
 *   - scaffold 없으면 outcome="no_scaffold"(preview 안 시도). 가짜 진행 X.
 *   - startPreview가 failed/blocked면 outcome="preview_not_running" — 가짜 running 표시 X.
 *   - DI 누락이면 outcome="not_configured"(501 아님 — UI가 다음 행동 안내 가능하게).
 */

const BLUEPRINT: DesignBlueprintInput = {
  title: "Tasks Board",
  userIntent: "preview vertical smoke",
  targetSurface: "new_app",
  screens: [
    {
      name: "Today",
      purpose: "오늘 할 일",
      primaryAction: "추가",
      secondaryActions: [],
      dataNeeded: [],
      emptyState: "없음",
      errorState: "실패",
    },
  ],
  designTokens: { density: "balanced", tone: "clean_builder", motion: "subtle" },
  acceptanceCriteria: ["체크 1"],
};

function emptyRecord(missionId: string): ServerMissionRecord {
  return {
    mission: {
      missionId,
      title: `미션 ${missionId}`,
      goal: "preview vertical",
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
    workspaces: [],
    updatedAt: "2026-06-14T12:00:00.000Z",
  } as unknown as ServerMissionRecord;
}

function statefulStore(): MissionStore & { records: Map<string, ServerMissionRecord> } {
  const records = new Map<string, ServerMissionRecord>();
  let workspaceCounter = 0;
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
    attachWorkspace: vi.fn(async (missionId: string, request) => {
      const rec = records.get(missionId);
      if (!rec) return undefined;
      workspaceCounter += 1;
      const ws: AppWorkspace = {
        id: `ws_${missionId}_${workspaceCounter}`,
        missionId,
        repoRootRef: request.repoRootRef,
        worktreeRef: request.worktreeRef,
        appType: request.appType ?? "unknown",
        preview: { status: "not_started", truthStatus: "planned" },
        terminal: { runnerKind: request.runnerKind ?? "local", mode: request.terminalMode ?? "read_only" },
        files: { changedCount: 0 },
        createdAt: "2026-06-14T12:00:00.000Z",
      };
      rec.workspaces = [...(rec.workspaces ?? []), ws];
      return rec;
    }),
    recordPreview: vi.fn(async (missionId: string, workspaceId: string, preview: AppWorkspacePreview) => {
      const rec = records.get(missionId);
      if (!rec) return undefined;
      rec.workspaces = (rec.workspaces ?? []).map((ws) =>
        ws.id === workspaceId ? ({ ...ws, preview } as AppWorkspace) : ws,
      );
      return rec;
    }),
  } as unknown as MissionStore & { records: Map<string, ServerMissionRecord> };
}

function callRoute(
  store: MissionStore,
  pathname: string,
  method: string,
  body: unknown,
  extra: Partial<Parameters<typeof handleMissionRoute>[0]> = {},
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
      now: () => "2026-06-14T12:00:00.000Z",
      ...extra,
    } as Parameters<typeof handleMissionRoute>[0]),
    read: () => ({ status, payload }),
  };
}

describe("POST /missions/:id/preview/run-scaffold — Preview Run vertical", () => {
  it("(vertical) blueprint mission → scaffold/latest 6개 파일 materialize → workspace attach → startPreview observed running → URL 응답", async () => {
    const store = statefulStore();
    const missionId = "mission_preview_vertical";
    // 1) blueprint 미션을 만들면 seed scaffold가 자동으로 남는다(이미 검증된 단계 — 여기선 setup).
    await callRoute(store, "/missions/from-blueprint", "POST", { blueprint: BLUEPRINT, missionId }).promise;

    // 2) DI 가짜 — materialize는 호출 카운트/files만 검사, startPreview는 observed running 반환.
    const materializeScaffoldFiles = vi.fn(async (input: { repoRoot: string; files: ReadonlyArray<{ path: string; content: string }> }) => {
      return { written: input.files.length };
    });
    const startPreview = vi.fn(async (input: { cwd: string; port: number; host: string; workspaceId: string }) => ({
      status: "running" as const,
      port: input.port,
      url: `http://${input.host}:${input.port}`,
      command: "pnpm dev",
      truthStatus: "observed" as const,
    }));
    const resolvePreviewRepoRoot = vi.fn(({ missionId: id }: { missionId: string }) => `/tmp/preview/${id}`);

    const { promise, read } = callRoute(
      store,
      `/missions/${missionId}/preview/run-scaffold`,
      "POST",
      { host: "127.0.0.1" },
      { materializeScaffoldFiles, startPreview, resolvePreviewRepoRoot },
    );
    expect(await promise).toBe(true);
    const { status, payload } = read();
    expect(status).toBe(200);
    expect(payload.outcome).toBe("observed");
    expect(payload.materializedFileCount).toBe(6); // package.json/index.html/main.tsx/App.tsx/styles.css/README.md
    expect(payload.repoRoot).toBe(`/tmp/preview/${missionId}`);
    expect(payload.workspaceId).toBeTruthy();
    expect(payload.preview.status).toBe("running");
    expect(payload.preview.truthStatus).toBe("observed");
    expect(payload.preview.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+/);

    // materialize에 전달된 files에 실제 blueprint 콘텐츠가 들어 있어야 함(scaffold/latest 재현).
    expect(materializeScaffoldFiles).toHaveBeenCalledTimes(1);
    const filesArg = materializeScaffoldFiles.mock.calls[0]![0].files;
    expect(filesArg.length).toBe(6);
    const appTsx = filesArg.find((f) => f.path === "src/App.tsx")!;
    expect(appTsx.content).toContain("Today"); // screen name reflected
    expect(appTsx.content).toContain("preview vertical smoke"); // userIntent reflected

    // startPreview는 attach된 workspace의 cwd와 derivePreviewPort 기반 포트를 받아야 함.
    expect(startPreview).toHaveBeenCalledTimes(1);
    const startArg = startPreview.mock.calls[0]![0];
    expect(startArg.cwd).toBe(`/tmp/preview/${missionId}`);
    expect(startArg.workspaceId).toMatch(/^ws_/);

    // store에도 preview가 기록되어 보드/MissionWorkspace UI가 자동 반영되어야 함.
    const finalRec = store.records.get(missionId)!;
    const lastWs = finalRec.workspaces!.at(-1)!;
    expect(lastWs.preview.status).toBe("running");
    expect(lastWs.preview.url).toMatch(/^http:\/\//);
  });

  it("scaffold/latest 비어 있으면 outcome=\"no_scaffold\" + preview 안 띄움(가짜 진행 X)", async () => {
    const store = statefulStore();
    const missionId = "mission_no_scaffold";
    // blueprint mission을 만들지 않음 — 직접 빈 mission 생성.
    await store.create({ id: missionId, title: "x", goal: "x", createdBy: "test" } as any);

    const materializeScaffoldFiles = vi.fn();
    const startPreview = vi.fn();
    const resolvePreviewRepoRoot = vi.fn(() => "/tmp/x");

    const { promise, read } = callRoute(
      store,
      `/missions/${missionId}/preview/run-scaffold`,
      "POST",
      {},
      { materializeScaffoldFiles, startPreview, resolvePreviewRepoRoot },
    );
    expect(await promise).toBe(true);
    const { payload } = read();
    expect(payload.outcome).toBe("no_scaffold");
    expect(materializeScaffoldFiles).not.toHaveBeenCalled();
    expect(startPreview).not.toHaveBeenCalled();
  });

  it("startPreview가 failed로 반환하면 outcome=\"preview_not_running\" + URL은 응답에 없다", async () => {
    const store = statefulStore();
    const missionId = "mission_preview_fail";
    await callRoute(store, "/missions/from-blueprint", "POST", { blueprint: BLUEPRINT, missionId }).promise;

    const materializeScaffoldFiles = vi.fn(async (input: { files: ReadonlyArray<unknown> }) => ({ written: input.files.length }));
    const startPreview = vi.fn(async () => ({
      status: "failed" as const,
      port: 5173,
      command: "pnpm dev",
      detail: "spawn ENOENT",
      truthStatus: "configured" as const,
    }));
    const resolvePreviewRepoRoot = vi.fn(({ missionId: id }: { missionId: string }) => `/tmp/preview/${id}`);

    const { promise, read } = callRoute(
      store,
      `/missions/${missionId}/preview/run-scaffold`,
      "POST",
      {},
      { materializeScaffoldFiles, startPreview, resolvePreviewRepoRoot },
    );
    expect(await promise).toBe(true);
    const { payload } = read();
    expect(payload.outcome).toBe("preview_not_running");
    expect(payload.preview.status).toBe("failed");
    expect(payload.preview.truthStatus).toBe("configured");
    expect(payload.preview.url).toBeUndefined(); // 가짜 URL 금지
  });

  it("DI 미주입이면 outcome=\"not_configured\" (501 아님 — UI 안내 가능)", async () => {
    const store = statefulStore();
    const missionId = "mission_no_di";
    await callRoute(store, "/missions/from-blueprint", "POST", { blueprint: BLUEPRINT, missionId }).promise;

    const { promise, read } = callRoute(
      store,
      `/missions/${missionId}/preview/run-scaffold`,
      "POST",
      {},
      {}, // DI 일부러 비움
    );
    expect(await promise).toBe(true);
    const { status, payload } = read();
    expect(status).toBe(200);
    expect(payload.outcome).toBe("not_configured");
  });

  it("회귀: 위험한 명령(rm/curl/메타문자)은 받지 않음 — preview command 정책은 기존 startPreview가 책임. 라우트는 그대로 전달만.", async () => {
    // 이 케이스는 명령 정책 자체를 검증하지 않고, 라우트가 명령을 임의로 변형하지 않는다는 회귀만.
    const store = statefulStore();
    const missionId = "mission_cmd_passthrough";
    await callRoute(store, "/missions/from-blueprint", "POST", { blueprint: BLUEPRINT, missionId }).promise;
    const startPreview = vi.fn(async (input: { command: string }) => ({
      status: "running" as const,
      port: 5173,
      url: `http://127.0.0.1:5173`,
      command: input.command,
      truthStatus: "observed" as const,
    }));
    const materializeScaffoldFiles = vi.fn(async (input: { files: ReadonlyArray<unknown> }) => ({ written: input.files.length }));
    const resolvePreviewRepoRoot = vi.fn(() => "/tmp/x");

    await callRoute(
      store,
      `/missions/${missionId}/preview/run-scaffold`,
      "POST",
      { command: "pnpm dev --host 127.0.0.1" },
      { materializeScaffoldFiles, startPreview, resolvePreviewRepoRoot },
    ).promise;
    expect(startPreview.mock.calls[0]![0].command).toBe("pnpm dev --host 127.0.0.1");
  });
});
