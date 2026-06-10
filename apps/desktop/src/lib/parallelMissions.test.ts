import type { LoadedPersona } from "@ai-orchestrator/agents";
import type { CodingPacket } from "@ai-orchestrator/protocol";
import { describe, expect, it } from "vitest";
import type { LoopStatus } from "./closedLoopController";
import { createSummonRegistry, type SummonContext } from "./personaSummon";
import {
  allocateMissions,
  runParallelMissions,
  type Mission,
  type MissionAllocation,
  type MissionUpdate,
} from "./parallelMissions";

const ctx: SummonContext = {
  now: "2026-06-10T00:00:00.000Z",
  makeSessionId: (persona, paneId) => `as_${persona}_${paneId}`,
};

const persona = (name: string): LoadedPersona => ({
  personaName: name,
  mode: "off",
  fragments: [],
  safetyContent: null,
});

const packet = (steps: string[]): CodingPacket => ({
  goal: "g",
  context: [],
  decisions: [],
  rejectedOptions: [],
  constraints: [],
  filesToInspect: [],
  implementationPlan: [],
  verificationPlan: steps,
  reviewerNotes: [],
});

const mission = (id: string, role: Mission["summon"]["preferredRole"]): Mission => ({
  id,
  summon: { personaName: id, sessionId: "s1", preferredRole: role },
  persona: persona(id),
  packet: packet(["run"]),
});

const roster = (count: number) =>
  createSummonRegistry(Array.from({ length: count }, (_, i) => ({ paneId: `%${i}`, role: "code" as const })));

describe("allocateMissions", () => {
  it("gives each mission a distinct pane and rejects overflow", () => {
    const { allocations, rejected } = allocateMissions(
      roster(2),
      [mission("a", "code"), mission("b", "code"), mission("c", "code")],
      ctx,
    );
    expect(allocations).toHaveLength(2);
    const paneIds = allocations.map((a) => a.session.paneId);
    expect(new Set(paneIds).size).toBe(2); // distinct panes — no collision
    expect(rejected).toEqual([{ mission: expect.objectContaining({ id: "c" }), reason: "no_free_pane" }]);
  });
});

describe("runParallelMissions", () => {
  it("runs allocated missions concurrently and folds registry transitions", async () => {
    const seen: string[] = [];
    let active = 0;
    let maxActive = 0;
    const runMission = async (alloc: MissionAllocation): Promise<LoopStatus> => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 5));
      active -= 1;
      seen.push(alloc.mission.id);
      return alloc.mission.id === "b" ? "failed" : "completed";
    };
    const { registry, results } = await runParallelMissions({
      registry: roster(3),
      missions: [mission("a", "code"), mission("b", "code"), mission("c", "code")],
      ctx,
      runMission,
    });
    expect(maxActive).toBeGreaterThan(1); // genuinely concurrent
    expect(seen.sort()).toEqual(["a", "b", "c"]);
    // completed/failed both free the pane -> all panes free again
    expect(registry.panes.every((p) => p.status === "free")).toBe(true);
    expect(results.find((r) => r.missionId === "b")).toMatchObject({ ok: true, loopStatus: "failed" });
  });

  it("respects maxConcurrency", async () => {
    let active = 0;
    let maxActive = 0;
    const runMission = async (): Promise<LoopStatus> => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 5));
      active -= 1;
      return "completed";
    };
    await runParallelMissions({
      registry: roster(4),
      missions: ["a", "b", "c", "d"].map((id) => mission(id, "code")),
      ctx,
      runMission,
      maxConcurrency: 2,
    });
    expect(maxActive).toBeLessThanOrEqual(2);
  });

  it("emits running+done updates and keeps awaiting_human panes busy", async () => {
    const updates: MissionUpdate[] = [];
    const { registry, results } = await runParallelMissions({
      registry: roster(1),
      missions: [mission("a", "code"), mission("b", "code")], // only 1 pane
      ctx,
      runMission: async () => "awaiting_human",
      onUpdate: (u) => updates.push(u),
    });
    expect(updates.filter((u) => u.phase === "running")).toHaveLength(1); // only the allocated one ran
    expect(updates.some((u) => u.phase === "done" && u.loopStatus === "awaiting_human")).toBe(true);
    expect(registry.panes[0]!.status).toBe("busy"); // awaiting_human retains the pane
    expect(results.find((r) => r.missionId === "b")).toEqual({ missionId: "b", ok: false, reason: "no_free_pane" });
  });
});
