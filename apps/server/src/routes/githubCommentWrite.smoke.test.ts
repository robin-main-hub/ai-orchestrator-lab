/**
 * W1c — GitHub PR/Issue comment write **end-to-end smoke**.
 *
 * 단위 테스트가 각 게이트(allowlist/sha/secret/preflight/tryClaim/armed-TTL)를
 * 개별 검증한다면, 이 smoke는 **실제 사용 경로를 한 흐름으로** 닫는다:
 *
 *   GitHub PR observed → comment 본문 작성 → plan(GitHub POST 0)
 *     → first-use warning confirm(클라이언트 측 armed 상태)
 *     → execute(approval-or-armed gate)
 *     → mock GitHub 201 → result.outcome=observed
 *     → duplicate execute → POST 1회만(idempotent)
 *     → 모든 단계에서 raw token/header/body가 응답이나 상태에 안 새는지 확인
 *
 * 그리고 negative cases도 한 묶음으로 — token/allowlist/repo/secret/sha/auth/
 * stale armed/future armed/permission_denied/no-plan — 각 사유를 정직하게 구분.
 *
 * 실제 GitHub에는 절대 게시하지 않는다(주입된 client만 사용).
 */

import { describe, expect, it, vi } from "vitest";
import type { IncomingMessage } from "node:http";
import { handleGithubRoute } from "./github";
import {
  GithubReadonlyError,
  githubConnectorStatus,
  type GithubReadonlyClient,
} from "../integrations/githubReadonlyClient";
import { createGithubCommentWritePlanStore } from "../integrations/githubCommentWritePlanStore";

// 가짜 토큰 (실제 GH PAT 아님 — 응답에 안 새는지 grep으로 확인하는 용도). 실제 토큰 패턴(ghp_*)을
// 의도적으로 피해 시크릿 스캐너가 false positive로 안 잡게 한다.
const SECRET_TOKEN = "FAKE-TOKEN-DO-NOT-LEAK-w1c-smoke-only";
const REPO = "robin/lab";
const ALLOWLIST = [REPO];

function clientStub(
  over: Partial<GithubReadonlyClient> & { token?: string } = {},
): GithubReadonlyClient {
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
        number: 7, title: "feat", state: "open", author: "robin", draft: false,
        htmlUrl: `https://github.com/${REPO}/pull/7`, createdAt: "c", updatedAt: "u",
        body: "PR 본문", baseRef: "main", headRef: "feat", merged: false,
        additions: 1, deletions: 1, changedFiles: 1, commits: 1,
      })),
    getFileContent: over.getFileContent ?? (async () => ({ path: "x", size: 0, sha: "s", htmlUrl: "u", content: "", truncated: false, encoding: "utf8" })),
    listIssues: over.listIssues ?? (async () => []),
    postIssueComment: over.postIssueComment ?? (async () => ({ id: 999, htmlUrl: `https://github.com/${REPO}/pull/7#issuecomment-999` })),
    getRefSha: over.getRefSha ?? (async () => "stub-sha"),
    createBranchRef:
      over.createBranchRef ?? (async (_o, _r, ref, sha) => ({ ref, sha, htmlUrl: `https://github.com/${REPO}/tree/stub` })),
    putFileContents:
      over.putFileContents ??
      (async () => ({ commitSha: "stub-commit", blobSha: "stub-blob", htmlUrl: "u" })),
    compareBranches:
      over.compareBranches ??
      (async () => ({ aheadBy: 1, behindBy: 0, totalCommits: 1, changedFiles: 1, files: [{ filename: "x", status: "modified", additions: 1, deletions: 0 }] })),
  };
}

const stubRequest = {} as IncomingMessage;

function capture() {
  const calls: Array<{ status: number; payload: any }> = [];
  return { calls, respondJson: (status: number, payload: unknown) => calls.push({ status, payload }) };
}

function isoFromMsAgo(ms: number, ref = "2026-06-14T12:00:00.000Z"): string {
  return new Date(Date.parse(ref) - ms).toISOString();
}

