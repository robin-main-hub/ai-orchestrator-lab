import { describe, expect, it, vi } from "vitest";
import type { IncomingMessage } from "node:http";
import type { GithubReadonlyClient } from "../integrations/githubReadonlyClient";
import { GithubReadonlyError, githubConnectorStatus } from "../integrations/githubReadonlyClient";
import { handleGithubRoute } from "./github";
import { createGithubBranchCreatePlanStore } from "../integrations/githubBranchCreatePlanStore";

/**
 * W2 smoke — branch create 1개 통합 시나리오로 end-to-end 경로를 닫는다.
 *
 * 시나리오 트리:
 *   1) plan → planned + sourceSha observed + createBranchRef POST 0
 *   2) execute(approvalId 없음) → blocked, createBranchRef POST 0
 *   3) execute(approval ok + sourceSha mismatch) → blocked, createBranchRef POST 0
 *   4) execute(approval ok + sha 일치) → observed + createBranchRef POST 1회
 *   5) 같은 plan 두 번째 execute → 동일 observed(멱등) + POST 추가 없음
 *   6) 별도 plan: invalid branch name → blocked, GitHub GET/POST 0
 *   7) 별도 plan에서 target이 이미 있으면 → already_exists, POST 0
 *   8) 모든 응답 payload에 token fragment 없음
 *
 * 가능한 한 짧게 — adversarial 분기는 route test에서 이미 커버된다.
 */

const ALLOW = ["robin/lab"];
const REPO = "robin/lab";
const TOKEN = "ghp_FAKE_w2_smoke_TOKEN_DO_NOT_LEAK";
const NOW_REF = "2026-06-14T12:00:00.000Z";
const NOW = () => NOW_REF;
const stubRequest = {} as IncomingMessage;
const SOURCE_SHA = "src-sha-abc123";
const RESULT_SHA = "branch-sha-result";

function stubClient(over: Partial<GithubReadonlyClient> & { token?: string } = {}): GithubReadonlyClient {
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
    getFileContent:
      over.getFileContent ??
      (async () => ({ path: "x", size: 0, sha: "s", htmlUrl: "u", content: "", truncated: false, encoding: "utf8" })),
    listIssues: over.listIssues ?? (async () => []),
    postIssueComment: over.postIssueComment ?? (async () => ({ id: 1, htmlUrl: "u" })),
    getRefSha: over.getRefSha ?? (async () => SOURCE_SHA),
    createBranchRef:
      over.createBranchRef ??
      (async (_o, _r, ref, sha) => ({ ref, sha, htmlUrl: `https://github.com/${REPO}/tree/stub` })),
    putFileContents:
      over.putFileContents ??
      (async () => ({ commitSha: "stub-commit", blobSha: "stub-blob", htmlUrl: "u" })),
    compareBranches:
      over.compareBranches ??
      (async () => ({ aheadBy: 1, behindBy: 0, totalCommits: 1, changedFiles: 1, files: [{ filename: "x", status: "modified", additions: 1, deletions: 0 }] })),
  };
}

function capture() {
  const calls: Array<{ status: number; payload: any }> = [];
  return { calls, respondJson: (status: number, payload: unknown) => calls.push({ status, payload }) };
}

