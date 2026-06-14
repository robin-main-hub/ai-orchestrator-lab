import { describe, expect, it, vi } from "vitest";
import {
  createOctokitPullRequestAdapter,
  composeGithubClientWithOctokitPRs,
} from "./githubOctokitClient";
import {
  GithubNotConfiguredError,
  GithubReadonlyError,
  type GithubReadonlyClient,
} from "./githubReadonlyClient";

/**
 * OSS-H2 — Octokit PR adapter contract.
 *
 * We intentionally test through the @octokit/request layer (not a mocked
 * Octokit) so a real-life network shape regression(headers, URL template, body)
 * will fail this test. The fetch impl is injected so no real HTTP is made.
 */

const TOKEN = "ghp_TEST_W5C_NEVER_LEAK";

function ok(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
function err(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("OctokitPullRequestAdapter — getPullRequest", () => {
  it("GET /repos/{o}/{r}/pulls/{n} 호출 + 헤더에 Bearer token + api version", async () => {
    const fetchImpl = vi.fn(async (input: any, init?: any) => {
      const url = String(input?.url ?? input);
      expect(url).toBe("https://api.github.com/repos/robin/lab/pulls/42");
      expect(init?.method).toBe("GET");
      const headers = new Headers(init?.headers);
      expect(headers.get("authorization")).toBe(`Bearer ${TOKEN}`);
      expect(headers.get("accept")).toBe("application/vnd.github+json");
      expect(headers.get("x-github-api-version")).toBe("2022-11-28");
      return ok({
        number: 42,
        title: "Add login flow",
        state: "open",
        user: { login: "robin" },
        draft: false,
        html_url: "https://github.com/robin/lab/pull/42",
        created_at: "2026-06-13T00:00:00Z",
        updated_at: "2026-06-14T00:00:00Z",
        body: "## What\nbody.\n",
        base: { ref: "main" },
        head: { ref: "feature/login" },
        merged: false,
        additions: 12,
        deletions: 1,
        changed_files: 3,
        commits: 2,
      });
    });
    const adapter = createOctokitPullRequestAdapter({ token: TOKEN, fetchImpl });

    const pr = await adapter.getPullRequest!("robin", "lab", 42);
    expect(pr.number).toBe(42);
    expect(pr.title).toBe("Add login flow");
    expect(pr.body).toBe("## What\nbody.\n");
    expect(pr.baseRef).toBe("main");
    expect(pr.headRef).toBe("feature/login");
    expect(pr.additions).toBe(12);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("token 없음 → GithubNotConfiguredError(network 호출 없음)", async () => {
    const fetchImpl = vi.fn();
    const adapter = createOctokitPullRequestAdapter({ token: undefined, fetchImpl });
    await expect(adapter.getPullRequest!("robin", "lab", 42)).rejects.toBeInstanceOf(
      GithubNotConfiguredError,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("404 → GithubReadonlyError(status=404), 메시지에 token 누설 0", async () => {
    const fetchImpl = vi.fn(async () => err(404, `Not Found token=${TOKEN}`));
    const adapter = createOctokitPullRequestAdapter({ token: TOKEN, fetchImpl });
    await expect(adapter.getPullRequest!("robin", "lab", 999)).rejects.toMatchObject({
      name: "GithubReadonlyError",
      status: 404,
    });
    try {
      await adapter.getPullRequest!("robin", "lab", 999);
    } catch (e) {
      expect((e as Error).message).not.toContain(TOKEN);
    }
  });
});

describe("OctokitPullRequestAdapter — updatePullRequest", () => {
  it("PATCH /repos/{o}/{r}/pulls/{n} + title/body 둘 다 본문에 실린다", async () => {
    const fetchImpl = vi.fn(async (input: any, init?: any) => {
      const url = String(input?.url ?? input);
      expect(url).toBe("https://api.github.com/repos/robin/lab/pulls/42");
      expect(init?.method).toBe("PATCH");
      const body = JSON.parse(String(init?.body ?? "{}"));
      expect(body).toEqual({ title: "T2", body: "B2" });
      // owner/repo/pull_number는 URL에 채워진 것 → 본문에 누락이 정상
      return ok({
        number: 42,
        title: "T2",
        body: "B2",
        html_url: "https://github.com/robin/lab/pull/42",
        updated_at: "2026-06-14T01:00:00Z",
      });
    });
    const adapter = createOctokitPullRequestAdapter({ token: TOKEN, fetchImpl });

    const out = await adapter.updatePullRequest!("robin", "lab", 42, {
      title: "T2",
      body: "B2",
    });
    expect(out).toEqual({
      pullNumber: 42,
      htmlUrl: "https://github.com/robin/lab/pull/42",
      title: "T2",
      body: "B2",
      updatedAt: "2026-06-14T01:00:00Z",
    });
  });

  it("title만 → body는 PATCH 본문에서 누락(undefined 정책 유지)", async () => {
    const fetchImpl = vi.fn(async (_input: any, init?: any) => {
      const body = JSON.parse(String(init?.body ?? "{}"));
      expect(body).toEqual({ title: "only-title" });
      expect(body.body).toBeUndefined();
      return ok({
        number: 42,
        title: "only-title",
        body: "untouched",
        html_url: "https://github.com/robin/lab/pull/42",
        updated_at: "2026-06-14T02:00:00Z",
      });
    });
    const adapter = createOctokitPullRequestAdapter({ token: TOKEN, fetchImpl });
    await adapter.updatePullRequest!("robin", "lab", 42, { title: "only-title" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("422 GitHub error → GithubReadonlyError(status=422), 메시지에 token 누설 0", async () => {
    const fetchImpl = vi.fn(async () =>
      err(422, JSON.stringify({ message: `Validation failed for token=${TOKEN}` })),
    );
    const adapter = createOctokitPullRequestAdapter({ token: TOKEN, fetchImpl });
    let caught: GithubReadonlyError | undefined;
    try {
      await adapter.updatePullRequest!("robin", "lab", 42, { title: "x" });
    } catch (e) {
      caught = e as GithubReadonlyError;
    }
    expect(caught?.name).toBe("GithubReadonlyError");
    expect(caught?.status).toBe(422);
    expect(caught?.message ?? "").not.toContain(TOKEN);
  });

  it("token 없음 → GithubNotConfiguredError(network 호출 없음)", async () => {
    const fetchImpl = vi.fn();
    const adapter = createOctokitPullRequestAdapter({ token: undefined, fetchImpl });
    await expect(
      adapter.updatePullRequest!("robin", "lab", 42, { title: "x" }),
    ).rejects.toBeInstanceOf(GithubNotConfiguredError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("composeGithubClientWithOctokitPRs — surgical swap", () => {
  it("PR read/update만 Octokit으로 가고, 나머지 메서드는 base client에 위임", async () => {
    const fetchImpl = vi.fn(async () =>
      ok({
        number: 42,
        title: "merged",
        body: "after",
        html_url: "https://github.com/o/r/pull/42",
        updated_at: "2026-06-14T03:00:00Z",
      }),
    );
    const baseGetRepoOverview = vi.fn(async () => ({
      fullName: "robin/lab",
      description: null,
      defaultBranch: "main",
      openIssues: 0,
      stars: 0,
      private: false,
      htmlUrl: "https://github.com/robin/lab",
    }));
    const baseCreateBranchRef = vi.fn(async () => ({ ref: "x", sha: "y", htmlUrl: "z" }));
    const baseGetPR = vi.fn(); // not used through composed client
    const baseUpdatePR = vi.fn(); // not used through composed client
    const base: GithubReadonlyClient = {
      status: () => ({
        id: "github",
        name: "stub",
        mode: "read_only",
        configured: true,
        tokenPresent: true,
        scopesNeeded: [],
        note: "",
      }),
      getRepoOverview: baseGetRepoOverview,
      listPullRequests: vi.fn(),
      getPullRequest: baseGetPR,
      getFileContent: vi.fn(),
      listIssues: vi.fn(),
      createBranchRef: baseCreateBranchRef,
      updatePullRequest: baseUpdatePR,
    } as unknown as GithubReadonlyClient;

    const composed = composeGithubClientWithOctokitPRs(base, { token: TOKEN, fetchImpl });

    // PR update: Octokit path (base.updatePullRequest 호출 안 됨, fetchImpl 호출됨)
    await composed.updatePullRequest!("robin", "lab", 42, { title: "T", body: "B" });
    expect(baseUpdatePR).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    // 다른 메서드(getRepoOverview): base 위임(fetchImpl 호출 0, baseGetRepoOverview 호출 1)
    await composed.getRepoOverview("robin", "lab");
    expect(baseGetRepoOverview).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1); // 그대로 1

    // 다른 메서드(createBranchRef): base 위임
    await composed.createBranchRef!("robin", "lab", "refs/heads/x", "sha");
    expect(baseCreateBranchRef).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
