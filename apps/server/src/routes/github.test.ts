import { describe, expect, it, vi } from "vitest";
import type { GithubReadonlyClient } from "../integrations/githubReadonlyClient";
import { GithubReadonlyError, githubConnectorStatus } from "../integrations/githubReadonlyClient";
import { handleGithubRoute } from "./github";

function clientStub(over: Partial<GithubReadonlyClient> & { token?: string } = {}): GithubReadonlyClient {
  const token = over.token;
  return {
    status: () => githubConnectorStatus(token),
    getRepoOverview:
      over.getRepoOverview ??
      (async () => ({ fullName: "o/r", description: null, defaultBranch: "main", openIssues: 0, stars: 0, private: false, htmlUrl: "" })),
    listPullRequests: over.listPullRequests ?? (async () => []),
    getPullRequest:
      over.getPullRequest ??
      (async () => ({
        number: 1,
        title: "t",
        state: "open",
        author: "a",
        draft: false,
        htmlUrl: "u",
        createdAt: "c",
        updatedAt: "u",
        body: "b",
        baseRef: "main",
        headRef: "feat",
        merged: false,
        additions: 1,
        deletions: 2,
        changedFiles: 3,
        commits: 4,
      })),
    getFileContent:
      over.getFileContent ??
      (async () => ({ path: "src/x.ts", size: 10, sha: "abc", htmlUrl: "u", content: "file body", truncated: false, encoding: "utf8" })),
    listIssues: over.listIssues ?? (async () => []),
    postIssueComment: over.postIssueComment ?? (async () => ({ id: 1, htmlUrl: "https://github.com/o/r/issues/1#issuecomment-1" })),
    getRefSha: over.getRefSha ?? (async () => "stub-sha"),
    createBranchRef:
      over.createBranchRef ?? (async (_o, _r, ref, sha) => ({ ref, sha, htmlUrl: "https://github.com/o/r/tree/stub" })),
    putFileContents:
      over.putFileContents ?? (async () => ({ commitSha: "stub-commit", blobSha: "stub-blob", htmlUrl: "https://github.com/o/r/blob/stub" })),
    compareBranches:
      over.compareBranches ??
      (async () => ({ aheadBy: 1, behindBy: 0, totalCommits: 1, changedFiles: 1, files: [{ filename: "x", status: "modified", additions: 1, deletions: 0 }] })),
  };
}

function capture() {
  const calls: Array<{ status: number; payload: unknown }> = [];
  return { calls, respondJson: (status: number, payload: unknown) => calls.push({ status, payload }) };
}

const now = () => "2026-06-13T00:00:00.000Z";

