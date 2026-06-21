import { createHash } from "node:crypto";
import { isRepoAllowed, scanForSecrets } from "./githubCommentWriteGuards.js";
import { evaluateBranchNamePolicy } from "./githubBranchWriteGuards.js";

/**
 * W3a — GitHub file change plan 안전 게이트(순수).
 *
 *   - repo allowlist: W1과 동일 env(GITHUB_WRITE_REPO_ALLOWLIST)
 *   - branch policy: W2와 동일(agent/work/user/mission/ prefix만; 보호 브랜치 차단)
 *   - path policy: traversal/absolute/null-byte/위험 path(.env/.github/workflows/*.pem/*.key 등) 차단
 *   - large-or-binary guard: NUL 바이트 존재 → binary 간주. 길이 한도 초과 → 차단.
 *   - secret scan: 새 콘텐츠 전체 검사(W1 scanner 재사용). diff hunk만 검사하지 않는 이유는,
 *     교활한 컨텍스트에서 토큰이 'context' 라인으로 들어와도 외부로 누출되는 결과는 같기 때문.
 *   - no-op: oldContent === newContent → 차단. 승인 큐를 빈 변경으로 어지럽히지 않는다.
 *
 * 모든 결정은 입력만으로 도출(외부 호출 없음). 게이트 통과 시 sha들을 함께 반환한다.
 */

const REPO_PATTERN = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;

export const FILE_CONTENT_MAX_BYTES = 256 * 1024; // 256 KiB — diff/preview/scan 비용 한도
export const PATH_MAX_LEN = 512;

/**
 * 위험 path 차단 — 명시적 deny-list.
 * (allow-list로 더 좁히는 정책은 docs로 적되, 실제 차단 강제는 deny-list로 한다. 코드/문서 분리.)
 *
 *   - .env, .env.*, *.pem, *.key, id_rsa* : 비밀 저장소
 *   - .github/workflows/* : CI 자동 트리거 가능 → 외부 공격 표면
 *   - .git/* : git 메타데이터 — 외부 PUT으로 수정 불가하지만 의도 자체가 의심스러움
 *   - node_modules/*, dist/*, build/*, .next/*, coverage/* : 산출물/외부 자산
 *   - package-lock.json, pnpm-lock.yaml, yarn.lock : LLM이 손대면 망가지기 쉬움(경고 후 별도 승인 필요한 영역이므로 W3a에서는 차단)
 */
