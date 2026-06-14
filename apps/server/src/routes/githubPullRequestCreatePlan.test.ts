import { describe, expect, it, vi } from "vitest";
import type { IncomingMessage } from "node:http";
import type { GithubReadonlyClient } from "../integrations/githubReadonlyClient";
import { GithubReadonlyError, githubConnectorStatus } from "../integrations/githubReadonlyClient";
import { handleGithubRoute } from "./github";
import { createGithubPullRequestCreatePlanStore } from "../integrations/githubPullRequestCreatePlanStore";

/**
 * W4a 라우트 — 적대적 체크리스트(사용자 contract 그대로):
 *   1) plan 단계 GitHub mutation 0 (createBranchRef/postIssueComment/putFileContents 0)
 *   2) token 미설정 → not_configured
 *   3) repo not allowed → blocked
 *   4) invalid base branch → blocked
 *   5) invalid head branch → blocked
 *   6) base == head → blocked
 *   7) head missing(404) → blocked
 *   8) base missing(404) → blocked
 *   9) compare aheadBy=0 → blocked(no-op PR)
 *  10) compare changedFiles=0 → blocked
 *  11) title secret → blocked
 *  12) body secret → blocked
 *  13) valid → plan + compare summary + filesPreview, status=approval_required, truthStatus=planned
 *  14) (evidence shape) plan 응답에 승인 카드에 필요한 모든 필드가 들어있다
 *  15) (large compare) filesPreview는 PR_COMPARE_FILES_PREVIEW_MAX(50)로 잘리고 truncated=true
 *  16) (token leak) 응답에 토큰 노출 없음
 */

const ALLOW = ["robin/lab"];
const BASE_ALLOW = ["main", "develop"];
const REPO = "robin/lab";
const TOKEN = "ghp_FAKE_w4a_test_TOKEN_DO_NOT_LEAK";
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
        aheadBy: 2,
        behindBy: 0,
        totalCommits: 2,
        changedFiles: 1,
        files: [{ filename: "src/x.ts", status: "modified", additions: 5, deletions: 2 }],
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

async function planRequest(body: any, over: {
  token?: string | null;
  getRefSha?: GithubReadonlyClient["getRefSha"];
  compareBranches?: GithubReadonlyClient["compareBranches"];
  prBaseAllowlist?: ReadonlyArray<string>;
  allow?: ReadonlyArray<string>;
}) {
  const prPlanStore = createGithubPullRequestCreatePlanStore();
  const { respondJson, calls } = capture();
  const createBranchRef = vi.fn();
  const postIssueComment = vi.fn();
  const putFileContents = vi.fn();
  const resolvedToken = over.token === null ? undefined : over.token ?? TOKEN;
  await handleGithubRoute({
    pathname: "/integrations/github/write/pr/plan",
    method: "POST",
    createClient: () => clientStub({
      token: resolvedToken,
      getRefSha: over.getRefSha,
      compareBranches: over.compareBranches,
      createBranchRef,
      postIssueComment,
      putFileContents,
    }),
    respondJson, now: NOW, request: stubRequest,
    readJsonBody: async () => body,
    prPlanStore,
    writeRepoAllowlist: over.allow ?? ALLOW,
    prBaseAllowlist: over.prBaseAllowlist ?? BASE_ALLOW,
    verifyApproval: async () => true,
  });
  return { calls, prPlanStore, createBranchRef, postIssueComment, putFileContents };
}

