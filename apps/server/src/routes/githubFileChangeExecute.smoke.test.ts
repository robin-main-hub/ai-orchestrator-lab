import { describe, expect, it, vi } from "vitest";
import type { IncomingMessage } from "node:http";
import type { GithubReadonlyClient } from "../integrations/githubReadonlyClient";
import { GithubReadonlyError, githubConnectorStatus } from "../integrations/githubReadonlyClient";
import { handleGithubRoute } from "./github";
import { createGithubFileChangePlanStore } from "../integrations/githubFileChangePlanStore";

/**
 * W3b smoke — file change execute end-to-end 1개 통합 시나리오:
 *   1) plan (update) → planned, putFileContents 0
 *   2) execute(approval) → observed + commitSha, putFileContents 1회
 *   3) duplicate execute → observed 동일, putFileContents 추가 호출 없음
 *   4) 응답 payload에 token fragment 없음
 *
 * negative 분기는 githubFileChangeExecute.test.ts에 있음 — smoke는 짧게.
 */

const ALLOW = ["robin/lab"];
const REPO = "robin/lab";
const TOKEN = "ghp_FAKE_w3b_smoke_TOKEN_DO_NOT_LEAK";
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
  };
}

function capture() {
  const calls: Array<{ status: number; payload: any }> = [];
  return { calls, respondJson: (status: number, payload: unknown) => calls.push({ status, payload }) };
}

describe("W3b smoke — file change execute end-to-end (mock GitHub)", () => {
  it("✓ plan(update) → approval execute → observed → duplicate idempotent, token leak 없음", async () => {
    const fileChangePlanStore = createGithubFileChangePlanStore();
    const BASE_CONTENT = "export const v = 1;\n";
    const NEW_CONTENT = "export const v = 2;\n";
    const BASE_SHA = "SMOKE_BASE_SHA";

    // base file은 plan 시점·execute 시점 둘 다 동일 sha 반환(force-push 없음).
    const getFileContent = vi.fn(async () => ({
      path: "src/util.ts", size: BASE_CONTENT.length, sha: BASE_SHA, htmlUrl: "u",
      content: BASE_CONTENT, truncated: false, encoding: "utf8" as const,
    }));
    const putFileContents = vi.fn(async () => ({
      commitSha: "SMOKE_COMMIT_SHA",
      blobSha: "SMOKE_BLOB_SHA",
      htmlUrl: `https://github.com/${REPO}/blob/agent/refactor-x/src/util.ts`,
    }));

    const baseDeps = {
      createClient: () => clientStub({ token: TOKEN, getFileContent, putFileContents }),
      now: NOW, request: stubRequest, fileChangePlanStore,
      writeRepoAllowlist: ALLOW, verifyApproval: async () => true,
    };

    // 1) plan
    const planCap = capture();
    await handleGithubRoute({
      pathname: "/integrations/github/write/file/plan",
      method: "POST",
      respondJson: planCap.respondJson,
      readJsonBody: async () => ({
        repoFullName: REPO,
        branchName: "agent/refactor-x",
        path: "src/util.ts",
        newContent: NEW_CONTENT,
        baseFileSha: BASE_SHA,
      }),
      ...baseDeps,
    });
    expect(planCap.calls[0]!.payload.outcome).toBe("planned");
    expect(putFileContents).not.toHaveBeenCalled(); // plan에서는 PUT 절대 없음
    const plan = planCap.calls[0]!.payload.plan;
    expect(plan.operation).toBe("update");
    expect(plan.baseFileSha).toBe(BASE_SHA);

    // 2) execute
    const execCap = capture();
    await handleGithubRoute({
      pathname: "/integrations/github/write/file/execute",
      method: "POST",
      respondJson: execCap.respondJson,
      readJsonBody: async () => ({
        planId: plan.id,
        newContentSha256: plan.newContentSha256,
        baseFileSha: BASE_SHA,
        approvalId: "appr_OK",
      }),
      ...baseDeps,
    });
    const execPayload = execCap.calls[0]!.payload;
    expect(execPayload.outcome).toBe("observed");
    expect(execPayload.truthStatus).toBe("observed");
    expect(execPayload.commitSha).toBe("SMOKE_COMMIT_SHA");
    expect(execPayload.blobSha).toBe("SMOKE_BLOB_SHA");
    expect(execPayload.htmlUrl).toContain(`${REPO}/blob/agent/refactor-x/src/util.ts`);
    expect(putFileContents).toHaveBeenCalledTimes(1);
    // 서버가 결정한 commit message — 사용자 자유 입력 차단의 표식.
    const putCall = putFileContents.mock.calls[0] as unknown as [string, string, string, { message: string }];
    expect(putCall[3].message).toContain("Apply planned file change (update)");
    expect(putCall[3].message).toContain("src/util.ts");

    // 3) duplicate execute — 동일 결과, putFileContents 추가 호출 없음.
    const dupCap = capture();
    await handleGithubRoute({
      pathname: "/integrations/github/write/file/execute",
      method: "POST",
      respondJson: dupCap.respondJson,
      readJsonBody: async () => ({
        planId: plan.id,
        newContentSha256: plan.newContentSha256,
        baseFileSha: BASE_SHA,
        approvalId: "appr_OK",
      }),
      ...baseDeps,
    });
    expect(dupCap.calls[0]!.payload.outcome).toBe("observed");
    expect(dupCap.calls[0]!.payload.commitSha).toBe("SMOKE_COMMIT_SHA");
    expect(putFileContents).toHaveBeenCalledTimes(1); // GitHub PUT은 단 한 번

    // 4) 모든 응답에 token fragment 없음.
    for (const c of [...planCap.calls, ...execCap.calls, ...dupCap.calls]) {
      expect(JSON.stringify(c.payload)).not.toContain(TOKEN);
    }
  });
});
