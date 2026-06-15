import { describe, expect, it, vi } from "vitest";
import type { IncomingMessage } from "node:http";
import type { GithubReadonlyClient } from "../integrations/githubReadonlyClient";
import { GithubReadonlyError, githubConnectorStatus } from "../integrations/githubReadonlyClient";
import { handleGithubRoute } from "./github";
import {
  createGithubPullRequestCreatePlanStore,
  type GithubPullRequestCreatePlanStore,
} from "../integrations/githubPullRequestCreatePlanStore";

/**
 * W4b PR create execute — 사용자 contract 적대적 체크리스트:
 *   1) plan 없으면 blocked
 *   2) approval 누락 → zod 400 blocked, createPullRequest 0
 *   3) approval verify=false → blocked, createPullRequest 0
 *   4) titleSha256 mismatch → blocked
 *   5) bodySha256 mismatch → blocked
 *   6) head ref sha plan 이후 변경(force-push 시뮬) → blocked
 *   7) base ref sha plan 이후 변경 → blocked
 *   8) compare execute 시점 no-op(aheadBy=0 또는 changedFiles=0) → blocked
 *   9) 정상 → createPullRequest 1회 + pullNumber/htmlUrl/headSha observed
 *  10) duplicate execute → createPullRequest 추가 호출 없음(observedCache)
 *  11) GitHub 422 → already_exists로 매핑(github_error로 안 흐름)
 *  12) GitHub 403 → permission_denied
 *  13) (token leak) 에러 메시지에 토큰 fragment 없음(scrubServerToken)
 *  14) MCP execute tool은 추가되지 않음 — mcpServer.test.ts의 부정 regex로 잠금
 */

const ALLOW = ["robin/lab"];
const BASE_ALLOW = ["main", "develop"];
const REPO = "robin/lab";
const TOKEN = "ghp_FAKE_w4b_test_TOKEN_DO_NOT_LEAK";
const NOW_REF = "2026-06-14T12:00:00.000Z";
const NOW = () => NOW_REF;
const stubRequest = {} as IncomingMessage;
const BASE_SHA = "BASE_SHA_PLAN";
const HEAD_SHA = "HEAD_SHA_PLAN";

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
    getRefSha:
      over.getRefSha ??
      (async (_o, _r, ref) => ref === "main" ? BASE_SHA : HEAD_SHA),
    createBranchRef:
      over.createBranchRef ?? (async (_o, _r, ref, sha) => ({ ref, sha, htmlUrl: "u" })),
    putFileContents:
      over.putFileContents ?? (async () => ({ commitSha: "stub", blobSha: "stub", htmlUrl: "u" })),
    compareBranches:
      over.compareBranches ??
      (async () => ({
        aheadBy: 2, behindBy: 0, totalCommits: 2, changedFiles: 1,
        files: [{ filename: "src/x.ts", status: "modified", additions: 5, deletions: 2 }],
      })),
    createPullRequest:
      over.createPullRequest ??
      (async () => ({ pullNumber: 42, htmlUrl: `https://github.com/${REPO}/pull/42`, headSha: HEAD_SHA })),
  };
}

function capture() {
  const calls: Array<{ status: number; payload: any }> = [];
  return { calls, respondJson: (status: number, payload: unknown) => calls.push({ status, payload }) };
}

/** plan 단계를 거쳐 실제 plan record를 store에 넣는다 — W4b execute 입력 준비. */
async function makePlan(opts: {
  store?: GithubPullRequestCreatePlanStore;
  title?: string;
  body?: string;
  baseBranch?: string;
  headBranch?: string;
  getRefSha?: GithubReadonlyClient["getRefSha"];
  compareBranches?: GithubReadonlyClient["compareBranches"];
}) {
  const store = opts.store ?? createGithubPullRequestCreatePlanStore({ nowMs: () => Date.parse(NOW_REF) });
  const planCap = capture();
  await handleGithubRoute({
    pathname: "/integrations/github/write/pr/plan",
    method: "POST",
    createClient: () => clientStub({
      token: TOKEN,
      getRefSha: opts.getRefSha,
      compareBranches: opts.compareBranches,
    }),
    respondJson: planCap.respondJson, now: NOW, request: stubRequest,
    readJsonBody: async () => ({
      repoFullName: REPO,
      baseBranch: opts.baseBranch ?? "main",
      headBranch: opts.headBranch ?? "agent/feature-x",
      title: opts.title ?? "PR title",
      body: opts.body ?? "PR body.",
    }),
    prPlanStore: store,
    writeRepoAllowlist: ALLOW, prBaseAllowlist: BASE_ALLOW,
    verifyApproval: async () => true,
  });
  expect(planCap.calls[0]!.payload.outcome).toBe("planned");
  return { store, plan: planCap.calls[0]!.payload.plan };
}