describe("W4a PR create plan — 적대적 체크리스트", () => {
  it("(#1) plan은 어떤 GitHub mutation도 호출하지 않는다", async () => {
    const { calls, createBranchRef, postIssueComment, putFileContents } = await planRequest(
      { repoFullName: REPO, baseBranch: "main", headBranch: "agent/feature-x", title: "T", body: "B" },
      {});
    expect(calls[0]!.payload.outcome).toBe("planned");
    expect(createBranchRef).not.toHaveBeenCalled();
    expect(postIssueComment).not.toHaveBeenCalled();
    expect(putFileContents).not.toHaveBeenCalled();
  });

  it("(#2) token 미설정 → not_configured", async () => {
    const { calls } = await planRequest(
      { repoFullName: REPO, baseBranch: "main", headBranch: "agent/x", title: "T", body: "B" },
      { token: null });
    expect(calls[0]!.payload.outcome).toBe("not_configured");
  });

  it("(#3) repo not in allowlist → blocked", async () => {
    const { calls } = await planRequest(
      { repoFullName: "evil/repo", baseBranch: "main", headBranch: "agent/x", title: "T", body: "B" }, {});
    expect(calls[0]!.payload.outcome).toBe("blocked");
  });

  it("(#4) invalid base → blocked", async () => {
    const { calls } = await planRequest(
      { repoFullName: REPO, baseBranch: "trunk", headBranch: "agent/x", title: "T", body: "B" }, {});
    expect(calls[0]!.payload.outcome).toBe("blocked");
  });

  it("(#5) invalid head(보호 브랜치/금지 prefix) → blocked", async () => {
    for (const bad of ["main", "develop", "release/x", "random-feature"]) {
      const { calls } = await planRequest(
        { repoFullName: REPO, baseBranch: "main", headBranch: bad, title: "T", body: "B" }, {});
      expect(calls[0]!.payload.outcome).toBe("blocked");
    }
  });

  it("(#6) base == head → blocked", async () => {
    // head가 agent/x인데 base allowlist를 agent/x로 만들면 base==head 분기로 빠진다.
    const { calls } = await planRequest(
      { repoFullName: REPO, baseBranch: "agent/x", headBranch: "agent/x", title: "T", body: "B" },
      { prBaseAllowlist: ["agent/x"] });
    expect(calls[0]!.payload.outcome).toBe("blocked");
  });

  it("(#7) head missing(404) → blocked + 명시 안내", async () => {
    // getRefSha는 head 먼저 호출 → 404 던지면 head 부재로 차단.
    const getRefSha = vi.fn(async () => { throw new GithubReadonlyError("not found", 404); });
    const { calls } = await planRequest(
      { repoFullName: REPO, baseBranch: "main", headBranch: "agent/x", title: "T", body: "B" },
      { getRefSha });
    expect(calls[0]!.payload.outcome).toBe("blocked");
    expect(calls[0]!.payload.message).toContain("head branch");
  });

  it("(#8) base missing(404) → blocked", async () => {
    // 첫 번째 호출(head)은 성공, 두 번째 호출(base)에서 404.
    let n = 0;
    const getRefSha = vi.fn(async () => {
      n += 1;
      if (n === 1) return "head-sha";
      throw new GithubReadonlyError("not found", 404);
    });
    const { calls } = await planRequest(
      { repoFullName: REPO, baseBranch: "main", headBranch: "agent/x", title: "T", body: "B" },
      { getRefSha });
    expect(calls[0]!.payload.outcome).toBe("blocked");
    expect(calls[0]!.payload.message).toContain("base branch");
  });

  it("(#9) compare aheadBy=0 → blocked(no-op PR)", async () => {
    const compareBranches = vi.fn(async () => ({
      aheadBy: 0, behindBy: 0, totalCommits: 0, changedFiles: 1,
      files: [{ filename: "x", status: "modified", additions: 1, deletions: 0 }],
    }));
    const { calls } = await planRequest(
      { repoFullName: REPO, baseBranch: "main", headBranch: "agent/x", title: "T", body: "B" },
      { compareBranches });
    expect(calls[0]!.payload.outcome).toBe("blocked");
    expect(calls[0]!.payload.message).toContain("no-op");
  });

  it("(#10) compare changedFiles=0 → blocked", async () => {
    const compareBranches = vi.fn(async () => ({
      aheadBy: 1, behindBy: 0, totalCommits: 1, changedFiles: 0, files: [],
    }));
    const { calls } = await planRequest(
      { repoFullName: REPO, baseBranch: "main", headBranch: "agent/x", title: "T", body: "B" },
      { compareBranches });
    expect(calls[0]!.payload.outcome).toBe("blocked");
  });

  it("(#11) title secret → blocked", async () => {
    const { calls } = await planRequest(
      { repoFullName: REPO, baseBranch: "main", headBranch: "agent/x", title: "Add ghp_abcdefghij1234567890abcd", body: "B" }, {});
    expect(calls[0]!.payload.outcome).toBe("blocked");
    expect(calls[0]!.payload.message).toContain("title");
  });

  it("(#12) body secret → blocked", async () => {
    const { calls } = await planRequest(
      { repoFullName: REPO, baseBranch: "main", headBranch: "agent/x", title: "T", body: "TOKEN=ghp_abcdefghij1234567890abcd" }, {});
    expect(calls[0]!.payload.outcome).toBe("blocked");
    expect(calls[0]!.payload.message).toContain("body");
  });

  it("(#13)(#14 evidence shape) 정상 입력 → 승인 카드 필드 전체 + planned", async () => {
    const { calls } = await planRequest(
      { repoFullName: REPO, baseBranch: "main", headBranch: "agent/feature-x", title: "Add evidence", body: "Approval queue + cards." },
      {});
    expect(calls[0]!.payload.outcome).toBe("planned");
    const plan = calls[0]!.payload.plan;
    // 필수 evidence 필드 — 승인 카드에서 빠지면 안 됨.
    expect(plan.repoFullName).toBe(REPO);
    expect(plan.baseBranch).toBe("main");
    expect(plan.headBranch).toBe("agent/feature-x");
    expect(plan.title).toBe("Add evidence");
    expect(plan.bodyPreview).toBeTruthy();
    expect(plan.titleSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(plan.bodySha256).toMatch(/^[a-f0-9]{64}$/);
    expect(plan.bodyLength).toBeGreaterThan(0);
    // compare summary
    expect(plan.compare.aheadBy).toBe(2);
    expect(plan.compare.changedFiles).toBe(1);
    expect(plan.compare.commits).toBe(2);
    expect(plan.compare.filesPreview).toEqual([
      { filename: "src/x.ts", status: "modified", additions: 5, deletions: 2 },
    ]);
    expect(plan.compare.truncated).toBe(false);
    // truthStatus = planned (GitHub mutation 미수행 표식)
    expect(plan.status).toBe("approval_required");
    expect(plan.truthStatus).toBe("planned");
    expect(plan.createdAt).toBeTruthy();
    expect(plan.expiresAt).toBeTruthy();
  });

  it("(#15) compare files가 50개 넘으면 잘리고 truncated=true", async () => {
    const manyFiles = Array.from({ length: 75 }, (_, i) => ({
      filename: `src/f${i}.ts`, status: "modified", additions: 1, deletions: 1,
    }));
    const compareBranches = vi.fn(async () => ({
      aheadBy: 75, behindBy: 0, totalCommits: 75, changedFiles: 75, files: manyFiles,
    }));
    const { calls } = await planRequest(
      { repoFullName: REPO, baseBranch: "main", headBranch: "agent/x", title: "T", body: "B" },
      { compareBranches });
    expect(calls[0]!.payload.outcome).toBe("planned");
    const plan = calls[0]!.payload.plan;
    expect(plan.compare.changedFiles).toBe(75); // 전체 카운트는 보존
    expect(plan.compare.filesPreview.length).toBe(50); // 미리보기는 50으로 잘림
    expect(plan.compare.truncated).toBe(true);
  });

  it("(#16 token leak) 응답에 토큰 fragment 없음 — error 경로도 포함", async () => {
    const ORIG = process.env.GITHUB_TOKEN;
    process.env.GITHUB_TOKEN = TOKEN;
    try {
      const getRefSha = vi.fn(async () => {
        throw new GithubReadonlyError(`failure with ${TOKEN}`, 500);
      });
      const { calls } = await planRequest(
        { repoFullName: REPO, baseBranch: "main", headBranch: "agent/x", title: "T", body: "B" },
        { getRefSha });
      expect(calls[0]!.payload.outcome).toBe("github_error");
      expect(JSON.stringify(calls[0]!.payload)).not.toContain(TOKEN);
      expect(calls[0]!.payload.message).toContain("<redacted-token>");
    } finally {
      if (ORIG === undefined) delete process.env.GITHUB_TOKEN; else process.env.GITHUB_TOKEN = ORIG;
    }
  });
});

// W4b 추가 이후: pr/execute 라우트가 W4b 핸들러로 들어간다 — plan 없는 빈 payload는 zod 400 blocked.
describe("W4a → W4b: pr/execute 경로는 W4b 핸들러가 받는다(빈 payload는 zod 거부)", () => {
  it("/integrations/github/write/pr/execute로 빈 POST → zod 400 blocked(MCP execute tool은 별도)", async () => {
    const cap = capture();
    await handleGithubRoute({
      pathname: "/integrations/github/write/pr/execute",
      method: "POST",
      createClient: () => clientStub({ token: TOKEN }),
      respondJson: cap.respondJson, now: NOW, request: stubRequest,
      readJsonBody: async () => ({}),
      prPlanStore: createGithubPullRequestCreatePlanStore(),
      writeRepoAllowlist: ALLOW, prBaseAllowlist: BASE_ALLOW,
      verifyApproval: async () => true,
    });
    expect(cap.calls[0]!.status).toBe(400);
    expect(cap.calls[0]!.payload.outcome).toBe("blocked");
  });
});
