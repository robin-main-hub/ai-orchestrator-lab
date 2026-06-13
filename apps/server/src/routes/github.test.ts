import { describe, expect, it, vi } from "vitest";
import type { GithubReadonlyClient } from "../integrations/githubReadonlyClient";
import { githubConnectorStatus } from "../integrations/githubReadonlyClient";
import { handleGithubRoute } from "./github";

function clientStub(over: Partial<GithubReadonlyClient> & { token?: string } = {}): GithubReadonlyClient {
  const token = over.token;
  return {
    status: () => githubConnectorStatus(token),
    getRepoOverview: over.getRepoOverview ?? (async () => ({ fullName: "o/r", description: null, defaultBranch: "main", openIssues: 0, stars: 0, private: false, htmlUrl: "" })),
    listPullRequests: over.listPullRequests ?? (async () => []),
    listIssues: over.listIssues ?? (async () => []),
  };
}

function capture() {
  const calls: Array<{ status: number; payload: unknown }> = [];
  return { calls, respondJson: (status: number, payload: unknown) => calls.push({ status, payload }) };
}

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

  it("미설정이면 리소스 호출도 200 + 미설정 안내(가짜 연결 금지)", async () => {
    const { respondJson, calls } = capture();
    const listPullRequests = vi.fn();
    await handleGithubRoute({
      pathname: "/integrations/github/repos/o/r/pulls",
      method: "GET",
      createClient: () => clientStub({ token: undefined, listPullRequests }),
      respondJson,
    });
    expect(calls[0]?.status).toBe(200);
    expect(JSON.stringify(calls[0]?.payload)).toContain("미설정");
    expect(listPullRequests).not.toHaveBeenCalled(); // 미설정이면 실제 호출 안 함
  });

  it("설정되어 있으면 pulls를 조회해 반환한다", async () => {
    const { respondJson, calls } = capture();
    const listPullRequests = vi.fn(async () => [
      { number: 1, title: "t", state: "open", author: "a", draft: false, htmlUrl: "u", createdAt: "c", updatedAt: "u" },
    ]);
    await handleGithubRoute({
      pathname: "/integrations/github/repos/o/r/pulls",
      method: "GET",
      createClient: () => clientStub({ token: "ghp_x", listPullRequests }),
      respondJson,
    });
    expect(calls[0]?.status).toBe(200);
    expect((calls[0]?.payload as { pullRequests: unknown[] }).pullRequests).toHaveLength(1);
    expect(listPullRequests).toHaveBeenCalledWith("o", "r", { state: "open" });
  });

  it("알 수 없는 github 경로는 404", async () => {
    const { respondJson, calls } = capture();
    await handleGithubRoute({ pathname: "/integrations/github/whoami", method: "GET", createClient: () => clientStub({ token: "ghp_x" }), respondJson });
    expect(calls[0]?.status).toBe(404);
  });
});