describe("W2 smoke — branch create end-to-end (mock GitHub)", () => {
  it("✓ 정상 경로: plan → approval execute → observed → duplicate idempotent, 부정 분기 한꺼번에", async () => {
    const branchPlanStore = createGithubBranchCreatePlanStore();
    const createBranchRef = vi.fn(async () => ({
      ref: "refs/heads/agent/feature-x",
      sha: RESULT_SHA,
      htmlUrl: `https://github.com/${REPO}/tree/agent/feature-x`,
    }));
    // plan: 1 source GET → SOURCE_SHA, 2 target GET → 404(없음)
    // execute: 3 source 재GET → SOURCE_SHA, 4 target 재GET → 404
    // duplicate execute는 observedCache로 막혀서 getRefSha를 호출하지 않음.
    let n = 0;
    const getRefSha = vi.fn(async () => {
      n += 1;
      if (n === 1) return SOURCE_SHA;
      if (n === 2) throw new GithubReadonlyError("not found", 404);
      if (n === 3) return SOURCE_SHA;
      if (n === 4) throw new GithubReadonlyError("not found", 404);
      throw new Error(`unexpected getRefSha call #${n}`);
    });
    const baseDeps = {
      createClient: () => stubClient({ token: TOKEN, getRefSha, createBranchRef }),
      now: NOW, request: stubRequest, branchPlanStore,
      writeRepoAllowlist: ALLOW, verifyApproval: async () => true,
    };

    // 1) plan
    const planCap = capture();
    await handleGithubRoute({
      pathname: "/integrations/github/write/branch/plan",
      method: "POST",
      respondJson: planCap.respondJson,
      readJsonBody: async () => ({ repoFullName: REPO, sourceRef: "main", newBranchName: "agent/feature-x" }),
      ...baseDeps,
    });
    const planPayload = planCap.calls[0]!.payload;
    expect(planPayload.outcome).toBe("planned");
    expect(planPayload.plan.truthStatus).toBe("planned");
    expect(planPayload.plan.sourceSha).toBe(SOURCE_SHA);
    expect(planPayload.plan.newRef).toBe("refs/heads/agent/feature-x");
    expect(createBranchRef).not.toHaveBeenCalled(); // 분기 #1: plan에서 POST 절대 없음

    // 2) execute without approvalId → schema requires approvalId so 이건 400(blocked)
    const noApprCap = capture();
    await handleGithubRoute({
      pathname: "/integrations/github/write/branch/execute",
      method: "POST",
      respondJson: noApprCap.respondJson,
      readJsonBody: async () => ({ planId: planPayload.plan.id, sourceSha: SOURCE_SHA }),
      ...baseDeps,
    });
    expect(noApprCap.calls[0]!.payload.outcome).toBe("blocked");
    expect(createBranchRef).not.toHaveBeenCalled(); // 분기 #2: approval 없으면 POST 없음

    // 3) execute with mismatched sourceSha → blocked
    const mismatchCap = capture();
    await handleGithubRoute({
      pathname: "/integrations/github/write/branch/execute",
      method: "POST",
      respondJson: mismatchCap.respondJson,
      readJsonBody: async () => ({ planId: planPayload.plan.id, sourceSha: "TAMPERED-SHA", approvalId: "appr_OK" }),
      ...baseDeps,
    });
    expect(mismatchCap.calls[0]!.payload.outcome).toBe("blocked");
    expect(mismatchCap.calls[0]!.payload.message).toContain("sourceSha");
    expect(createBranchRef).not.toHaveBeenCalled(); // 분기 #3

    // 4) execute with approval + sha 일치 → observed
    const okCap = capture();
    await handleGithubRoute({
      pathname: "/integrations/github/write/branch/execute",
      method: "POST",
      respondJson: okCap.respondJson,
      readJsonBody: async () => ({ planId: planPayload.plan.id, sourceSha: SOURCE_SHA, approvalId: "appr_OK" }),
      ...baseDeps,
    });
    const okPayload = okCap.calls[0]!.payload;
    expect(okPayload.outcome).toBe("observed");
    expect(okPayload.truthStatus).toBe("observed");
    expect(okPayload.ref).toBe("refs/heads/agent/feature-x");
    expect(okPayload.sha).toBe(RESULT_SHA);
    expect(createBranchRef).toHaveBeenCalledTimes(1); // 분기 #4: 단 1회 POST

    // 5) duplicate execute — 같은 plan 다시 호출해도 observedCache가 응답, POST 추가 없음.
    const dupCap = capture();
    await handleGithubRoute({
      pathname: "/integrations/github/write/branch/execute",
      method: "POST",
      respondJson: dupCap.respondJson,
      readJsonBody: async () => ({ planId: planPayload.plan.id, sourceSha: SOURCE_SHA, approvalId: "appr_OK" }),
      ...baseDeps,
    });
    expect(dupCap.calls[0]!.payload.outcome).toBe("observed");
    expect(dupCap.calls[0]!.payload.sha).toBe(RESULT_SHA);
    expect(createBranchRef).toHaveBeenCalledTimes(1); // 분기 #5: 멱등

    // 8) 어떤 응답 payload에도 토큰 fragment가 들어가지 않는다.
    for (const c of [...planCap.calls, ...noApprCap.calls, ...mismatchCap.calls, ...okCap.calls, ...dupCap.calls]) {
      expect(JSON.stringify(c.payload)).not.toContain(TOKEN);
    }
  });

  it("✗ invalid branch name(보호 브랜치/금지 prefix/unsafe chars) → blocked, GitHub GET/POST 0", async () => {
    const createBranchRef = vi.fn();
    const getRefSha = vi.fn();
    const baseDeps = {
      createClient: () => stubClient({ token: TOKEN, getRefSha, createBranchRef }),
      now: NOW, request: stubRequest, branchPlanStore: createGithubBranchCreatePlanStore(),
      writeRepoAllowlist: ALLOW, verifyApproval: async () => true,
    };
    for (const bad of ["main", "develop", "release/x", "refs/heads/x", "random-feature", "agent/foo;rm -rf"]) {
      const cap = capture();
      await handleGithubRoute({
        pathname: "/integrations/github/write/branch/plan",
        method: "POST",
        respondJson: cap.respondJson,
        readJsonBody: async () => ({ repoFullName: REPO, sourceRef: "main", newBranchName: bad }),
        ...baseDeps,
      });
      expect(cap.calls[0]!.payload.outcome).toBe("blocked");
    }
    expect(getRefSha).not.toHaveBeenCalled();
    expect(createBranchRef).not.toHaveBeenCalled(); // 분기 #7 + #8
  });

  it("✗ target ref가 이미 있으면 plan에서 already_exists, createBranchRef POST 0", async () => {
    const createBranchRef = vi.fn();
    // 1차 source GET → sha, 2차 target GET → sha(이미 존재)
    const getRefSha = vi.fn(async () => SOURCE_SHA);
    const cap = capture();
    await handleGithubRoute({
      pathname: "/integrations/github/write/branch/plan",
      method: "POST",
      createClient: () => stubClient({ token: TOKEN, getRefSha, createBranchRef }),
      respondJson: cap.respondJson,
      now: NOW, request: stubRequest, branchPlanStore: createGithubBranchCreatePlanStore(),
      writeRepoAllowlist: ALLOW, verifyApproval: async () => true,
      readJsonBody: async () => ({ repoFullName: REPO, sourceRef: "main", newBranchName: "agent/feature-x" }),
    });
    expect(cap.calls[0]!.payload.outcome).toBe("already_exists");
    expect(createBranchRef).not.toHaveBeenCalled(); // 분기 #6
  });
});
