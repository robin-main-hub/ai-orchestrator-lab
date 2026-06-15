import { describe, expect, it, vi } from "vitest";
import type { IncomingMessage } from "node:http";
import { handleGithubRoute } from "./github";
import { githubConnectorStatus, type GithubReadonlyClient } from "../integrations/githubReadonlyClient";
import { createGithubCommentWritePlanStore } from "../integrations/githubCommentWritePlanStore";
import { bodySha256 } from "../integrations/githubCommentWriteGuards";

function clientStub(over: Partial<GithubReadonlyClient> & { token?: string } = {}): GithubReadonlyClient {
  const token = over.token;
  return {
    status: () => githubConnectorStatus(token),
    getRepoOverview: over.getRepoOverview ?? (async () => ({ fullName: "robin/lab", description: null, defaultBranch: "main", openIssues: 0, stars: 0, private: false, htmlUrl: "" })),
    listPullRequests: over.listPullRequests ?? (async () => []),
    getPullRequest:
      over.getPullRequest ??
      (async () => ({
        number: 1, title: "t", state: "open", author: "robin", draft: false, htmlUrl: "u", createdAt: "c", updatedAt: "u",
        body: "", baseRef: "main", headRef: "feat", merged: false, additions: 1, deletions: 1, changedFiles: 1, commits: 1,
      })),
    getFileContent: over.getFileContent ?? (async () => ({ path: "x", size: 0, sha: "s", htmlUrl: "u", content: "", truncated: false, encoding: "utf8" })),
    listIssues: over.listIssues ?? (async () => []),
    postIssueComment: over.postIssueComment ?? (async () => ({ id: 42, htmlUrl: "https://github.com/robin/lab/pull/7#issuecomment-42" })),
    getRefSha: over.getRefSha ?? (async () => "stub-sha"),
    createBranchRef:
      over.createBranchRef ?? (async (_o, _r, ref, sha) => ({ ref, sha, htmlUrl: "https://github.com/robin/lab/tree/stub" })),
    putFileContents:
      over.putFileContents ??
      (async () => ({ commitSha: "stub-commit", blobSha: "stub-blob", htmlUrl: "u" })),
    compareBranches:
      over.compareBranches ??
      (async () => ({ aheadBy: 1, behindBy: 0, totalCommits: 1, changedFiles: 1, files: [{ filename: "x", status: "modified", additions: 1, deletions: 0 }] })),
    createPullRequest:
      over.createPullRequest ??
      (async () => ({ pullNumber: 1, htmlUrl: "u", headSha: "stub-head" })),
  };
}

function capture() {
  const calls: Array<{ status: number; payload: any }> = [];
  return { calls, respondJson: (status: number, payload: unknown) => calls.push({ status, payload }) };
}

const stubRequest = {} as IncomingMessage;
// 노트: plan store TTL은 실시간 Date.now()로 prune된다. NOW를 너무 이른 시각으로 두면
// 실제 wall clock이 expiresAt(NOW+10분)을 지나가서 plan이 즉시 만료된다. 12:00 UTC로 둔다.
const NOW = () => "2026-06-14T12:00:00.000Z";