const DENIED_PATH_PATTERNS: ReadonlyArray<{ name: string; test: (path: string) => boolean }> = [
  { name: ".env*", test: (p) => /(^|\/)\.env(\..+)?$/.test(p) },
  // env/ 디렉터리·secrets(.|/) — 형제 multi-file commit 가드(githubMultiFileCommit.checkPath)는
  // 막는데 이 단일파일 가드는 빠뜨려, env/production.json·secrets.yaml·secrets/db.txt 같은
  // 비밀 저장 경로를 단일파일 write로는 허용하던 드리프트가 있었다(실측 ok:true). 파일명 기반
  // defense-in-depth 층이라 토큰 형태가 아닌 비밀(password: …)도 막는다. 같은 taxonomy로 parity.
  { name: "env/*", test: (p) => /(^|\/)env\//i.test(p) },
  { name: "secrets?", test: (p) => /(^|\/)secrets?(\.|\/|$)/i.test(p) },
  { name: "*.pem", test: (p) => /\.pem$/i.test(p) },
  { name: "*.key", test: (p) => /\.key$/i.test(p) },
  { name: "id_rsa*", test: (p) => /(^|\/)id_(?:rsa|ed25519|ecdsa|dsa)(\..*)?$/.test(p) },
  { name: ".github/workflows/*", test: (p) => /(^|\/)\.github\/workflows\//.test(p) },
  { name: ".git/*", test: (p) => /(^|\/)\.git\//.test(p) || p === ".git" },
  { name: "node_modules/*", test: (p) => /(^|\/)node_modules\//.test(p) },
  { name: "dist/*", test: (p) => /(^|\/)dist\//.test(p) },
  { name: "build/*", test: (p) => /(^|\/)build\//.test(p) },
  { name: ".next/*", test: (p) => /(^|\/)\.next\//.test(p) },
  { name: "coverage/*", test: (p) => /(^|\/)coverage\//.test(p) },
  { name: "package-lock.json", test: (p) => /(^|\/)package-lock\.json$/.test(p) },
  { name: "pnpm-lock.yaml", test: (p) => /(^|\/)pnpm-lock\.yaml$/.test(p) },
  { name: "yarn.lock", test: (p) => /(^|\/)yarn\.lock$/.test(p) },
];

export type PathPolicyResult = { ok: true; normalized: string } | { ok: false; reason: string };

/**
 * 저장소 루트 기준 path 정책. 통과 시 정규화(앞 슬래시 제거, ./ 제거)한 path를 반환한다.
 *   - 절대 경로(/) 금지 — 저장소 외부 표시
 *   - .. segment 금지 — traversal
 *   - null byte / NUL 금지 — path injection
 *   - 백슬래시 금지 — Windows path 혼입 방지(GitHub는 forward slash만)
 *   - 빈 segment(//) 금지
 *   - 위 DENIED_PATH_PATTERNS 매칭 시 차단
 */
export function evaluateFilePathPolicy(rawPath: string): PathPolicyResult {
  const path = (rawPath ?? "").trim();
  if (!path) return { ok: false, reason: "path가 비어 있습니다" };
  if (path.length > PATH_MAX_LEN) return { ok: false, reason: `path가 너무 깁니다(최대 ${PATH_MAX_LEN}자)` };
  if (path.includes("\0")) return { ok: false, reason: "path에 NUL 바이트가 포함되어 있습니다" };
  if (path.includes("\\")) return { ok: false, reason: "path에 역슬래시(\\\\)가 포함되어 있습니다 — forward slash만 허용" };
  if (path.startsWith("/")) return { ok: false, reason: "절대 경로(/)는 허용되지 않습니다" };
  // ./ 제거
  let normalized = path.replace(/^\.\//, "");
  if (normalized.includes("..")) {
    // segment 단위로 정확히 본다(파일명에 ..xx가 들어가는 건 허용 — segment 단위 ".."만 금지)
    const parts = normalized.split("/");
    if (parts.some((seg) => seg === "..")) {
      return { ok: false, reason: "path에 '..' segment가 포함되어 있습니다(traversal 금지)" };
    }
  }
  // '.' segment(예: a/./b, .github/./workflows/x.yml)도 차단. git/GitHub는 이를 정규화로
  // 접어 실제로는 a/b·.github/workflows/x.yml을 가리키는데, deny-list는 *연속* substring을
  // 매칭하므로 segment 사이에 '.'를 끼우면 .github/workflows/ 같은 다중-segment 차단을
  // 회피할 수 있다(leading "./"는 위에서 이미 제거됨 — 여기 걸리는 건 interior/trailing '.').
  // '..'·'//'와 동일한 정규화-회피 부류라 같은 강도로 막는다.
  if (normalized.split("/").some((seg) => seg === ".")) {
    return { ok: false, reason: "path에 '.' segment가 포함되어 있습니다(정규화 회피 금지)" };
  }
  if (normalized.includes("//")) return { ok: false, reason: "path에 빈 segment(//)가 포함되어 있습니다" };
  if (normalized.endsWith("/")) return { ok: false, reason: "path는 디렉터리가 아니라 파일이어야 합니다" };
  for (const rule of DENIED_PATH_PATTERNS) {
    if (rule.test(normalized)) {
      return { ok: false, reason: `${rule.name} 경로는 W3a에서 차단됩니다(보안/안정성 정책)` };
    }
  }
  return { ok: true, normalized };
}

/**
 * 콘텐츠 텍스트성 검사. NUL 바이트가 있으면 binary로 간주(GitHub Contents API도 NUL을 다르게 처리).
 * UTF-16 surrogate 등 일부 invalid sequence는 zod 입력이 이미 string이라 큰 문제가 아니지만, 안전상
 * 한 번 더 길이 체크.
 */
export type ContentSafetyResult = { ok: true; size: number; sha256: string } | { ok: false; reason: string };

export function evaluateNewContentSafety(content: string): ContentSafetyResult {
  if (content == null) return { ok: false, reason: "newContent가 없습니다" };
  // utf-8 byte length로 캡 — string.length는 code unit 수라 길어질 수 있음.
  const size = Buffer.byteLength(content, "utf8");
  if (size > FILE_CONTENT_MAX_BYTES) {
    return { ok: false, reason: `newContent가 너무 큽니다(${size}B, 한도 ${FILE_CONTENT_MAX_BYTES}B). 작은 단위 변경으로 분할하세요.` };
  }
  if (content.includes("\0")) {
    return { ok: false, reason: "newContent에 NUL 바이트가 있어 binary로 판단 — 텍스트만 허용" };
  }
  const sha256 = createHash("sha256").update(content, "utf8").digest("hex");
  return { ok: true, size, sha256 };
}

/** 본 콘텐츠(이미 GitHub에서 observed로 읽은 텍스트)도 동일한 한도/binary 가드를 통과해야 한다. */
export function evaluateBaseContentSafety(content: string): ContentSafetyResult {
  return evaluateNewContentSafety(content);
}

export type FileChangeGate =
  | {
      kind: "ok";
      repoFullName: string;
      branchRef: string;
      branchName: string;
      path: string;
      newContentSha256: string;
      newContentBytes: number;
    }
  | { kind: "blocked"; reason: string };

/**
 * W3a plan에서 적용되는 정적(외부 호출 없는) 안전 검증. 통과해도 아직 GitHub는 안 봤고,
 * 호출자가 별도로 (1) GitHub에서 branch ref read, (2) file read, (3) no-op 비교를 한다.
 */
export function evaluateFileChangeGate(input: {
  repoFullName: string;
  branchName: string;
  path: string;
  newContent: string;
  allowlist: ReadonlyArray<string>;
  tokenPresent: boolean;
}): FileChangeGate {
  if (!input.tokenPresent) {
    return { kind: "blocked", reason: "GITHUB_TOKEN이 없어 write가 비활성화되어 있습니다" };
  }
  if (input.allowlist.length === 0) {
    return { kind: "blocked", reason: "GITHUB_WRITE_REPO_ALLOWLIST가 비어 있어 write가 비활성화되어 있습니다" };
  }
  if (!REPO_PATTERN.test(input.repoFullName) || !isRepoAllowed(input.repoFullName, input.allowlist)) {
    return { kind: "blocked", reason: `${input.repoFullName}은(는) write 허용 목록에 없습니다` };
  }
  const branchPolicy = evaluateBranchNamePolicy(input.branchName);
  if (!branchPolicy.ok) {
    return { kind: "blocked", reason: `target branch 거부: ${branchPolicy.reason}` };
  }
  const pathPolicy = evaluateFilePathPolicy(input.path);
  if (!pathPolicy.ok) {
    return { kind: "blocked", reason: pathPolicy.reason };
  }
  const safety = evaluateNewContentSafety(input.newContent);
  if (!safety.ok) {
    return { kind: "blocked", reason: safety.reason };
  }
  const secret = scanForSecrets(input.newContent);
  if (!secret.ok) {
    return {
      kind: "blocked",
      reason: `newContent에서 비밀 패턴 감지(${secret.matched}) — 외부 푸시를 차단합니다`,
    };
  }
  return {
    kind: "ok",
    repoFullName: input.repoFullName,
    branchRef: branchPolicy.ref,
    branchName: input.branchName.trim(),
    path: pathPolicy.normalized,
    newContentSha256: safety.sha256,
    newContentBytes: safety.size,
  };
}

/** 결정적 sha256 — base content 비교에 사용. */
export function contentSha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}
