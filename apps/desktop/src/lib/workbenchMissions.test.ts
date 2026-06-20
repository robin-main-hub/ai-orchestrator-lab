import { beforeEach, describe, expect, it } from "vitest";
import {
  createMission,
  loadMissions,
  MISSIONS_STORAGE_KEY,
  workbenchMissionStore,
} from "./workbenchMissions";

// Characterization tests for createMission's deterministic projection in
// workbenchMissions.ts (no behavior change). createMission folds a thin
// fork/board input into a fully-shaped WorkbenchMission: role defaults to
// Implementer, the agent slug is derived from the role (QA/Verifier carve-out),
// the worktree branch/path embed a slugified task, allowed/denied paths and
// gates carry safe defaults, and origin/originEvent pass through. The id,
// tmux session, heartbeat and event timestamps are Date.now()/ISO-derived, so
// those are asserted structurally (pattern/prefix), not pinned. No store,
// no localStorage, no network.
describe("createMission", () => {
  it("fills role/title/model/status defaults when the input is sparse", () => {
    const m = createMission({});
    expect(m.role).toBe("Implementer");
    expect(m.title).toBe("Implementer 병렬 작업");
    expect(m.model).toBe("route: task complexity policy");
    expect(m.status).toBe("blocked");
    expect(m.worktree.baseBranch).toBe("main");
    expect(m.allowedPaths).toEqual(["apps/desktop/src/**", "docs/**"]);
    expect(m.deniedPaths).toEqual([".env", "**/secrets/**", "node_modules/**"]);
    expect(m.gates).toEqual([
      "human approval before send-keys",
      "diff review before merge",
      "sequential merge queue only",
    ]);
    expect(m.artifacts).toEqual([]);
  });

  it("derives the agent slug from the role, carving out QA/Verifier", () => {
    expect(createMission({ role: "QA/Verifier" }).agent).toBe("qa-verifier");
    expect(createMission({ role: "Backend Builder" }).agent).toBe("backend-builder");
  });

  it("uses the task as the title and slugifies it into the worktree branch/path", () => {
    const m = createMission({ task: "Fix the Login Bug!!" });
    expect(m.title).toBe("Fix the Login Bug!!");
    expect(m.worktree.path).toBe("../ai-orchestrator-lab__worktrees/fix-the-login-bug");
    expect(m.worktree.branch).toMatch(/^agent\/fix-the-login-bug-[a-z0-9]{4}$/);
  });

  it("keeps Korean word chars and falls back to agent-task on an empty slug", () => {
    expect(createMission({ task: "로그인 화면" }).worktree.path).toBe(
      "../ai-orchestrator-lab__worktrees/로그인-화면",
    );
    expect(createMission({ task: "!!!" }).worktree.path).toBe(
      "../ai-orchestrator-lab__worktrees/agent-task",
    );
  });

  it("passes through overrides for model, baseBranch, allowedPaths, and origin", () => {
    const m = createMission({
      model: "claude-opus-4-6",
      baseBranch: "develop",
      allowedPaths: ["src/**"],
      origin: "conversation fork",
      originEvent: "Forked from chat #12",
    });
    expect(m.model).toBe("claude-opus-4-6");
    expect(m.worktree.baseBranch).toBe("develop");
    expect(m.allowedPaths).toEqual(["src/**"]);
    expect(m.origin).toBe("conversation fork");
    expect(m.events[0]!.text).toBe("Forked from chat #12");
  });

  it("uses default origin event text and structural id-derived fields", () => {
    const m = createMission({});
    expect(m.origin).toBeUndefined();
    expect(m.events).toHaveLength(1);
    expect(m.events[0]!.text).toBe("Mission created from /fork fallback UI.");
    expect(m.id).toMatch(/^ms_[a-z0-9]+$/);
    expect(m.tmux).toEqual({ session: `orch-${m.id}`, window: "worker", pane: "0" });
    expect(m.diffPath).toBe(`artifacts/${m.id}/changes.diff`);
    expect(m.testOutputPath).toBe(`artifacts/${m.id}/verify.log`);
  });
});

// Characterization tests (no behavior change) for the previously-untested module
// singleton store (workbenchMissionStore / loadMissions / MISSIONS_STORAGE_KEY).
// The block above only drives the pure createMission projection. The store is the
// shared source of truth that lets the Mission Board tab and the "fork conversation
// to worker" tab see the same list via useSyncExternalStore. Load-bearing contract:
//   - loadMissions() is a thin compat alias that returns the live snapshot;
//   - add() prepends newest-first and REPLACES the array reference (so
//     useSyncExternalStore sees identity change), notifying every subscriber;
//   - setMissions(updater) receives the current snapshot and swaps in its result,
//     also notifying;
//   - subscribe returns an unsubscribe that stops further notifications.
// This vitest runtime has no `window`, so emit()'s localStorage persistence is a
// no-op here (loadInitial started the store empty) — we exercise the in-memory
// store + listener fan-out only, never real storage. We reset to a known baseline
// before each case because the store is a process-wide singleton.
describe("workbenchMissionStore / loadMissions", () => {
  beforeEach(() => {
    workbenchMissionStore.setMissions(() => []);
  });

  it("MISSIONS_STORAGE_KEY is the documented v1 key", () => {
    expect(MISSIONS_STORAGE_KEY).toBe("orch.codingWorkbench.missions.v1");
  });

  it("loadMissions() returns the same snapshot reference the store exposes", () => {
    expect(loadMissions()).toBe(workbenchMissionStore.getSnapshot());
  });

  it("add() prepends newest-first and replaces the array reference", () => {
    const before = workbenchMissionStore.getSnapshot();
    const first = createMission({ task: "first" });
    workbenchMissionStore.add(first);
    const afterFirst = workbenchMissionStore.getSnapshot();
    expect(afterFirst).not.toBe(before); // new identity → useSyncExternalStore re-renders
    expect(afterFirst.map((m) => m.title)).toEqual(["first"]);

    const second = createMission({ task: "second" });
    workbenchMissionStore.add(second);
    // newest at index 0
    expect(workbenchMissionStore.getSnapshot().map((m) => m.title)).toEqual(["second", "first"]);
  });

  it("setMissions(updater) receives the current snapshot and swaps in its result", () => {
    workbenchMissionStore.add(createMission({ task: "keep" }));
    workbenchMissionStore.add(createMission({ task: "drop" }));
    workbenchMissionStore.setMissions((current) => current.filter((m) => m.title === "keep"));
    expect(workbenchMissionStore.getSnapshot().map((m) => m.title)).toEqual(["keep"]);
  });

  it("notifies every subscriber on mutation and stops after unsubscribe", () => {
    let a = 0;
    let b = 0;
    const unsubA = workbenchMissionStore.subscribe(() => {
      a += 1;
    });
    workbenchMissionStore.subscribe(() => {
      b += 1;
    });

    workbenchMissionStore.add(createMission({ task: "notify" }));
    expect([a, b]).toEqual([1, 1]);

    unsubA();
    workbenchMissionStore.setMissions((current) => current);
    expect([a, b]).toEqual([1, 2]); // a unsubscribed, b still notified
  });
});
