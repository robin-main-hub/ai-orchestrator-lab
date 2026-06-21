import type { IncomingMessage } from "node:http";
import type { EventEnvelope, ServerMissionRecord } from "@ai-orchestrator/protocol";
import { describe, expect, it, vi } from "vitest";
import { createMissionStore, type MissionStore } from "../missions/missionStore.js";
import { handleMissionRoute } from "./missions.js";

/** in-memory event storage so the route exercises the real appendEvent invariant, not a stub */
function realStore() {
  const events: EventEnvelope[] = [];
  const store = createMissionStore({
    loadEvents: async () => [...events],
    appendEvents: async (_sessionId: string, envelopes: EventEnvelope[]) => {
      for (const envelope of envelopes) {
        if (!events.some((existing) => existing.id === envelope.id)) {
          events.push(envelope);
        }
      }
    },
    now: () => "2026-06-13T00:00:00.000Z",
  });
  return { store, events };
}

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

  it("POST /missions/from-template creates a mission from a GENERIC core template", async () => {
    const create = vi.fn(async () => record("m_tpl_1", "running"));
    const appendEvent = vi.fn(async () => record("m_tpl_1", "running"));
    const store = { create, appendEvent } as unknown as MissionStore;
    const { args, result } = deps(store, "/missions/from-template", "POST", { templateId: "react_vite_app", missionId: "m_tpl_1", input: { appName: "demo" } });
    expect(await handleMissionRoute(args)).toBe(true);
    expect(result().status).toBe(201);
    expect(create).toHaveBeenCalled();
    expect(appendEvent).toHaveBeenCalled(); // planned artifacts attached
    expect((result().payload as { verificationPlan: unknown[] }).verificationPlan.length).toBeGreaterThan(0);
  });

  it("POST /missions/:id/events 400s a cross-mission artifact and leaves the event log untouched", async () => {
    const { store, events } = realStore();
    await store.create({
      id: "m_evt",
      title: "evt",
      goal: "g",
      truthStatus: "observed",
      createdBy: "desktop",
      workers: [{ agentId: "a1", role: "builder", displayName: "B", soulMode: "summary", configSource: "internal" }],
    });
    const before = events.length;
    const { args, result } = deps(store, "/missions/m_evt/events", "POST", {
      type: "mission.artifact.attached",
      payload: {
        artifact: { id: "art_x", missionId: "m_other", kind: "diff", summary: "cross", truthStatus: "observed", createdAt: "2026-06-13T00:00:01.000Z" },
      },
    });
    expect(await handleMissionRoute(args)).toBe(true);
    const { status, payload } = result();
    expect(status).toBe(400);
    expect((payload as { error: string }).error).toBe("invalid_mission_event_payload");
    expect(events.length).toBe(before); // rejected request is not appended
  });

  it("POST /missions/from-template 404s a removed business template", async () => {
    const store = {} as unknown as MissionStore;
    const { args, result } = deps(store, "/missions/from-template", "POST", { templateId: "giolite_htv_quote", input: {} });
    expect(await handleMissionRoute(args)).toBe(true);
    expect(result().status).toBe(404); // 회사 도메인 템플릿은 제품에서 제거됨
  });

  it("POST /missions/from-template 404s an unknown template", async () => {
    const store = {} as unknown as MissionStore;
    const { args, result } = deps(store, "/missions/from-template", "POST", { templateId: "nope", input: {} });
    expect(await handleMissionRoute(args)).toBe(true);
    expect(result().status).toBe(404);
  });

  it("POST /missions/from-template 400s with the missing required fields", async () => {
    const store = {} as unknown as MissionStore;
    const { args, result } = deps(store, "/missions/from-template", "POST", { templateId: "react_vite_app", input: {} });
    expect(await handleMissionRoute(args)).toBe(true);
    const { status, payload } = result();
    expect(status).toBe(400);
    expect((payload as { missingFields: string[] }).missingFields).toContain("appName");
  });

  it("POST /missions/:id/workspace attaches an app workspace", async () => {
    const attachWorkspace = vi.fn(async () => record("m1", "running"));
    const store = { attachWorkspace } as unknown as MissionStore;
    const { args, result } = deps(store, "/missions/m1/workspace", "POST", { repoRootRef: "/repo", appType: "react_vite" });
    expect(await handleMissionRoute(args)).toBe(true);
    expect(result().status).toBe(201);
    expect(attachWorkspace).toHaveBeenCalled();
  });

  it("POST /missions/:id/workspace 404s an unknown mission", async () => {
    const store = { attachWorkspace: async () => undefined } as unknown as MissionStore;
    const { args, result } = deps(store, "/missions/ghost/workspace", "POST", { repoRootRef: "/repo" });
    expect(await handleMissionRoute(args)).toBe(true);
    expect(result().status).toBe(404);
  });

  function withWorkspace(id: string, wsId: string) {
    const r = record(id, "running");
    (r as { workspaces: unknown[] }).workspaces = [{ id: wsId, missionId: id, preview: { status: "not_started", truthStatus: "planned" } }];
    return r;
  }

  it("POST preview records observed running when the port is bound", async () => {
    const recordPreview = vi.fn(async () => withWorkspace("m1", "ws1"));
    const store = { get: async () => withWorkspace("m1", "ws1"), recordPreview } as unknown as MissionStore;
    const probePreview = vi.fn(async () => true);
    const { args, result } = deps(store, "/missions/m1/workspace/ws1/preview", "POST", { host: "127.0.0.1" }, { probePreview });
    expect(await handleMissionRoute(args)).toBe(true);
    expect(result().status).toBe(200);
    expect((result().payload as { preview: { truthStatus: string } }).preview.truthStatus).toBe("observed");
    expect(probePreview).toHaveBeenCalled();
  });

  it("POST preview records NOT observed when the port is not bound", async () => {
    const store = { get: async () => withWorkspace("m1", "ws1"), recordPreview: async () => withWorkspace("m1", "ws1") } as unknown as MissionStore;
    const probePreview = vi.fn(async () => false);
    const { args, result } = deps(store, "/missions/m1/workspace/ws1/preview", "POST", {}, { probePreview });
    expect(await handleMissionRoute(args)).toBe(true);
    expect((result().payload as { preview: { truthStatus: string } }).preview.truthStatus).not.toBe("observed");
  });

  it("POST preview 404s an unknown workspace", async () => {
    const store = { get: async () => record("m1", "running") } as unknown as MissionStore;
    const { args, result } = deps(store, "/missions/m1/workspace/ghost/preview", "POST", {}, { probePreview: async () => true });
    expect(await handleMissionRoute(args)).toBe(true);
    expect(result().status).toBe(404);
  });

  it("POST preview 501s when probe is not configured", async () => {
    const store = { get: async () => withWorkspace("m1", "ws1") } as unknown as MissionStore;
    const { args, result } = deps(store, "/missions/m1/workspace/ws1/preview", "POST", {});
    expect(await handleMissionRoute(args)).toBe(true);
    expect(result().status).toBe(501);
  });

  it("POST preview/start records observed running when the dev process serves", async () => {
    const store = { get: async () => withWorkspace("m1", "ws1"), recordPreview: async () => withWorkspace("m1", "ws1") } as unknown as MissionStore;
    const startPreview = vi.fn(async () => ({ status: "running", port: 4401, url: "http://127.0.0.1:4401", truthStatus: "observed" }));
    const { args, result } = deps(store, "/missions/m1/workspace/ws1/preview/start", "POST", { command: "vite preview" }, { startPreview });
    expect(await handleMissionRoute(args)).toBe(true);
    expect(result().status).toBe(200);
    expect((result().payload as { preview: { truthStatus: string } }).preview.truthStatus).toBe("observed");
    expect(startPreview).toHaveBeenCalled();
  });

  it("POST preview/start 501s when not configured", async () => {
    const store = { get: async () => withWorkspace("m1", "ws1") } as unknown as MissionStore;
    const { args, result } = deps(store, "/missions/m1/workspace/ws1/preview/start", "POST", {});
    expect(await handleMissionRoute(args)).toBe(true);
    expect(result().status).toBe(501);
  });

  it("POST preview/start 404s an unknown workspace", async () => {
    const store = { get: async () => record("m1", "running") } as unknown as MissionStore;
    const { args, result } = deps(store, "/missions/m1/workspace/ghost/preview/start", "POST", {}, { startPreview: async () => ({ status: "running", truthStatus: "observed" }) });
    expect(await handleMissionRoute(args)).toBe(true);
    expect(result().status).toBe(404);
  });

  it("POST preview/stop records stopped", async () => {
    const store = { get: async () => withWorkspace("m1", "ws1"), recordPreview: async () => withWorkspace("m1", "ws1") } as unknown as MissionStore;
    const stopPreview = vi.fn(async () => ({ status: "stopped", truthStatus: "configured" }));
    const { args, result } = deps(store, "/missions/m1/workspace/ws1/preview/stop", "POST", {}, { stopPreview });
    expect(await handleMissionRoute(args)).toBe(true);
    expect(result().status).toBe(200);
    expect((result().payload as { preview: { status: string } }).preview.status).toBe("stopped");
    expect(stopPreview).toHaveBeenCalled();
  });

  function withObservedPreview(id: string, wsId: string) {
    const r = record(id, "running");
    (r as { workspaces: unknown[] }).workspaces = [{ id: wsId, missionId: id, preview: { status: "running", port: 4401, url: "http://127.0.0.1:4401", truthStatus: "observed" } }];
    return r;
  }

  it("POST visual-qa runs when the preview is observed running", async () => {
    const store = { get: async () => withObservedPreview("m1", "ws1"), recordVisualQa: async () => withObservedPreview("m1", "ws1") } as unknown as MissionStore;
    const runVisualQa = vi.fn(async () => ({ id: "vq1", missionId: "m1", workspaceId: "ws1", previewUrl: "http://127.0.0.1:4401", checks: [], issues: [], status: "warning", truthStatus: "observed", createdAt: "t" }));
    const { args, result } = deps(store, "/missions/m1/workspace/ws1/visual-qa", "POST", {}, { runVisualQa });
    expect(await handleMissionRoute(args)).toBe(true);
    expect(result().status).toBe(200);
    expect(runVisualQa).toHaveBeenCalled();
  });

  it("POST visual-qa 409s when preview is NOT observed (no fake QA)", async () => {
    const store = { get: async () => withWorkspace("m1", "ws1") } as unknown as MissionStore; // preview not_started
    const { args, result } = deps(store, "/missions/m1/workspace/ws1/visual-qa", "POST", {}, { runVisualQa: async () => ({}) as never });
    expect(await handleMissionRoute(args)).toBe(true);
    expect(result().status).toBe(409);
  });

  it("POST visual-qa 501s when not configured", async () => {
    const store = { get: async () => withObservedPreview("m1", "ws1") } as unknown as MissionStore;
    const { args, result } = deps(store, "/missions/m1/workspace/ws1/visual-qa", "POST", {});
    expect(await handleMissionRoute(args)).toBe(true);
    expect(result().status).toBe(501);
  });

  const samplePlan = { id: "sc1", missionId: "m1", workspaceId: "ws1", templateId: "react_vite_app", input: { appName: "demo" }, repoRootRef: "/repo", files: [{ path: "package.json", action: "create", bytes: 10, contentPreview: "{}" }], hasOverwrites: false, truthStatus: "planned", createdAt: "t" };

  it("POST scaffold/plan returns a planned diff (no write)", async () => {
    const planScaffold = vi.fn(async () => ({ ok: true as const, plan: samplePlan }));
    const store = { get: async () => withWorkspace("m1", "ws1"), recordScaffoldPlan: async () => withWorkspace("m1", "ws1") } as unknown as MissionStore;
    const { args, result } = deps(store, "/missions/m1/workspace/ws1/scaffold/plan", "POST", { templateId: "react_vite_app", input: { appName: "demo" } }, { planScaffold });
    expect(await handleMissionRoute(args)).toBe(true);
    expect(result().status).toBe(201);
    expect((result().payload as { plan: { truthStatus: string } }).plan.truthStatus).toBe("planned");
  });

  it("POST scaffold/plan 409s when the runner blocks (e.g. repoRoot not allowlisted)", async () => {
    const planScaffold = vi.fn(async () => ({ ok: false as const, reason: "repoRoot not allowlisted" }));
    const store = { get: async () => withWorkspace("m1", "ws1") } as unknown as MissionStore;
    const { args, result } = deps(store, "/missions/m1/workspace/ws1/scaffold/plan", "POST", { templateId: "react_vite_app", input: {} }, { planScaffold });
    expect(await handleMissionRoute(args)).toBe(true);
    expect(result().status).toBe(409);
  });

  it("POST scaffold/:planId/apply applies (200) and maps blocked → 409", async () => {
    const store = { getScaffoldPlan: async () => samplePlan, recordScaffoldApply: async () => withWorkspace("m1", "ws1") } as unknown as MissionStore;
    const applied = vi.fn(async () => ({ status: "applied", appliedPaths: ["package.json"], reason: "ok", observed: true, appliedAt: "t" }));
    const { args, result } = deps(store, "/missions/m1/scaffold/sc1/apply", "POST", { planId: "sc1" }, { applyScaffold: applied });
    expect(await handleMissionRoute(args)).toBe(true);
    expect(result().status).toBe(200);

    const blocked = vi.fn(async () => ({ status: "blocked", appliedPaths: [], reason: "needs approval", observed: true, appliedAt: "t" }));
    const { args: a2, result: r2 } = deps(store, "/missions/m1/scaffold/sc1/apply", "POST", { planId: "sc1" }, { applyScaffold: blocked });
    expect(await handleMissionRoute(a2)).toBe(true);
    expect(r2().status).toBe(409);
  });

  it("POST scaffold apply 404s an unknown plan", async () => {
    const store = { getScaffoldPlan: async () => undefined } as unknown as MissionStore;
    const { args, result } = deps(store, "/missions/m1/scaffold/ghost/apply", "POST", { planId: "ghost" }, { applyScaffold: async () => ({}) as never });
    expect(await handleMissionRoute(args)).toBe(true);
    expect(result().status).toBe(404);
  });

  const BLUEPRINT = {
    title: "보드 개편",
    userIntent: "한눈에 보기",
    targetSurface: "mission_board",
    screens: [{ name: "보드", purpose: "현황", primaryAction: "열기", emptyState: "없음", errorState: "실패" }],
    designTokens: { density: "balanced", tone: "clean_builder", motion: "subtle" },
  };

  it("POST /missions/from-blueprint creates a design mission", async () => {
    const create = vi.fn(async () => record("m_design_1", "running"));
    const attachDesignBlueprint = vi.fn(async () => ({ mission: record("m_design_1", "running"), blueprint: { acceptanceCriteria: [] } }));
    const store = { create, attachDesignBlueprint } as unknown as MissionStore;
    const { args, result } = deps(store, "/missions/from-blueprint", "POST", { blueprint: BLUEPRINT, missionId: "m_design_1" });
    expect(await handleMissionRoute(args)).toBe(true);
    expect(result().status).toBe(201);
    expect(create).toHaveBeenCalled();
    expect(attachDesignBlueprint).toHaveBeenCalled();
    expect((result().payload as { designTeam: unknown[] }).designTeam.length).toBeGreaterThan(0);
  });

  it("POST /missions/from-blueprint 400s with no screens", async () => {
    const store = {} as unknown as MissionStore;
    const { args, result } = deps(store, "/missions/from-blueprint", "POST", { blueprint: { ...BLUEPRINT, screens: [] } });
    expect(await handleMissionRoute(args)).toBe(true);
    expect(result().status).toBe(400);
  });

  const DEBATE_PACKET = {
    id: "dp1",
    debateId: "debate_1",
    kind: "design",
    summary: "보드 개편",
    adoptedDecisions: ["상단 신호 1개"],
    rejectedOptions: [],
    openQuestions: [],
  };

  it("POST /missions/from-debate promotes an actionable debate to a design mission", async () => {
    const create = vi.fn(async () => record("m_debate_1", "running"));
    const attachDesignBlueprint = vi.fn(async () => ({ mission: record("m_debate_1", "running"), blueprint: { acceptanceCriteria: [] } }));
    const store = { create, attachDesignBlueprint } as unknown as MissionStore;
    const { args, result } = deps(store, "/missions/from-debate", "POST", { packet: DEBATE_PACKET, missionId: "m_debate_1" });
    expect(await handleMissionRoute(args)).toBe(true);
    expect(result().status).toBe(201);
    expect(create).toHaveBeenCalled();
    expect(attachDesignBlueprint).toHaveBeenCalled();
    expect((result().payload as { debatePacket: { debateId: string } }).debatePacket.debateId).toBe("debate_1");
  });

  it("POST /missions/from-debate 400s when the debate has no actionable decisions", async () => {
    const store = {} as unknown as MissionStore;
    const { args, result } = deps(store, "/missions/from-debate", "POST", { packet: { ...DEBATE_PACKET, adoptedDecisions: [] } });
    expect(await handleMissionRoute(args)).toBe(true);
    expect(result().status).toBe(400);
  });
});
