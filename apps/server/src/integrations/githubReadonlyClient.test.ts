import { describe, expect, it, vi } from "vitest";
import {
  GithubNotConfiguredError,
  GithubReadonlyError,
  createGithubReadonlyClient,
  githubConnectorStatus,
} from "./githubReadonlyClient";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("githubConnectorStatus — 정직한 설정 상태", () => {
  it("토큰 없으면 configured/tokenPresent false + 설정 안내", () => {
    const status = githubConnectorStatus(undefined);
    expect(status.configured).toBe(false);
    expect(status.tokenPresent).toBe(false);
    expect(status.mode).toBe("read_only");
    expect(status.note).toContain("GITHUB_TOKEN");
  });

  it("공백 토큰은 미설정으로 본다", () => {
    expect(githubConnectorStatus("   ").configured).toBe(false);
  });

  it("토큰 있으면 configured true (토큰 값은 어디에도 안 실림)", () => {
    const status = githubConnectorStatus("ghp_secret");
    expect(status.configured).toBe(true);
    expect(JSON.stringify(status)).not.toContain("ghp_secret");
  });
});

describe("createGithubReadonlyClient — 읽기 전용 조회", () => {
  it("토큰 없으면 리소스 호출 시 GithubNotConfiguredError(가짜 연결 금지)", async () => {
    const client = createGithubReadonlyClient({ token: undefined, fetchImpl: vi.fn() });
    await expect(client.getRepoOverview("o", "r")).rejects.toBeInstanceOf(GithubNotConfiguredError);
  });

  it("PR 목록을 요약으로 매핑하고 GET만 사용한다", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      jsonResponse([
        { number: 7, title: "fix", state: "open", user: { login: "robin" }, draft: false, html_url: "u", created_at: "c", updated_at: "u2" },
      ]),
    );
    const client = createGithubReadonlyClient({ token: "ghp_x", fetchImpl });
    const prs = await client.listPullRequests("o", "r");
    expect(prs).toEqual([
      { number: 7, title: "fix", state: "open", author: "robin", draft: false, htmlUrl: "u", createdAt: "c", updatedAt: "u2" },
    ]);
    expect(fetchImpl.mock.calls[0]?.[1]?.method).toBe("GET");
  });

  it("이슈 목록에서 PR(pull_request 필드)은 제외한다", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse([
        { number: 1, title: "real issue", state: "open", user: { login: "a" }, comments: 2, html_url: "u", created_at: "c", updated_at: "u" },
        { number: 2, title: "pr-as-issue", state: "open", user: { login: "b" }, pull_request: { url: "x" }, html_url: "u", created_at: "c", updated_at: "u" },
      ]),
    );
    const client = createGithubReadonlyClient({ token: "ghp_x", fetchImpl });
    const issues = await client.listIssues("o", "r");
    expect(issues.map((i) => i.number)).toEqual([1]);
  });

  it("repo 개요를 매핑한다", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ full_name: "o/r", description: null, default_branch: "main", open_issues_count: 3, stargazers_count: 9, private: true, html_url: "h" }),
    );
    const client = createGithubReadonlyClient({ token: "ghp_x", fetchImpl });
    expect(await client.getRepoOverview("o", "r")).toEqual({
      fullName: "o/r",
      description: null,
      defaultBranch: "main",
      openIssues: 3,
      stars: 9,
      private: true,
      htmlUrl: "h",
    });
  });

  it("에러 메시지에서 토큰을 마스킹한다(비밀 누출 방지)", async () => {
    const token = "ghp_supersecret";
    const fetchImpl = vi.fn(async () => {
      throw new Error(`network failed for Bearer ${token}`);
    });
    const client = createGithubReadonlyClient({ token, fetchImpl });
    await expect(client.getRepoOverview("o", "r")).rejects.toMatchObject({
      message: expect.not.stringContaining(token),
    });
  });

  it("GitHub 비정상 응답은 GithubReadonlyError(상태코드 포함)로 변환", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ message: "Not Found" }, 404));
    const client = createGithubReadonlyClient({ token: "ghp_x", fetchImpl });
    await expect(client.listIssues("o", "r")).rejects.toBeInstanceOf(GithubReadonlyError);
  });
});