describe("handleGithubRoute", () => {
  it("github 경로가 아니면 처리하지 않는다(false)", async () => {
    const { respondJson, calls } = capture();
    const handled = await handleGithubRoute({ pathname: "/missions", method: "GET", createClient: () => clientStub(), respondJson });
    expect(handled).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("GET 외 메서드는 405(읽기 전용)", async () => {
    const { respondJson, calls } = capture();
    await handleGithubRoute({ pathname: "/integrations/github/status", method: "POST", createClient: () => clientStub(), respondJson });
    expect(calls[0]?.status).toBe(405);
  });

  it("status는 토큰 유무를 노출하되 토큰 값은 안 싣는다", async () => {
    const { respondJson, calls } = capture();
    await handleGithubRoute({ pathname: "/integrations/github/status", method: "GET", createClient: () => clientStub({ token: "ghp_secret" }), respondJson });
    expect(calls[0]?.status).toBe(200);
    expect(JSON.stringify(calls[0]?.payload)).toContain('"configured":true');
    expect(JSON.stringify(calls[0]?.payload)).not.toContain("ghp_secret");
  });

  it("미설정이면 리소스 호출도 outcome=not_configured + GitHub 호출 안 함", async () => {
    const { respondJson, calls } = capture();
    const listPullRequests = vi.fn();
    await handleGithubRoute({
      pathname: "/integrations/github/repos/o/r/pulls",
      method: "GET",
      createClient: () => clientStub({ token: undefined, listPullRequests }),
      respondJson,
    });
    expect((calls[0]?.payload as { outcome: string }).outcome).toBe("not_configured");
    expect(listPullRequests).not.toHaveBeenCalled();
  });

  it("설정되어 있으면 pulls를 outcome=observed + observedAt로 반환", async () => {
    const { respondJson, calls } = capture();
    const listPullRequests = vi.fn(async () => [
      { number: 1, title: "t", state: "open", author: "a", draft: false, htmlUrl: "u", createdAt: "c", updatedAt: "u" },
    ]);
    await handleGithubRoute({
      pathname: "/integrations/github/repos/o/r/pulls",
      method: "GET",
      createClient: () => clientStub({ token: "ghp_x", listPullRequests }),
      respondJson,
      now,
    });
    const payload = calls[0]?.payload as { outcome: string; observedAt?: string; pullRequests: unknown[] };
    expect(payload.outcome).toBe("observed");
    expect(payload.observedAt).toBe(now());
    expect(payload.pullRequests).toHaveLength(1);
  });

  it("401/403은 outcome=permission_denied (빈 목록 아님)", async () => {
    const { respondJson, calls } = capture();
    await handleGithubRoute({
      pathname: "/integrations/github/repos/o/r/pulls",
      method: "GET",
      createClient: () =>
        clientStub({
          token: "ghp_x",
          listPullRequests: async () => {
            throw new GithubReadonlyError("forbidden", 403);
          },
        }),
      respondJson,
    });
    expect((calls[0]?.payload as { outcome: string }).outcome).toBe("permission_denied");
  });

  it("네트워크(status 0)는 outcome=connection_failed", async () => {
    const { respondJson, calls } = capture();
    await handleGithubRoute({
      pathname: "/integrations/github/repos/o/r/issues",
      method: "GET",
      createClient: () =>
        clientStub({
          token: "ghp_x",
          listIssues: async () => {
            throw new GithubReadonlyError("network", 0);
          },
        }),
      respondJson,
    });
    expect((calls[0]?.payload as { outcome: string }).outcome).toBe("connection_failed");
  });

  it("PR 상세 경로는 pullRequest + observed로 반환", async () => {
    const { respondJson, calls } = capture();
    const getPullRequest = vi.fn(clientStub({ token: "ghp_x" }).getPullRequest);
    await handleGithubRoute({
      pathname: "/integrations/github/repos/o/r/pulls/42",
      method: "GET",
      createClient: () => clientStub({ token: "ghp_x", getPullRequest }),
      respondJson,
      now,
    });
    const payload = calls[0]?.payload as { outcome: string; pullRequest?: { number: number } };
    expect(payload.outcome).toBe("observed");
    expect(getPullRequest).toHaveBeenCalledWith("o", "r", 42);
    expect(payload.pullRequest?.number).toBe(1);
  });

  it("file 경로는 path 쿼리로 파일을 observed 반환", async () => {
    const { respondJson, calls } = capture();
    const getFileContent = vi.fn(async () => ({ path: "src/a.ts", size: 5, sha: "s", htmlUrl: "u", content: "hello", truncated: false, encoding: "utf8" as const }));
    await handleGithubRoute({
      pathname: "/integrations/github/repos/o/r/file?path=src/a.ts&ref=main",
      method: "GET",
      createClient: () => clientStub({ token: "ghp_x", getFileContent }),
      respondJson,
      now,
    });
    const payload = calls[0]?.payload as { outcome: string; file?: { content: string } };
    expect(payload.outcome).toBe("observed");
    expect(getFileContent).toHaveBeenCalledWith("o", "r", "src/a.ts", "main");
    expect(payload.file?.content).toBe("hello");
  });

  it("file 경로에 path 쿼리가 없으면 github_error로 정직 반환", async () => {
    const { respondJson, calls } = capture();
    const getFileContent = vi.fn();
    await handleGithubRoute({
      pathname: "/integrations/github/repos/o/r/file",
      method: "GET",
      createClient: () => clientStub({ token: "ghp_x", getFileContent }),
      respondJson,
    });
    expect((calls[0]?.payload as { outcome: string }).outcome).toBe("github_error");
    expect(getFileContent).not.toHaveBeenCalled();
  });

  it("알 수 없는 github 경로는 404", async () => {
    const { respondJson, calls } = capture();
    await handleGithubRoute({ pathname: "/integrations/github/whoami", method: "GET", createClient: () => clientStub({ token: "ghp_x" }), respondJson });
    expect(calls[0]?.status).toBe(404);
  });
});
