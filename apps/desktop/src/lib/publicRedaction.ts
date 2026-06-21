const PUBLIC_TEXT_FORBIDDEN_PATTERNS = [
  /https?:\/\/[^\s"'`<>)]+/i,
  /\bBearer\s+[A-Za-z0-9._~+/=-]+\b/i,
  /sk-[A-Za-z0-9_-]{8,}/i,
  /tp-[A-Za-z0-9_-]{8,}/i,
  // GitLab PAT(glpat-) — 형제 redaction 게이트 W1 githubCommentWriteGuards·errors.ts
  // SECRET_LIKE_PATTERNS는 이미 glpat을 비밀로 보는데 이 공개-텍스트 redactor만 빠져, glpat
  // 토큰이 mask도 gate block도 안 되고 published/표시 표면으로 그대로 노출됐다. 같은 taxonomy로 parity.
  /\bglpat-[A-Za-z0-9_-]{20,}/i,
  /\/Users\/[^\s"'`<>)]+/i,
  /\b[A-Za-z0-9_]*(?:TOKEN|SECRET|API_KEY|PASSWORD|COOKIE|KEY)[A-Za-z0-9_]*\s*=\s*["']?[^\s"']+["']?/i,
  /(?:chain[- ]of[- ]thought|raw prompt|tool input|command args?)\b/i,
];

export type PublicRedactionReport = {
  blockedReasons: string[];
  isSafe: boolean;
};

export function sanitizePublicText(value: string): string {
  return value
    .replace(/(?:chain[- ]of[- ]thought|raw prompt|tool input|command args?)\b[^\n\r]*/gi, "[redacted:internal]")
    .replace(/https?:\/\/[^\s"'`<>)]+/gi, "[redacted:url]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+\b/gi, "Bearer [redacted]")
    .replace(/sk-[A-Za-z0-9_-]{8,}/gi, "[redacted]")
    .replace(/tp-[A-Za-z0-9_-]{8,}/gi, "[redacted]")
    .replace(/\bglpat-[A-Za-z0-9_-]{20,}/gi, "[redacted]")
    .replace(/\b[A-Za-z0-9_]*(?:TOKEN|SECRET|API_KEY|PASSWORD|COOKIE|KEY)[A-Za-z0-9_]*\s*=\s*["']?[^\s"']+["']?/gi, "[redacted]")
    .replace(/\b([A-Z0-9_]*(?:API_KEY|TOKEN|SECRET|PASSWORD|COOKIE|KEY))\b/g, "redacted_secret_name")
    .replace(/\/Users\/[^\s"'`<>)]+/g, "[redacted:path]");
}

export function compactPublicText(value: string, maxLength = 72): string {
  const sanitized = sanitizePublicText(value).replace(/\s+/g, " ").trim();
  if (sanitized.length <= maxLength) return sanitized;
  return `${sanitized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

export function inspectPublicText(value: string): PublicRedactionReport {
  const blockedReasons = PUBLIC_TEXT_FORBIDDEN_PATTERNS.flatMap((pattern) =>
    pattern.test(value) ? [`금지 패턴 감지: ${pattern.source}`] : [],
  );
  return {
    blockedReasons,
    isSafe: blockedReasons.length === 0,
  };
}
