import type {
  GithubMultiFileCommitExecuteRequest,
  GithubMultiFileCommitExecuteResponse,
} from "@ai-orchestrator/protocol";
import {
  GITHUB_MULTIFILE_COMMIT_PER_FILE_BYTES_MAX,
  GITHUB_MULTIFILE_COMMIT_TOTAL_BYTES_MAX,
} from "@ai-orchestrator/protocol";
import { scanForSecrets } from "./githubCommentWriteGuards.js";

/**
 * W5b — Multi-file atomic commit runner.
 *
 * 시퀀스(엄격 순서, 중간 실패는 전부 abort — 부분 적용 금지):
 *   1. server-side guard 전면 재검증(파일별 path/secret/binary/too_large, 전체 total bytes, duplicate path).
 *   2. high-risk path(.github/workflows, env, secrets, *.pem, *.key) 거부.
 *   3. repo allowlist + branch protection(W2) 재확인.
 *   4. approval 검증(armed 없음, 필수).
 *   5. GET ref HEAD sha → expectedHeadSha 일치 확인(낙관적 동시성).
 *   6. GET commit → tree sha(base_tree).
 *   7. 각 파일 → createBlob → blob sha 수집.
 *   8. createTree(base_tree=current, entries=[mode/type/path/sha]).
 *   9. createCommit(parents=[currentHead], tree=newTree, message).
 *   10. updateRef(force=false). 409/422 → head_mismatch.
 *
 * 부분 성공으로 표시하지 않는다 — ref update가 성공할 때만 observed.
 */

export interface GithubGitDataClient {
  getRefSha(owner: string, repo: string, branch: string): Promise<string>;
  getCommitTreeSha(owner: string, repo: string, commitSha: string): Promise<string>;
  createBlob(owner: string, repo: string, content: string): Promise<{ sha: string }>;
  createTree(
    owner: string,
    repo: string,
    input: {
      baseTreeSha: string;
      entries: Array<{ path: string; mode: "100644"; type: "blob"; sha: string }>;
    },
  ): Promise<{ sha: string }>;
  createCommit(
    owner: string,
    repo: string,
    input: { message: string; treeSha: string; parentShas: string[] },
  ): Promise<{ sha: string; htmlUrl?: string }>;
  /** force=false 강제. 409/422는 호출자가 head_mismatch로 매핑(GithubGitDataConflictError). */
  updateRefSha(
    owner: string,
    repo: string,
    branch: string,
    sha: string,
  ): Promise<{ ref: string; sha: string }>;
}

// 클라이언트의 conflict error를 재사용(단일 진실 소스).
import { GithubGitDataConflictError } from "./githubReadonlyClient.js";
export { GithubGitDataConflictError };

export class GithubGitDataPermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GithubGitDataPermissionError";
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Server-side guards(클라이언트 가드는 신뢰 X — 여기서 모두 재검증).
// ──────────────────────────────────────────────────────────────────────────────

const HIGH_RISK_PATH_PATTERNS: ReadonlyArray<RegExp> = [
  /^\.github\/workflows\//i,
  /^\.env($|\.|\/)/i,          // .env, .env.local, .env/foo
  /\.env$/i,                    // foo.env(config.env 등)
  /(^|\/)env\//i,               // env/ 디렉터리
  /(^|\/)secrets?(\.|\/|$)/i,
  /\.pem$/i,
  /\.key$/i,
];

const ALLOWED_BRANCH_PREFIX = /^(agent|work|user|mission|debate)\//;

function utf8Bytes(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}

type GuardOk = { ok: true };
type GuardBlock = {
  ok: false;
  reason: NonNullable<GithubMultiFileCommitExecuteResponse["reason"]>;
  message: string;
};
type GuardResult = GuardOk | GuardBlock;

function block(reason: GuardBlock["reason"], message: string): GuardBlock {
  return { ok: false, reason, message };
}

/** Path 가드 — traversal/absolute/NUL/high-risk/empty. */
export function checkPath(path: string): GuardResult {
  if (!path || !path.trim()) return block("unsafe_path", "empty path");
  if (path.includes("\0")) return block("unsafe_path", "path contains NUL");
  if (path.startsWith("/")) return block("unsafe_path", "absolute path 금지");
  if (path.includes("..")) return block("unsafe_path", "path traversal 금지");
  if (path.includes("\\")) return block("unsafe_path", "backslash 금지(forward slash만)");
  for (const pattern of HIGH_RISK_PATH_PATTERNS) {
    if (pattern.test(path)) return block("unsafe_path", `high-risk path(${pattern.source})`);
  }
  return { ok: true };
}

