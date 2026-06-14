import { describe, expect, it, vi } from "vitest";
import type { IncomingMessage } from "node:http";
import type { GithubReadonlyClient } from "../integrations/githubReadonlyClient";
import { GithubReadonlyError, githubConnectorStatus } from "../integrations/githubReadonlyClient";
import { handleGithubRoute } from "./github";
import { createGithubFileChangePlanStore } from "../integrations/githubFileChangePlanStore";

/**
 * W3a smoke — file change plan end-to-end 1개 통합 시나리오.
 *
 *  1) update path: existing file 변경 → planned + operation=update + diff preview 보임
 *  2) create path: missing file 신규 → planned + operation=create + 모두 added
 *  3) GitHub mutation(createBranchRef/postIssueComment) 호출 0
 *  4) 모든 응답 payload에 token fragment 없음
 *  5) negative 한 묶음: token 없음 / repo 차단 / .env / NUL / secret / no-op / wrong base sha → 모두 distinct outcome
 */

const ALLOW = ["robin/lab"];
const REPO = "robin/lab";
const TOKEN = "ghp_FAKE_w3a_smoke_TOKEN_DO_NOT_LEAK";
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
      over.createBranchRef ??
      (async (_o, _r, ref, sha) => ({ ref, sha, htmlUrl: "u" })),
    putFileContents:
      over.putFileContents ??
      (async () => ({ commitSha: "stub-commit", blobSha: "stub-blob", htmlUrl: "u" })),
    compareBranches:
      over.compareBranches ??
      (async () => ({ aheadBy: 1, behindBy: 0, totalCommits: 1, changedFiles: 1, files: [{ filename: "x", status: "modified", additions: 1, deletions: 0 }] })),
  };
}

function capture() {
  const calls: Array<{ status: number; payload: any }> = [];
  return { calls, respondJson: (status: number, payload: unknown) => calls.push({ status, payload }) };
}

