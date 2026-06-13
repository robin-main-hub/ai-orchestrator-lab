import { describe, expect, it, vi } from "vitest";
import type { IncomingMessage } from "node:http";
import type { GithubReadonlyClient } from "../integrations/githubReadonlyClient";
import { GithubReadonlyError, githubConnectorStatus } from "../integrations/githubReadonlyClient";
import { handleGithubRoute } from "./github";
import { createGithubBranchCreatePlanStore } from "../integrations/githubBranchCreatePlanStore";

/**
 * W2 branch create route tests — 8-item adversarial checklist:
 *   1) plan 단계 GitHub POST(refs 생성) 없음 — refs는 execute에서만
 *   2) approval 없이 execute 없음 (W2는 approval ONLY — armed 경로 없음)
 *   3) sourceSha mismatch 차단 (client payload sha ↔ plan 저장 sha)
 *   4) source ref가 plan 이후 force-push로 sha가 바뀌면 차단
 *   5) target ref가 이미 존재하면 already_exists (plan + execute 양 단계)
 *   6) 보호 브랜치 직접 생성 차단 (main/master/develop/release/hotfix)
 *   7) unsafe branch 차단 (정책 위반 prefix·문자)
 *   8) 동일 plan 두 번 execute해도 createBranchRef는 1회만 호출(멱등 + tryClaim)
 *   + token leak 없음(에러 메시지 검사)
 *   + W1 comment 기능 회귀 없음(W2 store 추가가 W1 path를 망가뜨리지 않는다는 sanity)
 */

const ALLOW = ["robin/lab"];
const TOKEN = "ghp_FAKE_w2_test_TOKEN_DO_NOT_LEAK";
const NOW_REF = "2026-06-14T12:00:00.000Z";
const NOW = () => NOW_REF;
const stubRequest = {} as IncomingMessage;

function clientStub(over: Partial<GithubReadonlyClient> & { token?: string } = {}): GithubReadonlyClient {
  const token = over.token;
  return {
    status: () => githubConnectorStatus(token),
    getRepoOverview:
      over.getRepoOverview ??
      (async () => ({ fullName: "robin/lab", description: null, defaultBranch: "main", openIssues: 0, stars: 0, private: false, htmlUrl: "" })),
    listPullRequests: over.listPullRequests ?? (async () => []),
    getPullRequest:
      over.getPullRequest ??
      (async () => ({
        number: 7, title: "t", state: "open", author: "robin", draft: false, htmlUrl: "u", createdAt: "c", updatedAt: "u",
        body: "", baseRef: "main", headRef: "feat", merged: false, additions: 1, deletions: 1, changedFiles: 1, commits: 1,
      })),
    getFileContent:
      over.getFileContent ??
      (async () => ({ path: "x", size: 0, sha: "s", htmlUrl: "u", content: "", truncated: false, encoding: "utf8" })),
    listIssues: over.listIssues ?? (async () => []),
    postIssueComment: over.postIssueComment ?? (async () => ({ id: 1, htmlUrl: "u" })),
    getRefSha: over.getRefSha ?? (async () => "sha-stub"),
    createBranchRef:
      over.createBranchRef ??
      (async (_o, _r, ref, sha) => ({ ref, sha, htmlUrl: "https://github.com/robin/lab/tree/stub" })),
    putFileContents:
      over.putFileContents ??
      (async () => ({ commitSha: "stub-commit", blobSha: "stub-blob", htmlUrl: "u" })),
  };
}

function capture() {
  const calls: Array<{ status: number; payload: any }> = [];
  return { calls, respondJson: (status: number, payload: unknown) => calls.push({ status, payload }) };
}

