import { describe, expect, it, vi } from "vitest";
import type { IncomingMessage } from "node:http";
import type { GithubReadonlyClient } from "../integrations/githubReadonlyClient";
import { GithubReadonlyError, githubConnectorStatus } from "../integrations/githubReadonlyClient";
import { handleGithubRoute } from "./github";
import { createGithubFileChangePlanStore } from "../integrations/githubFileChangePlanStore";
import { contentSha256 } from "../integrations/githubFileChangeWriteGuards";
import type { GithubFileChangePlanStore } from "../integrations/githubFileChangePlanStore";

/**
 * W3b file change execute — 적대적 체크리스트:
 *   1) plan 없으면 blocked
 *   2) approval 없으면 blocked, putFileContents 0
 *   3) approval 거절이면 blocked, putFileContents 0
 *   4) newContentSha256 mismatch면 blocked, putFileContents 0
 *   5) (update) baseFileSha mismatch(client vs plan)면 blocked, putFileContents 0
 *   6) plan 이후 branch가 사라지면 blocked, putFileContents 0
 *   7) (update) plan 이후 file sha가 바뀌면 blocked(force-push 시뮬), putFileContents 0
 *   8) (create) plan 이후 파일이 생기면 already_exists, putFileContents 0
 *   9) 정상: update → putFileContents 1회 + observed commitSha 반환
 *  10) 정상: create → putFileContents 1회 + observed commitSha 반환
 *  11) duplicate execute → putFileContents 1회만(멱등)
 *  12) GitHub 409 → blocked(github_error로 안 흐름)
 *  13) GitHub 422 → blocked(같은 매핑)
 */

const ALLOW = ["robin/lab"];
const REPO = "robin/lab";
const TOKEN = "ghp_FAKE_w3b_test_TOKEN_DO_NOT_LEAK";
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
    getFileContent:
      over.getFileContent ??
      (async () => { throw new GithubReadonlyError("not found", 404); }),
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

/** plan 단계를 거쳐 진짜 plan record를 만들어 store에 넣는다(W3b execute 입력 준비). */
async function makePlan(opts: {
  operation: "create" | "update";
  baseContent?: string;
  newContent: string;
  baseFileSha?: string;
  branchName?: string;
  path?: string;
  store?: GithubFileChangePlanStore;
  putFileContents?: GithubReadonlyClient["putFileContents"];
}) {
  const store = opts.store ?? createGithubFileChangePlanStore();
  const branchName = opts.branchName ?? "agent/feature-x";
  const path = opts.path ?? "src/x.ts";
  const baseFileSha = opts.baseFileSha ?? "BASE_SHA";
  const getFileContent = opts.operation === "update"
    ? vi.fn(async () => ({
        path, size: opts.baseContent?.length ?? 0, sha: baseFileSha, htmlUrl: "u",
        content: opts.baseContent ?? "", truncated: false, encoding: "utf8" as const,
      }))
    : vi.fn(async () => { throw new GithubReadonlyError("not found", 404); });
  const planCap = capture();
  await handleGithubRoute({
    pathname: "/integrations/github/write/file/plan",
    method: "POST",
    createClient: () => clientStub({ token: TOKEN, getFileContent, putFileContents: opts.putFileContents }),
    respondJson: planCap.respondJson, now: NOW, request: stubRequest,
    readJsonBody: async () => ({
      repoFullName: REPO,
      branchName,
      path,
      newContent: opts.newContent,
      ...(opts.operation === "update" ? { baseFileSha } : {}),
    }),
    fileChangePlanStore: store,
    writeRepoAllowlist: ALLOW,
    verifyApproval: async () => true,
  });
  expect(planCap.calls[0]!.payload.outcome).toBe("planned");
  return { store, plan: planCap.calls[0]!.payload.plan };
}

