import { describe, expect, it } from "vitest";
import {
  applyEdits,
  applySearchReplace,
  buildEditApplyScript,
  normalizeEditInput,
  parseSearchReplaceBlocks,
  similarityRatio,
} from "./editEngine";

describe("applySearchReplace — 4단계 계층 매칭", () => {
  const content = ["function add(a, b) {", "  return a + b;", "}", ""].join("\n");

  it("1. exact 매칭", () => {
    const { content: next, result } = applySearchReplace(content, {
      search: "  return a + b;",
      replace: "  return a + b + 0;",
    });
    expect(result).toMatchObject({ ok: true, strategy: "exact" });
    expect(next).toContain("return a + b + 0;");
  });

  it("2. whitespace-insensitive (trailing 공백 차이 흡수)", () => {
    const { content: next, result } = applySearchReplace(content, {
      search: "  return a + b;   ", // 끝에 공백
      replace: "  return a * b;",
    });
    expect(result).toMatchObject({ ok: true, strategy: "whitespace" });
    expect(next).toContain("return a * b;");
    expect(next).not.toContain("a + b");
  });

  it("3. indentation-flexible (앞 공백 차이 흡수)", () => {
    // exact/whitespace로는 안 잡히고 들여쓰기만 다른 멀티라인 케이스
    const indented = ["def foo():", "    x = 1", "    return x", ""].join("\n");
    const { content: next, result } = applySearchReplace(indented, {
      search: ["  x = 1", "  return x"].join("\n"), // 원본은 4칸, search는 2칸
      replace: ["    x = 2", "    return x"].join("\n"),
    });
    expect(result).toMatchObject({ ok: true, strategy: "indentation" });
    expect(next).toContain("x = 2");
  });

  it("4. fuzzy (오타가 있어도 유사도 ≥ 0.85면 적용)", () => {
    const { content: next, result } = applySearchReplace(content, {
      search: "  return a + b;;", // 세미콜론 하나 추가된 오타
      replace: "  return a + b + 1;",
    });
    expect(result.ok).toBe(true);
    expect(result.strategy).toBe("fuzzy");
    expect(result.confidence).toBeGreaterThanOrEqual(0.85);
    expect(next).toContain("return a + b + 1;");
  });

  it("search가 빈 문자열이면 파일 끝에 append", () => {
    const { content: next, result } = applySearchReplace(content, {
      search: "",
      replace: "export { add };",
    });
    expect(result).toMatchObject({ ok: true, strategy: "append" });
    expect(next.endsWith("export { add };")).toBe(true);
  });

  it("전혀 일치하지 않으면 실패 + 사유 보고 (콘텐츠 불변)", () => {
    const { content: next, result } = applySearchReplace(content, {
      search: "const completelyUnrelated = require('nope');",
      replace: "x",
    });
    expect(result.ok).toBe(false);
    expect(result.strategy).toBe("failed");
    expect(result.reason).toBeTruthy();
    expect(next).toBe(content); // 원본 보존
  });
});

describe("applyEdits — 멀티블록", () => {
  it("여러 블록을 순차 적용하고, 일부 실패해도 나머지는 적용", () => {
    const content = "a = 1\nb = 2\nc = 3\n";
    const result = applyEdits(content, [
      { search: "a = 1", replace: "a = 10" },
      { search: "does-not-exist", replace: "z" },
      { search: "c = 3", replace: "c = 30" },
    ]);
    expect(result.applied).toBe(2);
    expect(result.total).toBe(3);
    expect(result.content).toContain("a = 10");
    expect(result.content).toContain("c = 30");
    expect(result.content).toContain("b = 2"); // 손대지 않음
    expect(result.results[1]!.ok).toBe(false);
  });
});

describe("similarityRatio", () => {
  it("동일 문자열은 1, 무관 문자열은 낮음", () => {
    expect(similarityRatio("hello", "hello")).toBe(1);
    expect(similarityRatio("", "")).toBe(1);
    expect(similarityRatio("return a + b;", "return a + b;;")).toBeGreaterThan(0.9);
    expect(similarityRatio("abc", "xyz")).toBeLessThan(0.4);
  });
});

describe("parseSearchReplaceBlocks", () => {
  it("SEARCH/REPLACE 펜스 블록을 파일명과 함께 추출", () => {
    const text = [
      "변경하겠습니다.",
      "src/app.ts",
      "<<<<<<< SEARCH",
      "const x = 1;",
      "=======",
      "const x = 2;",
      ">>>>>>> REPLACE",
    ].join("\n");
    const blocks = parseSearchReplaceBlocks(text);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      filepath: "src/app.ts",
      search: "const x = 1;",
      replace: "const x = 2;",
    });
  });
});

describe("normalizeEditInput — 유연한 입력 정규화", () => {
  it("단일 search/replace", () => {
    expect(normalizeEditInput({ search: "a", replace: "b" })).toEqual([{ search: "a", replace: "b" }]);
  });
  it("oldText/newText 별칭", () => {
    expect(normalizeEditInput({ oldText: "a", newText: "b" })).toEqual([{ search: "a", replace: "b" }]);
  });
  it("edits 배열", () => {
    expect(
      normalizeEditInput({ edits: [{ search: "a", replace: "b" }, { old: "c", new: "d" }] }),
    ).toEqual([{ search: "a", replace: "b" }, { search: "c", replace: "d" }]);
  });
  it("diff 텍스트 안의 펜스 블록", () => {
    const diff = "x\n<<<<<<< SEARCH\nfoo\n=======\nbar\n>>>>>>> REPLACE";
    expect(normalizeEditInput({ diff })).toEqual([{ search: "foo", replace: "bar" }]);
  });
  it("빈 입력은 빈 배열", () => {
    expect(normalizeEditInput({})).toEqual([]);
  });
});

describe("buildEditApplyScript — python 적용 명령 생성", () => {
  it("path와 blocks가 있으면 heredoc python 명령 생성 (base64 페이로드)", () => {
    const cmd = buildEditApplyScript("src/app.ts", [{ search: "a", replace: "b" }]);
    expect(cmd).toBeTruthy();
    expect(cmd).toContain("python3 - <<'__ORCH_PYEDIT__'");
    expect(cmd).toContain("os.replace(tmp,path)"); // 원자적 저장
    expect(cmd).toContain("difflib"); // fuzzy 폴백
  });

  it("path가 비었거나 blocks가 없으면 null", () => {
    expect(buildEditApplyScript("", [{ search: "a", replace: "b" }])).toBeNull();
    expect(buildEditApplyScript("src/app.ts", [])).toBeNull();
  });

  it("base64 페이로드가 원본 edits를 정확히 담는다 (디코드 검증)", () => {
    const blocks = [{ search: "복잡한\n원문 'quote'", replace: "새 \"내용\"" }];
    const cmd = buildEditApplyScript("a.ts", blocks)!;
    const b64 = /b64decode\("([^"]+)"\)/.exec(cmd)![1]!;
    const decoded = JSON.parse(Buffer.from(b64, "base64").toString("utf-8"));
    expect(decoded.path).toBe("a.ts");
    expect(decoded.edits).toEqual(blocks);
  });
});