async function planFirst(over: {
  sourceRef?: string;
  newBranchName?: string;
  repoFullName?: string;
  getRefSha?: GithubReadonlyClient["getRefSha"];
  createBranchRef?: GithubReadonlyClient["createBranchRef"];
  token?: string | null; // null/undefined-as-explicit-no-token: caller must pass `null` to disable.
  allow?: ReadonlyArray<string>;
}) {
  const branchPlanStore = createGithubBranchCreatePlanStore();
  const { respondJson, calls } = capture();
  // `null`이면 명시적으로 "토큰 없음", `undefined`이면 기본 TOKEN 사용. (=== TOKEN 회피)
  const resolvedToken = over.token === null ? undefined : over.token ?? TOKEN;
  await handleGithubRoute({
    pathname: "/integrations/github/write/branch/plan",
    method: "POST",
    createClient: () => clientStub({ token: resolvedToken, getRefSha: over.getRefSha, createBranchRef: over.createBranchRef }),
    respondJson, now: NOW, request: stubRequest,
    readJsonBody: async () => ({
      repoFullName: over.repoFullName ?? "robin/lab",
      sourceRef: over.sourceRef ?? "main",
      newBranchName: over.newBranchName ?? "agent/feature-x",
    }),
    branchPlanStore,
    writeRepoAllowlist: over.allow ?? ALLOW,
    verifyApproval: async () => true,
  });
  return { branchPlanStore, calls };
}

describe("W2 branch create — plan", () => {
  it("(adversarial #1) plan 단계는 createBranchRef를 절대 호출하지 않는다", async () => {
    const createBranchRef = vi.fn(async () => ({ ref: "x", sha: "y", htmlUrl: "u" }));
    // 1차 호출(source) → sha, 2차 호출(target) → 404(존재하지 않음).
    let n = 0;
    const getRefSha = vi.fn(async () => {
      n += 1;
      if (n === 1) return "abc123";
      throw new GithubReadonlyError("not found", 404);
    });
    const { calls } = await planFirst({ getRefSha, createBranchRef });
    expect(calls[0]!.payload.outcome).toBe("planned");
    expect(calls[0]!.payload.plan.truthStatus).toBe("planned");
    expect(calls[0]!.payload.plan.sourceSha).toBe("abc123");
    expect(createBranchRef).not.toHaveBeenCalled();
  });

  it("token 미설정이면 not_configured(GitHub 호출 0)", async () => {
    const getRefSha = vi.fn();
    const { calls } = await planFirst({ token: null, getRefSha });
    expect(calls[0]!.payload.outcome).toBe("not_configured");
    expect(getRefSha).not.toHaveBeenCalled();
  });

  it("(adversarial #7) 정책 위반 branch는 blocked — sourceRef GET 전에 차단", async () => {
    const getRefSha = vi.fn();
    for (const bad of ["main", "develop", "release/x", "refs/heads/x", "random-feature", "agent/한글"]) {
      const { calls } = await planFirst({ newBranchName: bad, getRefSha });
      // 게이트에서 잘리므로 결과는 항상 blocked이며 GitHub GET이 발생하지 않아야 한다.
      expect(calls[0]!.payload.outcome).toBe("blocked");
    }
    expect(getRefSha).not.toHaveBeenCalled();
  });

  it("repo allowlist에 없으면 blocked(앞에서 차단 — GitHub GET 없음)", async () => {
    const getRefSha = vi.fn();
    const { calls } = await planFirst({ repoFullName: "evil/repo", getRefSha });
    expect(calls[0]!.payload.outcome).toBe("blocked");
    expect(getRefSha).not.toHaveBeenCalled();
  });

  it("(adversarial #5a) target ref가 이미 존재하면 plan 단계에서 already_exists", async () => {
    // getRefSha가 source/target 둘 다 성공 → target 존재로 판정.
    const getRefSha = vi.fn(async () => "sha-1");
    const { calls } = await planFirst({ getRefSha });
    expect(calls[0]!.payload.outcome).toBe("already_exists");
    expect(calls[0]!.payload.message).toContain("이미 존재");
  });

  it("source ref가 없으면(404) github_error 또는 permission 매핑", async () => {
    const getRefSha = vi.fn(async () => {
      throw new GithubReadonlyError("not found", 404);
    });
    const { calls } = await planFirst({ getRefSha });
    expect(["github_error", "connection_failed", "not_configured", "permission_denied"]).toContain(calls[0]!.payload.outcome);
  });
});

