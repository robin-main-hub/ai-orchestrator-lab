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

  it("getPullRequest는 본문/ref/diff stat을 상세로 매핑한다", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        number: 42,
        title: "feat",
        state: "open",
        user: { login: "robin" },
        draft: false,
        html_url: "u",
        created_at: "c",
        updated_at: "u2",
        body: "설명",
        base: { ref: "main" },
        head: { ref: "feat-x" },
        merged: false,
        additions: 10,
        deletions: 3,
        changed_files: 2,
        commits: 4,
      }),
    );
    const client = createGithubReadonlyClient({ token: "ghp_x", fetchImpl });
    expect(await client.getPullRequest("o", "r", 42)).toEqual({
      number: 42,
      title: "feat",
      state: "open",
      author: "robin",
      draft: false,
      htmlUrl: "u",
      createdAt: "c",
      updatedAt: "u2",
      body: "설명",
      baseRef: "main",
      headRef: "feat-x",
      merged: false,
      additions: 10,
      deletions: 3,
      changedFiles: 2,
      commits: 4,
    });
  });

  it("getPullRequest의 누락 diff stat은 null로 둔다(0으로 위장 금지)", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ number: 7, title: "t", state: "open", user: { login: "a" }, body: "", base: { ref: "main" }, head: { ref: "x" } }),
    );
    const client = createGithubReadonlyClient({ token: "ghp_x", fetchImpl });
    const pr = await client.getPullRequest("o", "r", 7);
    expect(pr.additions).toBeNull();
    expect(pr.changedFiles).toBeNull();
  });

  it("getFileContent는 base64를 UTF-8로 디코드해 반환", async () => {
    const content = Buffer.from("console.log('hi')\n", "utf8").toString("base64");
    const fetchImpl = vi.fn(async () => jsonResponse({ path: "src/a.ts", size: 18, sha: "abc", html_url: "u", content, encoding: "base64" }));
    const client = createGithubReadonlyClient({ token: "ghp_x", fetchImpl });
    const file = await client.getFileContent("o", "r", "src/a.ts");
    expect(file.content).toBe("console.log('hi')\n");
    expect(file.truncated).toBe(false);
    expect(file.encoding).toBe("utf8");
  });

  it("getFileContent는 큰 파일을 24K로 자르고 truncated=true (raw 전체 미반환)", async () => {
    const big = Buffer.from("z".repeat(40_000), "utf8").toString("base64");
    const fetchImpl = vi.fn(async () => jsonResponse({ path: "big.txt", size: 40_000, sha: "s", html_url: "u", content: big, encoding: "base64" }));
    const client = createGithubReadonlyClient({ token: "ghp_x", fetchImpl });
    const file = await client.getFileContent("o", "r", "big.txt");
    expect(file.truncated).toBe(true);
    expect(file.content.length).toBe(24_000);
  });

  it("getFileContent는 디렉터리(배열 응답)면 에러", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse([{ name: "a" }, { name: "b" }]));
    const client = createGithubReadonlyClient({ token: "ghp_x", fetchImpl });
    await expect(client.getFileContent("o", "r", "src")).rejects.toBeInstanceOf(GithubReadonlyError);
  });
});