describe("W1 — POST /integrations/github/write/comment/plan", () => {
  it("token 없으면 not_configured (GitHub 호출 없음)", async () => {
    const { respondJson, calls } = capture();
    const planStore = createGithubCommentWritePlanStore({ nowMs: () => Date.parse(NOW()) });
    const postIssueComment = vi.fn();
    const getPullRequest = vi.fn();
    await handleGithubRoute({
      pathname: "/integrations/github/write/comment/plan",
      method: "POST",
      createClient: () => clientStub({ token: undefined, postIssueComment, getPullRequest }),
      respondJson,
      now: NOW,
      request: stubRequest,
      readJsonBody: async () => ({ repoFullName: "robin/lab", number: 7, targetKind: "pull_request", body: "hi" }),
      planStore,
      writeRepoAllowlist: ["robin/lab"],
      verifyApproval: async () => false,
    });
    expect(calls[0]?.payload.outcome).toBe("not_configured");
    expect(postIssueComment).not.toHaveBeenCalled();
    expect(getPullRequest).not.toHaveBeenCalled();
  });

  it("allowlist 비어 있으면 blocked", async () => {
    const { respondJson, calls } = capture();
    await handleGithubRoute({
      pathname: "/integrations/github/write/comment/plan",
      method: "POST",
      createClient: () => clientStub({ token: "ghp_x" }),
      respondJson,
      now: NOW,
      request: stubRequest,
      readJsonBody: async () => ({ repoFullName: "robin/lab", number: 7, targetKind: "pull_request", body: "hi" }),
      planStore: createGithubCommentWritePlanStore({ nowMs: () => Date.parse(NOW()) }),
      writeRepoAllowlist: [],
      verifyApproval: async () => false,
    });
    expect(calls[0]?.payload.outcome).toBe("blocked");
    expect(calls[0]?.payload.message).toContain("ALLOWLIST");
  });

  it("allowlist에 없는 repo는 blocked", async () => {
    const { respondJson, calls } = capture();
    await handleGithubRoute({
      pathname: "/integrations/github/write/comment/plan",
      method: "POST",
      createClient: () => clientStub({ token: "ghp_x" }),
      respondJson, now: NOW, request: stubRequest,
      readJsonBody: async () => ({ repoFullName: "evil/repo", number: 7, targetKind: "pull_request", body: "hi" }),
      planStore: createGithubCommentWritePlanStore({ nowMs: () => Date.parse(NOW()) }),
      writeRepoAllowlist: ["robin/lab"],
      verifyApproval: async () => false,
    });
    expect(calls[0]?.payload.outcome).toBe("blocked");
  });

  it("정상 plan은 status:approval_required + truthStatus:planned + bodySha256 반환 (실제 게시 없음)", async () => {
    const { respondJson, calls } = capture();
    const postIssueComment = vi.fn();
    await handleGithubRoute({
      pathname: "/integrations/github/write/comment/plan",
      method: "POST",
      createClient: () => clientStub({ token: "ghp_x", postIssueComment }),
      respondJson, now: NOW, request: stubRequest,
      readJsonBody: async () => ({ repoFullName: "robin/lab", number: 7, targetKind: "pull_request", body: "리뷰 의도 확인했습니다." }),
      planStore: createGithubCommentWritePlanStore({ nowMs: () => Date.parse(NOW()) }),
      writeRepoAllowlist: ["robin/lab"],
      verifyApproval: async () => false,
    });
    const payload = calls[0]?.payload;
    expect(payload.outcome).toBe("planned");
    expect(payload.plan.status).toBe("approval_required");
    expect(payload.plan.truthStatus).toBe("planned");
    expect(payload.plan.bodySha256).toBe(bodySha256("리뷰 의도 확인했습니다."));
    expect(postIssueComment).not.toHaveBeenCalled(); // plan 단계에서 절대 게시 안 함
  });

  it("body에 비밀 패턴 있으면 blocked(외부 GitHub 누출 차단)", async () => {
    const { respondJson, calls } = capture();
    await handleGithubRoute({
      pathname: "/integrations/github/write/comment/plan", method: "POST",
      createClient: () => clientStub({ token: "ghp_x" }),
      respondJson, now: NOW, request: stubRequest,
      readJsonBody: async () => ({ repoFullName: "robin/lab", number: 7, targetKind: "pull_request", body: "디버그 토큰 ghp_1234567890abcdefghijabcdef" }),
      planStore: createGithubCommentWritePlanStore({ nowMs: () => Date.parse(NOW()) }),
      writeRepoAllowlist: ["robin/lab"],
      verifyApproval: async () => false,
    });
    expect(calls[0]?.payload.outcome).toBe("blocked");
    expect(calls[0]?.payload.message).toContain("비밀 패턴");
  });

  it("plan은 GET을 허용하지 않는다(405)", async () => {
    const { respondJson, calls } = capture();
    await handleGithubRoute({
      pathname: "/integrations/github/write/comment/plan", method: "GET",
      createClient: () => clientStub({ token: "ghp_x" }),
      respondJson, now: NOW, request: stubRequest,
      readJsonBody: async () => ({}),
      planStore: createGithubCommentWritePlanStore({ nowMs: () => Date.parse(NOW()) }),
      writeRepoAllowlist: ["robin/lab"],
      verifyApproval: async () => false,
    });
    expect(calls[0]?.status).toBe(405);
  });
});

