import { describe, expect, it, vi } from "vitest";
import type { IncomingMessage } from "node:http";
import { createHash } from "node:crypto";
import type { GithubReadonlyClient } from "../integrations/githubReadonlyClient";
import { GithubReadonlyError, githubConnectorStatus } from "../integrations/githubReadonlyClient";
import { handleGithubRoute } from "./github";
import {
  createGithubPullRequestUpdatePlanStore,
  clearPullRequestUpdateObservedCache,
} from "../integrations/githubPullRequestUpdatePlanStore";

/**
 * W5c PR title/body update — 적대적 체크리스트(좁은 범위):
 *   범위: title/body만. draft/state/base/labels/assignees 절대 안 받음.
 *
 *   plan 단계:
 *     - GitHub mutation 0(updatePullRequest/createBranchRef/postIssueComment/createPullRequest 모두 0)
 *     - token 미설정 → not_configured
 *     - repo not allowed → blocked
 *     - PR closed → blocked
 *     - PR merged → blocked
 *     - PR 404 → blocked
 *     - empty change(no title, no body) → blocked
 *     - no-op(새 값 == 현재) → no_op
 *     - title too long → blocked
 *     - body too long → blocked
 *     - title secret → blocked
 *     - body secret → blocked
 *     - 정상: planned + currentTitleSha + currentBodySha + newBodyExcerpt(raw body 미노출)
 *
 *   execute 단계:
 *     - approval 없음 → approval_required
 *     - expectedCurrentTitleSha 불일치 → blocked(toctou_title_mismatch)
 *     - expectedCurrentBodySha 불일치 → blocked(toctou_body_mismatch)
 *     - newTitleSha 불일치 → blocked
 *     - newBodySha 불일치 → blocked
 *     - TOCTOU: PR이 plan 이후 title 바뀜 → blocked
 *     - TOCTOU: PR이 plan 이후 closed → blocked
 *     - 정상: PATCH 1회 호출, observed(title/htmlUrl/updatedAt/bodySha/bodyLength) — raw body 없음
 *     - 멱등성: 같은 plan으로 두 번 execute → PATCH 1회만, 같은 observed 반환
 *     - response/trace에 raw body 본문 누설 X
 */

const ALLOW = ["robin/lab"];
const REPO = "robin/lab";
const TOKEN = "ghp_FAKE_w5c_test_TOKEN_DO_NOT_LEAK";
const NOW_REF = "2026-06-14T12:00:00.000Z";
const NOW = () => NOW_REF;
const stubRequest = {} as IncomingMessage;

const CURRENT_TITLE = "Add login flow";
const CURRENT_BODY = "## What\nThis PR adds a login flow.\n";
const NEW_TITLE = "Add login flow (cleaned up)";
const NEW_BODY = "## What\n로그인 흐름을 추가하고 한 번 더 다듬었다.\n";