async function execute(opts: {
  store: GithubFileChangePlanStore;
  planId: string;
  newContentSha256: string;
  baseFileSha?: string;
  approvalId?: string;
  verifyApproval?: (id: string) => Promise<boolean>;
  putFileContents?: GithubReadonlyClient["putFileContents"];
  getRefSha?: GithubReadonlyClient["getRefSha"];
  getFileContent?: GithubReadonlyClient["getFileContent"];
}) {
  const cap = capture();
  await handleGithubRoute({
    pathname: "/integrations/github/write/file/execute",
    method: "POST",
    createClient: () => clientStub({
      token: TOKEN,
      putFileContents: opts.putFileContents,
      getRefSha: opts.getRefSha,
      getFileContent: opts.getFileContent,
    }),
    respondJson: cap.respondJson, now: NOW, request: stubRequest,
    readJsonBody: async () => ({
      planId: opts.planId,
      newContentSha256: opts.newContentSha256,
      ...(opts.baseFileSha ? { baseFileSha: opts.baseFileSha } : {}),
      ...(opts.approvalId ? { approvalId: opts.approvalId } : {}),
    }),
    fileChangePlanStore: opts.store,
    writeRepoAllowlist: ALLOW,
    verifyApproval: opts.verifyApproval ?? (async () => true),
  });
  return cap.calls[0]!.payload;
}

