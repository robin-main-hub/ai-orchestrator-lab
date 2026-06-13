import { describe, expect, it, vi } from "vitest";
import type { IncomingMessage } from "node:http";
import type { GithubReadonlyClient } from "../integrations/githubReadonlyClient";
import { GithubReadonlyError, githubConnectorStatus } from "../integrations/githubReadonlyClient";
import { handleGithubRoute } from "./github";
import { createGithubFileChangePlanStore } from "../integrations/githubFileChangePlanStore";

/**
 * W3a 라우트 테스트 — 적대적 체크리스트:
 *   1) plan 단계 GitHub mutation 호출 0 (createBranchRef/postIssueComment 등 절대 호출 안 됨)
 *   2) token 미설정 → not_configured
 *   3) repo not allowed → blocked
 *   4) target branch policy 위반 → blocked
 *   5) path policy 위반(.env, traversal, .github/workflows 등) → blocked
 *   6) secret-like content → blocked
 *   7) binary(NUL) content → blocked
 *   8) target branch 없음 → blocked + 명시 안내
 *   9) existing file → operation=update + baseFileSha + diff preview
 *  10) missing file → operation=create + baseFileSha undefined
 *  11) no-op (base == new) → blocked
 *  12) baseFileSha mismatch → blocked
 *  13) baseFileSha sent but file missing → blocked
 *  14) GitHub read 실패 시 token 누출 없음(scrubServerToken)
 */

const ALLOW = ["robin/lab"];
const REPO = "robin/lab";
const TOKEN = "ghp_FAKE_w3a_test_TOKEN_DO_NOT_LEAK";
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
      (async () => ({
        path: "src/x.ts", size: 10, sha: "BASE_SHA_DEFAULT", htmlUrl: "u",
        content: "hello\nworld\n", truncated: false, encoding: "utf8",
      })),
    listIssues: over.listIssues ?? (async () => []),
    postIssueComment: over.postIssueComment ?? (async () => ({ id: 1, htmlUrl: "u" })),
    getRefSha: over.getRefSha ?? (async () => "branch-sha-stub"),
    createBranchRef:
      over.createBranchRef ??
      (async (_o, _r, ref, sha) => ({ ref, sha, htmlUrl: "u" })),
    putFileContents:
      over.putFileContents ??
      (async () => ({ commitSha: "stub-commit", blobSha: "stub-blob", htmlUrl: "u" })),
  };
}

function capture() {
  const calls: Array<{ status: number; payload: any }> = [];
  return { calls, respondJson: (status: number, payload: unknown) => calls.push({ status, payload }) };
}

async function planRequest(body: any, over: {
  token?: string | null;
  getFileContent?: GithubReadonlyClient["getFileContent"];
  getRefSha?: GithubReadonlyClient["getRefSha"];
  allow?: ReadonlyArray<string>;
}) {
  const fileChangePlanStore = createGithubFileChangePlanStore();
  const { respondJson, calls } = capture();
  const createBranchRef = vi.fn();
  const postIssueComment = vi.fn();
  const resolvedToken = over.token === null ? undefined : over.token ?? TOKEN;
  await handleGithubRoute({
    pathname: "/integrations/github/write/file/plan",
    method: "POST",
    createClient: () => clientStub({
      token: resolvedToken,
      getFileContent: over.getFileContent,
      getRefSha: over.getRefSha,
      createBranchRef,
      postIssueComment,
    }),
    respondJson, now: NOW, request: stubRequest,
    readJsonBody: async () => body,
    fileChangePlanStore,
    writeRepoAllowlist: over.allow ?? ALLOW,
    verifyApproval: async () => true,
  });
  return { calls, fileChangePlanStore, createBranchRef, postIssueComment };
}

