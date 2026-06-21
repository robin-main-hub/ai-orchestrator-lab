// bare 고신호 토큰 prefix — 위 sk-/Bearer/URL/KEY=value 규칙은 keyword·URL·assignment 형태만
// 잡아, 산문에 그대로 박힌 bare 토큰(ghp_/github_pat_/AKIA/AIza/xox)과 PEM 블록을 놓쳤다.
// 이 텍스트는 공개(publish/표시) 표면으로 외부 노출되므로, W1 githubCommentWriteGuards·
// H8d runnerPatchSafety·#1041/#1042 redaction 게이트와 동일 taxonomy로 parity를 맞춘다.
// 패턴이 충분히 정밀해 산문 오탐(=잘못된 publish 차단)은 사실상 없다.
const HIGH_SIGNAL_TOKEN_PATTERNS: ReadonlyArray<RegExp> = [
  /\bgh[pousr]_[A-Za-z0-9]{20,}/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bAIza[0-9A-Za-z_-]{30,}/,
  /\bxox[abposr]-[A-Za-z0-9-]{10,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];

const PUBLIC_TEXT_FORBIDDEN_PATTERNS = [
  /https?:\/\/[^\s"'`<>)]+/i,
  /\bBearer\s+[A-Za-z0-9._~+/=-]+\b/i,
  /sk-[A-Za-z0-9_-]{8,}/i,
  /tp-[A-Za-z0-9_-]{8,}/i,
  /\/Users\/[^\s"'`<>)]+/i,
  /\b[A-Za-z0-9_]*(?:TOKEN|SECRET|API_KEY|PASSWORD|COOKIE|KEY)[A-Za-z0-9_]*\s*=\s*["']?[^\s"']+["']?/i,
  /(?:chain[- ]of[- ]thought|raw prompt|tool input|command args?)\b/i,
  ...HIGH_SIGNAL_TOKEN_PATTERNS,
];

export type PublicRedactionReport = {
  blockedReasons: string[];
  isSafe: boolean;
};

export function sanitizePublicText(value: string): string {
  let masked = value
    .replace(/(?:chain[- ]of[- ]thought|raw prompt|tool input|command args?)\b[^\n\r]*/gi, "[redacted:internal]")
    .replace(/https?:\/\/[^\s"'`<>)]+/gi, "[redacted:url]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+\b/gi, "Bearer [redacted]")
    .replace(/sk-[A-Za-z0-9_-]{8,}/gi, "[redacted]")
    .replace(/tp-[A-Za-z0-9_-]{8,}/gi, "[redacted]");
  // bare 고신호 토큰(ghp_/github_pat_/AKIA/AIza/xox/PEM) — gate(PUBLIC_TEXT_FORBIDDEN_PATTERNS)와
  // 동일 taxonomy로 마스킹해 parity 유지. replace라 오탐 무해.
  for (const pattern of HIGH_SIGNAL_TOKEN_PATTERNS) {
    masked = masked.replace(new RegExp(pattern.source, "g"), "[redacted]");
  }
  return masked
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
