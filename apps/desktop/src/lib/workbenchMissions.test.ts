import { describe, expect, it } from "vitest";
import { createMission } from "./workbenchMissions";

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