describe("W3a file change plan — 적대적 체크리스트", () => {
  it("(#1) plan은 GitHub mutation을 절대 호출하지 않는다", async () => {
    const { calls, createBranchRef, postIssueComment } = await planRequest(
      { repoFullName: REPO, branchName: "agent/x", path: "src/x.ts", newContent: "different\n" }, {});
    expect(calls[0]!.payload.outcome).toBe("planned");
    expect(createBranchRef).not.toHaveBeenCalled();
    expect(postIssueComment).not.toHaveBeenCalled();
  });

  it("(#2) token 미설정 → not_configured", async () => {
    const { calls } = await planRequest(
      { repoFullName: REPO, branchName: "agent/x", path: "src/x.ts", newContent: "hello" },
      { token: null });
    expect(calls[0]!.payload.outcome).toBe("not_configured");
  });

  it("(#3) repo not in allowlist → blocked", async () => {
    const { calls } = await planRequest(
      { repoFullName: "evil/repo", branchName: "agent/x", path: "src/x.ts", newContent: "hello" }, {});
    expect(calls[0]!.payload.outcome).toBe("blocked");
  });

  it("(#4) target branch 정책 위반 → blocked", async () => {
    for (const bad of ["main", "develop", "release/x"]) {
      const { calls } = await planRequest(
        { repoFullName: REPO, branchName: bad, path: "src/x.ts", newContent: "hi" }, {});
      expect(calls[0]!.payload.outcome).toBe("blocked");
    }
  });

  it("(#5) path policy 위반 → blocked", async () => {
    for (const bad of [".env", ".github/workflows/ci.yml", "node_modules/x.js", "../escape", "/etc/passwd"]) {
      const { calls } = await planRequest(
        { repoFullName: REPO, branchName: "agent/x", path: bad, newContent: "hi" }, {});
      expect(calls[0]!.payload.outcome).toBe("blocked");
    }
  });

  it("(#6) secret-like content → blocked", async () => {
    const { calls } = await planRequest(
      { repoFullName: REPO, branchName: "agent/x", path: "src/x.ts", newContent: "TOKEN=ghp_abcdefghij1234567890abcd" }, {});
    expect(calls[0]!.payload.outcome).toBe("blocked");
    expect(calls[0]!.payload.message).toContain("비밀 패턴");
  });

  it("(#7) binary NUL content → blocked", async () => {
    const { calls } = await planRequest(
      { repoFullName: REPO, branchName: "agent/x", path: "src/x.ts", newContent: "hello\0world" }, {});
    expect(calls[0]!.payload.outcome).toBe("blocked");
  });

  it("(#8) target branch 없음(404) → blocked + 명시 안내", async () => {
    const getRefSha = vi.fn(async () => { throw new GithubReadonlyError("not found", 404); });
    const { calls } = await planRequest(
      { repoFullName: REPO, branchName: "agent/x", path: "src/x.ts", newContent: "hi" },
      { getRefSha });
    expect(calls[0]!.payload.outcome).toBe("blocked");
    expect(calls[0]!.payload.message).toContain("target branch");
    expect(calls[0]!.payload.message).toContain("W2로 먼저");
  });

  it("(#9) existing file → operation=update + baseFileSha + diff", async () => {
    const getFileContent = vi.fn(async () => ({
      path: "src/x.ts", size: 12, sha: "EXISTING_BLOB_SHA", htmlUrl: "u",
      content: "hello\nworld\n", truncated: false, encoding: "utf8" as const,
    }));
    const { calls } = await planRequest(
      { repoFullName: REPO, branchName: "agent/x", path: "src/x.ts", newContent: "hello\nworld\nbye\n" },
      { getFileContent });
    expect(calls[0]!.payload.outcome).toBe("planned");
    const plan = calls[0]!.payload.plan;
    expect(plan.operation).toBe("update");
    expect(plan.baseFileSha).toBe("EXISTING_BLOB_SHA");
    expect(plan.baseContentSha256).toBeTruthy();
    expect(plan.diffPreview).toContain("+bye");
    expect(plan.diffStat.additions).toBeGreaterThan(0);
    expect(plan.truthStatus).toBe("planned");
    expect(plan.status).toBe("approval_required");
  });

  it("(#10) missing file(404) → operation=create + baseFileSha undefined", async () => {
    const getFileContent = vi.fn(async () => { throw new GithubReadonlyError("not found", 404); });
    const { calls } = await planRequest(
      { repoFullName: REPO, branchName: "agent/x", path: "src/new.ts", newContent: "export const x = 1;\n" },
      { getFileContent });
    expect(calls[0]!.payload.outcome).toBe("planned");
    const plan = calls[0]!.payload.plan;
    expect(plan.operation).toBe("create");
    expect(plan.baseFileSha).toBeUndefined();
    expect(plan.baseContentSha256).toBeUndefined();
    expect(plan.diffStat.additions).toBeGreaterThan(0);
    expect(plan.diffStat.deletions).toBe(0);
  });

  it("(#11) no-op(base == new) → blocked", async () => {
    const SAME = "hello\nworld\n";
    const getFileContent = vi.fn(async () => ({
      path: "src/x.ts", size: SAME.length, sha: "S", htmlUrl: "u",
      content: SAME, truncated: false, encoding: "utf8" as const,
    }));
    const { calls } = await planRequest(
      { repoFullName: REPO, branchName: "agent/x", path: "src/x.ts", newContent: SAME },
      { getFileContent });
    expect(calls[0]!.payload.outcome).toBe("blocked");
    expect(calls[0]!.payload.message).toMatch(/no-op|동일/);
  });

  it("(#12) baseFileSha mismatch(클라이언트 vs 서버 관측) → blocked", async () => {
    const getFileContent = vi.fn(async () => ({
      path: "src/x.ts", size: 12, sha: "SERVER_OBSERVED_SHA", htmlUrl: "u",
      content: "hello\nworld\n", truncated: false, encoding: "utf8" as const,
    }));
    const { calls } = await planRequest(
      {
        repoFullName: REPO, branchName: "agent/x", path: "src/x.ts",
        newContent: "hello\nworld\nbye\n",
        baseFileSha: "CLIENT_SAW_DIFFERENT_SHA",
      },
      { getFileContent });
    expect(calls[0]!.payload.outcome).toBe("blocked");
    expect(calls[0]!.payload.message).toContain("baseFileSha 불일치");
  });

  it("(#13) baseFileSha 보냈지만 파일이 없으면 → blocked(모순)", async () => {
    const getFileContent = vi.fn(async () => { throw new GithubReadonlyError("not found", 404); });
    const { calls } = await planRequest(
      {
        repoFullName: REPO, branchName: "agent/x", path: "src/x.ts",
        newContent: "hi\n",
        baseFileSha: "FAKE_SHA",
      },
      { getFileContent });
    expect(calls[0]!.payload.outcome).toBe("blocked");
    expect(calls[0]!.payload.message).toContain("모순");
  });

  it("(#14) GitHub read 에러 메시지에 토큰이 들어가도 응답에 노출되지 않음(scrubServerToken)", async () => {
    const ORIG = process.env.GITHUB_TOKEN;
    process.env.GITHUB_TOKEN = TOKEN;
    try {
      const getRefSha = vi.fn(async () => {
        throw new GithubReadonlyError(`internal failure with ${TOKEN} in message`, 500);
      });
      const { calls } = await planRequest(
        { repoFullName: REPO, branchName: "agent/x", path: "src/x.ts", newContent: "hi" },
        { getRefSha });
      expect(calls[0]!.payload.outcome).toBe("github_error");
      expect(JSON.stringify(calls[0]!.payload)).not.toContain(TOKEN);
      expect(calls[0]!.payload.message).toContain("<redacted-token>");
    } finally {
      if (ORIG === undefined) delete process.env.GITHUB_TOKEN; else process.env.GITHUB_TOKEN = ORIG;
    }
  });

  it("base 파일이 truncated로 GitHub에서 반환되면 blocked(다루지 않음)", async () => {
    const getFileContent = vi.fn(async () => ({
      path: "src/x.ts", size: 1_000_000, sha: "S", htmlUrl: "u",
      content: "partial", truncated: true, encoding: "utf8" as const,
    }));
    const { calls } = await planRequest(
      { repoFullName: REPO, branchName: "agent/x", path: "src/x.ts", newContent: "hello" },
      { getFileContent });
    expect(calls[0]!.payload.outcome).toBe("blocked");
    expect(calls[0]!.payload.message).toContain("truncated");
  });

  it("(evidence shape) plan 응답이 승인 카드에 필요한 모든 필드를 한 번에 담는다", async () => {
    // 승인 카드 evidence 요구사항(사용자 contract):
    //   repo / branch / path / operation(create/update) / diff stat / bounded diff preview /
    //   diffTruncated 표시 / GitHub mutation 미수행 표식(truthStatus="planned")
    // 이 테스트가 깨지면 evidence 일부가 빠진 것 — UI 카드가 거짓 정보를 보여줄 위험.
    const getFileContent = vi.fn(async () => ({
      path: "src/x.ts", size: 24, sha: "EVIDENCE_BASE_SHA", htmlUrl: "u",
      content: "const a = 1;\nconst b = 2;\n", truncated: false, encoding: "utf8" as const,
    }));
    const createBranchRef = vi.fn();
    const postIssueComment = vi.fn();
    const { calls } = await planRequest(
      {
        repoFullName: "robin/lab",
        branchName: "agent/feature-x",
        path: "src/x.ts",
        newContent: "const a = 1;\nconst b = 2;\nconst c = 3;\n",
        baseFileSha: "EVIDENCE_BASE_SHA",
      },
      { getFileContent });
    expect(calls[0]!.payload.outcome).toBe("planned");
    const plan = calls[0]!.payload.plan;
    // 필수 evidence 필드 — 하나라도 빠지면 승인 카드가 거짓 표시를 할 수 있다.
    expect(plan.repoFullName).toBe("robin/lab");
    expect(plan.branchName).toBe("agent/feature-x");
    expect(plan.branchRef).toBe("refs/heads/agent/feature-x");
    expect(plan.path).toBe("src/x.ts");
    expect(plan.operation).toBe("update");
    expect(plan.baseFileSha).toBe("EVIDENCE_BASE_SHA");
    expect(typeof plan.baseContentSha256).toBe("string");
    expect(typeof plan.newContentSha256).toBe("string");
    expect(plan.newContentSha256).not.toBe(plan.baseContentSha256); // 변경이 있어야 plan이 됨
    expect(plan.newContentLength).toBeGreaterThan(0);
    expect(typeof plan.diffPreview).toBe("string");
    expect(plan.diffPreview).toContain("--- a/src/x.ts");
    expect(plan.diffPreview).toContain("+++ b/src/x.ts");
    expect(plan.diffPreview).toContain("+const c = 3;");
    expect(plan.diffTruncated).toBe(false);
    expect(plan.diffStat).toEqual({ additions: 1, deletions: 0 });
    // GitHub mutation 미수행 표식 — UI는 이걸로 "계획 단계, 아직 GitHub에 쓰지 않음"을 결정한다.
    expect(plan.status).toBe("approval_required");
    expect(plan.truthStatus).toBe("planned");
    expect(plan.createdAt).toBeTruthy();
    expect(plan.expiresAt).toBeTruthy();
    // 실제로 어떤 mutation도 호출되지 않음.
    expect(createBranchRef).not.toHaveBeenCalled();
    expect(postIssueComment).not.toHaveBeenCalled();
  });

  it("base 파일이 binary면 blocked(NUL 포함)", async () => {
    const getFileContent = vi.fn(async () => ({
      path: "src/x.ts", size: 4, sha: "S", htmlUrl: "u",
      content: "a\0b\0", truncated: false, encoding: "utf8" as const,
    }));
    const { calls } = await planRequest(
      { repoFullName: REPO, branchName: "agent/x", path: "src/x.ts", newContent: "hi" },
      { getFileContent });
    expect(calls[0]!.payload.outcome).toBe("blocked");
    expect(calls[0]!.payload.message).toContain("binary");
  });
});
