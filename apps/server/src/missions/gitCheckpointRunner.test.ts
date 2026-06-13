import { describe, expect, it, vi } from "vitest";
import type { MergeExecOutcome } from "./gitWorktreeMergeRunner.js";
import { createMissionCheckpoint, executeMissionRollback } from "./gitCheckpointRunner.js";

const ALLOWED = ["/repo"];
const now = () => "2026-06-13T00:00:00.000Z";

function scriptedGit(map: Record<string, MergeExecOutcome>) {
  return vi.fn(async (_repo: string, args: string[]) => {
    const key = args.join(" ");
    return map[key] ?? { exitCode: 0, stdout: "", stderr: "" };
  });
}

describe("createMissionCheckpoint", () => {
  it("captures the real HEAD sha as observed", async () => {
    const git = scriptedGit({ "rev-parse HEAD": { exitCode: 0, stdout: "abc1234def\n", stderr: "" } });
    const result = await createMissionCheckpoint({
      id: "cp1", missionId: "m1", repoRoot: "/repo", gitRef: "HEAD", reason: "before_merge",
      allowedRepoRoots: ALLOWED, git, now,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.checkpoint.headSha).toBe("abc1234def");
      expect(result.checkpoint.truthStatus).toBe("observed");
    }
  });

  it("blocks a repoRoot outside the allowlist (no git call)", async () => {
    const git = scriptedGit({});
    const result = await createMissionCheckpoint({
      id: "cp", missionId: "m", repoRoot: "/evil", gitRef: "HEAD", reason: "manual",
      allowedRepoRoots: ALLOWED, git, now,
    });
    expect(result.ok).toBe(false);
    expect(git).not.toHaveBeenCalled();
  });
});

describe("executeMissionRollback", () => {
  const base = { missionId: "m1", repoRoot: "/repo", targetSha: "abc1234def", approvalId: "appr_1", allowedRepoRoots: ALLOWED, now };

  it("requires a granted approvalId — refuses auto rollback", async () => {
    const out = await executeMissionRollback({ ...base, approvalId: "", git: scriptedGit({}) });
    expect(out.status).toBe("blocked");
    expect(out.reason).toContain("approvalId");
  });

  it("blocks a dirty worktree (no reset)", async () => {
    const git = scriptedGit({ "status --porcelain": { exitCode: 0, stdout: " M src/foo.ts\n", stderr: "" } });
    const out = await executeMissionRollback({ ...base, git });
    expect(out.status).toBe("blocked");
    expect(out.reason).toContain("dirty");
    expect(git).not.toHaveBeenCalledWith("/repo", ["reset", "--hard", "abc1234def"]);
  });

  it("resets to the target and records the observed restored sha", async () => {
    const git = scriptedGit({
      "status --porcelain": { exitCode: 0, stdout: "", stderr: "" },
      "rev-parse --verify abc1234def^{commit}": { exitCode: 0, stdout: "abc1234def\n", stderr: "" },
      "reset --hard abc1234def": { exitCode: 0, stdout: "", stderr: "" },
      "rev-parse HEAD": { exitCode: 0, stdout: "abc1234def\n", stderr: "" },
    });
    const out = await executeMissionRollback({ ...base, git });
    expect(out.status).toBe("completed");
    expect(out.restoredSha).toBe("abc1234def");
    expect(out.observed).toBe(true);
  });

  it("blocks an unknown target sha", async () => {
    const git = scriptedGit({
      "status --porcelain": { exitCode: 0, stdout: "", stderr: "" },
      "rev-parse --verify abc1234def^{commit}": { exitCode: 128, stdout: "", stderr: "bad object" },
    });
    const out = await executeMissionRollback({ ...base, git });
    expect(out.status).toBe("blocked");
    expect(out.reason).toContain("찾을 수 없");
  });
});
