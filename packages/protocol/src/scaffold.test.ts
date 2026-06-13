import { describe, expect, it } from "vitest";
import { buildScaffoldPlan, scaffoldForTemplate, scaffoldPlanSchema } from "./scaffold.js";

const now = () => "2026-06-13T00:00:00.000Z";

describe("scaffoldForTemplate", () => {
  it("react_vite_app produces a real minimal Vite scaffold (no company strings)", () => {
    const files = scaffoldForTemplate("react_vite_app", { appName: "demo" });
    const paths = files.map((f) => f.path);
    expect(paths).toContain("package.json");
    expect(paths).toContain("src/App.tsx");
    expect(paths).toContain("index.html");
    const blob = JSON.stringify(files);
    for (const banned of ["example-domain", "EXAMPLE_DOMAIN", "HTV", "견적"]) expect(blob).not.toContain(banned);
  });

  it("a generic template produces a README + component stub", () => {
    const files = scaffoldForTemplate("dashboard_screen", { title: "보드" });
    expect(files.some((f) => f.path === "README.md")).toBe(true);
    expect(files.some((f) => f.path.startsWith("src/") && f.path.endsWith(".tsx"))).toBe(true);
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