async function execute(opts: {
  store: GithubPullRequestCreatePlanStore;
  planId: string;
  titleSha256: string;
  bodySha256: string;
  approvalId?: string;
  verifyApproval?: (id: string) => Promise<boolean>;
  getRefSha?: GithubReadonlyClient["getRefSha"];
  compareBranches?: GithubReadonlyClient["compareBranches"];
  createPullRequest?: GithubReadonlyClient["createPullRequest"];
}) {
  const cap = capture();
  await handleGithubRoute({
    pathname: "/integrations/github/write/pr/execute",
    method: "POST",
    createClient: () => clientStub({
      token: TOKEN,
      getRefSha: opts.getRefSha,
      compareBranches: opts.compareBranches,
      createPullRequest: opts.createPullRequest,
    }),
    respondJson: cap.respondJson, now: NOW, request: stubRequest,
    readJsonBody: async () => ({
      planId: opts.planId,
      titleSha256: opts.titleSha256,
      bodySha256: opts.bodySha256,
      ...(opts.approvalId ? { approvalId: opts.approvalId } : {}),
    }),
    prPlanStore: opts.store,
    writeRepoAllowlist: ALLOW, prBaseAllowlist: BASE_ALLOW,
    verifyApproval: opts.verifyApproval ?? (async () => true),
  });
  return cap.calls[0]!.payload;
}