function sha(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function clientStub(
  over: Partial<GithubReadonlyClient> & {
    token?: string;
    prState?: "open" | "closed";
    prMerged?: boolean;
    prTitle?: string;
    prBody?: string;
  } = {},
): GithubReadonlyClient {
  const token = over.token;
  const prState = over.prState ?? "open";
  const prMerged = over.prMerged ?? false;
  const prTitle = over.prTitle ?? CURRENT_TITLE;
  const prBody = over.prBody ?? CURRENT_BODY;
  return {
    status: () => githubConnectorStatus(token),
    getRepoOverview:
      over.getRepoOverview ??
      (async () => ({ fullName: REPO, description: null, defaultBranch: "main", openIssues: 0, stars: 0, private: false, htmlUrl: "" })),
    listPullRequests: over.listPullRequests ?? (async () => []),
    getPullRequest:
      over.getPullRequest ??
      (async () => ({
        number: 42, title: prTitle, state: prState, author: "robin", draft: false,
        htmlUrl: "https://github.com/robin/lab/pull/42", createdAt: "c", updatedAt: "u",
        body: prBody, baseRef: "main", headRef: "agent/x", merged: prMerged,
        additions: 1, deletions: 1, changedFiles: 1, commits: 1,
      })),
    getFileContent: over.getFileContent ?? (async () => { throw new GithubReadonlyError("not found", 404); }),
    listIssues: over.listIssues ?? (async () => []),
    postIssueComment: over.postIssueComment ?? (async () => ({ id: 1, htmlUrl: "u" })),
    getRefSha: over.getRefSha ?? (async () => "stub-sha"),
    createBranchRef: over.createBranchRef ?? (async (_o, _r, ref, sha) => ({ ref, sha, htmlUrl: "u" })),
    putFileContents: over.putFileContents ?? (async () => ({ commitSha: "x", blobSha: "x", htmlUrl: "x" })),
    compareBranches:
      over.compareBranches ??
      (async () => ({ aheadBy: 1, behindBy: 0, totalCommits: 1, changedFiles: 1, files: [] })),
    createPullRequest:
      over.createPullRequest ??
      (async () => ({ pullNumber: 1, htmlUrl: "u", headSha: "stub-head" })),
    updatePullRequest: over.updatePullRequest,
  };
}

function capture() {
  const calls: Array<{ status: number; payload: any }> = [];
  return { calls, respondJson: (status: number, payload: unknown) => calls.push({ status, payload }) };
}

async function planRequest(
  body: any,
  over: {
    token?: string | null;
    prState?: "open" | "closed";
    prMerged?: boolean;
    prTitle?: string;
    prBody?: string;
    allow?: ReadonlyArray<string>;
    updatePullRequest?: GithubReadonlyClient["updatePullRequest"];
    getPullRequest?: GithubReadonlyClient["getPullRequest"];
  } = {},
) {
  clearPullRequestUpdateObservedCache();
  // 가짜 시계로 store 생성 — 그렇지 않으면 plan의 expiresAt(NOW_REF + 10분)이 실제 Date.now()
  // 기준 과거가 되어 put 직후 prune된다(테스트 격리 실패).
  const prUpdatePlanStore = createGithubPullRequestUpdatePlanStore({
    nowMs: () => Date.parse(NOW_REF),
  });
  const { respondJson, calls } = capture();
  const updatePullRequest = over.updatePullRequest ?? vi.fn(async () => ({
    pullNumber: 42,
    htmlUrl: "https://github.com/robin/lab/pull/42",
    title: NEW_TITLE,
    body: NEW_BODY,
    updatedAt: "2026-06-14T13:00:00.000Z",
  }));
  const resolvedToken = over.token === null ? undefined : over.token ?? TOKEN;
  await handleGithubRoute({
    pathname: "/integrations/github/write/pr/update/plan",
    method: "POST",
    createClient: () => clientStub({
      token: resolvedToken,
      prState: over.prState,
      prMerged: over.prMerged,
      prTitle: over.prTitle,
      prBody: over.prBody,
      getPullRequest: over.getPullRequest,
      updatePullRequest,
    }),
    respondJson, now: NOW, request: stubRequest,
    readJsonBody: async () => body,
    prUpdatePlanStore,
    writeRepoAllowlist: over.allow ?? ALLOW,
    verifyApproval: async () => true,
  });
  return { calls, prUpdatePlanStore, updatePullRequest };
}

async function executeRequest(
  prUpdatePlanStore: ReturnType<typeof createGithubPullRequestUpdatePlanStore>,
  body: any,
  over: {
    verifyApproval?: (approvalId: string) => Promise<boolean>;
    updatePullRequest?: GithubReadonlyClient["updatePullRequest"];
    getPullRequest?: GithubReadonlyClient["getPullRequest"];
    prTitle?: string;
    prBody?: string;
    prState?: "open" | "closed";
    prMerged?: boolean;
  } = {},
) {
  const { respondJson, calls } = capture();
  const updatePullRequest = over.updatePullRequest ?? vi.fn(async () => ({
    pullNumber: 42,
    htmlUrl: "https://github.com/robin/lab/pull/42",
    title: NEW_TITLE,
    body: NEW_BODY,
    updatedAt: "2026-06-14T13:00:00.000Z",
  }));
  await handleGithubRoute({
    pathname: "/integrations/github/write/pr/update/execute",
    method: "POST",
    createClient: () => clientStub({
      token: TOKEN,
      prTitle: over.prTitle,
      prBody: over.prBody,
      prState: over.prState,
      prMerged: over.prMerged,
      getPullRequest: over.getPullRequest,
      updatePullRequest,
    }),
    respondJson, now: NOW, request: stubRequest,
    readJsonBody: async () => body,
    prUpdatePlanStore,
    writeRepoAllowlist: ALLOW,
    verifyApproval: over.verifyApproval ?? (async () => true),
  });
  return { calls, updatePullRequest };
}

describe("W5c PR title/body update", () => {
  it("(#1) plan은 update 등 어떤 GitHub mutation도 호출하지 않는다", async () => {
    const { calls, updatePullRequest } = await planRequest(
      { repoFullName: REPO, pullNumber: 42, newTitle: NEW_TITLE, newBody: NEW_BODY },
    );
    expect(calls[0]!.payload.outcome).toBe("planned");
    expect(updatePullRequest).not.toHaveBeenCalled();
  });

  it("(#2) token 미설정 → not_configured", async () => {
    const { calls } = await planRequest(
      { repoFullName: REPO, pullNumber: 42, newTitle: NEW_TITLE },
      { token: null },
    );
    expect(calls[0]!.payload.outcome).toBe("not_configured");
  });

  it("(#3) repo not in allowlist → blocked", async () => {
    const { calls } = await planRequest(
      { repoFullName: "evil/repo", pullNumber: 42, newTitle: NEW_TITLE },
      { allow: ALLOW },
    );
    expect(calls[0]!.payload.outcome).toBe("blocked");
  });

  it("(#4) PR closed → blocked", async () => {
    const { calls } = await planRequest(
      { repoFullName: REPO, pullNumber: 42, newTitle: NEW_TITLE },
      { prState: "closed" },
    );
    expect(calls[0]!.payload.outcome).toBe("blocked");
    expect(calls[0]!.payload.message).toContain("open");
  });

  it("(#5) PR merged → blocked", async () => {
    const { calls } = await planRequest(
      { repoFullName: REPO, pullNumber: 42, newTitle: NEW_TITLE },
      { prMerged: true },
    );
    expect(calls[0]!.payload.outcome).toBe("blocked");
    expect(calls[0]!.payload.message).toContain("merged");
  });

  it("(#6) 변경 의도 없음(no title, no body) → blocked", async () => {
    const { calls } = await planRequest({ repoFullName: REPO, pullNumber: 42 });
    expect(calls[0]!.payload.outcome).toBe("blocked");
  });

  it("(#7) no-op(새 title==현재, body 미지정) → no_op", async () => {
    const { calls } = await planRequest(
      { repoFullName: REPO, pullNumber: 42, newTitle: CURRENT_TITLE },
    );
    expect(calls[0]!.payload.outcome).toBe("no_op");
  });

  it("(#8) title secret → blocked", async () => {
    const { calls } = await planRequest(
      { repoFullName: REPO, pullNumber: 42, newTitle: "ghp_abcdefghijklmnopqrstuvwx12345" },
    );
    expect(calls[0]!.payload.outcome).toBe("blocked");
  });

  it("(#9) body secret → blocked", async () => {
    const { calls } = await planRequest(
      { repoFullName: REPO, pullNumber: 42, newBody: "TOKEN=ghp_aaaabbbbccccddddeeeeffff1234\n" },
    );
    expect(calls[0]!.payload.outcome).toBe("blocked");
  });

  it("(#10) 정상: planned + currentTitleSha + newBodyExcerpt(raw body 없음)", async () => {
    const { calls } = await planRequest(
      { repoFullName: REPO, pullNumber: 42, newTitle: NEW_TITLE, newBody: NEW_BODY },
    );
    expect(calls[0]!.payload.outcome).toBe("planned");
    const plan = calls[0]!.payload.plan;
    expect(plan.currentTitle).toBe(CURRENT_TITLE);
    expect(plan.currentTitleSha256).toBe(sha(CURRENT_TITLE));
    expect(plan.currentBodySha256).toBe(sha(CURRENT_BODY));
    expect(plan.newTitle).toBe(NEW_TITLE);
    expect(plan.newTitleSha256).toBe(sha(NEW_TITLE));
    expect(plan.newBodySha256).toBe(sha(NEW_BODY));
    expect(plan.newBodyExcerpt.length).toBeGreaterThan(0);
    // body raw 본문(전체)은 plan 응답에 들어가지 않는다 — excerpt만.
    expect(plan.newBody).toBeUndefined();
    expect(plan.changeSummary.titleChanged).toBe(true);
    expect(plan.changeSummary.bodyChanged).toBe(true);
    expect(plan.status).toBe("approval_required");
  });

  it("(#11) execute approval 없음 → approval_required", async () => {
    const { prUpdatePlanStore, calls: planCalls } = await planRequest(
      { repoFullName: REPO, pullNumber: 42, newTitle: NEW_TITLE },
    );
    const plan = planCalls[0]!.payload.plan;
    const { calls } = await executeRequest(
      prUpdatePlanStore,
      {
        planId: plan.id,
        expectedCurrentTitleSha256: plan.currentTitleSha256,
        expectedCurrentBodySha256: plan.currentBodySha256,
        newTitleSha256: plan.newTitleSha256,
        approvalId: "",
      },
    );
    expect(calls[0]!.payload.outcome).toBe("approval_required");
  });

  it("(#12) execute expectedCurrentTitleSha 불일치 → blocked(toctou_title_mismatch)", async () => {
    const { prUpdatePlanStore, calls: planCalls } = await planRequest(
      { repoFullName: REPO, pullNumber: 42, newTitle: NEW_TITLE, newBody: NEW_BODY },
    );
    const plan = planCalls[0]!.payload.plan;
    const { calls } = await executeRequest(
      prUpdatePlanStore,
      {
        planId: plan.id,
        expectedCurrentTitleSha256: sha("not the same"),
        expectedCurrentBodySha256: plan.currentBodySha256,
        newTitleSha256: plan.newTitleSha256,
        newBodySha256: plan.newBodySha256,
        approvalId: "appr-1",
      },
    );
    expect(calls[0]!.payload.outcome).toBe("blocked");
    expect(calls[0]!.payload.reason).toBe("toctou_title_mismatch");
  });

  it("(#13) execute 시점 PR title이 바뀐 경우 → blocked(toctou_title_mismatch)", async () => {
    const { prUpdatePlanStore, calls: planCalls } = await planRequest(
      { repoFullName: REPO, pullNumber: 42, newTitle: NEW_TITLE, newBody: NEW_BODY },
    );
    const plan = planCalls[0]!.payload.plan;
    // execute 시점에 GitHub PR title이 다른 값으로 바뀐 상태를 시뮬레이션.
    const { calls } = await executeRequest(
      prUpdatePlanStore,
      {
        planId: plan.id,
        expectedCurrentTitleSha256: plan.currentTitleSha256,
        expectedCurrentBodySha256: plan.currentBodySha256,
        newTitleSha256: plan.newTitleSha256,
        newBodySha256: plan.newBodySha256,
        approvalId: "appr-1",
      },
      { prTitle: "Someone changed the title before us" },
    );
    expect(calls[0]!.payload.outcome).toBe("blocked");
    expect(calls[0]!.payload.reason).toBe("toctou_title_mismatch");
  });

  it("(#14) execute 시점 PR이 closed가 됐으면 → blocked(pr_closed)", async () => {
    const { prUpdatePlanStore, calls: planCalls } = await planRequest(
      { repoFullName: REPO, pullNumber: 42, newTitle: NEW_TITLE },
    );
    const plan = planCalls[0]!.payload.plan;
    const { calls } = await executeRequest(
      prUpdatePlanStore,
      {
        planId: plan.id,
        expectedCurrentTitleSha256: plan.currentTitleSha256,
        expectedCurrentBodySha256: plan.currentBodySha256,
        newTitleSha256: plan.newTitleSha256,
        approvalId: "appr-1",
      },
      { prState: "closed" },
    );
    expect(calls[0]!.payload.outcome).toBe("blocked");
    expect(calls[0]!.payload.reason).toBe("pr_closed");
  });

  it("(#15) 정상 execute: PATCH 1회 + observed(title/htmlUrl/updatedAt/bodySha/bodyLength) — raw body 응답 X", async () => {
    const { prUpdatePlanStore, calls: planCalls } = await planRequest(
      { repoFullName: REPO, pullNumber: 42, newTitle: NEW_TITLE, newBody: NEW_BODY },
    );
    const plan = planCalls[0]!.payload.plan;
    const updatePullRequest = vi.fn(async () => ({
      pullNumber: 42,
      htmlUrl: "https://github.com/robin/lab/pull/42",
      title: NEW_TITLE,
      body: NEW_BODY,
      updatedAt: "2026-06-14T13:00:00.000Z",
    }));
    const { calls } = await executeRequest(
      prUpdatePlanStore,
      {
        planId: plan.id,
        expectedCurrentTitleSha256: plan.currentTitleSha256,
        expectedCurrentBodySha256: plan.currentBodySha256,
        newTitleSha256: plan.newTitleSha256,
        newBodySha256: plan.newBodySha256,
        approvalId: "appr-1",
      },
      { updatePullRequest },
    );
    expect(updatePullRequest).toHaveBeenCalledTimes(1);
    expect(updatePullRequest).toHaveBeenCalledWith("robin", "lab", 42, {
      title: NEW_TITLE,
      body: NEW_BODY,
    });
    const payload = calls[0]!.payload;
    expect(payload.outcome).toBe("observed");
    expect(payload.pullNumber).toBe(42);
    expect(payload.title).toBe(NEW_TITLE);
    expect(payload.bodySha256).toBe(sha(NEW_BODY));
    expect(payload.bodyLength).toBe(Buffer.byteLength(NEW_BODY, "utf8"));
    expect(payload.htmlUrl).toBe("https://github.com/robin/lab/pull/42");
    expect(payload.updatedAt).toBe("2026-06-14T13:00:00.000Z");
    // response에 raw body 본문이 들어가서는 안 된다 — sha/length/excerpt만 허용.
    const fullPayload = JSON.stringify(payload);
    expect(fullPayload).not.toContain("로그인 흐름을 추가하고");
    expect(fullPayload).not.toContain("body\":\"");
  });

  it("(#16) 멱등성: 같은 plan으로 두 번 execute → PATCH 1회만, 두 번째는 캐시된 observed", async () => {
    const { prUpdatePlanStore, calls: planCalls } = await planRequest(
      { repoFullName: REPO, pullNumber: 42, newTitle: NEW_TITLE, newBody: NEW_BODY },
    );
    const plan = planCalls[0]!.payload.plan;
    const updatePullRequest = vi.fn(async () => ({
      pullNumber: 42,
      htmlUrl: "https://github.com/robin/lab/pull/42",
      title: NEW_TITLE,
      body: NEW_BODY,
      updatedAt: "2026-06-14T13:00:00.000Z",
    }));
    const body = {
      planId: plan.id,
      expectedCurrentTitleSha256: plan.currentTitleSha256,
      expectedCurrentBodySha256: plan.currentBodySha256,
      newTitleSha256: plan.newTitleSha256,
      newBodySha256: plan.newBodySha256,
      approvalId: "appr-1",
    };
    const first = await executeRequest(prUpdatePlanStore, body, { updatePullRequest });
    const second = await executeRequest(prUpdatePlanStore, body, { updatePullRequest });
    expect(updatePullRequest).toHaveBeenCalledTimes(1);
    expect(first.calls[0]!.payload.outcome).toBe("observed");
    expect(second.calls[0]!.payload.outcome).toBe("observed");
    expect(second.calls[0]!.payload.pullNumber).toBe(42);
  });

  it("(#17 회귀) PATCH 본문에는 의도한 키만 들어간다 — draft/state/base/labels 등 절대 보내지 않음", async () => {
    const { prUpdatePlanStore, calls: planCalls } = await planRequest(
      { repoFullName: REPO, pullNumber: 42, newTitle: NEW_TITLE }, // body는 변경하지 않음
    );
    const plan = planCalls[0]!.payload.plan;
    type UpdateArgs = { title?: string; body?: string };
    const updatePullRequest = vi.fn(async (_o: string, _r: string, _n: number, _p: UpdateArgs) => ({
      pullNumber: 42, htmlUrl: "u", title: NEW_TITLE, body: CURRENT_BODY, updatedAt: "u",
    }));
    await executeRequest(
      prUpdatePlanStore,
      {
        planId: plan.id,
        expectedCurrentTitleSha256: plan.currentTitleSha256,
        expectedCurrentBodySha256: plan.currentBodySha256,
        newTitleSha256: plan.newTitleSha256,
        approvalId: "appr-1",
      },
      { updatePullRequest },
    );
    expect(updatePullRequest).toHaveBeenCalledTimes(1);
    const args = updatePullRequest.mock.calls[0]![3] as UpdateArgs;
    expect(args).toEqual({ title: NEW_TITLE, body: undefined });
    // draft/state/base/labels/assignees 등 절대 못 들어옴 — 인터페이스가 이미 막아둠.
    expect("draft" in args).toBe(false);
    expect("state" in args).toBe(false);
    expect("base" in args).toBe(false);
    expect("labels" in args).toBe(false);
  });
});