describe("W1c smoke — GitHub comment write full path (mock GitHub)", () => {
  it("✓ 정상 경로: plan(POST 0) → armed → execute(201) → observed → duplicate idempotent", async () => {
    const planStore = createGithubCommentWritePlanStore();
    const postIssueComment = vi.fn(async () => ({ id: 7777, htmlUrl: `https://github.com/${REPO}/pull/7#issuecomment-7777` }));
    const getPullRequest = vi.fn(clientStub({ token: SECRET_TOKEN }).getPullRequest);
    const NOW_REF = "2026-06-14T12:00:00.000Z";
    const NOW = () => NOW_REF;
    const baseDeps = {
      createClient: () => clientStub({ token: SECRET_TOKEN, postIssueComment, getPullRequest }),
      now: NOW, request: stubRequest, planStore,
      writeRepoAllowlist: ALLOWLIST, verifyApproval: async () => false,
    };

    // ── 1) plan — GitHub에 댓글을 게시하지 않고 target 존재만 확인 ──
    const planCap = capture();
    await handleGithubRoute({
      pathname: "/integrations/github/write/comment/plan", method: "POST",
      respondJson: planCap.respondJson,
      readJsonBody: async () => ({
        repoFullName: REPO, number: 7, targetKind: "pull_request",
        body: "이 PR 의도 잘 봤어요. 머지 OK!",
      }),
      ...baseDeps,
    });
    expect(postIssueComment).not.toHaveBeenCalled();
    const planPayload = planCap.calls[0]!.payload;
    expect(planPayload.outcome).toBe("planned");
    expect(planPayload.plan.truthStatus).toBe("planned");
    expect(planPayload.plan.status).toBe("approval_required");
    // plan은 target 존재 확인 GET 한 번만(읽기 전용)
    expect(getPullRequest).toHaveBeenCalledTimes(1);
    // 응답에 토큰이 새지 않는지(전 단계 공통 단언)
    expect(JSON.stringify(planPayload)).not.toContain(SECRET_TOKEN);

    // ── 2) armed warning은 사용자 측에서 confirm — 서버 입장에선 클라가 보낸
    //       autoExecuteArmed+armedAt 표식을 30분 윈도우/plan TTL 안에서만 신뢰 ──
    const armedAt = NOW_REF; // 막 confirm한 직후 시각
    const planId = planPayload.plan.id as string;
    const bodySha256 = planPayload.plan.bodySha256 as string;

    // ── 3) execute — mock GitHub 201 → observed ──
    const execCap = capture();
    await handleGithubRoute({
      pathname: "/integrations/github/write/comment/execute", method: "POST",
      respondJson: execCap.respondJson,
      readJsonBody: async () => ({ planId, bodySha256, autoExecuteArmed: true, armedAt }),
      ...baseDeps,
    });
    const exec1 = execCap.calls[0]!.payload;
    expect(exec1.outcome).toBe("observed");
    expect(exec1.truthStatus).toBe("observed");
    expect(exec1.commentId).toBe(7777);
    expect(exec1.htmlUrl).toContain("issuecomment-7777");
    expect(postIssueComment).toHaveBeenCalledTimes(1);
    // 서버가 게시한 본문은 클라이언트의 execute payload가 아니라 server-stored record.body여야 함
    const postCall = postIssueComment.mock.calls[0] as unknown as [string, string, number, string];
    expect(postCall[3]).toBe("이 PR 의도 잘 봤어요. 머지 OK!");
    expect(JSON.stringify(exec1)).not.toContain(SECRET_TOKEN);

    // ── 4) duplicate execute — POST 1회만(idempotent observedCache) ──
    const dupCap = capture();
    await handleGithubRoute({
      pathname: "/integrations/github/write/comment/execute", method: "POST",
      respondJson: dupCap.respondJson,
      readJsonBody: async () => ({ planId, bodySha256, autoExecuteArmed: true, armedAt }),
      ...baseDeps,
    });
    const dup = dupCap.calls[0]!.payload;
    expect(dup.outcome).toBe("observed");
    expect(dup.commentId).toBe(7777); // 동일 결과 그대로
    expect(postIssueComment).toHaveBeenCalledTimes(1); // GitHub POST는 단 한 번
  });

  // ── 모든 부정 경로를 한 묶음으로 — 각각이 distinct outcome으로 구분돼야 함 ──
  it("✗ token 없음 → not_configured (GitHub 호출 0)", async () => {
    const planStore = createGithubCommentWritePlanStore();
    const postIssueComment = vi.fn();
    const cap = capture();
    await handleGithubRoute({
      pathname: "/integrations/github/write/comment/plan", method: "POST",
      createClient: () => clientStub({ token: undefined, postIssueComment }),
      respondJson: cap.respondJson, now: () => "2026-06-14T00:00:00.000Z",
      request: stubRequest, planStore, writeRepoAllowlist: ALLOWLIST,
      verifyApproval: async () => false,
      readJsonBody: async () => ({ repoFullName: REPO, number: 7, targetKind: "pull_request", body: "hi" }),
    });
    expect(cap.calls[0]!.payload.outcome).toBe("not_configured");
    expect(postIssueComment).not.toHaveBeenCalled();
  });

  it("✗ allowlist 빈/repo 미일치 → blocked", async () => {
    const planStore = createGithubCommentWritePlanStore();
    const cap1 = capture();
    await handleGithubRoute({
      pathname: "/integrations/github/write/comment/plan", method: "POST",
      createClient: () => clientStub({ token: SECRET_TOKEN }),
      respondJson: cap1.respondJson, now: () => "2026-06-14T00:00:00.000Z",
      request: stubRequest, planStore, writeRepoAllowlist: [], verifyApproval: async () => false,
      readJsonBody: async () => ({ repoFullName: REPO, number: 7, targetKind: "pull_request", body: "hi" }),
    });
    expect(cap1.calls[0]!.payload.outcome).toBe("blocked");

    const cap2 = capture();
    await handleGithubRoute({
      pathname: "/integrations/github/write/comment/plan", method: "POST",
      createClient: () => clientStub({ token: SECRET_TOKEN }),
      respondJson: cap2.respondJson, now: () => "2026-06-14T00:00:00.000Z",
      request: stubRequest, planStore, writeRepoAllowlist: ALLOWLIST, verifyApproval: async () => false,
      readJsonBody: async () => ({ repoFullName: "evil/repo", number: 7, targetKind: "pull_request", body: "hi" }),
    });
    expect(cap2.calls[0]!.payload.outcome).toBe("blocked");
  });

  it("✗ secret-like body → plan blocked(외부 GitHub 누출 차단)", async () => {
    const cap = capture();
    await handleGithubRoute({
      pathname: "/integrations/github/write/comment/plan", method: "POST",
      createClient: () => clientStub({ token: SECRET_TOKEN }),
      respondJson: cap.respondJson, now: () => "2026-06-14T00:00:00.000Z",
      request: stubRequest, planStore: createGithubCommentWritePlanStore(),
      writeRepoAllowlist: ALLOWLIST, verifyApproval: async () => false,
      readJsonBody: async () => ({
        repoFullName: REPO, number: 7, targetKind: "pull_request",
        body: "디버그용 토큰 ghp_1234567890abcdefghijabcdef 붙임",
      }),
    });
    expect(cap.calls[0]!.payload.outcome).toBe("blocked");
    expect(cap.calls[0]!.payload.message).toContain("비밀 패턴");
  });

  it("✗ bodySha mismatch → execute blocked(replay 변조 차단)", async () => {
    const planStore = createGithubCommentWritePlanStore();
    const postIssueComment = vi.fn();
    const NOW = () => "2026-06-14T12:00:00.000Z";
    const baseDeps = {
      createClient: () => clientStub({ token: SECRET_TOKEN, postIssueComment }),
      now: NOW, request: stubRequest, planStore,
      writeRepoAllowlist: ALLOWLIST, verifyApproval: async () => true, // 승인 있어도 sha 안 맞으면 차단
    };
    const planCap = capture();
    await handleGithubRoute({
      pathname: "/integrations/github/write/comment/plan", method: "POST",
      respondJson: planCap.respondJson,
      readJsonBody: async () => ({ repoFullName: REPO, number: 7, targetKind: "pull_request", body: "정상" }),
      ...baseDeps,
    });
    const planId = planCap.calls[0]!.payload.plan.id;

    const execCap = capture();
    await handleGithubRoute({
      pathname: "/integrations/github/write/comment/execute", method: "POST",
      respondJson: execCap.respondJson,
      readJsonBody: async () => ({ planId, bodySha256: "deadbeef", approvalId: "appr_1" }),
      ...baseDeps,
    });
    expect(execCap.calls[0]!.payload.outcome).toBe("blocked");
    expect(execCap.calls[0]!.payload.message).toContain("bodySha256");
    expect(postIssueComment).not.toHaveBeenCalled();
  });

  it("✗ approval도 armed도 없으면 execute blocked", async () => {
    const planStore = createGithubCommentWritePlanStore();
    const postIssueComment = vi.fn();
    const NOW = () => "2026-06-14T12:00:00.000Z";
    const baseDeps = {
      createClient: () => clientStub({ token: SECRET_TOKEN, postIssueComment }),
      now: NOW, request: stubRequest, planStore,
      writeRepoAllowlist: ALLOWLIST, verifyApproval: async () => false,
    };
    const planCap = capture();
    await handleGithubRoute({
      pathname: "/integrations/github/write/comment/plan", method: "POST",
      respondJson: planCap.respondJson,
      readJsonBody: async () => ({ repoFullName: REPO, number: 7, targetKind: "pull_request", body: "hi" }),
      ...baseDeps,
    });
    const plan = planCap.calls[0]!.payload.plan;

    const execCap = capture();
    await handleGithubRoute({
      pathname: "/integrations/github/write/comment/execute", method: "POST",
      respondJson: execCap.respondJson,
      readJsonBody: async () => ({ planId: plan.id, bodySha256: plan.bodySha256 }),
      ...baseDeps,
    });
    expect(execCap.calls[0]!.payload.outcome).toBe("blocked");
    expect(postIssueComment).not.toHaveBeenCalled();
  });

  it("✗ stale armedAt(5시간 전) → blocked, 미래 armedAt → blocked", async () => {
    const planStore = createGithubCommentWritePlanStore();
    const postIssueComment = vi.fn();
    const NOW_REF = "2026-06-14T12:00:00.000Z";
    const baseDeps = {
      createClient: () => clientStub({ token: SECRET_TOKEN, postIssueComment }),
      now: () => NOW_REF, request: stubRequest, planStore,
      writeRepoAllowlist: ALLOWLIST, verifyApproval: async () => false,
    };
    const planCap = capture();
    await handleGithubRoute({
      pathname: "/integrations/github/write/comment/plan", method: "POST",
      respondJson: planCap.respondJson,
      readJsonBody: async () => ({ repoFullName: REPO, number: 7, targetKind: "pull_request", body: "hi" }),
      ...baseDeps,
    });
    const plan = planCap.calls[0]!.payload.plan;

    const staleCap = capture();
    await handleGithubRoute({
      pathname: "/integrations/github/write/comment/execute", method: "POST",
      respondJson: staleCap.respondJson,
      readJsonBody: async () => ({
        planId: plan.id, bodySha256: plan.bodySha256, autoExecuteArmed: true,
        armedAt: isoFromMsAgo(5 * 60 * 60 * 1000), // 5시간 전
      }),
      ...baseDeps,
    });
    expect(staleCap.calls[0]!.payload.outcome).toBe("blocked");

    const futureCap = capture();
    await handleGithubRoute({
      pathname: "/integrations/github/write/comment/execute", method: "POST",
      respondJson: futureCap.respondJson,
      readJsonBody: async () => ({
        planId: plan.id, bodySha256: plan.bodySha256, autoExecuteArmed: true,
        armedAt: "2027-01-01T00:00:00.000Z",
      }),
      ...baseDeps,
    });
    expect(futureCap.calls[0]!.payload.outcome).toBe("blocked");
    expect(postIssueComment).not.toHaveBeenCalled();
  });

  it("✗ GitHub 403 → permission_denied(write 권한 미추정)", async () => {
    const planStore = createGithubCommentWritePlanStore();
    const NOW = () => "2026-06-14T12:00:00.000Z";
    const planCap = capture();
    await handleGithubRoute({
      pathname: "/integrations/github/write/comment/plan", method: "POST",
      respondJson: planCap.respondJson, now: NOW, request: stubRequest, planStore,
      createClient: () => clientStub({ token: SECRET_TOKEN }),
      writeRepoAllowlist: ALLOWLIST, verifyApproval: async () => true,
      readJsonBody: async () => ({ repoFullName: REPO, number: 7, targetKind: "pull_request", body: "ok" }),
    });
    const plan = planCap.calls[0]!.payload.plan;

    // execute에서 GitHub가 403을 던지는 클라이언트
    const denyingClient = (): GithubReadonlyClient =>
      clientStub({
        token: SECRET_TOKEN,
        postIssueComment: async () => {
          throw new GithubReadonlyError(`Forbidden — token has no comment scope: ${SECRET_TOKEN}`, 403);
        },
      });
    const execCap = capture();
    await handleGithubRoute({
      pathname: "/integrations/github/write/comment/execute", method: "POST",
      respondJson: execCap.respondJson, now: NOW, request: stubRequest, planStore,
      createClient: denyingClient,
      writeRepoAllowlist: ALLOWLIST, verifyApproval: async () => true,
      readJsonBody: async () => ({ planId: plan.id, bodySha256: plan.bodySha256, approvalId: "appr_1" }),
    });
    const payload = execCap.calls[0]!.payload;
    expect(payload.outcome).toBe("permission_denied");
    expect(payload.truthStatus).toBe("planned"); // 시도했지만 게시 실패 → 여전히 planned
    // 토큰이 응답에 새지 않는지(client의 scrub이 작동해야 함)
    expect(JSON.stringify(payload)).not.toContain(SECRET_TOKEN);
  });

  it("✗ plan 없는 planId → execute blocked(없는 plan 차단)", async () => {
    const cap = capture();
    await handleGithubRoute({
      pathname: "/integrations/github/write/comment/execute", method: "POST",
      respondJson: cap.respondJson, now: () => "2026-06-14T00:00:00.000Z",
      request: stubRequest, planStore: createGithubCommentWritePlanStore(),
      createClient: () => clientStub({ token: SECRET_TOKEN }),
      writeRepoAllowlist: ALLOWLIST, verifyApproval: async () => true,
      readJsonBody: async () => ({
        planId: "gcwp_nope", bodySha256: "x", autoExecuteArmed: true, armedAt: "2026-06-14T00:00:00.000Z",
      }),
    });
    expect(cap.calls[0]!.payload.outcome).toBe("blocked");
  });
});