/** Content 가드 — binary/too_large/secret_suspect. */
export function checkContent(content: string): GuardResult {
  if (content.includes("\0")) return block("binary", "binary content(NUL byte)");
  const bytes = utf8Bytes(content);
  if (bytes > GITHUB_MULTIFILE_COMMIT_PER_FILE_BYTES_MAX) {
    return block("too_large", `파일 단일 ${bytes}B > ${GITHUB_MULTIFILE_COMMIT_PER_FILE_BYTES_MAX}B`);
  }
  // 비밀 패턴 스캔은 W1 공유 스캐너(githubCommentWriteGuards)를 단일 진실 소스로 재사용한다.
  // 과거엔 이 모듈이 자체 SECRET_PATTERNS를 복제해 들고 있었는데, 공유 스캐너에 fine-grained
  // PAT(github_pat_) 패턴이 추가됐을 때 이 복제본만 누락돼 commit 경로로는 비밀이 빠져나갈 수
  // 있었다(드리프트). 공유 스캐너를 호출해 그 클래스의 false-negative를 원천 차단한다.
  const secret = scanForSecrets(content);
  if (!secret.ok) return block("secret_suspect", `secret 패턴 의심(${secret.matched})`);
  return { ok: true };
}

/** Branch 정책 — W2 prefix와 보호 브랜치 거부. */
export function checkBranch(branchName: string, protectedBranches: ReadonlyArray<string>): GuardResult {
  if (protectedBranches.includes(branchName)) {
    return block("branch_protection", `보호 브랜치 '${branchName}'에 직접 commit 금지`);
  }
  if (!ALLOWED_BRANCH_PREFIX.test(branchName)) {
    return block(
      "branch_protection",
      `branch '${branchName}'는 정책 prefix(agent|work|user|mission|debate)/ 만 허용`,
    );
  }
  return { ok: true };
}

/** Repo allowlist 검사. */
export function checkRepoAllowlist(repoFullName: string, allowlist: ReadonlyArray<string>): GuardResult {
  if (allowlist.length === 0) {
    return block("allowlist", "GITHUB_WRITE_REPO_ALLOWLIST 미설정");
  }
  if (!allowlist.includes(repoFullName)) {
    return block("allowlist", `repo '${repoFullName}'은 allowlist에 없음`);
  }
  return { ok: true };
}

/** 입력 전체 검증(파일별 + 합계 + 중복 path). */
export function validateFiles(
  files: ReadonlyArray<{ path: string; newContent: string }>,
): GuardResult {
  let totalBytes = 0;
  const seen = new Set<string>();
  for (const f of files) {
    const p = checkPath(f.path);
    if (!p.ok) return p;
    const c = checkContent(f.newContent);
    if (!c.ok) return c;
    if (seen.has(f.path)) {
      return block("duplicate_path", `같은 path가 두 번 있음: ${f.path}`);
    }
    seen.add(f.path);
    totalBytes += utf8Bytes(f.newContent);
  }
  if (totalBytes > GITHUB_MULTIFILE_COMMIT_TOTAL_BYTES_MAX) {
    return block(
      "too_large",
      `합계 ${totalBytes}B > ${GITHUB_MULTIFILE_COMMIT_TOTAL_BYTES_MAX}B`,
    );
  }
  return { ok: true };
}

// ──────────────────────────────────────────────────────────────────────────────
// Runner
// ──────────────────────────────────────────────────────────────────────────────

export interface MultiFileCommitDeps {
  client: GithubGitDataClient;
  /** approvalId 검증 — false면 approval_required. */
  verifyApproval: (approvalId: string) => Promise<boolean>;
  /** 환경 변수에서 받는 write repo allowlist. */
  writeRepoAllowlist: ReadonlyArray<string>;
  /** 보호 브랜치(예: ['main', 'master']) — 기본은 호출자가 결정. */
  protectedBranches: ReadonlyArray<string>;
  now: () => string;
}