describe("W4b PR create execute — 적대적 체크리스트", () => {
  it("(#1) plan 없으면 blocked", async () => {
    const createPullRequest = vi.fn();
    const result = await execute({
      store: createGithubPullRequestCreatePlanStore({ nowMs: () => Date.parse(NOW_REF) }),
      planId: "gprp_nonexistent", titleSha256: "x", bodySha256: "y",
      approvalId: "appr_OK", createPullRequest,
    });
    expect(result.outcome).toBe("blocked");
    expect(createPullRequest).not.toHaveBeenCalled();
  });

  it("(#2) approval 누락 → zod 400, createPullRequest 0", async () => {
    const { store, plan } = await makePlan({});
    const createPullRequest = vi.fn();
    const result = await execute({
      store, planId: plan.id,
      titleSha256: plan.titleSha256, bodySha256: plan.bodySha256,
      createPullRequest,
    });
    expect(result.outcome).toBe("blocked");
    expect(createPullRequest).not.toHaveBeenCalled();
  });

  it("(#3) approval verify=false → blocked", async () => {
    const { store, plan } = await makePlan({});
    const createPullRequest = vi.fn();
    const result = await execute({
      store, planId: plan.id,
      titleSha256: plan.titleSha256, bodySha256: plan.bodySha256,
      approvalId: "appr_DENIED",
      verifyApproval: async () => false,
      createPullRequest,
    });
    expect(result.outcome).toBe("blocked");
    expect(createPullRequest).not.toHaveBeenCalled();
  });

  it("(#4) titleSha256 mismatch → blocked", async () => {
    const { store, plan } = await makePlan({});
    const createPullRequest = vi.fn();
    const result = await execute({
      store, planId: plan.id,
      titleSha256: "DEADBEEF_TITLE",
      bodySha256: plan.bodySha256,
      approvalId: "appr_OK",
      createPullRequest,
    });
    expect(result.outcome).toBe("blocked");
    expect(result.message).toContain("titleSha256");
    expect(createPullRequest).not.toHaveBeenCalled();
  });

  it("(#5) bodySha256 mismatch → blocked", async () => {
    const { store, plan } = await makePlan({});
    const createPullRequest = vi.fn();
    const result = await execute({
      store, planId: plan.id,
      titleSha256: plan.titleSha256,
      bodySha256: "DEADBEEF_BODY",
      approvalId: "appr_OK",
      createPullRequest,
    });
    expect(result.outcome).toBe("blocked");
    expect(result.message).toContain("bodySha256");
    expect(createPullRequest).not.toHaveBeenCalled();
  });

  it("(#6) head sha plan 이후 변경(force-push) → blocked, createPullRequest 0", async () => {
    const { store, plan } = await makePlan({});
    const createPullRequest = vi.fn();
    // execute 시점 head sha 다른 값.
    const getRefSha = vi.fn(async (_o, _r, ref) =>
      ref === plan.headBranch ? "HEAD_FORCE_PUSHED" : BASE_SHA,
    );
    const result = await execute({
      store, planId: plan.id,
      titleSha256: plan.titleSha256, bodySha256: plan.bodySha256,
      approvalId: "appr_OK",
      getRefSha, createPullRequest,
    });
    expect(result.outcome).toBe("blocked");
    expect(result.message).toMatch(/head branch.*sha.*변경/);
    expect(createPullRequest).not.toHaveBeenCalled();
  });

  it("(#7) base sha plan 이후 변경 → blocked", async () => {
    const { store, plan } = await makePlan({});
    const createPullRequest = vi.fn();
    const getRefSha = vi.fn(async (_o, _r, ref) =>
      ref === plan.baseBranch ? "BASE_MOVED" : HEAD_SHA,
    );
    const result = await execute({
      store, planId: plan.id,
      titleSha256: plan.titleSha256, bodySha256: plan.bodySha256,
      approvalId: "appr_OK",
      getRefSha, createPullRequest,
    });
    expect(result.outcome).toBe("blocked");
    expect(result.message).toMatch(/base branch.*sha.*변경/);
    expect(createPullRequest).not.toHaveBeenCalled();
  });

  it("(#8) execute 시점 compare가 no-op이 됐으면 blocked", async () => {
    const { store, plan } = await makePlan({});
    const createPullRequest = vi.fn();
    // plan 시점 compare는 정상이었지만 execute 시점 head가 base와 같아짐.
    const compareBranches = vi.fn(async () => ({
      aheadBy: 0, behindBy: 0, totalCommits: 0, changedFiles: 0, files: [],
    }));
    const result = await execute({
      store, planId: plan.id,
      titleSha256: plan.titleSha256, bodySha256: plan.bodySha256,
      approvalId: "appr_OK",
      compareBranches, createPullRequest,
    });
    expect(result.outcome).toBe("blocked");
    expect(result.message).toContain("no-op");
    expect(createPullRequest).not.toHaveBeenCalled();
  });

  it("(#9) 정상 → createPullRequest 1회 + observed pullNumber/htmlUrl/headSha", async () => {
    const { store, plan } = await makePlan({});
    const createPullRequest = vi.fn(async () => ({
      pullNumber: 777,
      htmlUrl: `https://github.com/${REPO}/pull/777`,
      headSha: HEAD_SHA,
    }));
    const result = await execute({
      store, planId: plan.id,
      titleSha256: plan.titleSha256, bodySha256: plan.bodySha256,
      approvalId: "appr_OK",
      createPullRequest,
    });
    expect(result.outcome).toBe("observed");
    expect(result.truthStatus).toBe("observed");
    expect(result.pullNumber).toBe(777);
    expect(result.htmlUrl).toContain(`${REPO}/pull/777`);
    expect(result.headSha).toBe(HEAD_SHA);
    expect(createPullRequest).toHaveBeenCalledTimes(1);
    // same-repo only: head는 'owner:branch'가 아니라 branch 이름 그대로.
    const call = createPullRequest.mock.calls[0] as unknown as [string, string, { base: string; head: string; title: string; body: string }];
    expect(call[2].base).toBe(plan.baseBranch);
    expect(call[2].head).toBe(plan.headBranch);
    expect(call[2].head).not.toContain(":");
    expect(call[2].title).toBe(plan.title);
  });

  it("(#10) duplicate execute → observed 동일, createPullRequest 추가 호출 없음(멱등)", async () => {
    const { store, plan } = await makePlan({});
    const createPullRequest = vi.fn(async () => ({
      pullNumber: 555, htmlUrl: `https://github.com/${REPO}/pull/555`, headSha: HEAD_SHA,
    }));
    const first = await execute({
      store, planId: plan.id,
      titleSha256: plan.titleSha256, bodySha256: plan.bodySha256,
      approvalId: "appr_OK", createPullRequest,
    });
    expect(first.outcome).toBe("observed");
    expect(createPullRequest).toHaveBeenCalledTimes(1);
    const second = await execute({
      store, planId: plan.id,
      titleSha256: plan.titleSha256, bodySha256: plan.bodySha256,
      approvalId: "appr_OK", createPullRequest,
    });
    expect(second.outcome).toBe("observed");
    expect(second.pullNumber).toBe(555);
    expect(createPullRequest).toHaveBeenCalledTimes(1);
  });

  it("(#11) GitHub 422 → already_exists(github_error로 안 흐름)", async () => {
    const { store, plan } = await makePlan({});
    const createPullRequest = vi.fn(async () => {
      throw new GithubReadonlyError("A pull request already exists for robin:agent/feature-x", 422);
    });
    const result = await execute({
      store, planId: plan.id,
      titleSha256: plan.titleSha256, bodySha256: plan.bodySha256,
      approvalId: "appr_OK", createPullRequest,
    });
    expect(result.outcome).toBe("already_exists");
  });

  it("(#12) GitHub 403 → permission_denied", async () => {
    const { store, plan } = await makePlan({});
    const createPullRequest = vi.fn(async () => {
      throw new GithubReadonlyError("forbidden", 403);
    });
    const result = await execute({
      store, planId: plan.id,
      titleSha256: plan.titleSha256, bodySha256: plan.bodySha256,
      approvalId: "appr_OK", createPullRequest,
    });
    expect(result.outcome).toBe("permission_denied");
  });

  it("(#13 token leak) 에러 메시지에 토큰 들어가도 응답에 토큰 노출 없음", async () => {
    const ORIG = process.env.GITHUB_TOKEN;
    process.env.GITHUB_TOKEN = TOKEN;
    try {
      const { store, plan } = await makePlan({});
      const createPullRequest = vi.fn(async () => {
        throw new GithubReadonlyError(`PR create failure with ${TOKEN}`, 500);
      });
      const result = await execute({
        store, planId: plan.id,
        titleSha256: plan.titleSha256, bodySha256: plan.bodySha256,
        approvalId: "appr_OK", createPullRequest,
      });
      expect(result.outcome).toBe("github_error");
      expect(JSON.stringify(result)).not.toContain(TOKEN);
      expect(result.message).toContain("<redacted-token>");
    } finally {
      if (ORIG === undefined) delete process.env.GITHUB_TOKEN; else process.env.GITHUB_TOKEN = ORIG;
    }
  });
});

describe("W4b — MCP execute tool은 추가되지 않음(서버 단독)", () => {
  it("pr/execute 라우트가 POST 외 메서드는 405", async () => {
    const cap = capture();
    await handleGithubRoute({
      pathname: "/integrations/github/write/pr/execute",
      method: "GET",
      createClient: () => clientStub({ token: TOKEN }),
      respondJson: cap.respondJson, now: NOW, request: stubRequest,
      readJsonBody: async () => ({}),
      prPlanStore: createGithubPullRequestCreatePlanStore({ nowMs: () => Date.parse(NOW_REF) }),
      writeRepoAllowlist: ALLOW, prBaseAllowlist: BASE_ALLOW,
      verifyApproval: async () => true,
    });
    expect(cap.calls[0]!.status).toBe(405);
  });
});
