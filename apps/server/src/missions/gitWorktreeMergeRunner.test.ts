import { describe, expect, it, vi } from "vitest";
import type { SequentialMergeQueueItem } from "@ai-orchestrator/protocol";
import {
  executeMerge,
  isAllowedRepoRoot,
  parseAllowedRepoRoots,
  validateMergeRefs,
  type MergeExecOutcome,
} from "./gitWorktreeMergeRunner";

const now = () => "2026-06-13T00:00:00.000Z";

function item(overrides: Partial<SequentialMergeQueueItem> = {}): SequentialMergeQueueItem {
  return {
    id: "merge_1",
    missionId: "mission_1",
    branchName: "agent/mission_1",
    sourceBranch: "agent/mission_1",
    targetBranch: "main",
    repoRoot: "/repo/allowed",
    status: "queued",
    requiredVerificationReportId: "verify_1",
    conflictFiles: [],
    reason: "verified",
    queuedAt: "2026-06-13T00:00:00.000Z",
    ...overrides,
  };
}

/** scripted git: args.join(" ") → outcome */
function scriptedGit(script: Record<string, Partial<MergeExecOutcome>>) {
  return vi.fn(async (_repoRoot: string, args: string[]) => {
    const key = args.join(" ");
    const match = Object.keys(script).find((k) => key.startsWith(k));
    return { exitCode: 0, stdout: "", stderr: "", ...(match ? script[match] : {}) } as MergeExecOutcome;
  });
}

const OK_TARGETS = ["main", "develop"];

describe("parseAllowedRepoRoots / isAllowedRepoRoot", () => {
  it("parses a comma list and matches exactly", () => {
    const roots = parseAllowedRepoRoots(" /a/b , /c/d ,");
    expect(roots).toEqual(["/a/b", "/c/d"]);
    expect(isAllowedRepoRoot("/a/b", roots)).toBe(true);
    expect(isAllowedRepoRoot("/a", roots)).toBe(false);
    expect(isAllowedRepoRoot(undefined, roots)).toBe(false);
  });
});

describe("validateMergeRefs", () => {
  it("requires agent/mission source and an allowlisted target, rejects main as source and metachars", () => {
    expect(validateMergeRefs({ sourceBranch: "agent/x", targetBranch: "main", allowedTargetBranches: OK_TARGETS }).ok).toBe(true);
    expect(validateMergeRefs({ sourceBranch: "main", targetBranch: "main", allowedTargetBranches: OK_TARGETS }).ok).toBe(false);
    expect(validateMergeRefs({ sourceBranch: "feature/x", targetBranch: "main", allowedTargetBranches: OK_TARGETS }).ok).toBe(false);
    expect(validateMergeRefs({ sourceBranch: "agent/x", targetBranch: "production", allowedTargetBranches: OK_TARGETS }).ok).toBe(false);
    expect(validateMergeRefs({ sourceBranch: "agent/x; rm -rf /", targetBranch: "main", allowedTargetBranches: OK_TARGETS }).ok).toBe(false);
  });
});

describe("executeMerge", () => {
  const allowed = ["/repo/allowed"];

  it("falls back to dry_run (NOT a fake sha) when repoRoot is not allowlisted", async () => {
    const git = vi.fn();
    const result = await executeMerge({
      item: item({ repoRoot: "/repo/other" }),
      missionTitle: "t",
      allowedRepoRoots: allowed,
      allowedTargetBranches: OK_TARGETS,
      git: git as never,
      now,
    });
    expect(result.status).toBe("dry_run");
    expect(result.mergeCommitSha).toBeUndefined(); // 합성 sha 없음
    expect(result.observed).toBe(false);
    expect(git).not.toHaveBeenCalled();
  });

  it("merges and returns the REAL sha from git rev-parse HEAD", async () => {
    const git = scriptedGit({
      "status --porcelain": { stdout: "" },
      "rev-parse --verify": { exitCode: 0 },
      checkout: { exitCode: 0 },
      "merge --no-ff": { exitCode: 0 },
      "rev-parse HEAD": { stdout: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2\n" },
    });
    const result = await executeMerge({ item: item(), missionTitle: "t", allowedRepoRoots: allowed, allowedTargetBranches: OK_TARGETS, git, now });
    expect(result.status).toBe("merged");
    expect(result.mergeCommitSha).toBe("a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2");
    expect(result.observed).toBe(true);
  });

  it("blocks a dirty worktree", async () => {
    const git = scriptedGit({ "status --porcelain": { stdout: " M src/x.ts" } });
    const result = await executeMerge({ item: item(), missionTitle: "t", allowedRepoRoots: allowed, allowedTargetBranches: OK_TARGETS, git, now });
    expect(result.status).toBe("blocked");
    expect(result.reason).toContain("dirty");
  });

  it("records conflict and aborts the merge (mission not closed)", async () => {
    const calls: string[] = [];
    const git = vi.fn(async (_r: string, args: string[]) => {
      calls.push(args.join(" "));
      const key = args.join(" ");
      if (key.startsWith("status")) return { exitCode: 0, stdout: "", stderr: "" };
      if (key.startsWith("rev-parse --verify")) return { exitCode: 0, stdout: "", stderr: "" };
      if (key.startsWith("checkout")) return { exitCode: 0, stdout: "", stderr: "" };
      if (key.startsWith("merge --no-ff")) return { exitCode: 1, stdout: "CONFLICT", stderr: "Automatic merge failed" };
      if (key.startsWith("diff --name-only")) return { exitCode: 0, stdout: "src/a.ts\nsrc/b.ts\n", stderr: "" };
      return { exitCode: 0, stdout: "", stderr: "" };
    });
    const result = await executeMerge({ item: item(), missionTitle: "t", allowedRepoRoots: allowed, allowedTargetBranches: OK_TARGETS, git, now });
    expect(result.status).toBe("conflict");
    expect(result.conflictFiles).toEqual(["src/a.ts", "src/b.ts"]);
    expect(result.mergeCommitSha).toBeUndefined();
    expect(calls).toContain("merge --abort"); // 충돌 시 abort 실행
  });

  it("blocks when source ref does not exist", async () => {
    const git = vi.fn(async (_r: string, args: string[]) => {
      const key = args.join(" ");
      if (key.startsWith("status")) return { exitCode: 0, stdout: "", stderr: "" };
      if (key === "rev-parse --verify agent/mission_1") return { exitCode: 128, stdout: "", stderr: "unknown revision" };
      return { exitCode: 0, stdout: "", stderr: "" };
    });
    const result = await executeMerge({ item: item(), missionTitle: "t", allowedRepoRoots: allowed, allowedTargetBranches: OK_TARGETS, git, now });
    expect(result.status).toBe("blocked");
    expect(result.reason).toContain("agent/mission_1");
  });
});
