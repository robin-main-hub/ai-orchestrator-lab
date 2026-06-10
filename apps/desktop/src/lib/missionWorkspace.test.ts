import { describe, expect, it } from "vitest";
import { buildWorkspacePlan, sanitizeWorkspaceKey, workspaceSafePrefixes } from "./missionWorkspace";

describe("sanitizeWorkspaceKey", () => {
  it("keeps branch-safe characters and collapses the rest", () => {
    expect(sanitizeWorkspaceKey("par_123_m1")).toBe("par_123_m1");
    expect(sanitizeWorkspaceKey("미션 #1/!!")).toBe("1");
    expect(sanitizeWorkspaceKey("///")).toBe("mission");
  });
});

describe("buildWorkspacePlan", () => {
  it("builds worktree add on a fresh branch under the worktrees root", () => {
    const plan = buildWorkspacePlan("par_1_m1", { repoPath: "/srv/repo/" });
    expect(plan.branchName).toBe("agent/par_1_m1");
    expect(plan.worktreePath).toBe("/srv/repo/.agent-worktrees/par_1_m1");
    expect(plan.setupCommands).toEqual([
      'git -C "/srv/repo" worktree add -b "agent/par_1_m1" "/srv/repo/.agent-worktrees/par_1_m1" "main"',
    ]);
    // default: keep the worktree + branch for review/PR
    expect(plan.teardownCommands).toEqual([]);
    expect(plan.kickoffPreamble).toContain('cd "/srv/repo/.agent-worktrees/par_1_m1"');
    expect(plan.kickoffPreamble).toContain("agent/par_1_m1");
  });

  it("honors base branch, root, prefix, and cleanup", () => {
    const plan = buildWorkspacePlan("m2", {
      repoPath: "/srv/repo",
      baseBranch: "develop",
      worktreesRoot: "/tmp/wt",
      branchPrefix: "swarm/",
      cleanup: true,
    });
    expect(plan.branchName).toBe("swarm/m2");
    expect(plan.setupCommands[0]).toContain('"/tmp/wt/m2" "develop"');
    expect(plan.teardownCommands).toEqual([
      'git -C "/srv/repo" worktree remove --force "/tmp/wt/m2"',
      'git -C "/srv/repo" branch -D "swarm/m2"',
    ]);
  });
});

describe("workspaceSafePrefixes", () => {
  it("safe-lists only repo-scoped worktree add, never removal", () => {
    const prefixes = workspaceSafePrefixes({ repoPath: "/srv/repo" });
    expect(prefixes).toEqual(['git -C "/srv/repo" worktree add']);
    const plan = buildWorkspacePlan("m1", { repoPath: "/srv/repo", cleanup: true });
    expect(plan.setupCommands[0]!.startsWith(prefixes[0]!)).toBe(true);
    for (const teardown of plan.teardownCommands) {
      expect(prefixes.some((p) => teardown.startsWith(p))).toBe(false);
    }
  });
});
