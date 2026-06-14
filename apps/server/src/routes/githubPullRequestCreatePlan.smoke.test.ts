import { describe, expect, it, vi } from "vitest";
import type { IncomingMessage } from "node:http";
import type { GithubReadonlyClient } from "../integrations/githubReadonlyClient";
import { GithubReadonlyError, githubConnectorStatus } from "../integrations/githubReadonlyClient";
import { handleGithubRoute } from "./github";
import { createGithubPullRequestCreatePlanStore } from "../integrations/githubPullRequestCreatePlanStore";

/**
 * W4a smoke — PR create plan end-to-end 1개 통합 시나리오.
 *
 *  1) plan(valid) → planned + compare summary + filesPreview, mutation 호출 0
 *  2) negative 한 묶음(token/repo/base/head/base=head/no-op/secret) 각각 distinct outcome
 *  3) 모든 응답에 token fragment 없음
 *
 * 세부 적대적 분기는 githubPullRequestCreatePlan.test.ts에 있음 — smoke는 짧게.
 */

const ALLOW = ["robin/lab"];
const BASE_ALLOW = ["main", "develop"];
const REPO = "robin/lab";
const TOKEN = "ghp_FAKE_w4a_smoke_TOKEN_DO_NOT_LEAK";
const NOW_REF = "2026-06-14T12:00:00.000Z";
const NOW = () => NOW_REF;
const stubRequest = {} as IncomingMessage;

function clientStub(over: Partial<GithubReadonlyClient> & { token?: string } = {}): GithubReadonlyClient {
  const token = over.token;
  return {
    status: () => githubConnectorStatus(token),
    getRepoOverview:
      over.getRepoOverview ??
      (async () => ({ fullName: REPO, description: null, defaultBranch: "main", openIssues: 0, stars: 0, private: false, htmlUrl: "" })),
    listPullRequests: over.listPullRequests ?? (async () => []),
    getPullRequest:
      over.getPullRequest ??
      (async () => ({
        number: 1, title: "t", state: "open", author: "robin", draft: false, htmlUrl: "u", createdAt: "c", updatedAt: "u",
        body: "", baseRef: "main", headRef: "feat", merged: false, additions: 1, deletions: 1, changedFiles: 1, commits: 1,
      })),
    getFileContent: over.getFileContent ?? (async () => { throw new GithubReadonlyError("not found", 404); }),
    listIssues: over.listIssues ?? (async () => []),
    postIssueComment: over.postIssueComment ?? (async () => ({ id: 1, htmlUrl: "u" })),
    getRefSha: over.getRefSha ?? (async () => "branch-sha-stub"),
    createBranchRef:
      over.createBranchRef ?? (async (_o, _r, ref, sha) => ({ ref, sha, htmlUrl: "u" })),
    putFileContents:
      over.putFileContents ?? (async () => ({ commitSha: "stub-commit", blobSha: "stub-blob", htmlUrl: "u" })),
    compareBranches:
      over.compareBranches ??
      (async () => ({
        aheadBy: 3, behindBy: 0, totalCommits: 3, changedFiles: 2,
        files: [
          { filename: "src/foo.ts", status: "modified", additions: 5, deletions: 1 },
          { filename: "src/bar.ts", status: "added", additions: 12, deletions: 0 },
        ],
      })),
    createPullRequest:
      over.createPullRequest ??
      (async () => ({ pullNumber: 1, htmlUrl: "u", headSha: "stub-head" })),
  };
}

function capture() {
  const calls: Array<{ status: number; payload: any }> = [];
  return { calls, respondJson: (status: number, payload: unknown) => calls.push({ status, payload }) };
}

