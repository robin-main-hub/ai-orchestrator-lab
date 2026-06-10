import type { LoadedPersona } from "@ai-orchestrator/agents";
import type { CodingPacket } from "@ai-orchestrator/protocol";
import { describe, expect, it, vi } from "vitest";
import { buildWorkspacePlan } from "./missionWorkspace";
import { runCheckInSweep, createCheckInState } from "./missionCheckIn";
import {
  broadcastToMissions,
  createCheckInTargets,
  runParallelAutonomy,
  type LiveMissionTarget,
  type ParallelMissionSpec,
} from "./parallelAutonomy";
import { createSummonRegistry, type SummonContext } from "./personaSummon";

const ctx: SummonContext = {
  now: "2026-06-10T00:00:00.000Z",
  makeSessionId: (persona, paneId) => `as_${persona}_${paneId}`,
};

const persona = (name: string): LoadedPersona => ({
  personaName: name,
  mode: "soul_plus_agents",
  safetyContent: "Never touch DGX-01.",
  fragments: [{ source: "soul", relativePath: `agents/${name}/SOUL.md`, content: `${name}-identity` }],
});

const packet = (goal: string, verificationPlan: string[]): CodingPacket => ({
  goal,
  context: [],
  decisions: [],
  rejectedOptions: [],
  constraints: [],
  filesToInspect: [],
  implementationPlan: [],
  verificationPlan,
  reviewerNotes: [],
});

const spec = (id: string, role: ParallelMissionSpec["summon"]["preferredRole"]): ParallelMissionSpec => ({
  id,
  summon: { personaName: id, sessionId: id, preferredRole: role },
  persona: persona(id),
  packet: packet(`goal-${id}`, ["run tests"]),
});

const dispatchResponse = () =>
  ({
    intent: {},
    permission: { decision: "allow", requestedLevels: [], reason: "" },
    approval: { sourceItemId: "ignored" },
    dispatch: { attempted: false, status: "dry_run", reason: "dry_run" },
  }) as any;

