import type { CodingRunResult, TestResultSummary } from "./codingRunner";
import type { RunnerPatchHandoff } from "./runnerPatchHandoff";

/**
 * H8d — Patch artifact safety checks.
 *
 * H8c가 만든 RunnerPatchHandoff를 승인 큐로 넘기기 전에 거치는 **read-only 안전 검사**.
 * 어느 결과든 patch를 자동 수정/적용하지 않는다. 결과는 사람이 보는 report일 뿐이며
 * blocker가 있으면 `applicable=false`로 강등시킨다.
 *
 * 정직성 (H8a/H8b/H8c와 같은 라인):
 *   - secret scan은 **patch 본문의 추가 라인(+)만** 검사. 컨텍스트/삭제 라인의 우연 매칭은 무시.
 *   - path policy는 호출자가 명시한 allowlist/denylist 기준. 둘 다 비어 있으면 "정책 미설정"으로
 *     warning만 (강제로 깔지 않는다 — repo별 정책이 다름).
 *   - verification은 runner가 "주장한" 테스트 통과 vs 별도 verifier가 본 실제 결과를 분리.
 *     actualVerification 미제공 시 status:"not_run"으로 정직하게 둔다.
 *   - report 자체는 patch를 변경하지 않는다. apply 함수 없음 — 모든 결정은 승인 단계에서.
 */

/** Secret 매칭 1건. preview는 정직하게 마스킹된 문자열만 외부 노출. */
export type SecretFinding = {
  filePath: string;
  /** 어떤 패턴 이름이 잡았는지 (label only — 정규식 자체는 노출 X) */
  pattern: string;
  /** 마스킹된 짧은 미리보기 — 실제 토큰은 절대 보관하지 않는다. */
  redactedPreview: string;
};

export type SecretScanReport = {
  /** "pass" — 매칭 0건 / "blocked" — 1건 이상 매칭 (apply 차단) */
  status: "pass" | "blocked";
  findings: SecretFinding[];
};

export type PathPolicyInput = {
  /** 글로브 비슷한 prefix 매칭(끝의 `/**`/`*` 지원). 비어 있으면 정책 미설정. */
  allow?: ReadonlyArray<string>;
  /** 절대 건드리면 안 되는 경로 prefix. allow보다 강함(deny 먼저 적용). */
  deny?: ReadonlyArray<string>;
};

export type PathPolicyViolation = {
  filePath: string;
  reason: "denied" | "not_in_allowlist" | "unsafe_path";
};

export type PathPolicyReport = {
  /** "pass" — 위반 0건 / "warning" — 정책 미설정 / "blocked" — 위반 1건 이상 */
  status: "pass" | "warning" | "blocked";
  allowedPaths: string[];
  deniedPaths: string[];
  violations: PathPolicyViolation[];
};

export type ActualVerification = {
  status: "not_run" | "passed" | "failed";
  /** 어떤 명령이 verifier로 돌았는지 — 정직성 표식. */
  command?: string;
  /** 짧은 한 줄 요약 (raw stdout 금지). */
  summary?: string;
  /** ISO timestamp — 언제 실제로 돌았는지. */
  ranAt?: string;
};

export type VerificationReport = {
  /** runner가 "통과했다"고 주장한 테스트 결과 (CodingRunResult.testResult 그대로). */
  runnerClaimedTests: TestResultSummary;
  /** 별도 verifier가 본 실제 결과. 호출자가 안 주면 status:"not_run". */
  actualVerification: ActualVerification;
  /** runner 주장과 actual이 어긋나는지 — 둘 다 알려졌을 때만 결정. */
  mismatch: boolean;
};

export type RunnerPatchSafetyReport = {
  /** "pass" — 모든 검사 pass / "warning" — pass지만 정책 미설정 등 / "blocked" — 한 검사라도 blocked */
  status: "pass" | "warning" | "blocked";
  secretScan: SecretScanReport;
  pathPolicy: PathPolicyReport;
  verification: VerificationReport;
};

// ── secret scan ──

/**
 * patch artifact의 추가 라인(+)에서만 시크릿 후보를 찾는다.
 * 컨텍스트/삭제 라인은 무시 — patch가 새로 도입하는 시크릿만 잡고 싶기 때문.
 *
 * 패턴은 H8a `redactSecrets`와 같은 카테고리지만 별도 정의:
 *  - redact는 "치환"용 (로그 마스킹)
 *  - 여기는 "분류"용 (어떤 종류가 잡혔는지 라벨 반환)
 */
