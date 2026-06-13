import { describe, expect, it } from "vitest";
import { generateUnifiedDiff } from "./githubFileDiff";

describe("generateUnifiedDiff", () => {
  it("동일 내용은 additions/deletions 0", () => {
    const v = generateUnifiedDiff("a\nb\nc\n", "a\nb\nc\n", "a/x", "b/x");
    expect(v.additions).toBe(0);
    expect(v.deletions).toBe(0);
    expect(v.truncated).toBe(false);
  });

  it("한 줄 교체는 +1/-1", () => {
    const v = generateUnifiedDiff("a\nb\nc\n", "a\nB\nc\n", "a/x", "b/x");
    expect(v.additions).toBe(1);
    expect(v.deletions).toBe(1);
    expect(v.diff).toContain("--- a/x");
    expect(v.diff).toContain("+++ b/x");
    expect(v.diff).toContain("-b");
    expect(v.diff).toContain("+B");
  });

  it("추가만 / 삭제만 분리", () => {
    const onlyAdd = generateUnifiedDiff("a\n", "a\nb\nc\n", "a/x", "b/x");
    expect(onlyAdd.additions).toBe(2);
    expect(onlyAdd.deletions).toBe(0);

    const onlyDel = generateUnifiedDiff("a\nb\nc\n", "a\n", "a/x", "b/x");
    expect(onlyDel.additions).toBe(0);
    expect(onlyDel.deletions).toBe(2);
  });

  it("hunk header 형식 @@ -X,Y +A,B @@", () => {
    const v = generateUnifiedDiff("1\n2\n3\n4\n5\n", "1\n2\n3X\n4\n5\n", "a/x", "b/x");
    expect(v.diff).toMatch(/@@ -\d+,\d+ \+\d+,\d+ @@/);
  });

  it("콘텐츠가 한도 초과면 diff omitted + truncated=true", () => {
    const big = "a".repeat(64 * 1024 + 1);
    const v = generateUnifiedDiff(big, big + "x", "a/x", "b/x");
    expect(v.truncated).toBe(true);
    expect(v.additions).toBe(0);
    expect(v.deletions).toBe(0);
    expect(v.diff).toContain("diff 프리뷰를 생성하지 않습니다");
  });

  it("create 시나리오: oldText='', newText='hello' → 모두 added", () => {
    const v = generateUnifiedDiff("", "hello\n", "/dev/null", "b/x");
    expect(v.additions).toBeGreaterThan(0);
    expect(v.deletions).toBe(0);
  });
});
