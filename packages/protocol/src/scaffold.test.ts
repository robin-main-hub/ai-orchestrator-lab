import { describe, expect, it } from "vitest";
import {
  buildScaffoldPlan,
  encodeBlueprintToScaffoldInput,
  scaffoldForTemplate,
  scaffoldPlanSchema,
  type ScaffoldBlueprintSpec,
} from "./scaffold.js";

const now = () => "2026-06-13T00:00:00.000Z";

describe("scaffoldForTemplate", () => {
  it("react_vite_app produces a real minimal Vite scaffold (no company strings)", () => {
    const files = scaffoldForTemplate("react_vite_app", { appName: "demo" });
    const paths = files.map((f) => f.path);
    expect(paths).toContain("package.json");
    expect(paths).toContain("src/App.tsx");
    expect(paths).toContain("index.html");
    const blob = JSON.stringify(files);
    for (const banned of ["giolite", "GIOLITE", "HTV", "견적"]) expect(blob).not.toContain(banned);
  });

  it("a generic template produces a README + component stub", () => {
    const files = scaffoldForTemplate("dashboard_screen", { title: "보드" });
    expect(files.some((f) => f.path === "README.md")).toBe(true);
    expect(files.some((f) => f.path.startsWith("src/") && f.path.endsWith(".tsx"))).toBe(true);
  });
});

// encodeBlueprintToScaffoldInput is the 0-ref encoder that smuggles a blueprint
// through scaffoldPlan.input (a Record<string, string|number>) under the
// "__blueprint" JSON key — schema-change-free. The decode side is private, only
// reachable via scaffoldForTemplate. Pin the encode shape and the full
// round-trip (intent + screens + acceptance criteria reflected into App.tsx /
// README), plus the honest fallback to a placeholder app when the blueprint is
// absent or malformed (never a half-rendered fake). Generic todo app — no domain.
describe("encodeBlueprintToScaffoldInput — blueprint round-trip", () => {
  const blueprint: ScaffoldBlueprintSpec = {
    userIntent: "할 일을 한 곳에서 관리한다",
    screens: [
      { name: "목록", purpose: "오늘 할 일을 본다", primaryAction: "완료 표시" },
      { name: "추가", purpose: "새 할 일을 적는다", primaryAction: "저장" },
    ],
    acceptanceCriteria: ["빈 목록일 때 안내를 보여준다", "추가 후 목록이 갱신된다"],
  };

  it("encodes to a single __blueprint JSON key that parses back to the same spec", () => {
    const encoded = encodeBlueprintToScaffoldInput(blueprint);
    expect(Object.keys(encoded)).toEqual(["__blueprint"]);
    expect(JSON.parse(String(encoded.__blueprint))).toEqual(blueprint);
  });

  it("reflects the encoded intent / screens / acceptance criteria into the react_vite scaffold", () => {
    const encoded = encodeBlueprintToScaffoldInput(blueprint);
    const files = scaffoldForTemplate("react_vite_app", { appName: "todo", ...encoded });
    const appTsx = files.find((f) => f.path === "src/App.tsx")!.content;
    const readme = files.find((f) => f.path === "README.md")!.content;
    for (const fragment of ["할 일을 한 곳에서 관리한다", "목록", "오늘 할 일을 본다", "완료 표시", "추가", "저장"]) {
      expect(appTsx).toContain(fragment);
    }
    expect(readme).toContain("## 의도");
    expect(readme).toContain("## 화면");
    expect(readme).toContain("## 수용 기준");
    expect(readme).toContain("빈 목록일 때 안내를 보여준다");
  });

  it("falls back to the placeholder app when no __blueprint is present", () => {
    const files = scaffoldForTemplate("react_vite_app", { appName: "todo" });
    const appTsx = files.find((f) => f.path === "src/App.tsx")!.content;
    const readme = files.find((f) => f.path === "README.md")!.content;
    expect(appTsx).toContain("아직 등록된 화면이 없습니다.");
    expect(readme).not.toContain("## 의도");
  });

  it("falls back gracefully when __blueprint is malformed JSON (no throw, placeholder app)", () => {
    const files = scaffoldForTemplate("react_vite_app", { appName: "todo", __blueprint: "{not valid json" });
    const appTsx = files.find((f) => f.path === "src/App.tsx")!.content;
    expect(appTsx).toContain("아직 등록된 화면이 없습니다.");
  });
});

describe("buildScaffoldPlan", () => {
  it("marks create vs overwrite, stays planned, carries input for later apply", () => {
    const scaffold = scaffoldForTemplate("react_vite_app", { appName: "demo" });
    const plan = buildScaffoldPlan({
      id: "sc1",
      missionId: "m1",
      workspaceId: "ws1",
      templateId: "react_vite_app",
      templateInput: { appName: "demo" },
      repoRootRef: "/repo",
      scaffold,
      existingPaths: new Set(["package.json"]),
      now,
    });
    expect(() => scaffoldPlanSchema.parse(plan)).not.toThrow();
    expect(plan.truthStatus).toBe("planned"); // 아직 쓰지 않음
    expect(plan.hasOverwrites).toBe(true);
    expect(plan.input.appName).toBe("demo"); // apply 재생성용
    expect(plan.files.find((f) => f.path === "package.json")?.action).toBe("overwrite");
  });
});