const SECRET_RULES: ReadonlyArray<{ label: string; regex: RegExp }> = [
  { label: "bearer_token", regex: /\bBearer\s+[A-Za-z0-9._\-]{8,}/gi },
  { label: "openai_key", regex: /\bsk-[A-Za-z0-9._\-]{16,}/g },
  // classic(ghp_/gho_/ghu_/ghs_/ghr_) + fine-grained PAT(github_pat_, 2022+ 권장 형식).
  // fine-grained는 prefix가 "gh_"가 아니라 "github_pat_"이고 본문에 underscore가 있어
  // classic 규칙으로는 안 잡힌다 — 별도 alternation으로 false-negative를 막는다.
  { label: "github_token", regex: /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/g },
  { label: "aws_access_key", regex: /\bAKIA[0-9A-Z]{16}\b/g },
  // 아래 3종은 W1 공유 scanForSecrets(githubCommentWriteGuards)는 잡지만 H8d 규칙엔 없어
  // patch로 들어오면 검출을 빠져나갔다(false negative). env_secret_assign은 변수명에
  // 키워드가 있을 때만 잡으므로 bare 리터럴(따옴표 안 토큰, PEM 블록 등)은 누락 → 별도 추가.
  { label: "slack_token", regex: /\bxox[abposr]-[A-Za-z0-9-]{10,}/g },
  { label: "google_api_key", regex: /\bAIza[0-9A-Za-z_-]{30,}/g },
  { label: "private_key_block", regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g },
  // env-style assignment — KEY=value 형태. 변수 이름에 토큰/키/비번 키워드.
  {
    label: "env_secret_assign",
    regex: /\b([A-Z0-9_]*(?:API[_-]?KEY|AUTH[_-]?TOKEN|ACCESS[_-]?TOKEN|SECRET|PASSWORD|TOKEN)[A-Z0-9_]*)\s*[=:]\s*[^\s"'`]+/gi,
  },
];

function maskPreview(match: string): string {
  if (match.length <= 8) return "<redacted>";
  const head = match.slice(0, 4);
  return `${head}…<redacted>`;
}

/** patch 한 줄에서 추가 라인만 추출 (`+` 시작, `+++` 헤더 제외). */
function extractAddedLines(diff: string | undefined): string[] {
  if (!diff) return [];
  const out: string[] = [];
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ ")) continue;
    if (line.startsWith("+")) out.push(line.slice(1));
  }
  return out;
}

export function runSecretScan(handoff: RunnerPatchHandoff): SecretScanReport {
  const findings: SecretFinding[] = [];
  for (const file of handoff.files) {
    const added = extractAddedLines(file.diff);
    if (added.length === 0) continue;
    const text = added.join("\n");
    for (const rule of SECRET_RULES) {
      for (const m of text.matchAll(rule.regex)) {
        findings.push({
          filePath: file.path,
          pattern: rule.label,
          redactedPreview: maskPreview(m[0]),
        });
      }
    }
  }
  return {
    status: findings.length > 0 ? "blocked" : "pass",
    findings,
  };
}

// ── path policy ──

/** prefix 매칭. `foo/**`, `foo/*`, `foo/` 모두 동일 의미로 처리한다 (단순 prefix). */
function normalizePolicyPath(pattern: string): string {
  return pattern.replace(/\/\*+$/, "/").replace(/\/+$/, "/");
}

function pathMatches(filePath: string, pattern: string): boolean {
  const norm = normalizePolicyPath(pattern);
  if (norm === "" || norm === "/") return true;
  if (norm.endsWith("/")) return filePath.startsWith(norm);
  return filePath === norm || filePath.startsWith(norm + "/");
}

/**
 * deny/allow는 raw startsWith prefix 매칭이라 path를 정규화하지 않는다. 그래서 git/GitHub가
 * 적용 시 접어버리는 '.'·'..' segment를 끼우면 정책을 우회할 수 있다(W3a #1030, W5b #1031과 같은 부류):
 *   - ".github/./workflows/x" → deny ".github/workflows/" 를 startsWith로 빠져나가지만 실제로는 같은 파일
 *   - "src/../../etc/passwd" → allow "src/" 의 startsWith는 통과하지만 적용되면 repo 밖으로 탈출
 *   - "src/../.github/workflows/x" → deny prefix를 빠져나가 보호 디렉터리로 진입
 * 따라서 정책 매칭 이전에 segment 단위로 '.'·'..'·절대경로·백슬래시·NUL을 unsafe로 차단한다(fail-closed).
 */
function hasUnsafePathSegment(filePath: string): boolean {
  if (filePath.includes("\0") || filePath.includes("\\")) return true;
  if (filePath.startsWith("/")) return true;
  return filePath.split("/").some((seg) => seg === "." || seg === "..");
}

