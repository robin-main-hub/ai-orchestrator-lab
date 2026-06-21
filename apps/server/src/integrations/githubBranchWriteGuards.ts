/**
 * W2 GitHub branch create 안전 게이트(순수).
 *
 *   - branch name policy: agent/* 또는 work/* prefix만 허용. main/master/develop/
 *     release/hotfix 직접 생성 금지. refs/* 직접 입력 금지. unsafe chars 차단.
 *   - source ref normalize: refs/heads/main 처럼 들어와도 "main"으로 정규화.
 *   - allowlist 재사용: comment write와 동일한 GITHUB_WRITE_REPO_ALLOWLIST.
 *
 * 모든 결정은 환경변수 + 입력만으로 결정적으로 도출 — 외부 호출 없음.
 */

const REPO_PATTERN = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;

/** branch name에 허용되는 문자(영문/숫자/대시/밑줄/슬래시/점). 한글·공백·shell 메타 차단. */
const BRANCH_SAFE_PATTERN = /^[A-Za-z0-9._/-]+$/;

/** 직접 생성을 금지하는 보호 브랜치(완전 일치 + release/hotfix prefix). */
const PROTECTED_EXACT = new Set(["main", "master", "develop", "trunk", "default"]);
const PROTECTED_PREFIX = ["release/", "hotfix/", "prod/", "production/"];

/**
 * 새 branch 이름은 이 prefix 중 하나로만. (사용자/에이전트 작업 공간만 쓰게 묶는다)
 *   - agent/*   에이전트(자동/스웜 등)가 만든 작업 가지
 *   - work/*    일반 작업 가지(날짜/슬러그 등 자유 조합 권장)
 *   - mission/* Mission 단위로 만들어지는 가지(mission id-에 연결)
 *   - user/*    사용자가 명시적으로 이름 지정한 임시 가지. 의도: explicit user-named
 *               scratch branches — 익명·랜덤 이름의 우회로가 되지 않게 docs로 못 박는다.
 *               (불필요해지면 W2 후속에서 제거 가능 — 보호 브랜치 차단은 별도 규칙이라
 *                이 prefix만 빼면 됨)
 */
const ALLOWED_PREFIXES = ["agent/", "work/", "user/", "mission/"];

export const BRANCH_NAME_MIN = 3;
export const BRANCH_NAME_MAX = 120;

/** source ref 정규화 — refs/heads/main, heads/main, main 다 "main"으로. */
export function normalizeSourceRef(raw: string): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("refs/heads/")) return trimmed.slice("refs/heads/".length);
  if (trimmed.startsWith("heads/")) return trimmed.slice("heads/".length);
  if (trimmed.startsWith("refs/")) return ""; // refs/tags, refs/pull 등은 source로 쓰지 않는다
  return trimmed;
}

/**
 * git ref 이름의 *안전 문자/문법*만 검사(prefix/protected 정책은 별도). source ref처럼
 * 보호 브랜치(main 등)도 정당한 값이라 prefix/protected를 적용할 수 없는 자리에서, 그래도
 * ref 조작 표면을 막기 위해 쓴다. evaluateBranchNamePolicy의 안전성 부분과 동일 강도.
 *   - 빈 값, 선행 -·/, 후행 /·., ..  //  @{  \, 비안전 문자(공백·한글·shell 메타) 거부
 */
export function isSafeGitRefName(name: string): boolean {
  if (!name) return false;
  if (name.startsWith("-") || name.startsWith("/") || name.endsWith("/") || name.endsWith(".")) return false;
  if (name.includes("..") || name.includes("//") || name.includes("@{") || name.includes("\\")) return false;
  return BRANCH_SAFE_PATTERN.test(name);
}

export type BranchNamePolicyResult = { ok: true; ref: string } | { ok: false; reason: string };

