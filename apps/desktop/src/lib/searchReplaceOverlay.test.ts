import { describe, expect, it } from "vitest";
import { buildSearchReplaceOverlayPlan } from "./searchReplaceOverlay";
import type { MissionScaffoldFile } from "./missionPublishPrefill";

function file(path: string, content: string): MissionScaffoldFile {
  return { path, newContent: content };
}

/** Aider-style 블록 빌더(테스트 가독성). */
function block(filepath: string, search: string, replace: string): string {
  return `${filepath}\n<<<<<<< SEARCH\n${search}\n=======\n${replace}\n>>>>>>> REPLACE`;
}

describe("buildSearchReplaceOverlayPlan — 정상 경로", () => {
  it("exact match → applied, 새 content가 overlayFiles에 실린다", () => {
    const plan = buildSearchReplaceOverlayPlan(
      [file("src/a.ts", "const x = 1;\n")],
      block("src/a.ts", "const x = 1;", "const x = 2;"),
    );
    expect(plan.blocks).toHaveLength(1);
    expect(plan.blocks[0]!.kind).toBe("applied");
    expect(plan.overlayFiles).toEqual([{ path: "src/a.ts", content: "const x = 2;\n" }]);
    expect(plan.skippedByGate).toEqual([]);
    expect(plan.noChangeFiles).toEqual([]);
  });

  it("한 파일에 다중 블록 — 순서대로 누적 적용", () => {
    const text = `${block("a.ts", "A", "AA")}\n${block("a.ts", "B", "BB")}`;
    const plan = buildSearchReplaceOverlayPlan([file("a.ts", "A B\n")], text);
    const applied = plan.blocks.filter((b) => b.kind === "applied").length;
    expect(applied).toBe(2);
    expect(plan.overlayFiles).toEqual([{ path: "a.ts", content: "AA BB\n" }]);
  });

  it("다중 파일 — 각각 overlayFiles에 들어간다", () => {
    const text = `${block("a.ts", "1", "2")}\n${block("b.ts", "x", "y")}`;
    const plan = buildSearchReplaceOverlayPlan(
      [file("a.ts", "v=1\n"), file("b.ts", "v=x\n")],
      text,
    );
    expect(plan.overlayFiles.map((f) => f.path).sort()).toEqual(["a.ts", "b.ts"]);
    expect(plan.overlayFiles.find((f) => f.path === "a.ts")?.content).toBe("v=2\n");
    expect(plan.overlayFiles.find((f) => f.path === "b.ts")?.content).toBe("v=y\n");
  });
});

describe("buildSearchReplaceOverlayPlan — 새 파일 / 충돌", () => {
  it("기존에 없는 파일 + search=빈 문자열 → created", () => {
    const text = block("src/NEW.ts", "", "export const NEW = 1;\n");
    const plan = buildSearchReplaceOverlayPlan([], text);
    expect(plan.blocks[0]).toMatchObject({ kind: "created", filepath: "src/NEW.ts" });
    expect(plan.overlayFiles).toEqual([
      { path: "src/NEW.ts", content: "export const NEW = 1;\n" },
    ]);
  });

  it("기존에 없는 파일 + search 있음 → create_conflict 에러(사일런트 폴백 X)", () => {
    const text = block("src/NEW.ts", "doesNotExist", "foo");
    const plan = buildSearchReplaceOverlayPlan([], text);
    expect(plan.blocks[0]).toMatchObject({ kind: "error", reason: "create_conflict" });
    expect(plan.overlayFiles).toEqual([]);
  });

  it("filepath 라벨 누락 → missing_filepath 에러", () => {
    // FENCE_PATTERN은 라벨 라인을 필수로 보지 않음 → filepath=undefined 케이스
    const text = `<<<<<<< SEARCH\nfoo\n=======\nbar\n>>>>>>> REPLACE`;
    const plan = buildSearchReplaceOverlayPlan([file("a.ts", "foo\n")], text);
    expect(plan.blocks[0]).toMatchObject({ kind: "error", reason: "missing_filepath" });
    expect(plan.overlayFiles).toEqual([]);
  });
});

describe("buildSearchReplaceOverlayPlan — 매칭 완화 단계", () => {
  it("whitespace-insensitive: SEARCH 쪽에 trailing 공백이 있어도 통과", () => {
    // content는 공백 없는 깔끔한 라인. SEARCH는 LLM 출력처럼 trailing 공백이 붙음.
    // exact는 실패, whitespace 단계에서 매칭.
    const plan = buildSearchReplaceOverlayPlan(
      [file("a.ts", "const x = 1;\n")],
      block("a.ts", "const x = 1;   ", "const x = 2;"),
    );
    expect(plan.blocks[0]!.kind).toBe("applied");
    if (plan.blocks[0]!.kind === "applied") {
      expect(plan.blocks[0]!.result.strategy).toBe("whitespace");
    }
  });

  it("매칭 실패 → failed + 사람용 이유, overlayFiles 0", () => {
    const plan = buildSearchReplaceOverlayPlan(
      [file("a.ts", "alpha\nbeta\ngamma\n")],
      block("a.ts", "delta\nepsilon\nzeta", "ANY"),
    );
    expect(plan.blocks[0]!.kind).toBe("failed");
    if (plan.blocks[0]!.kind === "failed") {
      expect(plan.blocks[0]!.result.ok).toBe(false);
      expect(plan.blocks[0]!.result.reason).toMatch(/찾지 못함/);
    }
    expect(plan.overlayFiles).toEqual([]);
    expect(plan.noChangeFiles).toEqual(["a.ts"]);
  });

  it("같은 파일에서 한 블록 성공 + 한 블록 실패 → blockApplied=1, overlayFiles 포함", () => {
    const text = `${block("a.ts", "alpha", "ALPHA")}\n${block("a.ts", "doesNotMatch", "X")}`;
    const plan = buildSearchReplaceOverlayPlan([file("a.ts", "alpha\nbeta\n")], text);
    expect(plan.files[0]?.blockTotal).toBe(2);
    expect(plan.files[0]?.blockApplied).toBe(1);
    expect(plan.overlayFiles).toEqual([{ path: "a.ts", content: "ALPHA\nbeta\n" }]);
  });
});

describe("buildSearchReplaceOverlayPlan — 가드(시크릿/바이너리/대용량)", () => {
  it("결과에 시크릿 패턴이 들어가면 skippedByGate=secret_suspect, overlayFiles 0", () => {
    const plan = buildSearchReplaceOverlayPlan(
      [file(".env", "API=PLACEHOLDER\n")],
      block(".env", "API=PLACEHOLDER", "API=ghp_AAAAAAAAAAAAAAAAAAAAAAAAAA"),
    );
    expect(plan.skippedByGate).toEqual([{ path: ".env", reason: "secret_suspect" }]);
    expect(plan.overlayFiles).toEqual([]);
  });

  it("결과에 NUL 포함 → binary로 차단", () => {
    const plan = buildSearchReplaceOverlayPlan(
      [file("a.txt", "ok\n")],
      block("a.txt", "ok", "\0\0"),
    );
    expect(plan.skippedByGate).toEqual([{ path: "a.txt", reason: "binary" }]);
    expect(plan.overlayFiles).toEqual([]);
  });
});
