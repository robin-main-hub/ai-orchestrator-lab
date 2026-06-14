import { describe, expect, it } from "vitest";
import { buildTurboEditPrompt, validateTurboEditOutput, DEFAULT_MAX_EXCERPT_BYTES } from "./turboEditPrompt";
import type { AppFixDraft } from "./appFixDraft";
import type { MissionScaffoldFile } from "./missionPublishPrefill";

function file(path: string, content: string): MissionScaffoldFile {
  return { path, newContent: content };
}

const SAMPLE_DRAFT: AppFixDraft = {
  status: "has_fixes",
  summary: "이슈 2건 — 1건은 매핑됨",
  fileSuggestions: [
    {
      file: "src/App.tsx",
      what: "primary button 라벨 명확화",
      why: "주요 action이 약함",
      kindHints: ["missing_primary_action"],
      evidenceIssueIds: ["i1"],
    },
  ],
  unmappedIssues: [
    {
      id: "i2",
      kind: "weird_kind",
      severity: "low",
      summary: "정확한 위치 불명",
      recommendation: "검토 필요",
    },
  ],
  counts: { totalIssues: 2, mappedIssues: 1, unmappedIssues: 1, suggestionGroups: 1 },
};

describe("buildTurboEditPrompt — system prompt + format spec", () => {
  it("(P1) systemPrompt가 SEARCH/REPLACE 포맷 + '추측 금지' 규칙을 명시한다", () => {
    const prompt = buildTurboEditPrompt({
      scaffoldFiles: [],
      focusPaths: [],
      userInstruction: "make the title bigger",
    });
    expect(prompt.systemPrompt).toContain("SEARCH");
    expect(prompt.systemPrompt).toContain("REPLACE");
    expect(prompt.systemPrompt).toContain("Do NOT guess");
    expect(prompt.systemPrompt).toContain("turbo_edit_prompt_");
  });

  it("(P2) userPrompt 끝에 NO_CONFIDENT_EDITS 폴백 신호가 있다", () => {
    const prompt = buildTurboEditPrompt({
      scaffoldFiles: [],
      focusPaths: [],
      userInstruction: "x",
    });
    expect(prompt.userPrompt).toContain("NO_CONFIDENT_EDITS");
  });
});

describe("buildTurboEditPrompt — context 포함", () => {
  it("(P3) AppFixDraft가 has_fixes일 때 mapped suggestions가 prompt에 들어가고 추측 금지 문구가 포함된다", () => {
    const prompt = buildTurboEditPrompt({
      appName: "테스트 앱",
      scaffoldFiles: [file("src/App.tsx", "export const App = () => null;\n")],
      focusPaths: ["src/App.tsx"],
      appFixDraft: SAMPLE_DRAFT,
    });
    expect(prompt.userPrompt).toContain("테스트 앱");
    expect(prompt.userPrompt).toContain("src/App.tsx");
    expect(prompt.userPrompt).toContain("primary button 라벨 명확화");
    expect(prompt.userPrompt).toContain("Unmapped issues");
    expect(prompt.userPrompt).toContain("Do not guess");
    expect(prompt.userPrompt).toContain("정확한 위치 불명");
  });

  it("(P4) extraIssues / userInstruction 둘 다 들어간다", () => {
    const prompt = buildTurboEditPrompt({
      scaffoldFiles: [file("src/App.tsx", "x")],
      focusPaths: ["src/App.tsx"],
      extraIssues: [
        { id: "x", kind: "contrast", severity: "high", summary: "텍스트 안 보임", recommendation: "대비 올려" },
      ],
      userInstruction: "다크모드 토글 추가",
    });
    expect(prompt.userPrompt).toContain("contrast");
    expect(prompt.userPrompt).toContain("텍스트 안 보임");
    expect(prompt.userPrompt).toContain("다크모드 토글 추가");
  });

  it("(P5) AppFixDraft=no_issues면 '수정 필요 없음' 신호만 들어간다(추측 prompt X)", () => {
    const noIssues: AppFixDraft = {
      status: "no_issues",
      summary: "ok",
      fileSuggestions: [],
      unmappedIssues: [],
      counts: { totalIssues: 0, mappedIssues: 0, unmappedIssues: 0, suggestionGroups: 0 },
    };
    const prompt = buildTurboEditPrompt({
      scaffoldFiles: [file("src/App.tsx", "x")],
      focusPaths: ["src/App.tsx"],
      appFixDraft: noIssues,
    });
    expect(prompt.userPrompt).toContain("no issues");
    expect(prompt.userPrompt).not.toContain("Unmapped issues");
  });
});