describe("W4a smoke — PR create plan end-to-end (mock GitHub)", () => {
  it("✓ 정상 + 부정 분기 한 묶음, mutation 0, token leak 없음", async () => {
    const createBranchRef = vi.fn();
    const postIssueComment = vi.fn();
    const putFileContents = vi.fn();
    const prPlanStore = createGithubPullRequestCreatePlanStore();

    const baseDeps = (clientOver: Partial<GithubReadonlyClient> & { token?: string } = { token: TOKEN }) => ({
      createClient: () => clientStub({ ...clientOver, createBranchRef, postIssueComment, putFileContents }),
      now: NOW, request: stubRequest, prPlanStore,
      writeRepoAllowlist: ALLOW, prBaseAllowlist: BASE_ALLOW, verifyApproval: async () => true,
    });

    // 1) 정상
    const okCap = capture();
    await handleGithubRoute({
      pathname: "/integrations/github/write/pr/plan", method: "POST",
      respondJson: okCap.respondJson,
      readJsonBody: async () => ({
        repoFullName: REPO,
        baseBranch: "main",
        headBranch: "agent/feature-x",
        title: "Add PR create plan surface",
        body: "approval evidence shape verified.",
      }),
      ...baseDeps(),
    });
    const plan = okCap.calls[0]!.payload.plan;
    expect(okCap.calls[0]!.payload.outcome).toBe("planned");
    expect(plan.baseBranch).toBe("main");
    expect(plan.headBranch).toBe("agent/feature-x");
    expect(plan.compare.aheadBy).toBe(3);
    expect(plan.compare.changedFiles).toBe(2);
    expect(plan.compare.filesPreview.length).toBe(2);
    expect(plan.compare.truncated).toBe(false);
    expect(plan.status).toBe("approval_required");
    expect(plan.truthStatus).toBe("planned");
    expect(JSON.stringify(okCap.calls[0]!.payload)).not.toContain(TOKEN);

    // 2) negative 묶음 — 각 distinct outcome.
    // token 없음 → not_configured
    {
      const cap = capture();
      await handleGithubRoute({
        pathname: "/integrations/github/write/pr/plan", method: "POST",
        respondJson: cap.respondJson,
        readJsonBody: async () => ({ repoFullName: REPO, baseBranch: "main", headBranch: "agent/x", title: "T", body: "B" }),
        ...baseDeps({ token: undefined }),
      });
      expect(cap.calls[0]!.payload.outcome).toBe("not_configured");
    }
    // repo not allowed
    {
      const cap = capture();
      await handleGithubRoute({
        pathname: "/integrations/github/write/pr/plan", method: "POST",
        respondJson: cap.respondJson,
        readJsonBody: async () => ({ repoFullName: "evil/repo", baseBranch: "main", headBranch: "agent/x", title: "T", body: "B" }),
        ...baseDeps(),
      });
      expect(cap.calls[0]!.payload.outcome).toBe("blocked");
    }
    // invalid base
    {
      const cap = capture();
      await handleGithubRoute({
        pathname: "/integrations/github/write/pr/plan", method: "POST",
        respondJson: cap.respondJson,
        readJsonBody: async () => ({ repoFullName: REPO, baseBranch: "trunk", headBranch: "agent/x", title: "T", body: "B" }),
        ...baseDeps(),
      });
      expect(cap.calls[0]!.payload.outcome).toBe("blocked");
    }
    // invalid head
    {
      const cap = capture();
      await handleGithubRoute({
        pathname: "/integrations/github/write/pr/plan", method: "POST",
        respondJson: cap.respondJson,
        readJsonBody: async () => ({ repoFullName: REPO, baseBranch: "main", headBranch: "release/x", title: "T", body: "B" }),
        ...baseDeps(),
      });
      expect(cap.calls[0]!.payload.outcome).toBe("blocked");
    }
    // no-op (aheadBy=0)
    {
      const cap = capture();
      const compareBranches = vi.fn(async () => ({
        aheadBy: 0, behindBy: 0, totalCommits: 0, changedFiles: 0, files: [],
      }));
      await handleGithubRoute({
        pathname: "/integrations/github/write/pr/plan", method: "POST",
        respondJson: cap.respondJson,
        readJsonBody: async () => ({ repoFullName: REPO, baseBranch: "main", headBranch: "agent/x", title: "T", body: "B" }),
        ...baseDeps({ token: TOKEN, compareBranches }),
      });
      expect(cap.calls[0]!.payload.outcome).toBe("blocked");
      expect(cap.calls[0]!.payload.message).toContain("no-op");
    }
    // title secret
    {
      const cap = capture();
      await handleGithubRoute({
        pathname: "/integrations/github/write/pr/plan", method: "POST",
        respondJson: cap.respondJson,
        readJsonBody: async () => ({
          repoFullName: REPO, baseBranch: "main", headBranch: "agent/x",
          title: "Add ghp_abcdefghij1234567890abcd",
          body: "B",
        }),
        ...baseDeps(),
      });
      expect(cap.calls[0]!.payload.outcome).toBe("blocked");
    }

    // 3) mutation 호출 0(모든 negative에서)
    expect(createBranchRef).not.toHaveBeenCalled();
    expect(postIssueComment).not.toHaveBeenCalled();
    expect(putFileContents).not.toHaveBeenCalled();
  });
});