export function runPathPolicy(
  handoff: RunnerPatchHandoff,
  policy: PathPolicyInput | undefined,
): PathPolicyReport {
  const allow = policy?.allow ?? [];
  const deny = policy?.deny ?? [];
  const violations: PathPolicyViolation[] = [];

  for (const file of handoff.files) {
    // 정책(allow/deny)을 보기 전에 정규화-회피 경로부터 차단. allow/deny가 비어 있어도(=정책 미설정)
    // '..' 탈출/'.' 회피는 그 자체로 unsafe라 fail-closed로 막는다.
    if (hasUnsafePathSegment(file.path)) {
      violations.push({ filePath: file.path, reason: "unsafe_path" });
      continue;
    }
    if (deny.some((p) => pathMatches(file.path, p))) {
      violations.push({ filePath: file.path, reason: "denied" });
      continue;
    }
    if (allow.length > 0 && !allow.some((p) => pathMatches(file.path, p))) {
      violations.push({ filePath: file.path, reason: "not_in_allowlist" });
    }
  }

  let status: PathPolicyReport["status"];
  if (violations.length > 0) {
    status = "blocked";
  } else if (allow.length === 0 && deny.length === 0) {
    // 정책 미설정 — 정직하게 warning. 강제 차단 X (repo별 정책이 다름).
    status = "warning";
  } else {
    status = "pass";
  }

  return {
    status,
    allowedPaths: [...allow],
    deniedPaths: [...deny],
    violations,
  };
}

// ── verification (claimed vs actual) ──

export function buildVerificationReport(
  result: Pick<CodingRunResult, "testResult">,
  actual: ActualVerification | undefined,
): VerificationReport {
  const claimed = result.testResult;
  const actualVerification: ActualVerification = actual ?? { status: "not_run" };

  let mismatch = false;
  if (actualVerification.status !== "not_run" && claimed.ran) {
    const claimedPassed = claimed.failed === 0 && claimed.passed > 0;
    if (actualVerification.status === "passed" && !claimedPassed) mismatch = true;
    if (actualVerification.status === "failed" && claimedPassed) mismatch = true;
  }

  return {
    runnerClaimedTests: claimed,
    actualVerification,
    mismatch,
  };
}

// ── 통합 builder ──

export type RunPatchSafetyInput = {
  handoff: RunnerPatchHandoff;
  /** H8c의 원본 CodingRunResult — verification.runnerClaimedTests의 출처. */
  result: Pick<CodingRunResult, "testResult">;
  pathPolicy?: PathPolicyInput;
  actualVerification?: ActualVerification;
};

export function buildRunnerPatchSafetyReport(input: RunPatchSafetyInput): RunnerPatchSafetyReport {
  const secretScan = runSecretScan(input.handoff);
  const pathPolicy = runPathPolicy(input.handoff, input.pathPolicy);
  const verification = buildVerificationReport(input.result, input.actualVerification);

  const blocked = secretScan.status === "blocked" || pathPolicy.status === "blocked";
  const warning = pathPolicy.status === "warning" || verification.mismatch;

  let status: RunnerPatchSafetyReport["status"];
  if (blocked) status = "blocked";
  else if (warning) status = "warning";
  else status = "pass";

  return { status, secretScan, pathPolicy, verification };
}

/**
 * Safety report를 handoff에 반영해 applicable/blockers를 갱신한다.
 *  - blocked → applicable=false, secret/path blocker가 새로 들어옴
 *  - warning → applicable은 그대로, warning만 추가
 * H8c의 blocker enum과 충돌하지 않게 새 enum을 별도로 둔다.
 */
export type PatchSafetyBlocker = "secret_in_patch" | "path_policy_violation";
export type PatchSafetyWarning = "path_policy_unset" | "verification_mismatch";

export type SafetyAnnotatedHandoff = RunnerPatchHandoff & {
  safety: RunnerPatchSafetyReport;
  safetyBlockers: PatchSafetyBlocker[];
  safetyWarnings: PatchSafetyWarning[];
};

export function annotateHandoffWithSafety(
  handoff: RunnerPatchHandoff,
  report: RunnerPatchSafetyReport,
): SafetyAnnotatedHandoff {
  const safetyBlockers: PatchSafetyBlocker[] = [];
  if (report.secretScan.status === "blocked") safetyBlockers.push("secret_in_patch");
  if (report.pathPolicy.status === "blocked") safetyBlockers.push("path_policy_violation");

  const safetyWarnings: PatchSafetyWarning[] = [];
  if (report.pathPolicy.status === "warning") safetyWarnings.push("path_policy_unset");
  if (report.verification.mismatch) safetyWarnings.push("verification_mismatch");

  return {
    ...handoff,
    safety: report,
    safetyBlockers,
    safetyWarnings,
    // 안전 블로커가 있으면 applicable을 강제로 false (자동 적용 0 라인 강화).
    applicable: handoff.applicable && safetyBlockers.length === 0,
  };
}

export const SAFETY_BLOCKER_REASON: Record<PatchSafetyBlocker, string> = {
  secret_in_patch: "patch 본문에 시크릿 후보 감지 — 적용 차단",
  path_policy_violation: "경로 정책 위반 — 허용되지 않은 파일이 변경됨",
};

export const SAFETY_WARNING_REASON: Record<PatchSafetyWarning, string> = {
  path_policy_unset: "경로 정책 미설정 — repo별 allowlist/denylist 정의 권장",
  verification_mismatch: "runner 주장 테스트 결과와 실제 verifier 결과가 어긋남",
};
