import { describe, expect, it } from "vitest";
import {
  addAnnotation,
  annotationsToTurboEditIssues,
  makeAnnotation,
  removeAnnotation,
  type PreviewAnnotation,
} from "./previewAnnotations";

function ann(over: Partial<PreviewAnnotation> = {}): PreviewAnnotation {
  return makeAnnotation({
    id: over.id ?? "a1",
    description: over.description ?? "헤더 텍스트가 작다",
    positionHint: over.positionHint,
    targetFile: over.targetFile,
    createdAt: over.createdAt ?? "2026-06-15T00:00:00Z",
  });
}

describe("makeAnnotation", () => {
  it("(M1) description은 trim, positionHint/targetFile은 비면 undefined", () => {
    const a = makeAnnotation({
      id: "x",
      description: "  hello  ",
      positionHint: "",
      targetFile: "   ",
      createdAt: "t",
    });
    expect(a.description).toBe("hello");
    expect(a.positionHint).toBeUndefined();
    expect(a.targetFile).toBeUndefined();
  });

  it("(M2) positionHint/targetFile 값 있으면 trim 후 보존", () => {
    const a = makeAnnotation({
      id: "x",
      description: "d",
      positionHint: "  헤더  ",
      targetFile: "  src/App.tsx  ",
      createdAt: "t",
    });
    expect(a.positionHint).toBe("헤더");
    expect(a.targetFile).toBe("src/App.tsx");
  });
});

describe("add/removeAnnotation", () => {
  it("(A1) 새 id 추가", () => {
    const list = addAnnotation([], ann({ id: "a1" }));
    expect(list).toHaveLength(1);
    expect(list[0]!.id).toBe("a1");
  });

  it("(A2) 같은 id 다시 추가 → 교체(중복 보존 X)", () => {
    let list = addAnnotation([], ann({ id: "a1", description: "old" }));
    list = addAnnotation(list, ann({ id: "a1", description: "new" }));
    expect(list).toHaveLength(1);
    expect(list[0]!.description).toBe("new");
  });

  it("(A3) remove 존재 id → 그 항목만 제외", () => {
    let list = addAnnotation([], ann({ id: "a1" }));
    list = addAnnotation(list, ann({ id: "a2", description: "다른" }));
    const after = removeAnnotation(list, "a1");
    expect(after.map((a) => a.id)).toEqual(["a2"]);
  });

  it("(A4) remove 없는 id → 변화 없음(에러 X)", () => {
    const list = addAnnotation([], ann({ id: "a1" }));
    const after = removeAnnotation(list, "nope");
    expect(after).toEqual(list);
  });
});

describe("annotationsToTurboEditIssues", () => {
  it("(I1) description 비어 있는 항목은 제외", () => {
    const list = [ann({ id: "a1", description: "" }), ann({ id: "a2", description: "ok" })];
    const issues = annotationsToTurboEditIssues(list);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.id).toBe("pa_a2");
  });

  it("(I2) kind=preview_annotation, severity=medium", () => {
    const issues = annotationsToTurboEditIssues([ann({ id: "a1" })]);
    expect(issues[0]!.kind).toBe("preview_annotation");
    expect(issues[0]!.severity).toBe("medium");
  });

  it("(I3) positionHint 있으면 summary에 [hint] prefix", () => {
    const issues = annotationsToTurboEditIssues([
      ann({ id: "a1", description: "글씨 작다", positionHint: "헤더" }),
    ]);
    expect(issues[0]!.summary).toBe("[헤더] 글씨 작다");
  });

  it("(I4) positionHint 없으면 description 그대로", () => {
    const issues = annotationsToTurboEditIssues([
      ann({ id: "a1", description: "글씨 작다" }),
    ]);
    expect(issues[0]!.summary).toBe("글씨 작다");
  });

  it("(I5) targetFile 있으면 recommendation에 path가 들어가고 '추측 금지' 문구 동행", () => {
    const issues = annotationsToTurboEditIssues([
      ann({ id: "a1", targetFile: "src/App.tsx" }),
    ]);
    expect(issues[0]!.recommendation).toContain("src/App.tsx");
    expect(issues[0]!.recommendation).toContain("블록 만들지");
  });

  it("(I6) targetFile 없어도 recommendation에 '추측 금지' 문구는 들어간다", () => {
    const issues = annotationsToTurboEditIssues([ann({ id: "a1" })]);
    expect(issues[0]!.recommendation).toContain("블록 만들지");
  });
});
