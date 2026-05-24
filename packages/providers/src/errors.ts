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
