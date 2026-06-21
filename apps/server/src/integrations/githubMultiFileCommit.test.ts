import { describe, expect, it, vi } from "vitest";
import {
  GithubGitDataConflictError,
  GithubGitDataPermissionError,
  runMultiFileCommitExecute,
  type GithubGitDataClient,
  type MultiFileCommitDeps,
} from "./githubMultiFileCommit.js";
import type { GithubMultiFileCommitExecuteRequest } from "@ai-orchestrator/protocol";

/**
 * W5b — Multi-file atomic commit runner 단위 테스트.
 *
 * 사용자 컨트랙트:
 *   - sequential Contents API PUT 금지. atomic Git data API 시퀀스만.
 *   - server-side guard 전면 재검증(클라이언트 가드는 신뢰 안 함).
 *   - expectedHeadSha 불일치 또는 ref update 409 → head_mismatch(부분 적용 0).
 *   - 부분 성공 표시 금지(blob 만들어도 ref update 실패면 observed 아님).
 *   - secret/binary/large/unsafe path는 GitHub API 호출 전에 차단(0회 호출).
 *   - approval 필수(armed 없음).
 */

function makeClient(overrides: Partial<GithubGitDataClient> = {}): GithubGitDataClient {
  return {
    getRefSha: vi.fn(async () => "a".repeat(40)),
    getCommitTreeSha: vi.fn(async () => "tree_sha"),
    createBlob: vi.fn(async () => ({ sha: "blob_sha" })),
    createTree: vi.fn(async () => ({ sha: "new_tree_sha" })),
    createCommit: vi.fn(async () => ({ sha: "c".repeat(40), htmlUrl: "https://github.com/robin/lab/commit/cccc" })),
    updateRefSha: vi.fn(async () => ({ ref: "refs/heads/agent/feature", sha: "c".repeat(40) })),
    ...overrides,
  };
}

function deps(overrides: Partial<MultiFileCommitDeps> = {}): MultiFileCommitDeps {
  return {
    client: makeClient(),
    verifyApproval: vi.fn(async () => true),
    writeRepoAllowlist: ["robin/lab"],
    protectedBranches: ["main", "master"],
    now: () => "2026-06-14T12:00:00.000Z",
    ...overrides,
  };
}

function request(over: Partial<GithubMultiFileCommitExecuteRequest> = {}): GithubMultiFileCommitExecuteRequest {
  return {
    repoFullName: "robin/lab",
    branchName: "agent/feature",
    expectedHeadSha: "a".repeat(40),
    message: "feat: multi-file commit",
    files: [
      { path: "src/a.ts", newContent: "export const a = 1;\n" },
      { path: "src/b.ts", newContent: "export const b = 2;\n" },
    ],
    approvalId: "appr_1",
    ...over,
  };
}