describe("W3b file change execute — 적대적 체크리스트", () => {
  it("(#1) plan 없으면 blocked", async () => {
    const store = createGithubFileChangePlanStore();
    const putFileContents = vi.fn();
    const result = await execute({
      store,
      planId: "gfcp_nonexistent",
      newContentSha256: "sha",
      approvalId: "appr_OK",
      putFileContents,
    });
    expect(result.outcome).toBe("blocked");
    expect(putFileContents).not.toHaveBeenCalled();
  });

  it("(#2) approval 누락 → zod 차단, putFileContents 0", async () => {
    const { store, plan } = await makePlan({ operation: "create", newContent: "hi\n" });
    const putFileContents = vi.fn();
    // approvalId는 schema required — 누락 시 zod로 400 blocked.
    const result = await execute({
      store, planId: plan.id, newContentSha256: plan.newContentSha256,
      putFileContents,
    });
    expect(result.outcome).toBe("blocked");
    expect(putFileContents).not.toHaveBeenCalled();
  });

  it("(#3) approval verify=false → blocked", async () => {
    const { store, plan } = await makePlan({ operation: "create", newContent: "hi\n" });
    const putFileContents = vi.fn();
    const result = await execute({
      store, planId: plan.id, newContentSha256: plan.newContentSha256,
      approvalId: "appr_DENIED",
      verifyApproval: async () => false,
      putFileContents,
    });
    expect(result.outcome).toBe("blocked");
    expect(putFileContents).not.toHaveBeenCalled();
  });

  it("(#4) newContentSha256 mismatch → blocked", async () => {
    const { store, plan } = await makePlan({ operation: "create", newContent: "hi\n" });
    const putFileContents = vi.fn();
    const result = await execute({
      store, planId: plan.id,
      newContentSha256: "DEADBEEF",
      approvalId: "appr_OK",
      putFileContents,
    });
    expect(result.outcome).toBe("blocked");
    expect(result.message).toContain("newContentSha256");
    expect(putFileContents).not.toHaveBeenCalled();
  });

  it("(#5) update에서 baseFileSha mismatch(client vs plan) → blocked", async () => {
    const { store, plan } = await makePlan({
      operation: "update",
      baseContent: "old\n",
      newContent: "new\n",
      baseFileSha: "PLAN_BASE",
    });
    const putFileContents = vi.fn();
    const result = await execute({
      store, planId: plan.id, newContentSha256: plan.newContentSha256,
      baseFileSha: "WRONG_BASE",
      approvalId: "appr_OK",
      putFileContents,
    });
    expect(result.outcome).toBe("blocked");
    expect(result.message).toContain("baseFileSha");
    expect(putFileContents).not.toHaveBeenCalled();
  });

  it("(#6) plan 이후 branch가 사라지면(404) blocked, putFileContents 0", async () => {
    const { store, plan } = await makePlan({ operation: "create", newContent: "hi\n" });
    const putFileContents = vi.fn();
    const getRefSha = vi.fn(async () => { throw new GithubReadonlyError("not found", 404); });
    const result = await execute({
      store, planId: plan.id, newContentSha256: plan.newContentSha256,
      approvalId: "appr_OK",
      getRefSha,
      putFileContents,
    });
    expect(result.outcome).toBe("blocked");
    expect(result.message).toContain("branch");
    expect(putFileContents).not.toHaveBeenCalled();
  });

  it("(#7) update에서 plan 이후 file sha가 바뀌면 blocked(force-push 시뮬)", async () => {
    const { store, plan } = await makePlan({
      operation: "update",
      baseContent: "old\n",
      newContent: "new\n",
      baseFileSha: "PLAN_BASE",
    });
    const putFileContents = vi.fn();
    // execute 시점 getFileContent가 다른 sha 반환.
    const getFileContent = vi.fn(async () => ({
      path: "src/x.ts", size: 4, sha: "POST_PLAN_FORCE_PUSH_SHA", htmlUrl: "u",
      content: "old\n", truncated: false, encoding: "utf8" as const,
    }));
    const result = await execute({
      store, planId: plan.id, newContentSha256: plan.newContentSha256,
      baseFileSha: "PLAN_BASE",
      approvalId: "appr_OK",
      getFileContent,
      putFileContents,
    });
    expect(result.outcome).toBe("blocked");
    expect(result.message).toMatch(/file sha.*변경|plan 시점/);
    expect(putFileContents).not.toHaveBeenCalled();
  });

  it("(#8) create인데 plan 이후 파일이 생겼으면 already_exists, putFileContents 0", async () => {
    const { store, plan } = await makePlan({ operation: "create", newContent: "hi\n" });
    const putFileContents = vi.fn();
    // execute 시점 getFileContent 성공 = 이미 존재.
    const getFileContent = vi.fn(async () => ({
      path: "src/x.ts", size: 4, sha: "SOMEONE_ELSE_SHA", htmlUrl: "u",
      content: "other\n", truncated: false, encoding: "utf8" as const,
    }));
    const result = await execute({
      store, planId: plan.id, newContentSha256: plan.newContentSha256,
      approvalId: "appr_OK",
      getFileContent,
      putFileContents,
    });
    expect(result.outcome).toBe("already_exists");
    expect(putFileContents).not.toHaveBeenCalled();
  });

  it("(#9) 정상 update → putFileContents 1회 + observed commitSha 반환", async () => {
    const { store, plan } = await makePlan({
      operation: "update",
      baseContent: "old\n",
      newContent: "new\n",
      baseFileSha: "PLAN_BASE",
    });
    const putFileContents = vi.fn(async () => ({
      commitSha: "COMMIT_SHA_1", blobSha: "BLOB_SHA_1", htmlUrl: "https://github.com/robin/lab/blob/agent/feature-x/src/x.ts",
    }));
    // execute 시점 getFileContent가 plan과 같은 base sha 반환(force-push 없음).
    const getFileContent = vi.fn(async () => ({
      path: "src/x.ts", size: 4, sha: "PLAN_BASE", htmlUrl: "u",
      content: "old\n", truncated: false, encoding: "utf8" as const,
    }));
    const result = await execute({
      store, planId: plan.id, newContentSha256: plan.newContentSha256,
      baseFileSha: "PLAN_BASE",
      approvalId: "appr_OK",
      getFileContent,
      putFileContents,
    });
    expect(result.outcome).toBe("observed");
    expect(result.truthStatus).toBe("observed");
    expect(result.commitSha).toBe("COMMIT_SHA_1");
    expect(result.blobSha).toBe("BLOB_SHA_1");
    expect(putFileContents).toHaveBeenCalledTimes(1);
    // 서버 생성 commit message: "Apply planned file change (update): <path>"
    const call = putFileContents.mock.calls[0] as unknown as [string, string, string, { message: string; sha?: string }];
    expect(call[3].message).toContain("update");
    expect(call[3].message).toContain("src/x.ts");
    expect(call[3].sha).toBe("PLAN_BASE");
  });

  it("(#10) 정상 create → putFileContents 1회 + observed commitSha 반환", async () => {
    const { store, plan } = await makePlan({ operation: "create", newContent: "first\n" });
    const putFileContents = vi.fn(async () => ({
      commitSha: "C_CREATE", blobSha: "B_CREATE", htmlUrl: "u",
    }));
    const result = await execute({
      store, planId: plan.id, newContentSha256: plan.newContentSha256,
      approvalId: "appr_OK",
      putFileContents,
    });
    expect(result.outcome).toBe("observed");
    expect(result.commitSha).toBe("C_CREATE");
    expect(putFileContents).toHaveBeenCalledTimes(1);
    // create는 sha 미포함.
    const call = putFileContents.mock.calls[0] as unknown as [string, string, string, { message: string; sha?: string }];
    expect(call[3].sha).toBeUndefined();
    expect(call[3].message).toContain("create");
  });

  it("(#11) duplicate execute → observed 그대로, putFileContents 1회만(멱등)", async () => {
    const { store, plan } = await makePlan({
      operation: "update",
      baseContent: "old\n",
      newContent: "new\n",
      baseFileSha: "PLAN_BASE",
    });
    const putFileContents = vi.fn(async () => ({
      commitSha: "COMMIT_IDEM", blobSha: "BLOB_IDEM", htmlUrl: "u",
    }));
    const getFileContent = vi.fn(async () => ({
      path: "src/x.ts", size: 4, sha: "PLAN_BASE", htmlUrl: "u",
      content: "old\n", truncated: false, encoding: "utf8" as const,
    }));
    const first = await execute({
      store, planId: plan.id, newContentSha256: plan.newContentSha256,
      baseFileSha: "PLAN_BASE", approvalId: "appr_OK",
      getFileContent, putFileContents,
    });
    expect(first.outcome).toBe("observed");
    expect(putFileContents).toHaveBeenCalledTimes(1);
    const second = await execute({
      store, planId: plan.id, newContentSha256: plan.newContentSha256,
      baseFileSha: "PLAN_BASE", approvalId: "appr_OK",
      getFileContent, putFileContents,
    });
    expect(second.outcome).toBe("observed");
    expect(second.commitSha).toBe("COMMIT_IDEM");
    expect(putFileContents).toHaveBeenCalledTimes(1); // 두 번째는 캐시에서 답
  });

  it("(#12) GitHub 409(conflict) → blocked, github_error로 흘리지 않음", async () => {
    const { store, plan } = await makePlan({
      operation: "update",
      baseContent: "old\n",
      newContent: "new\n",
      baseFileSha: "PLAN_BASE",
    });
    const putFileContents = vi.fn(async () => {
      throw new GithubReadonlyError("conflict", 409);
    });
    const getFileContent = vi.fn(async () => ({
      path: "src/x.ts", size: 4, sha: "PLAN_BASE", htmlUrl: "u",
      content: "old\n", truncated: false, encoding: "utf8" as const,
    }));
    const result = await execute({
      store, planId: plan.id, newContentSha256: plan.newContentSha256,
      baseFileSha: "PLAN_BASE", approvalId: "appr_OK",
      getFileContent, putFileContents,
    });
    expect(result.outcome).toBe("blocked");
    expect(result.message).toContain("409");
  });

  it("(#13) GitHub 422 → blocked", async () => {
    const { store, plan } = await makePlan({
      operation: "update",
      baseContent: "old\n",
      newContent: "new\n",
      baseFileSha: "PLAN_BASE",
    });
    const putFileContents = vi.fn(async () => {
      throw new GithubReadonlyError("invalid", 422);
    });
    const getFileContent = vi.fn(async () => ({
      path: "src/x.ts", size: 4, sha: "PLAN_BASE", htmlUrl: "u",
      content: "old\n", truncated: false, encoding: "utf8" as const,
    }));
    const result = await execute({
      store, planId: plan.id, newContentSha256: plan.newContentSha256,
      baseFileSha: "PLAN_BASE", approvalId: "appr_OK",
      getFileContent, putFileContents,
    });
    expect(result.outcome).toBe("blocked");
    expect(result.message).toContain("422");
  });
});

describe("W3b — MCP execute tool은 추가되지 않았다(서버 단독)", () => {
  it("file_execute 라우트는 POST 외 메서드 거부", async () => {
    const cap = capture();
    await handleGithubRoute({
      pathname: "/integrations/github/write/file/execute",
      method: "GET",
      createClient: () => clientStub({ token: TOKEN }),
      respondJson: cap.respondJson, now: NOW, request: stubRequest,
      readJsonBody: async () => ({}),
      fileChangePlanStore: createGithubFileChangePlanStore(),
      writeRepoAllowlist: ALLOW, verifyApproval: async () => true,
    });
    expect(cap.calls[0]!.status).toBe(405);
  });
});