export function evaluateBranchNamePolicy(rawName: string): BranchNamePolicyResult {
  const name = (rawName ?? "").trim();
  if (!name) return { ok: false, reason: "branch 이름이 비어 있습니다" };
  if (name.length < BRANCH_NAME_MIN) return { ok: false, reason: `branch 이름이 너무 짧습니다(최소 ${BRANCH_NAME_MIN}자)` };
  if (name.length > BRANCH_NAME_MAX) return { ok: false, reason: `branch 이름이 너무 깁니다(최대 ${BRANCH_NAME_MAX}자)` };
  if (name.startsWith("refs/")) return { ok: false, reason: "refs/* 형식은 직접 입력할 수 없습니다(branch 이름만 입력)" };
  if (name.startsWith("-") || name.startsWith("/") || name.endsWith("/") || name.endsWith(".")) {
    return { ok: false, reason: "branch 이름이 -, /, .으로 시작/끝날 수 없습니다" };
  }
  if (name.includes("..") || name.includes("//") || name.includes("@{") || name.includes("\\")) {
    return { ok: false, reason: "branch 이름에 ..  //  @{  \\는 허용되지 않습니다" };
  }
  if (!BRANCH_SAFE_PATTERN.test(name)) {
    return { ok: false, reason: "branch 이름에 허용되지 않는 문자가 있습니다(영문/숫자/. _ - / 만 허용)" };
  }
  if (PROTECTED_EXACT.has(name)) return { ok: false, reason: `${name}은(는) 보호 브랜치라 직접 생성할 수 없습니다` };
  for (const prefix of PROTECTED_PREFIX) {
    if (name.startsWith(prefix)) return { ok: false, reason: `${prefix}* 브랜치는 직접 생성할 수 없습니다` };
  }
  if (!ALLOWED_PREFIXES.some((prefix) => name.startsWith(prefix))) {
    return { ok: false, reason: `branch 이름은 ${ALLOWED_PREFIXES.join(", ")} 중 하나로 시작해야 합니다` };
  }
  return { ok: true, ref: `refs/heads/${name}` };
}

export type BranchCreateGate =
  | { kind: "ok"; sourceRef: string; ref: string }
  | { kind: "blocked"; reason: string };

export function evaluateBranchCreateGate(input: {
  repoFullName: string;
  sourceRef: string;
  newBranchName: string;
  allowlist: ReadonlyArray<string>;
  tokenPresent: boolean;
}): BranchCreateGate {
  if (!input.tokenPresent) {
    return { kind: "blocked", reason: "GITHUB_TOKEN이 없어 write가 비활성화되어 있습니다" };
  }
  if (input.allowlist.length === 0) {
    return { kind: "blocked", reason: "GITHUB_WRITE_REPO_ALLOWLIST가 비어 있어 write가 비활성화되어 있습니다" };
  }
  if (!REPO_PATTERN.test(input.repoFullName) || !input.allowlist.includes(input.repoFullName)) {
    return { kind: "blocked", reason: `${input.repoFullName}은(는) write 허용 목록에 없습니다` };
  }
  const sourceRef = normalizeSourceRef(input.sourceRef);
  if (!sourceRef) return { kind: "blocked", reason: "source ref가 비어 있거나 refs/tags 등 지원하지 않는 경로입니다" };
  // newBranchName은 evaluateBranchNamePolicy로 ..  @{  \ 등을 거부하는데, source ref는
  // normalizeSourceRef(prefix 제거)만 거쳐 그대로 getRefSha의 ref로 흘러가, main@{0}·main..evil·
  // "main ; rm -rf"·한글 같은 refspec/shell 메타가 통과했다(실측 OK). source는 보호 브랜치(main 등)도
  // 정당하므로 prefix/protected 정책은 적용하지 않고 안전 문자/문법만 동일 강도로 막는다.
  if (!isSafeGitRefName(sourceRef)) {
    return { kind: "blocked", reason: `source ref '${sourceRef}'에 허용되지 않는 git ref 문자/문법이 있습니다` };
  }
  const policy = evaluateBranchNamePolicy(input.newBranchName);
  if (!policy.ok) return { kind: "blocked", reason: policy.reason };
  return { kind: "ok", sourceRef, ref: policy.ref };
}