describe("W1 — POST /integrations/github/write/comment/execute", () => {
  async function planFirst(body: string) {
    const planStore = createGithubCommentWritePlanStore({ nowMs: () => Date.parse(NOW()) });
    const { calls } = capture();
    const respondJson = (status: number, payload: unknown) => calls.push({ status, payload });
    await handleGithubRoute({
      pathname: "/integrations/github/write/comment/plan", method: "POST",
      createClient: () => clientStub({ token: "ghp_x" }),
      respondJson, now: NOW, request: stubRequest,
      readJsonBody: async () => ({ repoFullName: "robin/lab", number: 7, targetKind: "pull_request", body }),
      planStore, writeRepoAllowlist: ["robin/lab"],
      verifyApproval: async () => false,
    });
    return { planStore, plan: calls[0]?.payload.plan };
  }

  it("approval도 armed도 없으면 blocked(둘 다 필요 — 한 쪽은 반드시)", async () => {
    const { planStore, plan } = await planFirst("안녕");
    const { respondJson, calls } = capture();
    const postIssueComment = vi.fn();
    await handleGithubRoute({
      pathname: "/integrations/github/write/comment/execute", method: "POST",
      createClient: () => clientStub({ token: "ghp_x", postIssueComment }),
      respondJson, now: NOW, request: stubRequest,
      readJsonBody: async () => ({ planId: plan.id, bodySha256: plan.bodySha256 }),
      planStore, writeRepoAllowlist: ["robin/lab"],
      verifyApproval: async () => false,
    });
    expect(calls[0]?.payload.outcome).toBe("blocked");
    expect(postIssueComment).not.toHaveBeenCalled();
  });

  it("bodySha256 불일치면 blocked(replay payload 변조 차단)", async () => {
    const { planStore, plan } = await planFirst("안녕");
    const { respondJson, calls } = capture();
    const postIssueComment = vi.fn();
    await handleGithubRoute({
      pathname: "/integrations/github/write/comment/execute", method: "POST",
      createClient: () => clientStub({ token: "ghp_x", postIssueComment }),
      respondJson, now: NOW, request: stubRequest,
      readJsonBody: async () => ({ planId: plan.id, bodySha256: "deadbeef", autoExecuteArmed: true, armedAt: NOW() }),
      planStore, writeRepoAllowlist: ["robin/lab"],
      verifyApproval: async () => true, // approval 있어도 sha 불일치면 차단되어야 함
    });
    expect(calls[0]?.payload.outcome).toBe("blocked");
    expect(calls[0]?.payload.message).toContain("bodySha256");
    expect(postIssueComment).not.toHaveBeenCalled();
  });

  it("approval 통과 + sha 일치면 GitHub POST 후 observed 반환", async () => {
    const { planStore, plan } = await planFirst("리뷰 잘 봤습니다");
    const { respondJson, calls } = capture();
    const postIssueComment = vi.fn(async () => ({ id: 99, htmlUrl: "https://github.com/robin/lab/pull/7#issuecomment-99" }));
    await handleGithubRoute({
      pathname: "/integrations/github/write/comment/execute", method: "POST",
      createClient: () => clientStub({ token: "ghp_x", postIssueComment }),
      respondJson, now: NOW, request: stubRequest,
      readJsonBody: async () => ({ planId: plan.id, bodySha256: plan.bodySha256, approvalId: "appr_1" }),
      planStore, writeRepoAllowlist: ["robin/lab"],
      verifyApproval: async (id) => id === "appr_1",
    });
    expect(calls[0]?.payload.outcome).toBe("observed");
    expect(calls[0]?.payload.commentId).toBe(99);
    expect(calls[0]?.payload.truthStatus).toBe("observed");
    expect(postIssueComment).toHaveBeenCalledTimes(1);
  });

  it("armedAt이 30분 이상 과거면 blocked(armed_expired) — 서버가 독립적으로 TTL 강제", async () => {
    const { planStore, plan } = await planFirst("stale");
    const { respondJson, calls } = capture();
    const postIssueComment = vi.fn();
    // armed가 5시간 전 — 클라가 잊고 켜둔 상태가 외부 게시로 이어지지 않게 서버가 거절.
    const NOW_REF = "2026-06-14T06:00:00.000Z";
    await handleGithubRoute({
      pathname: "/integrations/github/write/comment/execute", method: "POST",
      createClient: () => clientStub({ token: "ghp_x", postIssueComment }),
      respondJson, now: () => NOW_REF, request: stubRequest,
      readJsonBody: async () => ({ planId: plan.id, bodySha256: plan.bodySha256, autoExecuteArmed: true, armedAt: "2026-06-14T00:00:00.000Z" }),
      planStore, writeRepoAllowlist: ["robin/lab"], verifyApproval: async () => false,
    });
    expect(calls[0]?.payload.outcome).toBe("blocked");
    expect(postIssueComment).not.toHaveBeenCalled();
  });

  it("armedAt이 미래면 blocked(시계 왜곡/위조 차단)", async () => {
    const { planStore, plan } = await planFirst("future");
    const { respondJson, calls } = capture();
    const postIssueComment = vi.fn();
    await handleGithubRoute({
      pathname: "/integrations/github/write/comment/execute", method: "POST",
      createClient: () => clientStub({ token: "ghp_x", postIssueComment }),
      respondJson, now: NOW, request: stubRequest,
      readJsonBody: async () => ({ planId: plan.id, bodySha256: plan.bodySha256, autoExecuteArmed: true, armedAt: "2026-12-31T23:59:59.000Z" }),
      planStore, writeRepoAllowlist: ["robin/lab"], verifyApproval: async () => false,
    });
    expect(calls[0]?.payload.outcome).toBe("blocked");
    expect(postIssueComment).not.toHaveBeenCalled();
  });

  it("autoExecuteArmed=true + armedAt 유효 + sha 일치면 observed", async () => {
    const { planStore, plan } = await planFirst("hello");
    const { respondJson, calls } = capture();
    const postIssueComment = vi.fn(async () => ({ id: 7, htmlUrl: "u" }));
    await handleGithubRoute({
      pathname: "/integrations/github/write/comment/execute", method: "POST",
      createClient: () => clientStub({ token: "ghp_x", postIssueComment }),
      respondJson, now: NOW, request: stubRequest,
      readJsonBody: async () => ({ planId: plan.id, bodySha256: plan.bodySha256, autoExecuteArmed: true, armedAt: NOW() }),
      planStore, writeRepoAllowlist: ["robin/lab"],
      verifyApproval: async () => false,
    });
    expect(calls[0]?.payload.outcome).toBe("observed");
  });

  it("같은 plan을 두 번 execute해도 GitHub 한 번만 호출(멱등)", async () => {
    const { planStore, plan } = await planFirst("once");
    const postIssueComment = vi.fn(async () => ({ id: 55, htmlUrl: "u" }));
    const client = () => clientStub({ token: "ghp_x", postIssueComment });
    const body = { planId: plan.id, bodySha256: plan.bodySha256, autoExecuteArmed: true, armedAt: NOW() };
    const { respondJson: r1, calls: c1 } = capture();
    await handleGithubRoute({
      pathname: "/integrations/github/write/comment/execute", method: "POST", createClient: client,
      respondJson: r1, now: NOW, request: stubRequest, readJsonBody: async () => body,
      planStore, writeRepoAllowlist: ["robin/lab"], verifyApproval: async () => false,
    });
    const { respondJson: r2, calls: c2 } = capture();
    await handleGithubRoute({
      pathname: "/integrations/github/write/comment/execute", method: "POST", createClient: client,
      respondJson: r2, now: NOW, request: stubRequest, readJsonBody: async () => body,
      planStore, writeRepoAllowlist: ["robin/lab"], verifyApproval: async () => false,
    });
    expect(c1[0]?.payload.outcome).toBe("observed");
    expect(c2[0]?.payload.outcome).toBe("observed");
    expect(postIssueComment).toHaveBeenCalledTimes(1);
  });

  it("동일 plan으로 동시 execute가 들어와도 GitHub POST는 한 번만(TOCTOU 차단)", async () => {
    const { planStore, plan } = await planFirst("concurrent");
    // 둘 다 통과해야 할 입력
    const body = { planId: plan.id, bodySha256: plan.bodySha256, autoExecuteArmed: true, armedAt: NOW() };
    // postIssueComment를 의도적으로 지연 — 첫 호출이 await 중일 때 두 번째가 들어오게.
    let resolveFirst!: (value: { id: number; htmlUrl: string }) => void;
    const firstPromise = new Promise<{ id: number; htmlUrl: string }>((resolve) => {
      resolveFirst = resolve;
    });
    let callCount = 0;
    const postIssueComment = vi.fn(async () => {
      callCount += 1;
      // 첫 호출만 실제로 게시 promise를 기다림. 두 번째는 도달하면 안 됨(이 테스트의 가설).
      if (callCount === 1) return firstPromise;
      throw new Error("duplicate GitHub POST detected");
    });
    const client = () => clientStub({ token: "ghp_x", postIssueComment });

    const { respondJson: r1, calls: c1 } = capture();
    const { respondJson: r2, calls: c2 } = capture();
    const exec1 = handleGithubRoute({
      pathname: "/integrations/github/write/comment/execute", method: "POST", createClient: client,
      respondJson: r1, now: NOW, request: stubRequest, readJsonBody: async () => body,
      planStore, writeRepoAllowlist: ["robin/lab"], verifyApproval: async () => false,
    });
    // 첫 호출이 postIssueComment를 호출하고 await 중일 때 두 번째 진입 — claim에 실패해야 함.
    // 마이크로태스크 사이클을 한 번 양보해 첫 호출이 tryClaim까지 진행되게.
    await Promise.resolve();
    await Promise.resolve();
    const exec2 = handleGithubRoute({
      pathname: "/integrations/github/write/comment/execute", method: "POST", createClient: client,
      respondJson: r2, now: NOW, request: stubRequest, readJsonBody: async () => body,
      planStore, writeRepoAllowlist: ["robin/lab"], verifyApproval: async () => false,
    });
    await exec2;
    // 두 번째는 GitHub POST 도달 전에 blocked로 거절되어야 함.
    expect(c2[0]?.payload.outcome).toBe("blocked");
    expect(c2[0]?.payload.message).toContain("실행 중");

    // 첫 호출 마무리.
    resolveFirst({ id: 1, htmlUrl: "u" });
    await exec1;
    expect(c1[0]?.payload.outcome).toBe("observed");
    expect(postIssueComment).toHaveBeenCalledTimes(1); // 핵심: 중복 POST 없음
  });

  it("target이 사라진 경우(404) execute는 GitHub POST 전에 preflight로 차단", async () => {
    const { planStore, plan } = await planFirst("preflight");
    const { respondJson, calls } = capture();
    const postIssueComment = vi.fn();
    // PR get을 404로 던지는 클라이언트 — preflight 단계에서 차단되어야 함.
    const { GithubReadonlyError } = await import("../integrations/githubReadonlyClient");
    const failingClient = (): GithubReadonlyClient => clientStub({
      token: "ghp_x",
      postIssueComment,
      getPullRequest: async () => {
        throw new GithubReadonlyError("404 not found", 404);
      },
    });
    await handleGithubRoute({
      pathname: "/integrations/github/write/comment/execute", method: "POST",
      createClient: failingClient,
      respondJson, now: NOW, request: stubRequest,
      readJsonBody: async () => ({ planId: plan.id, bodySha256: plan.bodySha256, autoExecuteArmed: true, armedAt: NOW() }),
      planStore, writeRepoAllowlist: ["robin/lab"],
      verifyApproval: async () => false,
    });
    expect(calls[0]?.payload.outcome).toBe("github_error");
    expect(postIssueComment).not.toHaveBeenCalled(); // preflight가 POST를 차단했어야 함
  });

  it("plan 없는 planId면 blocked(없는 plan으로 게시 시도 차단)", async () => {
    const { respondJson, calls } = capture();
    await handleGithubRoute({
      pathname: "/integrations/github/write/comment/execute", method: "POST",
      createClient: () => clientStub({ token: "ghp_x" }),
      respondJson, now: NOW, request: stubRequest,
      readJsonBody: async () => ({ planId: "gcwp_nope", bodySha256: "x", autoExecuteArmed: true, armedAt: NOW() }),
      planStore: createGithubCommentWritePlanStore({ nowMs: () => Date.parse(NOW()) }), writeRepoAllowlist: ["robin/lab"],
      verifyApproval: async () => true,
    });
    expect(calls[0]?.payload.outcome).toBe("blocked");
    expect(calls[0]?.payload.message).toContain("plan");
  });
});