describe("runParallelAutonomy", () => {
  it("drives multiple missions concurrently, each through the gate, on distinct panes", async () => {
    const dispatchedByPane = new Map<string, string[]>();
    let active = 0;
    let maxActive = 0;
    const dispatchClient = vi.fn(async ({ request }: any) => {
      const list = dispatchedByPane.get(request.paneId) ?? [];
      list.push(request.commandPreview);
      dispatchedByPane.set(request.paneId, list);
      return dispatchResponse();
    });
    const captureClient = vi.fn(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 5));
      active -= 1;
      return { status: "captured", reason: "ok", payload: { outputPreview: "All tests passed", lineCount: 1 } } as any;
    });

    const updates: string[] = [];
    const stepMissions = new Set<string>();
    const { registry, results } = await runParallelAutonomy({
      registry: createSummonRegistry([
        { paneId: "%1", role: "qa" },
        { paneId: "%2", role: "qa" },
      ]),
      missions: [spec("aoi", "qa"), spec("rin", "qa")],
      ctx,
      mode: "human",
      clients: { dispatchClient, captureClient },
      now: () => "2026-06-10T00:00:00.000Z",
      onMissionUpdate: (u) => updates.push(`${u.missionId}:${u.phase}`),
      onMissionStep: (missionId) => stepMissions.add(missionId),
    });

    // both missions completed and freed their panes
    expect(results.filter((r) => r.ok && r.loopStatus === "completed")).toHaveLength(2);
    expect(registry.panes.every((p) => p.status === "free")).toBe(true);
    // genuinely overlapping execution
    expect(maxActive).toBeGreaterThan(1);
    // two distinct panes were driven, each with its own identity injection
    expect([...dispatchedByPane.keys()].sort()).toEqual(["%1", "%2"]);
    for (const cmds of dispatchedByPane.values()) {
      expect(cmds.some((c) => c.includes("-identity"))).toBe(true); // identity injected per pane
      expect(cmds).toContain("run tests");
    }
    // live board signals fired for both
    expect(updates).toContain("aoi:running");
    expect(updates).toContain("rin:done");
    expect(stepMissions).toEqual(new Set(["aoi", "rin"]));
  });

  it("rejects overflow missions while still running the ones that fit", async () => {
    const dispatchClient = vi.fn(async () => dispatchResponse());
    const captureClient = vi.fn(async () => ({
      status: "captured",
      reason: "ok",
      payload: { outputPreview: "All tests passed", lineCount: 1 },
    }) as any);

    const { results } = await runParallelAutonomy({
      registry: createSummonRegistry([{ paneId: "%1", role: "qa" }]), // only one pane
      missions: [spec("aoi", "qa"), spec("rin", "qa")],
      ctx,
      mode: "auto_safe",
      clients: { dispatchClient, captureClient },
      now: () => "2026-06-10T00:00:00.000Z",
    });

    expect(results.find((r) => !r.ok)).toMatchObject({ ok: false, reason: "no_free_pane" });
    expect(results.find((r) => r.ok)).toMatchObject({ ok: true, loopStatus: "completed" });
  });

  it("worktree workspace: gated setup before injection, kickoff preamble, teardown after completion", async () => {
    const dispatched: string[] = [];
    const dispatchClient = vi.fn(async ({ request }: any) => {
      dispatched.push(request.commandPreview);
      return dispatchResponse();
    });
    const captureClient = vi.fn(async () => ({
      status: "captured",
      reason: "ok",
      payload: { outputPreview: "All tests passed", lineCount: 1 },
    }) as any);

    const workspace = buildWorkspacePlan("run1_m1", { repoPath: "/srv/repo", cleanup: true });
    const { results } = await runParallelAutonomy({
      registry: createSummonRegistry([{ paneId: "%1", role: "code" }]),
      missions: [{ ...spec("aoi", "code"), workspace }],
      ctx,
      mode: "human",
      clients: { dispatchClient, captureClient },
      now: () => "2026-06-10T00:00:00.000Z",
    });

    expect(results[0]).toMatchObject({ ok: true, loopStatus: "completed" });
    // setup is the very first gated dispatch — before identity injection
    expect(dispatched[0]).toContain("worktree add");
    const injectionIndex = dispatched.findIndex((c) => c.includes("-identity"));
    expect(injectionIndex).toBeGreaterThan(0);
    // kickoff carries the worktree preamble + the original goal
    const kickoff = dispatched.find((c) => c.includes("워크스페이스 격리"));
    expect(kickoff).toBeDefined();
    expect(kickoff).toContain("goal-aoi");
    // cleanup teardown ran after completion
    expect(dispatched.some((c) => c.includes("worktree remove"))).toBe(true);
    expect(dispatched.indexOf(dispatched.find((c) => c.includes("worktree remove"))!)).toBeGreaterThan(injectionIndex);
  });

  it("a failed mission keeps its worktree (no teardown)", async () => {
    const dispatched: string[] = [];
    const dispatchClient = vi.fn(async ({ request }: any) => {
      dispatched.push(request.commandPreview);
      return dispatchResponse();
    });
    // pane reports a hard failure -> loop fails
    const captureClient = vi.fn(async () => ({
      status: "captured",
      reason: "ok",
      payload: { outputPreview: "error: cannot compile", lineCount: 1 },
    }) as any);

    const workspace = buildWorkspacePlan("run1_m1", { repoPath: "/srv/repo", cleanup: true });
    const { results } = await runParallelAutonomy({
      registry: createSummonRegistry([{ paneId: "%1", role: "code" }]),
      missions: [{ ...spec("aoi", "code"), workspace }],
      ctx,
      mode: "human",
      clients: { dispatchClient, captureClient },
      now: () => "2026-06-10T00:00:00.000Z",
    });

    expect(results[0]).toMatchObject({ ok: true, loopStatus: "failed" });
    expect(dispatched.some((c) => c.includes("worktree add"))).toBe(true);
    expect(dispatched.some((c) => c.includes("worktree remove"))).toBe(false);
  });

  it("agent set: each mission boots a FRESH hermes session before its identity lands", async () => {
    const dispatchedByPane = new Map<string, string[]>();
    const dispatchClient = vi.fn(async ({ request }: any) => {
      const list = dispatchedByPane.get(request.paneId) ?? [];
      list.push(request.commandPreview);
      dispatchedByPane.set(request.paneId, list);
      return dispatchResponse();
    });
    const captureClient = vi.fn(async () => ({
      status: "captured",
      reason: "ok",
      payload: { outputPreview: "All tests passed", lineCount: 1 },
    }) as any);

    const { resolvePersonaAgentSet } = await import("./personaAgentSet");
    await runParallelAutonomy({
      registry: createSummonRegistry([
        { paneId: "%1", role: "qa" },
        { paneId: "%2", role: "qa" },
      ]),
      missions: [
        { ...spec("aoi", "qa"), agentSet: resolvePersonaAgentSet("aoi") },
        { ...spec("rin", "qa"), agentSet: resolvePersonaAgentSet("rin") },
      ],
      ctx,
      mode: "human",
      clients: { dispatchClient, captureClient },
      now: () => "2026-06-10T00:00:00.000Z",
    });

    for (const commands of dispatchedByPane.values()) {
      expect(commands[0]).toBe("/new"); // fresh session first — no inherited context
      const bootIndex = commands.indexOf("/new");
      const identityIndex = commands.findIndex((c) => c.includes("-identity"));
      expect(identityIndex).toBeGreaterThan(bootIndex);
      expect(commands[identityIndex]).toContain("fresh hermes agent session");
    }
  });

  it("onAllocations exposes live session bindings before missions finish", async () => {
    const dispatchClient = vi.fn(async () => dispatchResponse());
    const captureClient = vi.fn(async () => ({
      status: "captured",
      reason: "ok",
      payload: { outputPreview: "All tests passed", lineCount: 1 },
    }) as any);

    let live: ReadonlyArray<LiveMissionTarget> = [];
    await runParallelAutonomy({
      registry: createSummonRegistry([
        { paneId: "%1", role: "qa" },
        { paneId: "%2", role: "qa" },
      ]),
      missions: [spec("aoi", "qa"), spec("rin", "qa")],
      ctx,
      mode: "human",
      clients: { dispatchClient, captureClient },
      now: () => "2026-06-10T00:00:00.000Z",
      onAllocations: (allocations) => {
        live = allocations;
      },
    });
    expect(live.map((t) => t.missionId).sort()).toEqual(["aoi", "rin"]);
    expect(new Set(live.map((t) => t.session.paneId)).size).toBe(2);
  });
});

