import { describe, expect, it } from "vitest";
import {
  buildScaffoldFileTree,
  flattenLeaves,
  summarizeGeneratedFiles,
  type GeneratedFileLeaf,
} from "./generatedFilesTree";
import type { MissionScaffoldFile } from "./missionPublishPrefill";

function file(path: string, content = "", operation?: "create" | "update"): MissionScaffoldFile {
  return { path, newContent: content, operation };
}

function leafAt(tree: ReturnType<typeof buildScaffoldFileTree>, path: string): GeneratedFileLeaf {
  const leaves = flattenLeaves(tree);
  const found = leaves.find((l) => l.path === path);
  if (!found) throw new Error(`leaf not found at ${path}`);
  return found;
}

describe("buildScaffoldFileTree", () => {
  it("빈 입력 → 빈 트리", () => {
    expect(buildScaffoldFileTree([])).toEqual([]);
  });

  it("단일 루트 파일 → 한 leaf, kind=file", () => {
    const tree = buildScaffoldFileTree([file("README.md", "# x\n")]);
    expect(tree).toHaveLength(1);
    expect(tree[0]!.kind).toBe("file");
    if (tree[0]!.kind === "file") {
      expect(tree[0]!.name).toBe("README.md");
      expect(tree[0]!.path).toBe("README.md");
    }
  });

  it("중첩 경로 → 디렉토리 노드가 만들어지고 leaf가 자식이 된다", () => {
    const tree = buildScaffoldFileTree([
      file("src/components/App.tsx", "export const App = () => null;\n"),
    ]);
    expect(tree).toHaveLength(1);
    const src = tree[0];
    expect(src?.kind).toBe("dir");
    if (src && src.kind === "dir") {
      expect(src.name).toBe("src");
      expect(src.children).toHaveLength(1);
      const components = src.children[0];
      expect(components?.kind).toBe("dir");
      if (components?.kind === "dir") {
        expect(components.name).toBe("components");
        expect(components.children).toHaveLength(1);
        expect(components.children[0]?.name).toBe("App.tsx");
      }
    }
  });

  it("디렉토리 먼저, 그 다음 파일. 같은 종류는 알파벳 정렬", () => {
    const tree = buildScaffoldFileTree([
      file("README.md"),
      file("src/B.tsx"),
      file("src/A.tsx"),
      file("docs/intro.md"),
    ]);
    // 루트: docs(dir), src(dir), README.md(file)
    expect(tree.map((n) => n.name)).toEqual(["docs", "src", "README.md"]);
    const src = tree.find((n) => n.name === "src");
    if (src?.kind === "dir") {
      expect(src.children.map((c) => c.name)).toEqual(["A.tsx", "B.tsx"]);
    }
  });

  it("operation은 그대로 leaf에 실린다", () => {
    const tree = buildScaffoldFileTree([
      file("src/x.ts", "x", "create"),
      file("README.md", "r", "update"),
    ]);
    expect(leafAt(tree, "src/x.ts").operation).toBe("create");
    expect(leafAt(tree, "README.md").operation).toBe("update");
  });

  it("gate: 안전 파일은 ok=true", () => {
    const tree = buildScaffoldFileTree([file("a.ts", "const x = 1;\n")]);
    expect(leafAt(tree, "a.ts").gate).toEqual({ ok: true });
  });

  it("gate: NUL 포함 → ok=false, reason=binary(정직 표시)", () => {
    const tree = buildScaffoldFileTree([file("bin.dat", "\0\0")]);
    expect(leafAt(tree, "bin.dat").gate).toEqual({ ok: false, reason: "binary" });
  });

  it("gate: secret_suspect 패턴 → reason=secret_suspect", () => {
    const tree = buildScaffoldFileTree([
      file(".env", "API_KEY=ghp_ABCDEFGHIJKLMNOPQRSTUVWX12345\n"),
    ]);
    expect(leafAt(tree, ".env").gate).toEqual({ ok: false, reason: "secret_suspect" });
  });

  it("gate: 256 KiB 초과 → reason=too_large(추측 X — 정확한 utf-8 바이트 기준)", () => {
    const big = "x".repeat(256 * 1024 + 1);
    const tree = buildScaffoldFileTree([file("big.txt", big)]);
    expect(leafAt(tree, "big.txt").gate).toEqual({ ok: false, reason: "too_large" });
  });

  it("byteLength / lineCount는 정확하게 계산된다", () => {
    const tree = buildScaffoldFileTree([
      file("a.ts", "한글\n"), // 한글 2글자 = 6바이트 + '\n'(1) = 7바이트, 1줄
      file("b.ts", "x\ny\nz"), // 5바이트, 3줄(마지막 \n 없음)
    ]);
    expect(leafAt(tree, "a.ts").byteLength).toBe(7);
    expect(leafAt(tree, "a.ts").lineCount).toBe(1);
    expect(leafAt(tree, "b.ts").byteLength).toBe(5);
    expect(leafAt(tree, "b.ts").lineCount).toBe(3);
  });
});

describe("flattenLeaves / summarizeGeneratedFiles", () => {
  it("중첩 트리에서 leaf만 평탄화", () => {
    const tree = buildScaffoldFileTree([
      file("README.md"),
      file("src/a.ts"),
      file("src/sub/b.ts"),
    ]);
    // 정렬 정책: 디렉토리 먼저, 같은 종류 안에서는 알파벳. 따라서 src/sub/b.ts가 src/a.ts보다 먼저 나온다.
    expect(flattenLeaves(tree).map((l) => l.path)).toEqual([
      "src/sub/b.ts",
      "src/a.ts",
      "README.md",
    ]);
  });

  it("summarize: 안전/사유별 카운트 + 총 바이트", () => {
    const tree = buildScaffoldFileTree([
      file("a.ts", "x"),
      file("b.ts", "y"),
      file("bin.dat", "\0"),
      file(".env", "API=ghp_AAAAAAAAAAAAAAAAAAAAAAAAAA\n"),
    ]);
    const s = summarizeGeneratedFiles(tree);
    expect(s.total).toBe(4);
    expect(s.safe).toBe(2);
    expect(s.blocked.binary).toBe(1);
    expect(s.blocked.secret_suspect).toBe(1);
    expect(s.blocked.too_large).toBe(0);
    expect(s.blocked.empty_path).toBe(0);
    expect(s.totalBytes).toBeGreaterThan(0);
  });
});