describe("runMultiFileCommitExecute — W5b atomic commit", () => {
  it("(#1) 2 files → blobs → tree → commit → ref update → observed(sha 반환)", async () => {
    const client = makeClient();
    const d = deps({ client });
    const res = await runMultiFileCommitExecute(request(), d);
    expect(res.outcome).toBe("observed");
    if (res.outcome !== "observed") throw new Error("unreachable");
    expect(res.commitSha).toBe("c".repeat(40));
    expect(res.treeSha).toBe("new_tree_sha");
    expect(res.fileCount).toBe(2);
    expect(res.totalBytes).toBeGreaterThan(0);
    expect(res.htmlUrl).toContain("github.com");
    // 시퀀스 검증: 정확히 한 번씩 호출
    expect(client.getRefSha).toHaveBeenCalledTimes(1);
    expect(client.getCommitTreeSha).toHaveBeenCalledTimes(1);
    expect(client.createBlob).toHaveBeenCalledTimes(2);
    expect(client.createTree).toHaveBeenCalledTimes(1);
    expect(client.createCommit).toHaveBeenCalledTimes(1);
    expect(client.updateRefSha).toHaveBeenCalledTimes(1);
  });

  it("(#2) expectedHeadSha 불일치 → blob 만들기 전에 head_mismatch", async () => {
    const client = makeClient({
      getRefSha: vi.fn(async () => "f".repeat(40)),
    });
    const res = await runMultiFileCommitExecute(request(), deps({ client }));
    expect(res.outcome).toBe("head_mismatch");
    expect(res.reason).toBe("head_mismatch");
    expect(client.createBlob).not.toHaveBeenCalled();
    expect(client.createTree).not.toHaveBeenCalled();
    expect(client.createCommit).not.toHaveBeenCalled();
    expect(client.updateRefSha).not.toHaveBeenCalled();
  });

  it("(#3) ref update 409(GithubGitDataConflictError) → head_mismatch(부분 적용 0)", async () => {
    const client = makeClient({
      updateRefSha: vi.fn(async () => {
        throw new GithubGitDataConflictError("ref가 그 사이 다른 sha로 이동했습니다(force=false 거부)", 409);
      }),
    });
    const res = await runMultiFileCommitExecute(request(), deps({ client }));
    expect(res.outcome).toBe("head_mismatch");
    expect(res.reason).toBe("head_mismatch");
    expect(res.commitSha).toBeUndefined();
    // 직전 단계는 호출됐지만 observed 아님.
    expect(client.createBlob).toHaveBeenCalledTimes(2);
    expect(client.createCommit).toHaveBeenCalledTimes(1);
  });

  it("(#4) 시크릿 의심 파일 → server block, GitHub API 0회 호출", async () => {
    const client = makeClient();
    const res = await runMultiFileCommitExecute(
      request({
        files: [
          { path: "src/a.ts", newContent: "export const a = 1;\n" },
          { path: "config.env", newContent: "TOKEN=ghp_abcdefghij1234567890abcd\n" },
        ],
      }),
      deps({ client }),
    );
    expect(res.outcome).toBe("blocked");
    expect(res.reason).toBe("unsafe_path"); // .env path가 unsafe로 먼저 잡힘
    expect(client.getRefSha).not.toHaveBeenCalled();
    expect(client.createBlob).not.toHaveBeenCalled();
  });

  it("(#4b) 안전 path + 시크릿 내용 → secret_suspect로 차단", async () => {
    const client = makeClient();
    const res = await runMultiFileCommitExecute(
      request({
        files: [
          { path: "src/util.ts", newContent: "const token = 'ghp_abcdefghij1234567890abcd'\n" },
        ],
      }),
      deps({ client }),
    );
    expect(res.outcome).toBe("blocked");
    expect(res.reason).toBe("secret_suspect");
    expect(client.getRefSha).not.toHaveBeenCalled();
  });

  it("(#4c) fine-grained PAT(github_pat_) 내용도 secret_suspect로 차단 — 공유 스캐너 위임 회귀", async () => {
    // 과거 버그: 이 모듈이 자체 SECRET_PATTERNS 복제본을 들고 있어 github_pat_가 누락 → commit
    // 경로로만 fine-grained PAT가 빠져나갔다. 공유 scanForSecrets 위임으로 닫혔는지 확인.
    // gitleaks가 diff에서 진짜 토큰 리터럴을 잡으므로 런타임 조합으로 회피.
    const pat = "github_" + "pat_" + "11" + "A".repeat(22) + "_" + "b".repeat(40);
    const client = makeClient();
    const res = await runMultiFileCommitExecute(
      request({ files: [{ path: "src/cfg.ts", newContent: `export const t = "${pat}";\n` }] }),
      deps({ client }),
    );
    expect(res.outcome).toBe("blocked");
    expect(res.reason).toBe("secret_suspect");
    expect(client.getRefSha).not.toHaveBeenCalled();
  });

  it("(#4d) commit MESSAGE에 박힌 secret도 차단 — 외부 노출 표면 parity(회귀)", async () => {
    // 드리프트 버그: runner가 파일 content는 scanForSecrets로 막는데 commit message는 그대로
    // createCommit으로 흘려보냈다(실측 observed — 메시지에 박은 토큰이 public commit으로 push).
    // schema 주석 "raw transcript/비밀 절대 금지" 의도가 강제되지 않던 gap. 형제 secret 표면
    // (file content·PR title/body·comment)과 동일하게 공유 스캐너로 막는다. gitleaks 회피 위해 조합.
    const token = "ghp_" + "a".repeat(30);
    const client = makeClient();
    const res = await runMultiFileCommitExecute(
      request({ message: `chore: rotate ${token}`, files: [{ path: "src/a.ts", newContent: "export const a = 1;\n" }] }),
      deps({ client }),
    );
    expect(res.outcome).toBe("blocked");
    expect(res.reason).toBe("secret_suspect");
    expect(res.message).toContain("commit message");
    expect(client.getRefSha).not.toHaveBeenCalled();
    expect(client.createCommit).not.toHaveBeenCalled();
  });

  it("(#4e) commit MESSAGE의 NUL byte도 차단 — content/path NUL 가드와 parity(회귀)", async () => {
    // 드리프트 버그: checkPath/checkContent는 NUL(\0)을 막는데(각각 unsafe_path/binary) commit
    // message만 NUL을 통과시켜 createCommit으로 흘렸다(실측 ok). NUL은 C-string 절단·로그 인젝션
    // 표면이고 message엔 정당한 쓰임이 없다. content NUL과 동일하게 "binary"로 막고 GitHub 0회.
    const client = makeClient();
    const res = await runMultiFileCommitExecute(
      request({ message: "feat: ok\u0000hidden", files: [{ path: "src/a.ts", newContent: "export const a = 1;\n" }] }),
      deps({ client }),
    );
    expect(res.outcome).toBe("blocked");
    expect(res.reason).toBe("binary");
    expect(res.message).toContain("NUL");
    expect(client.getRefSha).not.toHaveBeenCalled();
    expect(client.createCommit).not.toHaveBeenCalled();
  });

  it("(#5) high-risk path(.github/workflows/) → server block, GitHub API 0회", async () => {
    const client = makeClient();
    const res = await runMultiFileCommitExecute(
      request({
        files: [{ path: ".github/workflows/ci.yml", newContent: "name: ci\n" }],
      }),
      deps({ client }),
    );
    expect(res.outcome).toBe("blocked");
    expect(res.reason).toBe("unsafe_path");
    expect(res.message).toContain("high-risk");
    expect(client.getRefSha).not.toHaveBeenCalled();
  });

  it("(#5b) '.' segment로 high-risk 차단 회피 시도 → server block, GitHub API 0회(회귀)", async () => {
    // git이 '.' segment를 접어 .github/workflows/evil.yml로 쓰는데, start-anchored
    // high-risk 패턴은 '.'를 끼운 path를 놓쳤다(정규화 회피). interior·leading 둘 다 차단.
    for (const path of [".github/./workflows/evil.yml", "./.github/workflows/evil.yml"]) {
      const client = makeClient();
      const res = await runMultiFileCommitExecute(
        request({ files: [{ path, newContent: "name: ci\n" }] }),
        deps({ client }),
      );
      expect(res.outcome, path).toBe("blocked");
      expect(res.reason, path).toBe("unsafe_path");
      expect(client.getRefSha, path).not.toHaveBeenCalled();
    }
  });

  it("(#5c) 형제 단일파일 가드가 막는 경로(.git/·SSH 키·lockfile·산출물) parity 차단(회귀)", async () => {
    // 드리프트 버그: multi-file commit checkPath가 githubFileChangeWriteGuards.DENIED_PATH_PATTERNS가
    // 막는 git 메타데이터·SSH private key·lockfile·산출물 디렉터리를 허용했다(실측 ALLOW). 더 약한
    // write 경로라 agent가 .git/config나 .ssh/id_rsa를 commit할 수 있었다. 같은 taxonomy로 막힌다.
    for (const path of [
      ".git/config",
      "sub/.git/hooks/pre-commit",
      "id_rsa",
      ".ssh/id_ed25519",
      "node_modules/foo/index.js",
      "dist/bundle.js",
      "build/out.js",
      ".next/cache.js",
      "coverage/lcov.info",
      "package-lock.json",
      "pnpm-lock.yaml",
      "yarn.lock",
    ]) {
      const client = makeClient();
      const res = await runMultiFileCommitExecute(
        request({ files: [{ path, newContent: "x\n" }] }),
        deps({ client }),
      );
      expect(res.outcome, path).toBe("blocked");
      expect(res.reason, path).toBe("unsafe_path");
      expect(client.getRefSha, path).not.toHaveBeenCalled();
    }
  });

  it("(#6a) binary content(NUL) → server block, GitHub API 0회", async () => {
    const client = makeClient();
    const res = await runMultiFileCommitExecute(
      request({ files: [{ path: "bin.dat", newContent: "abc\0def" }] }),
      deps({ client }),
    );
    expect(res.outcome).toBe("blocked");
    expect(res.reason).toBe("binary");
    expect(client.createBlob).not.toHaveBeenCalled();
  });

  it("(#6b) too_large(파일 단일 256KiB 초과) → server block", async () => {
    const big = "x".repeat(256 * 1024 + 1);
    const client = makeClient();
    const res = await runMultiFileCommitExecute(
      request({ files: [{ path: "src/big.ts", newContent: big }] }),
      deps({ client }),
    );
    expect(res.outcome).toBe("blocked");
    expect(res.reason).toBe("too_large");
    expect(client.createBlob).not.toHaveBeenCalled();
  });

  it("(#7) blob 성공 / tree 실패 → observed 아님(부분 성공 표시 X)", async () => {
    const client = makeClient({
      createTree: vi.fn(async () => {
        throw new Error("tree create fail");
      }),
    });
    const res = await runMultiFileCommitExecute(request(), deps({ client }));
    expect(res.outcome).toBe("failed");
    expect(res.reason).toBe("github_error");
    expect(res.commitSha).toBeUndefined();
    expect(client.createBlob).toHaveBeenCalledTimes(2);
    expect(client.createCommit).not.toHaveBeenCalled();
    expect(client.updateRefSha).not.toHaveBeenCalled();
  });

  it("(#8 approval) approval 거부 → approval_required, GitHub API 0회", async () => {
    const client = makeClient();
    const res = await runMultiFileCommitExecute(
      request(),
      deps({ client, verifyApproval: vi.fn(async () => false) }),
    );
    expect(res.outcome).toBe("approval_required");
    expect(client.getRefSha).not.toHaveBeenCalled();
  });

  it("(#9 allowlist) repo가 allowlist 아님 → blocked", async () => {
    const client = makeClient();
    const res = await runMultiFileCommitExecute(
      request({ repoFullName: "evil/repo" }),
      deps({ client, writeRepoAllowlist: ["robin/lab"] }),
    );
    expect(res.outcome).toBe("blocked");
    expect(res.reason).toBe("allowlist");
    expect(client.getRefSha).not.toHaveBeenCalled();
  });

  it("(#10 protected branch) main 직접 commit 시도 → blocked(branch_protection)", async () => {
    const client = makeClient();
    const res = await runMultiFileCommitExecute(
      request({ branchName: "main" }),
      deps({ client, protectedBranches: ["main"] }),
    );
    expect(res.outcome).toBe("blocked");
    expect(res.reason).toBe("branch_protection");
    expect(client.getRefSha).not.toHaveBeenCalled();
  });

  it("(#11 invalid branch prefix) random prefix 거부", async () => {
    const client = makeClient();
    const res = await runMultiFileCommitExecute(
      request({ branchName: "evil/branch" }),
      deps({ client, protectedBranches: ["main"] }),
    );
    expect(res.outcome).toBe("blocked");
    expect(res.reason).toBe("branch_protection");
  });

  it("(#11b refspec injection) git ref 특수문법 branchName 차단 — W2 parity(회귀)", async () => {
    // 드리프트 버그: checkBranch가 prefix/protected만 보고 ..  //  @{  \  trailing . 같은
    // git ref 특수문법을 놓쳐, prefix만 맞으면(agent/foo..bar 등) 그대로 getRefSha/updateRefSha의
    // ref로 흘러가 ref 조작 표면이 됐다(실측 ALLOW). W2 evaluateBranchNamePolicy와 안전성 parity.
    for (const branchName of [
      "agent/foo..bar",
      "agent/x@{0}",
      "agent/foo\\bar",
      "agent/a//b",
      "agent/end.",
      "agent/feature/", // trailing slash
    ]) {
      const client = makeClient();
      const res = await runMultiFileCommitExecute(
        request({ branchName }),
        deps({ client, protectedBranches: ["main"] }),
      );
      expect(res.outcome, branchName).toBe("blocked");
      expect(res.reason, branchName).toBe("branch_protection");
      expect(client.getRefSha, branchName).not.toHaveBeenCalled();
    }
    // 정상 작업 가지(debate/ 포함)는 계속 통과 — 안전성 검증이 오탐을 만들지 않는다.
    for (const branchName of ["agent/ok-feature", "debate/topic-1"]) {
      const client = makeClient();
      const res = await runMultiFileCommitExecute(request({ branchName }), deps({ client }));
      expect(res.outcome, branchName).toBe("observed");
    }
  });

  it("(#12 duplicate path) 같은 path 2개 → blocked(duplicate_path)", async () => {
    const client = makeClient();
    const res = await runMultiFileCommitExecute(
      request({
        files: [
          { path: "src/a.ts", newContent: "x" },
          { path: "src/a.ts", newContent: "y" },
        ],
      }),
      deps({ client }),
    );
    expect(res.outcome).toBe("blocked");
    expect(res.reason).toBe("duplicate_path");
    expect(client.getRefSha).not.toHaveBeenCalled();
  });

  it("(#13 traversal) path가 .. 포함 → blocked", async () => {
    const client = makeClient();
    const res = await runMultiFileCommitExecute(
      request({ files: [{ path: "../etc/passwd", newContent: "x" }] }),
      deps({ client }),
    );
    expect(res.outcome).toBe("blocked");
    expect(res.reason).toBe("unsafe_path");
    expect(client.getRefSha).not.toHaveBeenCalled();
  });

  it("(#14 permission denied) client가 GithubGitDataPermissionError throw → permission_denied", async () => {
    const client = makeClient({
      getRefSha: vi.fn(async () => {
        throw new GithubGitDataPermissionError("no write scope");
      }),
    });
    const res = await runMultiFileCommitExecute(request(), deps({ client }));
    expect(res.outcome).toBe("permission_denied");
    expect(res.reason).toBe("permission_denied");
  });

  it("(#15 message) 요청 raw transcript/secret이 message에 들어가도 trace 응답에 raw newContent는 절대 안 들어감", async () => {
    // 응답 객체에 file newContent는 절대 노출 X(가드).
    const client = makeClient();
    const res = await runMultiFileCommitExecute(
      request({ files: [{ path: "src/x.ts", newContent: "very secret content goes here" }] }),
      deps({ client }),
    );
    // observed면 응답에 commitSha/treeSha는 있지만 newContent는 없다.
    expect(JSON.stringify(res)).not.toContain("very secret content");
  });
});
