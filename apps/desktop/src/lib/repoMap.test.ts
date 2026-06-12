import { describe, expect, it } from "vitest";
import {
  buildRepoMap,
  extractSymbols,
  rankFiles,
  renderRepoMap,
  resolveImport,
} from "./repoMap";

describe("extractSymbols", () => {
  it("export/정의 심볼과 import를 추출한다", () => {
    const content = [
      `import { foo } from "./foo";`,
      `import type { Bar } from "../types";`,
      `export function add(a: number, b: number) {`,
      `  return a + b;`,
      `}`,
      `export class Widget {}`,
      `export interface Options {}`,
      `export type Handler = () => void;`,
      `export const VERSION = "1.0";`,
      `function privateHelper() {}`,
    ].join("\n");
    const sym = extractSymbols("src/app.ts", content);
    expect(sym.imports).toEqual(["./foo", "../types"]);
    const names = sym.defs.map((d) => d.name);
    expect(names).toContain("add");
    expect(names).toContain("Widget");
    expect(names).toContain("Options");
    expect(names).toContain("Handler");
    expect(names).toContain("VERSION");
    expect(names).toContain("privateHelper");
    // export 심볼이 먼저 정렬
    expect(sym.defs[0]!.exported).toBe(true);
    expect(sym.defs.find((d) => d.name === "add")).toMatchObject({ kind: "function", exported: true });
    expect(sym.defs.find((d) => d.name === "privateHelper")).toMatchObject({ exported: false });
  });
});

describe("resolveImport", () => {
  const known = new Set([
    "src/foo.ts",
    "src/types.ts",
    "src/util/index.ts",
  ]);
  it("상대 경로를 확장자/인덱스로 해석", () => {
    expect(resolveImport("src/app.ts", "./foo", known)).toBe("src/foo.ts");
    expect(resolveImport("src/app.ts", "./util", known)).toBe("src/util/index.ts");
    expect(resolveImport("src/sub/x.ts", "../types", known)).toBe("src/types.ts");
  });
  it("외부 패키지와 미해결은 null", () => {
    expect(resolveImport("src/app.ts", "react", known)).toBeNull();
    expect(resolveImport("src/app.ts", "./missing", known)).toBeNull();
  });
});

describe("rankFiles — PageRank-lite", () => {
  const files = [
    { path: "src/util.ts", content: `export const helper = () => 1;` },
    { path: "src/a.ts", content: `import { helper } from "./util";\nexport function a() {}` },
    { path: "src/b.ts", content: `import { helper } from "./util";\nexport function b() {}` },
    { path: "src/app.ts", content: `import { a } from "./a";\nexport function app() {}` },
  ].map((f) => extractSymbols(f.path, f.content));

  it("많이 import되는 파일이 상위로", () => {
    const ranked = rankFiles({ files });
    const top = ranked[0]!.path;
    expect(top).toBe("src/util.ts"); // a,b가 둘 다 import
  });

  it("편집 중(chat) 파일이 import하는 파일에 강한 부스트", () => {
    const ranked = rankFiles({ files, chatFiles: ["src/app.ts"] });
    const score = (p: string) => ranked.find((r) => r.path === p)!.score;
    // app이 직접 import하는 a가 b보다 높아야
    expect(score("src/a.ts")).toBeGreaterThan(score("src/b.ts"));
  });

  it("mentionedSymbols를 export하는 파일 부스트", () => {
    const ranked = rankFiles({ files, mentionedSymbols: ["b"] });
    const score = (p: string) => ranked.find((r) => r.path === p)!.score;
    expect(score("src/b.ts")).toBeGreaterThan(score("src/a.ts"));
  });
});

describe("renderRepoMap — 토큰 예산", () => {
  const files = Array.from({ length: 20 }, (_, i) => ({
    path: `src/mod${i}.ts`,
    content: `export function fn${i}(arg: string): number { return ${i}; }\nexport const C${i} = ${i};`,
  })).map((f) => extractSymbols(f.path, f.content));
  const ranked = files.map((f) => ({ path: f.path, score: 1 }));

  it("예산을 초과하지 않게 상위만 렌더", () => {
    const small = renderRepoMap({ files, ranked, maxTokens: 40 });
    const large = renderRepoMap({ files, ranked, maxTokens: 4000 });
    expect(small.length).toBeLessThan(large.length);
    expect(small).toContain("저장소 맵");
    // 작은 예산은 일부 파일만
    expect((small.match(/src\/mod\d+\.ts:/g) ?? []).length).toBeLessThan(20);
  });

  it("excludePaths(편집 중 파일)는 맵에서 제외", () => {
    const out = renderRepoMap({ files, ranked, maxTokens: 4000, excludePaths: ["src/mod0.ts"] });
    expect(out).not.toContain("src/mod0.ts:");
    expect(out).toContain("src/mod1.ts:");
  });

  it("정의가 전혀 없으면 빈 문자열", () => {
    const empty = renderRepoMap({ files: [], ranked: [], maxTokens: 1024 });
    expect(empty).toBe("");
  });
});

describe("buildRepoMap — 통합", () => {
  it("실제 코드 형태에서 repo-map을 만들고 편집 중 파일을 제외한다", () => {
    const result = buildRepoMap({
      files: [
        { path: "src/lib/math.ts", content: `export function add(a:number,b:number){return a+b;}\nexport function sub(a:number,b:number){return a-b;}` },
        { path: "src/lib/format.ts", content: `import { add } from "./math";\nexport const fmt = (n:number) => String(n);` },
        { path: "src/App.tsx", content: `import { fmt } from "./lib/format";\nimport { add } from "./lib/math";\nexport function App(){return null;}` },
      ],
      chatFiles: ["src/App.tsx"],
      maxTokens: 2000,
    });
    // App이 직접 의존하는 math/format이 맵에 등장, App 자신은 제외
    expect(result.repoMap).toContain("src/lib/math.ts:");
    expect(result.repoMap).toContain("export function add");
    expect(result.repoMap).not.toContain("src/App.tsx:");
    // math가 format/App 양쪽에서 참조 → 최상위 근처
    expect(result.ranked[0]!.path === "src/lib/math.ts" || result.ranked[1]!.path === "src/lib/math.ts").toBe(true);
  });
});
