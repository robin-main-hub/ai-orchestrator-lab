import { describe, expect, it } from "vitest";
import {
  classifyDiagnosticsTool,
  formatDiagnosticsForModel,
  parseDiagnostics,
} from "./diagnosticsParser";

describe("classifyDiagnosticsTool", () => {
  it("명령에서 도구 종류를 추론", () => {
    expect(classifyDiagnosticsTool("pnpm exec tsc --noEmit")).toBe("tsc");
    expect(classifyDiagnosticsTool("eslint --fix src")).toBe("eslint");
    expect(classifyDiagnosticsTool("pnpm test")).toBe("test");
    expect(classifyDiagnosticsTool("vitest run")).toBe("test");
    expect(classifyDiagnosticsTool("pnpm run build")).toBe("build");
    expect(classifyDiagnosticsTool("echo hi")).toBe("generic");
  });
});

describe("parseDiagnostics — tsc", () => {
  it("tsc 에러를 file/line/col/code/message로 파싱", () => {
    const out = [
      "src/app.ts(10,5): error TS2345: Argument of type 'X' is not assignable to 'Y'.",
      "src/util.ts(3,1): error TS2304: Cannot find name 'foo'.",
    ].join("\n");
    const r = parseDiagnostics("tsc --noEmit", out);
    expect(r.ok).toBe(false);
    expect(r.errorCount).toBe(2);
    expect(r.diagnostics[0]).toMatchObject({
      file: "src/app.ts",
      line: 10,
      column: 5,
      severity: "error",
      code: "TS2345",
    });
  });

  it("깨끗한 출력은 통과 (과민판정 없음)", () => {
    expect(parseDiagnostics("tsc --noEmit", "").ok).toBe(true);
    expect(parseDiagnostics("tsc --noEmit", "Found 0 errors.").ok).toBe(true);
  });
});

describe("parseDiagnostics — eslint", () => {
  it("stylish 포맷 (파일 라인 + 위치 라인)", () => {
    const out = [
      "/repo/src/a.ts",
      "  12:3  error  Unexpected console statement  no-console",
      "  20:1  warning  Missing return type  @typescript-eslint/explicit-function-return-type",
    ].join("\n");
    const r = parseDiagnostics("eslint src", out);
    expect(r.errorCount).toBe(1);
    expect(r.warningCount).toBe(1);
    expect(r.diagnostics[0]).toMatchObject({
      file: "/repo/src/a.ts",
      line: 12,
      severity: "error",
      code: "no-console",
    });
  });

  it("compact 포맷", () => {
    const out = "src/b.ts: line 5, col 2, Error - Strings must use singlequote (quotes)";
    const r = parseDiagnostics("eslint --format compact src", out);
    expect(r.ok).toBe(false);
    expect(r.diagnostics[0]).toMatchObject({ file: "src/b.ts", line: 5, code: "quotes" });
  });
});

describe("parseDiagnostics — test", () => {
  it("vitest 실패 라인 + 요약 카운트", () => {
    const out = ["× src/foo.test.ts > adds numbers", "Tests  1 failed | 9 passed (10)"].join("\n");
    const r = parseDiagnostics("vitest run", out);
    expect(r.ok).toBe(false);
    expect(r.errorCount).toBeGreaterThanOrEqual(1);
  });

  it("0 failed면 통과", () => {
    const out = "Tests  10 passed (10)\n  0 failed";
    expect(parseDiagnostics("pnpm test", out).ok).toBe(true);
  });
});

describe("parseDiagnostics — 실패 종료/폴백", () => {
  it("도구가 failed 상태면 에러로 처리", () => {
    const r = parseDiagnostics("pnpm run build", "...", { toolStatus: "failed" });
    expect(r.ok).toBe(false);
    expect(r.errorCount).toBe(1);
  });

  it("구조화 항목 없이 에러 키워드만 있으면 폴백 에러", () => {
    const r = parseDiagnostics("make", "fatal error: something broke");
    expect(r.ok).toBe(false);
  });

  it("'0 errors' 류는 폴백에서 통과로 인식", () => {
    expect(parseDiagnostics("make", "Build complete with 0 errors").ok).toBe(true);
    expect(parseDiagnostics("make", "no errors found").ok).toBe(true);
  });
});

describe("formatDiagnosticsForModel", () => {
  it("위치+코드를 포함한 간결한 피드백 + 초과분 요약", () => {
    const many = Array.from({ length: 15 }, (_, i) =>
      `src/f${i}.ts(${i + 1},1): error TS1000: msg ${i}`,
    ).join("\n");
    const r = parseDiagnostics("tsc --noEmit", many);
    const text = formatDiagnosticsForModel(r, 12);
    expect(text).toContain("tsc 실패");
    expect(text).toContain("src/f0.ts:1:1");
    expect(text).toContain("[TS1000]");
    expect(text).toContain("외 3건"); // 15 - 12
  });
});
