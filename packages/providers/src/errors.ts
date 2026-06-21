export type AdapterErrorCategory =
  | "network"
  | "auth"
  | "credential_expired"
  | "refresh_required"
  | "rate_limit"
  | "bad_request"
  | "provider"
  | "blocked"
  | "unknown";

export type AdapterErrorOptions = {
  status?: number;
  retryAfterSec?: number;
  providerRawSnippet?: string;
  cause?: unknown;
};

export class AdapterError extends Error {
  readonly category: AdapterErrorCategory;
  readonly status?: number;
  readonly retryAfterSec?: number;
  readonly providerRawSnippet?: string;

  constructor(category: AdapterErrorCategory, message: string, options: AdapterErrorOptions = {}) {
    super(message);
    this.name = "AdapterError";
    this.category = category;
    this.status = options.status;
    this.retryAfterSec = options.retryAfterSec;
    this.providerRawSnippet = options.providerRawSnippet;
    if (options.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

const SECRET_LIKE_PATTERNS: ReadonlyArray<RegExp> = [
  /\bsk-[A-Za-z0-9_-]{16,}\b/g,
  /\b(?:claude|anthropic|grok|xai|deepseek|ghp|gho|ghs|ghr|ghu|glpat|pat)[-_][A-Za-z0-9_-]{16,}\b/gi,
  // 세분화(fine-grained) GitHub PAT — `github_pat_…`. 위 줄은 `pat`를 prefix로 갖지만
  // `github_pat_`의 `pat` 앞이 `_`(word char)라 `\bpat`가 매칭되지 않아 통째로 새어나갔다
  // (실측 false-negative). 별도 규칙으로 잡는다. providers의 raw 스니펫이 에러카드/로그로
  // 노출되므로 W1/H8d/autorunSafety 차단·redact 게이트와 동일 taxonomy로 parity를 맞춘다.
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  // bare 고신호 토큰(keyword 없이 노출되는 AWS/Google/Slack) — 위 규칙들은 sk-/provider/PAT만
  // 잡아 이들을 전부 놓쳤다. redaction은 replace(마스킹)라 오탐은 무해.
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bAIza[0-9A-Za-z_-]{30,}/g,
  /\bxox[abposr]-[A-Za-z0-9-]{10,}/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}\b/gi,
  /\b(?:API_KEY|AUTH_TOKEN|SECRET|TOKEN|PASSWORD|PRIVATE_KEY)\s*[:=]\s*[^"'\s,}]{4,}/gi,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
];

export function redactSecretsForLog(text: string): string {
  let masked = text;
  for (const pattern of SECRET_LIKE_PATTERNS) {
    masked = masked.replace(pattern, "<redacted>");
  }
  return masked;
}

export function truncateForLog(text: string, maxLength = 240): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}
