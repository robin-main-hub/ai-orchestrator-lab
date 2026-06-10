import type { LoadedPersona } from "@ai-orchestrator/agents";
import type { CodingPacket } from "@ai-orchestrator/protocol";
import { describe, expect, it, vi } from "vitest";
import { buildWorkspacePlan } from "./missionWorkspace";
import { runParallelAutonomy, type ParallelMissionSpec } from "./parallelAutonomy";
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
});
