/**
 * Diagnostics output parser (P1-4, KIMI 브리프). 도구 출력(tsc/eslint/test/build)을
 * 구조화된 에러로 파싱해 정확한 통과/실패 판정과 모델 피드백을 만든다.
 *
 * 기존 진단 라운드는 정규식 `/error/`로만 판정해 "0 errors" 같은 정상 출력도
 * 실패로 오판하거나, 어디서 깨졌는지 모델에 구체적으로 알려주지 못했다.
 */

export type DiagnosticSeverity = "error" | "warning";

export type ParsedDiagnostic = {
  file?: string;
  line?: number;
  column?: number;
  severity: DiagnosticSeverity;
  message: string;
  code?: string;
};

export type DiagnosticsReport = {
  /** 에러(severity=error)가 0개면 통과 */
  ok: boolean;
  diagnostics: ParsedDiagnostic[];
  errorCount: number;
  warningCount: number;
  /** 도구 분류 (tsc/eslint/test/build/generic) */
  tool: DiagnosticsTool;
  /** 모델에 줄 한 줄 요약 */
  summary: string;
};

export type DiagnosticsTool = "tsc" | "eslint" | "test" | "build" | "generic";

const TSC_RE = /^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+):\s+(.+)$/;
// eslint stylish: 별도 라인의 "  12:3  error  msg  rule"
const ESLINT_STYLISH_RE = /^\s*(\d+):(\d+)\s+(error|warning)\s+(.+?)\s{2,}([\w@/-]+)\s*$/;
// eslint compact: "path: line 12, col 3, Error - msg (rule)"
const ESLINT_COMPACT_RE = /^(.+?):\s*line\s+(\d+),\s*col\s+(\d+),\s*(Error|Warning)\s+-\s+(.+?)(?:\s+\(([\w@/-]+)\))?$/i;
// vitest/jest 실패 라인
const TEST_FAIL_RE = /^\s*(?:×|✗|FAIL|✕)\s+(.+)$/;
const TEST_SUMMARY_RE = /(\d+)\s+failed/i;

export function classifyDiagnosticsTool(command: string): DiagnosticsTool {
  const c = command.toLowerCase();
  if (/\btsc\b|--noemit|type-?check/.test(c)) return "tsc";
  if (/eslint|biome|lint/.test(c)) return "eslint";
  if (/vitest|jest|\btest\b|mocha|pytest/.test(c)) return "test";
  if (/\bbuild\b|vite build|webpack|rollup|esbuild/.test(c)) return "build";
  return "generic";
}

/** 도구 출력을 파싱해 구조화된 진단 리포트로 변환 */
export function parseDiagnostics(
  command: string,
  output: string,
  options: { toolStatus?: "completed" | "failed" | "denied" } = {},
): DiagnosticsReport {
  const tool = classifyDiagnosticsTool(command);
  const lines = output.split("\n");
  const diagnostics: ParsedDiagnostic[] = [];
  let currentFile: string | undefined;

  for (const raw of lines) {
    const line = raw.replace(/\r$/, "");

    const tsc = TSC_RE.exec(line);
    if (tsc) {
      diagnostics.push({
        file: tsc[1]!.trim(),
        line: Number(tsc[2]),
        column: Number(tsc[3]),
        severity: tsc[4] as DiagnosticSeverity,
        code: tsc[5],
        message: tsc[6]!.trim(),
      });
      continue;
    }

    const compact = ESLINT_COMPACT_RE.exec(line);
    if (compact) {
      diagnostics.push({
        file: compact[1]!.trim(),
        line: Number(compact[2]),
        column: Number(compact[3]),
        severity: compact[4]!.toLowerCase() as DiagnosticSeverity,
        message: compact[5]!.trim(),
        code: compact[6],
      });
      continue;
    }

    // eslint stylish: 파일 경로가 별도 라인에 먼저 나온다
    if (/^(?:\/|\.|[A-Za-z]:|src\/|apps\/|packages\/).*\.(t|j)sx?$/.test(line.trim())) {
      currentFile = line.trim();
      continue;
    }
    const stylish = ESLINT_STYLISH_RE.exec(line);
    if (stylish) {
      diagnostics.push({
        file: currentFile,
        line: Number(stylish[1]),
        column: Number(stylish[2]),
        severity: stylish[3] as DiagnosticSeverity,
        message: stylish[4]!.trim(),
        code: stylish[5],
      });
      continue;
    }

    if (tool === "test") {
      const fail = TEST_FAIL_RE.exec(line);
      if (fail) {
        diagnostics.push({ severity: "error", message: fail[1]!.trim() });
        continue;
      }
    }
  }

  let errorCount = diagnostics.filter((d) => d.severity === "error").length;
  let warningCount = diagnostics.filter((d) => d.severity === "warning").length;

  // 파서가 개별 항목을 못 잡았어도 신뢰 가능한 실패 신호는 반영한다.
  const testSummary = TEST_SUMMARY_RE.exec(output);
  if (tool === "test" && testSummary) {
    const failed = Number(testSummary[1]);
    if (failed > 0 && errorCount === 0) {
      diagnostics.push({ severity: "error", message: `${failed} test(s) failed` });
      errorCount = failed;
    } else if (failed === 0) {
      // "0 failed" → 명시적 통과, 다른 잡음 무시
      errorCount = 0;
    }
  }

  // 도구가 실패 종료했고 파싱된 에러가 없으면 일반 실패로 표시
  if (options.toolStatus === "failed" && errorCount === 0) {
    diagnostics.push({ severity: "error", message: "명령이 비정상 종료(실패)했습니다." });
    errorCount = 1;
  }

  // 구조화 항목이 전혀 없을 때만 키워드 폴백 (정상 출력 과민판정 방지)
  if (diagnostics.length === 0 && options.toolStatus !== "failed") {
    const hasErrorKeyword = /\b(error|errors|failed|FAIL|✗|✕)\b/.test(output) &&
      !/\b0\s+(errors?|problems?|failed)\b/i.test(output) &&
      !/no\s+(errors?|problems?)/i.test(output);
    if (hasErrorKeyword) {
      diagnostics.push({ severity: "error", message: "출력에 오류 신호가 있습니다 (상세 파싱 불가)." });
      errorCount = 1;
    }
  }

  const ok = errorCount === 0;
  const summary = ok
    ? `${tool} 통과${warningCount > 0 ? ` (경고 ${warningCount})` : ""}`
    : `${tool} 실패: 에러 ${errorCount}${warningCount > 0 ? `, 경고 ${warningCount}` : ""}`;

  return { ok, diagnostics, errorCount, warningCount, tool, summary };
}

/** 모델 피드백용으로 구조화 에러를 간결한 텍스트로 렌더 (상위 N개) */
export function formatDiagnosticsForModel(report: DiagnosticsReport, maxItems = 12): string {
  const errs = report.diagnostics.filter((d) => d.severity === "error").slice(0, maxItems);
  const lines = errs.map((d) => {
    const loc = d.file ? `${d.file}${d.line ? `:${d.line}${d.column ? `:${d.column}` : ""}` : ""}` : "";
    const code = d.code ? ` [${d.code}]` : "";
    return `- ${loc ? `${loc} — ` : ""}${d.message}${code}`;
  });
  const more = report.errorCount > errs.length ? `\n  …외 ${report.errorCount - errs.length}건` : "";
  return `${report.summary}\n${lines.join("\n")}${more}`;
}