export async function runMultiFileCommitExecute(
  request: GithubMultiFileCommitExecuteRequest,
  deps: MultiFileCommitDeps,
): Promise<GithubMultiFileCommitExecuteResponse> {
  // (1) repo allowlist + branch policy
  const repoGate = checkRepoAllowlist(request.repoFullName, deps.writeRepoAllowlist);
  if (!repoGate.ok) {
    return blockedResponse(repoGate.reason, repoGate.message);
  }
  const branchGate = checkBranch(request.branchName, deps.protectedBranches);
  if (!branchGate.ok) {
    return blockedResponse(branchGate.reason, branchGate.message);
  }
  // (2) 파일별/전체 가드
  const filesGate = validateFiles(request.files);
  if (!filesGate.ok) {
    return blockedResponse(filesGate.reason, filesGate.message);
  }
  // (3) approval
  const authorized = await deps.verifyApproval(request.approvalId);
  if (!authorized) {
    return {
      outcome: "approval_required",
      truthStatus: "planned",
      message: "approval이 승인되지 않았습니다",
    };
  }
  const [owner, repo] = request.repoFullName.split("/") as [string, string];
  // (4) GET ref → expectedHeadSha 일치 확인
  let headSha: string;
  try {
    headSha = await deps.client.getRefSha(owner, repo, request.branchName);
  } catch (error) {
    return errorResponse(error);
  }
  if (headSha !== request.expectedHeadSha) {
    return {
      outcome: "head_mismatch",
      truthStatus: "planned",
      reason: "head_mismatch",
      message: `branch HEAD가 expectedHeadSha와 다릅니다(expected ${request.expectedHeadSha} → 현재 ${headSha})`,
    };
  }
  // (5) GET commit → base tree sha
  let baseTreeSha: string;
  try {
    baseTreeSha = await deps.client.getCommitTreeSha(owner, repo, headSha);
  } catch (error) {
    return errorResponse(error);
  }
  // (6) blobs — 각 파일마다 createBlob(실패 시 abort: 어떤 ref update도 안 함, 부분 적용 0)
  const blobShas: Array<{ path: string; sha: string }> = [];
  for (const file of request.files) {
    try {
      const blob = await deps.client.createBlob(owner, repo, file.newContent);
      blobShas.push({ path: file.path, sha: blob.sha });
    } catch (error) {
      return errorResponse(error);
    }
  }
  // (7) createTree(base_tree=현재, entries=blob ref)
  let newTreeSha: string;
  try {
    const tree = await deps.client.createTree(owner, repo, {
      baseTreeSha,
      entries: blobShas.map((b) => ({ path: b.path, mode: "100644", type: "blob", sha: b.sha })),
    });
    newTreeSha = tree.sha;
  } catch (error) {
    return errorResponse(error);
  }
  // (8) createCommit(parents=[head])
  let newCommit: { sha: string; htmlUrl?: string };
  try {
    newCommit = await deps.client.createCommit(owner, repo, {
      message: request.message,
      treeSha: newTreeSha,
      parentShas: [headSha],
    });
  } catch (error) {
    return errorResponse(error);
  }
  // (9) updateRef(force=false). 409/422 → head_mismatch(다른 클라이언트가 그 사이 push).
  try {
    await deps.client.updateRefSha(owner, repo, request.branchName, newCommit.sha);
  } catch (error) {
    if (error instanceof GithubGitDataConflictError) {
      return {
        outcome: "head_mismatch",
        truthStatus: "planned",
        reason: "head_mismatch",
        message: error.message,
      };
    }
    return errorResponse(error);
  }
  // (10) 성공 — observed
  const totalBytes = request.files.reduce((sum, f) => sum + utf8Bytes(f.newContent), 0);
  return {
    outcome: "observed",
    truthStatus: "observed",
    commitSha: newCommit.sha,
    treeSha: newTreeSha,
    htmlUrl: newCommit.htmlUrl,
    fileCount: request.files.length,
    totalBytes,
    observedAt: deps.now(),
  };
}

function blockedResponse(
  reason: NonNullable<GithubMultiFileCommitExecuteResponse["reason"]>,
  message: string,
): GithubMultiFileCommitExecuteResponse {
  return { outcome: "blocked", truthStatus: "planned", reason, message };
}

function errorResponse(error: unknown): GithubMultiFileCommitExecuteResponse {
  if (error instanceof GithubGitDataPermissionError) {
    return {
      outcome: "permission_denied",
      truthStatus: "planned",
      reason: "permission_denied",
      message: error.message,
    };
  }
  return {
    outcome: "failed",
    truthStatus: "planned",
    reason: "github_error",
    message: error instanceof Error ? error.message : "unknown error",
  };
}