describe("broadcastToMissions", () => {
  it("dispatches the gated instruction to every live pane", async () => {
    const dispatchedByPane = new Map<string, string[]>();
    const dispatchClient = vi.fn(async ({ request }: any) => {
      const list = dispatchedByPane.get(request.paneId) ?? [];
      list.push(request.commandPreview);
      dispatchedByPane.set(request.paneId, list);
      return dispatchResponse();
    });

    const targets: LiveMissionTarget[] = [
      { missionId: "aoi", session: { id: "s1", sessionId: "x", role: "qa", paneId: "%1" } as any },
      { missionId: "rin", session: { id: "s2", sessionId: "x", role: "qa", paneId: "%2" } as any },
    ];
    const results = await broadcastToMissions({
      targets,
      message: "中간 보고해줘",
      binding: { mode: "human", clients: { dispatchClient }, runId: "r1" },
    });

    expect(results.every((r) => r.ok)).toBe(true);
    expect(dispatchedByPane.get("%1")![0]).toBe("[브로드캐스트] 中간 보고해줘");
    expect(dispatchedByPane.get("%2")![0]).toBe("[브로드캐스트] 中간 보고해줘");
  });

  it("reports per-target failures without failing the others", async () => {
    const dispatchClient = vi.fn(async ({ request }: any) => {
      if (request.paneId === "%2") throw new Error("pane gone");
      return dispatchResponse();
    });
    const targets: LiveMissionTarget[] = [
      { missionId: "aoi", session: { id: "s1", sessionId: "x", role: "qa", paneId: "%1" } as any },
      { missionId: "rin", session: { id: "s2", sessionId: "x", role: "qa", paneId: "%2" } as any },
    ];
    const results = await broadcastToMissions({
      targets,
      message: "hi",
      binding: { mode: "human", clients: { dispatchClient } },
    });
    expect(results.find((r) => r.missionId === "aoi")).toMatchObject({ ok: true });
    expect(results.find((r) => r.missionId === "rin")).toMatchObject({ ok: false, error: "pane gone" });
  });
});

describe("createCheckInTargets", () => {
  it("binds gated capture + nudge so the sweep nudges only stalled panes", async () => {
    const dispatched: Array<{ paneId: string; command: string }> = [];
    const dispatchClient = vi.fn(async ({ request }: any) => {
      dispatched.push({ paneId: request.paneId, command: request.commandPreview });
      return dispatchResponse();
    });
    const outputs: Record<string, string[]> = { "%1": ["same", "same"], "%2": ["a", "b"] };
    const calls: Record<string, number> = { "%1": 0, "%2": 0 };
    const captureClient = vi.fn(async ({ request }: any) => {
      const seq = outputs[request.paneId]!;
      const index = Math.min(calls[request.paneId]!++, seq.length - 1);
      return { status: "captured", reason: "ok", payload: { outputPreview: seq[index], lineCount: 1 } } as any;
    });

    const targets = createCheckInTargets({
      targets: [
        { missionId: "quiet", session: { id: "s1", sessionId: "x", role: "qa", paneId: "%1" } as any },
        { missionId: "busy", session: { id: "s2", sessionId: "x", role: "qa", paneId: "%2" } as any },
      ],
      binding: { mode: "human", clients: { dispatchClient, captureClient }, runId: "r1" },
    });

    let state = createCheckInState();
    ({ state } = await runCheckInSweep({ targets, state })); // baseline
    const { rows } = await runCheckInSweep({ targets, state });

    expect(rows.find((r) => r.missionId === "quiet")).toMatchObject({ status: "stalled", nudged: true });
    expect(rows.find((r) => r.missionId === "busy")).toMatchObject({ status: "active", nudged: false });
    // the nudge went to the stalled pane only, through the gate
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]!.paneId).toBe("%1");
    expect(dispatched[0]!.command).toContain("정기 체크인");
  });
});