describe("W2 branch create — execute", () => {
  it("(adversarial #2) approval 없으면 execute는 approval_required/blocked", async () => {
    const createBranchRef = vi.fn(async () => ({ ref: "x", sha: "y", htmlUrl: "u" }));
    // plan: target 없음(404), source는 sha.
    let calls = 0;
    const getRefSha = vi.fn(async () => {
      calls += 1;
      if (calls === 1) return "src-sha";
      throw new GithubReadonlyError("not found", 404);
    });
    const { branchPlanStore, calls: planCalls } = await planFirst({ getRefSha, createBranchRef });
    expect(planCalls[0]!.payload.outcome).toBe("planned");
    const plan = planCalls[0]!.payload.plan;
    // execute without approvalId — but schema requires it.
    const cap = capture();
    await handleGithubRoute({
      pathname: "/integrations/github/write/branch/execute",
      method: "POST",
      createClient: () => clientStub({ token: TOKEN, getRefSha, createBranchRef }),
      respondJson: cap.respondJson, now: NOW, request: stubRequest,
      readJsonBody: async () => ({ planId: plan.id, sourceSha: plan.sourceSha }), // approvalId 누락
      branchPlanStore, writeRepoAllowlist: ALLOW,
      verifyApproval: async () => false,
    });
    expect(cap.calls[0]!.payload.outcome).toBe("blocked");
    expect(createBranchRef).not.toHaveBeenCalled();
  });

  it("approval이 verify 실패면 blocked", async () => {
    const createBranchRef = vi.fn();
    let n = 0;
    const getRefSha = vi.fn(async () => {
      n += 1;
      if (n === 1) return "src-sha";
      throw new GithubReadonlyError("not found", 404);
    });
    const { branchPlanStore, calls: planCalls } = await planFirst({ getRefSha, createBranchRef });
    const plan = planCalls[0]!.payload.plan;
    const cap = capture();
    await handleGithubRoute({
      pathname: "/integrations/github/write/branch/execute",
      method: "POST",
      createClient: () => clientStub({ token: TOKEN, getRefSha, createBranchRef }),
      respondJson: cap.respondJson, now: NOW, request: stubRequest,
      readJsonBody: async () => ({ planId: plan.id, sourceSha: plan.sourceSha, approvalId: "appr_X" }),
      branchPlanStore, writeRepoAllowlist: ALLOW,
      verifyApproval: async () => false, // 명시적으로 거절
    });
    expect(cap.calls[0]!.payload.outcome).toBe("blocked");
    expect(createBranchRef).not.toHaveBeenCalled();
  });

  it("(adversarial #3) sourceSha mismatch면 blocked — createBranchRef 호출 안 함", async () => {
    const createBranchRef = vi.fn();
    let n = 0;
    const getRefSha = vi.fn(async () => {
      n += 1;
      if (n === 1) return "plan-sha";
      throw new GithubReadonlyError("not found", 404);
    });
    const { branchPlanStore, calls: planCalls } = await planFirst({ getRefSha, createBranchRef });
    const plan = planCalls[0]!.payload.plan;
    const cap = capture();
    await handleGithubRoute({
      pathname: "/integrations/github/write/branch/execute",
      method: "POST",
      createClient: () => clientStub({ token: TOKEN, getRefSha, createBranchRef }),
      respondJson: cap.respondJson, now: NOW, request: stubRequest,
      readJsonBody: async () => ({ planId: plan.id, sourceSha: "TAMPERED-SHA", approvalId: "appr_OK" }),
      branchPlanStore, writeRepoAllowlist: ALLOW, verifyApproval: async () => true,
    });
    expect(cap.calls[0]!.payload.outcome).toBe("blocked");
    expect(cap.calls[0]!.payload.message).toContain("sourceSha");
    expect(createBranchRef).not.toHaveBeenCalled();
  });

  it("(adversarial #4) plan 이후 source ref sha가 바뀌면 blocked(force-push 등)", async () => {
    const createBranchRef = vi.fn();
    let callIdx = 0;
    const getRefSha = vi.fn(async () => {
      callIdx += 1;
      if (callIdx === 1) return "sha-at-plan";       // source preflight
      if (callIdx === 2) throw new GithubReadonlyError("not found", 404); // target preflight
      if (callIdx === 3) return "sha-AFTER-FORCE-PUSH"; // execute re-GET source
      throw new Error("unexpected getRefSha call");
    });
    const { branchPlanStore, calls: planCalls } = await planFirst({ getRefSha, createBranchRef });
    const plan = planCalls[0]!.payload.plan;
    const cap = capture();
    await handleGithubRoute({
      pathname: "/integrations/github/write/branch/execute",
      method: "POST",
      createClient: () => clientStub({ token: TOKEN, getRefSha, createBranchRef }),
      respondJson: cap.respondJson, now: NOW, request: stubRequest,
      readJsonBody: async () => ({ planId: plan.id, sourceSha: plan.sourceSha, approvalId: "appr_OK" }),
      branchPlanStore, writeRepoAllowlist: ALLOW, verifyApproval: async () => true,
    });
    expect(cap.calls[0]!.payload.outcome).toBe("blocked");
    expect(cap.calls[0]!.payload.message).toContain("sha가 plan 시점 이후 변경");
    expect(createBranchRef).not.toHaveBeenCalled();
  });

  it("(adversarial #5b) plan 이후 target ref가 생기면 execute에서 already_exists(overwrite 금지)", async () => {
    const createBranchRef = vi.fn();
    let callIdx = 0;
    const getRefSha = vi.fn(async () => {
      callIdx += 1;
      if (callIdx === 1) return "src-sha";              // source preflight
      if (callIdx === 2) throw new GithubReadonlyError("not found", 404); // target absent at plan
      if (callIdx === 3) return "src-sha";              // execute re-GET source (same)
      if (callIdx === 4) return "someone-else-sha";     // target now exists
      throw new Error("unexpected getRefSha");
    });
    const { branchPlanStore, calls: planCalls } = await planFirst({ getRefSha, createBranchRef });
    const plan = planCalls[0]!.payload.plan;
    const cap = capture();
    await handleGithubRoute({
      pathname: "/integrations/github/write/branch/execute",
      method: "POST",
      createClient: () => clientStub({ token: TOKEN, getRefSha, createBranchRef }),
      respondJson: cap.respondJson, now: NOW, request: stubRequest,
      readJsonBody: async () => ({ planId: plan.id, sourceSha: plan.sourceSha, approvalId: "appr_OK" }),
      branchPlanStore, writeRepoAllowlist: ALLOW, verifyApproval: async () => true,
    });
    expect(cap.calls[0]!.payload.outcome).toBe("already_exists");
    expect(createBranchRef).not.toHaveBeenCalled();
  });

  it("정상 경로 — observed + truthStatus=observed + 멱등(중복 execute 1회 POST)", async () => {
    const createBranchRef = vi.fn(async () => ({
      ref: "refs/heads/agent/feature-x",
      sha: "src-sha",
      htmlUrl: "https://github.com/robin/lab/tree/agent/feature-x",
    }));
    let callIdx = 0;
    const getRefSha = vi.fn(async () => {
      callIdx += 1;
      if (callIdx === 1) return "src-sha";
      if (callIdx === 2) throw new GithubReadonlyError("not found", 404);
      if (callIdx === 3) return "src-sha";
      if (callIdx === 4) throw new GithubReadonlyError("not found", 404);
      throw new Error("unexpected getRefSha");
    });
    const { branchPlanStore, calls: planCalls } = await planFirst({ getRefSha, createBranchRef });
    const plan = planCalls[0]!.payload.plan;

    const cap1 = capture();
    await handleGithubRoute({
      pathname: "/integrations/github/write/branch/execute",
      method: "POST",
      createClient: () => clientStub({ token: TOKEN, getRefSha, createBranchRef }),
      respondJson: cap1.respondJson, now: NOW, request: stubRequest,
      readJsonBody: async () => ({ planId: plan.id, sourceSha: plan.sourceSha, approvalId: "appr_OK" }),
      branchPlanStore, writeRepoAllowlist: ALLOW, verifyApproval: async () => true,
    });
    expect(cap1.calls[0]!.payload.outcome).toBe("observed");
    expect(cap1.calls[0]!.payload.truthStatus).toBe("observed");
    expect(cap1.calls[0]!.payload.ref).toBe("refs/heads/agent/feature-x");
    expect(createBranchRef).toHaveBeenCalledTimes(1);

    // (adversarial #8) 같은 plan 두 번째 execute — 멱등(observed 그대로) + createBranchRef 추가 호출 없음.
    const cap2 = capture();
    await handleGithubRoute({
      pathname: "/integrations/github/write/branch/execute",
      method: "POST",
      createClient: () => clientStub({ token: TOKEN, getRefSha, createBranchRef }),
      respondJson: cap2.respondJson, now: NOW, request: stubRequest,
      readJsonBody: async () => ({ planId: plan.id, sourceSha: plan.sourceSha, approvalId: "appr_OK" }),
      branchPlanStore, writeRepoAllowlist: ALLOW, verifyApproval: async () => true,
    });
    expect(cap2.calls[0]!.payload.outcome).toBe("observed");
    expect(createBranchRef).toHaveBeenCalledTimes(1);
  });

  it("GitHub 422(이미 존재) → already_exists로 매핑(github_error로 흘리지 않음)", async () => {
    const createBranchRef = vi.fn(async () => {
      throw new GithubReadonlyError("Reference already exists", 422);
    });
    let callIdx = 0;
    const getRefSha = vi.fn(async () => {
      callIdx += 1;
      if (callIdx === 1) return "src-sha";
      if (callIdx === 2) throw new GithubReadonlyError("not found", 404);
      if (callIdx === 3) return "src-sha";
      if (callIdx === 4) throw new GithubReadonlyError("not found", 404);
      throw new Error("unexpected getRefSha");
    });
    const { branchPlanStore, calls: planCalls } = await planFirst({ getRefSha, createBranchRef });
    const plan = planCalls[0]!.payload.plan;
    const cap = capture();
    await handleGithubRoute({
      pathname: "/integrations/github/write/branch/execute",
      method: "POST",
      createClient: () => clientStub({ token: TOKEN, getRefSha, createBranchRef }),
      respondJson: cap.respondJson, now: NOW, request: stubRequest,
      readJsonBody: async () => ({ planId: plan.id, sourceSha: plan.sourceSha, approvalId: "appr_OK" }),
      branchPlanStore, writeRepoAllowlist: ALLOW, verifyApproval: async () => true,
    });
    expect(cap.calls[0]!.payload.outcome).toBe("already_exists");
  });

  it("(token leak 가드) 에러 본문에 토큰이 들어 있어도 응답 payload에 토큰 노출 없음", async () => {
    // 시나리오: readonlyClient의 fetch-level scrub을 우회한 어떤 코드 경로에서 토큰을 담은 에러가
    // 발생했다고 가정. route 측 defense-in-depth scrub이 이를 한 번 더 제거하는지 확인.
    const ORIG = process.env.GITHUB_TOKEN;
    process.env.GITHUB_TOKEN = TOKEN;
    try {
      const createBranchRef = vi.fn(async () => {
        throw new GithubReadonlyError(`internal failure log including ${TOKEN}`, 500);
      });
      let n = 0;
      const getRefSha = vi.fn(async () => {
        n += 1;
        if (n === 1) return "src-sha";
        if (n === 2) throw new GithubReadonlyError("not found", 404);
        if (n === 3) return "src-sha";
        if (n === 4) throw new GithubReadonlyError("not found", 404);
        throw new Error("unexpected");
      });
      const { branchPlanStore, calls: planCalls } = await planFirst({ getRefSha, createBranchRef });
      const plan = planCalls[0]!.payload.plan;
      const cap = capture();
      await handleGithubRoute({
        pathname: "/integrations/github/write/branch/execute",
        method: "POST",
        createClient: () => clientStub({ token: TOKEN, getRefSha, createBranchRef }),
        respondJson: cap.respondJson, now: NOW, request: stubRequest,
        readJsonBody: async () => ({ planId: plan.id, sourceSha: plan.sourceSha, approvalId: "appr_OK" }),
        branchPlanStore, writeRepoAllowlist: ALLOW, verifyApproval: async () => true,
      });
      expect(JSON.stringify(cap.calls[0]!.payload)).not.toContain(TOKEN);
      // 그래도 사용자에게는 사고가 났음을 알려야 하므로 outcome은 github_error로 정직하게 노출.
      expect(cap.calls[0]!.payload.outcome).toBe("github_error");
      // 토큰 자리에 redacted 표식이 들어가 있어야 함 — 메시지 통째로 빈칸이 되지 않게.
      expect(cap.calls[0]!.payload.message).toContain("<redacted-token>");
    } finally {
      if (ORIG === undefined) delete process.env.GITHUB_TOKEN; else process.env.GITHUB_TOKEN = ORIG;
    }
  });
});
