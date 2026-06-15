import { describe, expect, it, vi } from "vitest";
import type { IncomingMessage } from "node:http";
import type { GithubReadonlyClient } from "../integrations/githubReadonlyClient";
import { GithubReadonlyError, githubConnectorStatus } from "../integrations/githubReadonlyClient";
import { handleGithubRoute } from "./github";
import { createGithubPullRequestCreatePlanStore } from "../integrations/githubPullRequestCreatePlanStore";

/**
 * W4b smoke — PR create execute end-to-end 1개 통합 시나리오.
 *
 *  1) plan → planned + base/head sha 캡처, createPullRequest 0
 *  2) execute(approval ok + sha 일치 + base/head 안 변함 + compare 유효)
 *     → observed + pullNumber/htmlUrl, createPullRequest 1회
 *  3) duplicate execute → observed 동일, createPullRequest 추가 호출 없음
 *  4) 모든 응답 payload에 token fragment 없음
 *
 * 세부 negative 분기는 githubPullRequestCreateExecute.test.ts에 있음.
 */

const ALLOW = ["robin/lab"];
const BASE_ALLOW = ["main", "develop"];
const REPO = "robin/lab";
const TOKEN = "ghp_FAKE_w4b_smoke_TOKEN_DO_NOT_LEAK";
const NOW_REF = "2026-06-14T12:00:00.000Z";
const NOW = () => NOW_REF;
const stubRequest = {} as IncomingMessage;
const BASE_SHA = "SMOKE_BASE_SHA";
const HEAD_SHA = "SMOKE_HEAD_SHA";

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
        aheadBy: 3, behindBy: 0, totalCommits: 3, changedFiles: 2,
        files: [
          { filename: "src/foo.ts", status: "modified", additions: 5, deletions: 1 },
          { filename: "src/bar.ts", status: "added", additions: 12, deletions: 0 },
        ],
      })),
    createPullRequest:
      over.createPullRequest ??
      (async () => ({ pullNumber: 1, htmlUrl: "u", headSha: HEAD_SHA })),
  };
}

function capture() {
  const calls: Array<{ status: number; payload: any }> = [];
  return { calls, respondJson: (status: number, payload: unknown) => calls.push({ status, payload }) };
}

describe("W4b smoke — PR create execute end-to-end (mock GitHub)", () => {
  it("✓ plan → approval execute → observed → duplicate idempotent, mutation 1회, token leak 없음", async () => {
    const prPlanStore = createGithubPullRequestCreatePlanStore({ nowMs: () => Date.parse(NOW_REF) });
    const createPullRequest = vi.fn(async () => ({
      pullNumber: 4242,
      htmlUrl: `https://github.com/${REPO}/pull/4242`,
      headSha: HEAD_SHA,
    }));
    const baseDeps = {
      createClient: () => clientStub({ token: TOKEN, createPullRequest }),
      now: NOW, request: stubRequest, prPlanStore,
      writeRepoAllowlist: ALLOW, prBaseAllowlist: BASE_ALLOW,
      verifyApproval: async () => true,
    };

    // 1) plan
    const planCap = capture();
    await handleGithubRoute({
      pathname: "/integrations/github/write/pr/plan",
      method: "POST",
      respondJson: planCap.respondJson,
      readJsonBody: async () => ({
        repoFullName: REPO,
        baseBranch: "main",
        headBranch: "agent/feature-x",
        title: "Add W4 PR write surface",
        body: "End-to-end smoke for W4b execute.",
      }),
      ...baseDeps,
    });
    const plan = planCap.calls[0]!.payload.plan;
    expect(planCap.calls[0]!.payload.outcome).toBe("planned");
    expect(plan.baseSha).toBe(BASE_SHA);
    expect(plan.headSha).toBe(HEAD_SHA);
    expect(createPullRequest).not.toHaveBeenCalled(); // plan에서는 POST 절대 없음

    // 2) execute
    const execCap = capture();
    await handleGithubRoute({
      pathname: "/integrations/github/write/pr/execute",
      method: "POST",
      respondJson: execCap.respondJson,
      readJsonBody: async () => ({
        planId: plan.id,
        titleSha256: plan.titleSha256,
        bodySha256: plan.bodySha256,
        approvalId: "appr_OK",
      }),
      ...baseDeps,
    });
    const exec = execCap.calls[0]!.payload;
    expect(exec.outcome).toBe("observed");
    expect(exec.truthStatus).toBe("observed");
    expect(exec.pullNumber).toBe(4242);
    expect(exec.htmlUrl).toContain(`${REPO}/pull/4242`);
    expect(exec.headSha).toBe(HEAD_SHA);
    expect(createPullRequest).toHaveBeenCalledTimes(1);
    // same-repo only — head는 단순 branch 이름.
    const call = createPullRequest.mock.calls[0] as unknown as [string, string, { title: string; base: string; head: string }];
    expect(call[2].title).toBe("Add W4 PR write surface");
    expect(call[2].base).toBe("main");
    expect(call[2].head).toBe("agent/feature-x");

    // 3) duplicate execute — observedCache로 응답, POST 추가 없음.
    const dupCap = capture();
    await handleGithubRoute({
      pathname: "/integrations/github/write/pr/execute",
      method: "POST",
      respondJson: dupCap.respondJson,
      readJsonBody: async () => ({
        planId: plan.id,
        titleSha256: plan.titleSha256,
        bodySha256: plan.bodySha256,
        approvalId: "appr_OK",
      }),
      ...baseDeps,
    });
    expect(dupCap.calls[0]!.payload.outcome).toBe("observed");
    expect(dupCap.calls[0]!.payload.pullNumber).toBe(4242);
    expect(createPullRequest).toHaveBeenCalledTimes(1); // 핵심: POST 단 한 번

    // 4) 응답 payload에 토큰 fragment 없음.
    for (const c of [...planCap.calls, ...execCap.calls, ...dupCap.calls]) {
      expect(JSON.stringify(c.payload)).not.toContain(TOKEN);
    }
  });
});