describe("buildTurboEditPrompt — file 가드 / excerpt", () => {
  it("(P6) scaffold에 없는 path → not_in_scaffold로 skipped", () => {
    const prompt = buildTurboEditPrompt({
      scaffoldFiles: [file("a.ts", "x")],
      focusPaths: ["a.ts", "missing.ts"],
    });
    expect(prompt.includedFiles.map((f) => f.path)).toEqual(["a.ts"]);
    expect(prompt.skippedFiles).toContainEqual({ path: "missing.ts", reason: "not_in_scaffold" });
  });

  it("(P7) secret_suspect 파일 → skipped, prompt 본문에 비밀 노출 0", () => {
    const secretFile = file(".env", "API=ghp_AAAAAAAAAAAAAAAAAAAAAAAAAA\n");
    const prompt = buildTurboEditPrompt({
      scaffoldFiles: [secretFile],
      focusPaths: [".env"],
    });
    expect(prompt.skippedFiles).toContainEqual({ path: ".env", reason: "secret_suspect" });
    expect(prompt.userPrompt).not.toContain("ghp_AAAAAAAAAAAAAAAAAAAAAAAAAA");
  });

  it("(P8) maxExcerptBytes 초과 → truncated=true + '...truncated' 안내가 본문에 들어간다", () => {
    const big = Array.from({ length: 2000 }, (_, i) => `line ${i}`).join("\n");
    const prompt = buildTurboEditPrompt({
      scaffoldFiles: [file("big.ts", big)],
      focusPaths: ["big.ts"],
      maxExcerptBytes: 500,
    });
    const included = prompt.includedFiles.find((f) => f.path === "big.ts");
    expect(included?.truncated).toBe(true);
    expect(prompt.userPrompt).toContain("truncated");
  });

  it("(P9) focus 비어 있고 issue/instruction 없음 → empty=true", () => {
    const prompt = buildTurboEditPrompt({
      scaffoldFiles: [file("a.ts", "x")],
      focusPaths: [],
    });
    expect(prompt.empty).toBe(true);
  });

  it("(P10) 기본 maxExcerptBytes는 12 KiB", () => {
    expect(DEFAULT_MAX_EXCERPT_BYTES).toBe(12_000);
  });
});

describe("validateTurboEditOutput", () => {
  it("(V1) 빈 입력 → reason=empty", () => {
    expect(validateTurboEditOutput("")).toEqual({ ok: false, reason: "empty" });
    expect(validateTurboEditOutput("   \n\n  ")).toEqual({ ok: false, reason: "empty" });
  });

  it("(V2) NO_CONFIDENT_EDITS → ok=true, noConfidentEdits=true (정직 신호)", () => {
    const r = validateTurboEditOutput("NO_CONFIDENT_EDITS\n");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.noConfidentEdits).toBe(true);
      expect(r.blockCount).toBe(0);
      expect(r.filePaths).toEqual([]);
    }
  });

  it("(V3) SEARCH/REPLACE 블록이 한 개도 없음 → no_blocks", () => {
    expect(validateTurboEditOutput("just a chat reply, no markers")).toEqual({
      ok: false,
      reason: "no_blocks",
    });
  });

  it("(V4) 모든 블록에 filepath 라벨이 없음 → missing_filepath", () => {
    const text = `<<<<<<< SEARCH\nfoo\n=======\nbar\n>>>>>>> REPLACE`;
    expect(validateTurboEditOutput(text)).toEqual({
      ok: false,
      reason: "missing_filepath",
    });
  });

  it("(V5) 정상 다중 파일 블록 → ok + filePaths 모두 보여줌", () => {
    const text = `src/a.ts
<<<<<<< SEARCH
old
=======
new
>>>>>>> REPLACE
src/b.ts
<<<<<<< SEARCH
foo
=======
bar
>>>>>>> REPLACE`;
    const r = validateTurboEditOutput(text);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.blockCount).toBe(2);
      expect([...r.filePaths].sort()).toEqual(["src/a.ts", "src/b.ts"]);
      expect(r.noConfidentEdits).toBe(false);
    }
  });
});