describe("W3a smoke — file change plan end-to-end", () => {
  it("✓ update path: existing file 변경 → planned + diff preview, mutation 호출 0", async () => {
    const createBranchRef = vi.fn();
    const postIssueComment = vi.fn();
    const getFileContent = vi.fn(async () => ({
      path: "src/util.ts", size: 12, sha: "BASE_SHA_42", htmlUrl: "u",
      content: "export const v = 1;\n", truncated: false, encoding: "utf8" as const,
    }));
    const fileChangePlanStore = createGithubFileChangePlanStore();
    const cap = capture();
    await handleGithubRoute({
      pathname: "/integrations/github/write/file/plan",
      method: "POST",
      createClient: () => clientStub({ token: TOKEN, getFileContent, createBranchRef, postIssueComment }),
      respondJson: cap.respondJson, now: NOW, request: stubRequest,
      readJsonBody: async () => ({
        repoFullName: REPO,
        branchName: "agent/refactor-x",
        path: "src/util.ts",
        newContent: "export const v = 2;\n",
        baseFileSha: "BASE_SHA_42",
      }),
      fileChangePlanStore, writeRepoAllowlist: ALLOW, verifyApproval: async () => true,
    });
    const payload = cap.calls[0]!.payload;
    expect(payload.outcome).toBe("planned");
    expect(payload.plan.operation).toBe("update");
    expect(payload.plan.baseFileSha).toBe("BASE_SHA_42");
    expect(payload.plan.branchRef).toBe("refs/heads/agent/refactor-x");
    expect(payload.plan.diffPreview).toContain("-export const v = 1;");
    expect(payload.plan.diffPreview).toContain("+export const v = 2;");
    expect(payload.plan.diffStat.additions).toBe(1);
    expect(payload.plan.diffStat.deletions).toBe(1);
    expect(payload.plan.truthStatus).toBe("planned");
    expect(payload.plan.status).toBe("approval_required");
    expect(createBranchRef).not.toHaveBeenCalled();
    expect(postIssueComment).not.toHaveBeenCalled();
    expect(JSON.stringify(payload)).not.toContain(TOKEN);
  });

  it("✓ create path: missing file 신규 → planned + 모두 added, mutation 호출 0", async () => {
    const createBranchRef = vi.fn();
    const postIssueComment = vi.fn();
    const getFileContent = vi.fn(async () => { throw new GithubReadonlyError("not found", 404); });
    const fileChangePlanStore = createGithubFileChangePlanStore();
    const cap = capture();
    await handleGithubRoute({
      pathname: "/integrations/github/write/file/plan",
      method: "POST",
      createClient: () => clientStub({ token: TOKEN, getFileContent, createBranchRef, postIssueComment }),
      respondJson: cap.respondJson, now: NOW, request: stubRequest,
      readJsonBody: async () => ({
        repoFullName: REPO,
        branchName: "agent/feature-y",
        path: "src/new.ts",
        newContent: "export const created = true;\n",
      }),
      fileChangePlanStore, writeRepoAllowlist: ALLOW, verifyApproval: async () => true,
    });
    const payload = cap.calls[0]!.payload;
    expect(payload.outcome).toBe("planned");
    expect(payload.plan.operation).toBe("create");
    expect(payload.plan.baseFileSha).toBeUndefined();
    expect(payload.plan.diffStat.deletions).toBe(0);
    expect(payload.plan.diffStat.additions).toBeGreaterThan(0);
    expect(createBranchRef).not.toHaveBeenCalled();
    expect(postIssueComment).not.toHaveBeenCalled();
    expect(JSON.stringify(payload)).not.toContain(TOKEN);
  });

  it("✗ negative 한 묶음 — token/repo/path/binary/secret/no-op/base-mismatch가 각각 distinct outcome", async () => {
    const createBranchRef = vi.fn();
    const postIssueComment = vi.fn();
    const baseDeps = (clientOver: Partial<GithubReadonlyClient> & { token?: string } = { token: TOKEN }) => ({
      createClient: () => clientStub({ ...clientOver, createBranchRef, postIssueComment }),
      now: NOW, request: stubRequest, fileChangePlanStore: createGithubFileChangePlanStore(),
      writeRepoAllowlist: ALLOW, verifyApproval: async () => true,
    });

    // token 없음 → not_configured
    {
      const cap = capture();
      await handleGithubRoute({
        pathname: "/integrations/github/write/file/plan", method: "POST",
        respondJson: cap.respondJson,
        readJsonBody: async () => ({ repoFullName: REPO, branchName: "agent/x", path: "src/x.ts", newContent: "hi" }),
        ...baseDeps({ token: undefined }),
      });
      expect(cap.calls[0]!.payload.outcome).toBe("not_configured");
    }
    // repo not allowed → blocked
    {
      const cap = capture();
      await handleGithubRoute({
        pathname: "/integrations/github/write/file/plan", method: "POST",
        respondJson: cap.respondJson,
        readJsonBody: async () => ({ repoFullName: "evil/repo", branchName: "agent/x", path: "src/x.ts", newContent: "hi" }),
        ...baseDeps(),
      });
      expect(cap.calls[0]!.payload.outcome).toBe("blocked");
    }
    // .env 차단
    {
      const cap = capture();
      await handleGithubRoute({
        pathname: "/integrations/github/write/file/plan", method: "POST",
        respondJson: cap.respondJson,
        readJsonBody: async () => ({ repoFullName: REPO, branchName: "agent/x", path: ".env", newContent: "TOKEN=x" }),
        ...baseDeps(),
      });
      expect(cap.calls[0]!.payload.outcome).toBe("blocked");
    }
    // NUL binary 차단
    {
      const cap = capture();
      await handleGithubRoute({
        pathname: "/integrations/github/write/file/plan", method: "POST",
        respondJson: cap.respondJson,
        readJsonBody: async () => ({ repoFullName: REPO, branchName: "agent/x", path: "src/x.ts", newContent: "hello\0bye" }),
        ...baseDeps(),
      });
      expect(cap.calls[0]!.payload.outcome).toBe("blocked");
    }
    // secret 차단
    {
      const cap = capture();
      await handleGithubRoute({
        pathname: "/integrations/github/write/file/plan", method: "POST",
        respondJson: cap.respondJson,
        readJsonBody: async () => ({
          repoFullName: REPO, branchName: "agent/x", path: "src/x.ts",
          newContent: "leak = ghp_abcdefghij1234567890abcd",
        }),
        ...baseDeps(),
      });
      expect(cap.calls[0]!.payload.outcome).toBe("blocked");
    }
    // no-op 차단
    {
      const SAME = "stay\n";
      const cap = capture();
      await handleGithubRoute({
        pathname: "/integrations/github/write/file/plan", method: "POST",
        respondJson: cap.respondJson,
        readJsonBody: async () => ({ repoFullName: REPO, branchName: "agent/x", path: "src/x.ts", newContent: SAME }),
        ...baseDeps({ token: TOKEN, getFileContent: async () => ({ path: "src/x.ts", size: SAME.length, sha: "S", htmlUrl: "u", content: SAME, truncated: false, encoding: "utf8" }) }),
      });
      expect(cap.calls[0]!.payload.outcome).toBe("blocked");
    }
    // base sha mismatch → blocked
    {
      const cap = capture();
      await handleGithubRoute({
        pathname: "/integrations/github/write/file/plan", method: "POST",
        respondJson: cap.respondJson,
        readJsonBody: async () => ({
          repoFullName: REPO, branchName: "agent/x", path: "src/x.ts",
          newContent: "different\n",
          baseFileSha: "WRONG",
        }),
        ...baseDeps({ token: TOKEN, getFileContent: async () => ({ path: "src/x.ts", size: 5, sha: "RIGHT", htmlUrl: "u", content: "old\n", truncated: false, encoding: "utf8" }) }),
      });
      expect(cap.calls[0]!.payload.outcome).toBe("blocked");
    }
    // GitHub mutation은 negative 모든 케이스에서 0회
    expect(createBranchRef).not.toHaveBeenCalled();
    expect(postIssueComment).not.toHaveBeenCalled();
  });
});
