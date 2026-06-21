import { createHash } from "node:crypto";

/**
 * W1 GitHub comment write 안전 게이트(순수). 모든 결정은 환경변수와 입력만으로
 * 결정적으로 도출되어 단위 테스트로 검증한다. 어느 한 게이트라도 실패하면 execute는
 * 차단되고 plan은 blocked 상태로만 만들어진다.
 *
 *   - repo allowlist : GITHUB_WRITE_REPO_ALLOWLIST="owner/repo,owner2/repo2" 환경변수 필수
 *   - body cap       : 16K 캡(프로토콜 zod max와 같음) + 비어 있지 않음
 *   - secret scan    : 흔한 토큰/키 패턴 발견 시 차단(외부 GitHub로 비밀 유출 방지)
 *   - bodySha256     : preview/replay payload와 실제 body의 동일성 검증
 */

export const COMMENT_BODY_MAX_CHARS = 16_000;
const REPO_PATTERN = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;

/** GITHUB_WRITE_REPO_ALLOWLIST 파싱(공백 제거, 빈 항목 제거, owner/repo 형식만 유지). */
export function parseRepoAllowlist(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0 && REPO_PATTERN.test(entry));
}

export function isRepoAllowed(repoFullName: string, allowlist: ReadonlyArray<string>): boolean {
  if (!REPO_PATTERN.test(repoFullName)) return false;
  return allowlist.includes(repoFullName);
}

/**
 * 댓글 본문에서 흔한 비밀 패턴을 감지. 발견되면 게시를 막아 외부(GitHub)로 비밀이 새지 않게.
 * false positive보다 false negative를 더 두려워한다 — 모호하면 차단.
 */
const SECRET_PATTERNS: ReadonlyArray<{ name: string; pattern: RegExp }> = [
  { name: "GitHub PAT (ghp_)", pattern: /\bghp_[A-Za-z0-9]{20,}\b/ },
  { name: "GitHub OAuth (gho_)", pattern: /\bgho_[A-Za-z0-9]{20,}\b/ },
  { name: "GitHub server-to-server (ghs_)", pattern: /\bghs_[A-Za-z0-9]{20,}\b/ },
  { name: "GitHub user-to-server (ghu_)", pattern: /\bghu_[A-Za-z0-9]{20,}\b/ },
  { name: "GitHub refresh (ghr_)", pattern: /\bghr_[A-Za-z0-9]{20,}\b/ },
  // 세분화(fine-grained) PAT — 2022년 이후 GitHub 권장 형식. 본문은 base62 + 내부 underscore.
  // classic ghp_/gho_/... 패턴이 prefix가 달라 못 잡으므로 별도로 추가(false negative 방지).
  { name: "GitHub fine-grained PAT (github_pat_)", pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/ },
  { name: "AWS access key", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "Anthropic API key", pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/ },
  { name: "OpenAI API key", pattern: /\bsk-[A-Za-z0-9]{40,}\b/ },
  // 모던(2024+) OpenAI 키 — sk-proj-… / sk-svcacct-… / sk-admin- 는 본문에 '-'·'_'가
  // 섞여 위의 pure-alnum sk-{40,} 규칙으로는 run이 끊겨 전혀 안 잡힌다(실측 false-negative).
  // H8d runner scanner는 broader sk-[...]{16,}로 이미 잡으므로 게이트 간 parity를 맞춘다.
  // 단, 광범위한 sk-<word>- 매칭은 산문(예: "sk-learn"=scikit-learn)을 오탐하므로
  // 문서화된 prefix(proj/svcacct/admin)로 한정 — false-positive 없이 누락만 막는다.
  { name: "OpenAI project key (sk-proj/svcacct/admin)", pattern: /\bsk-(?:proj|svcacct|admin)-[A-Za-z0-9_-]{20,}/ },
  { name: "Slack token", pattern: /\bxox[abposr]-[A-Za-z0-9-]{10,}\b/ },
  { name: "Google API key", pattern: /\bAIza[0-9A-Za-z_-]{30,}\b/ },
  { name: "Authorization Bearer header", pattern: /\bAuthorization\s*:\s*Bearer\s+\S+/i },
  // bare bearer 토큰 — "Authorization:" 헤더 형태가 아니라 따옴표 안/설정값으로 들어온
  // `Bearer <token>`도 잡는다. 위 헤더 규칙은 `Authorization:` 접두가 있을 때만 맞아,
  // 헤더 없이 토큰만 노출되면(예: `const h = "Bearer eyJ..."`) false-negative였다.
  // H8d runnerPatchSafety의 bearer_token 규칙과 동일 형태 — 게이트 간 패턴 parity.
  { name: "Bearer token", pattern: /\bBearer\s+[A-Za-z0-9._-]{8,}/ },
  // PEM/private-key 표식만 잡아도 충분
  { name: "Private key block", pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/ },
];

export type SecretScanResult = { ok: true } | { ok: false; matched: string };

export function scanForSecrets(body: string): SecretScanResult {
  for (const candidate of SECRET_PATTERNS) {
    if (candidate.pattern.test(body)) {
      return { ok: false, matched: candidate.name };
    }
  }
  return { ok: true };
}

/** 결정적 sha256 — preview를 그대로 hash. 클라이언트/서버가 동일하게 계산해야 함. */
export function bodySha256(body: string): string {
  return createHash("sha256").update(body, "utf8").digest("hex");
}

/** 프리뷰는 본문의 앞부분만(트레이스/응답에 raw 전체를 노출하지 않기 위한 안전선). */
export function bodyPreviewOf(body: string, maxChars = 400): string {
  return body.length <= maxChars ? body : `${body.slice(0, maxChars - 1)}…`;
}

/** 모든 안전선 결정 결과 — 어떤 항목이라도 fail이면 plan은 blocked가 된다. */
export type CommentWriteGate =
  | { kind: "ok"; sha: string; preview: string }
  | { kind: "blocked"; reason: string };

/**
 * plan 단계에서 적용되는 결정적 안전 검증.
 * 입력만 검사 — 외부 호출 없음. execute에서도 동일 게이트를 한 번 더 통과시켜야 함.
 */
export function evaluateCommentWriteGate(input: {
  repoFullName: string;
  body: string;
  allowlist: ReadonlyArray<string>;
  tokenPresent: boolean;
}): CommentWriteGate {
  if (!input.tokenPresent) {
    return { kind: "blocked", reason: "GITHUB_TOKEN이 없어 write가 비활성화되어 있습니다" };
  }
  if (input.allowlist.length === 0) {
    return {
      kind: "blocked",
      reason: "GITHUB_WRITE_REPO_ALLOWLIST가 비어 있어 write가 비활성화되어 있습니다",
    };
  }
  if (!isRepoAllowed(input.repoFullName, input.allowlist)) {
    return { kind: "blocked", reason: `${input.repoFullName}은(는) write 허용 목록에 없습니다` };
  }
  const body = input.body ?? "";
  if (!body.trim()) {
    return { kind: "blocked", reason: "body가 비어 있습니다" };
  }
  if (body.length > COMMENT_BODY_MAX_CHARS) {
    return { kind: "blocked", reason: `body가 너무 깁니다(최대 ${COMMENT_BODY_MAX_CHARS}자)` };
  }
  const secret = scanForSecrets(body);
  if (!secret.ok) {
    return { kind: "blocked", reason: `body에서 비밀 패턴 감지(${secret.matched}) — 게시를 차단합니다` };
  }
  return { kind: "ok", sha: bodySha256(body), preview: bodyPreviewOf(body) };
}
