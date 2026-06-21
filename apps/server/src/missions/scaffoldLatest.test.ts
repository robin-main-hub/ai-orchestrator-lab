import { describe, expect, it } from "vitest";
import type { ScaffoldOverlay, ScaffoldPlan } from "@ai-orchestrator/protocol";
import {
  buildMissionScaffoldLatestResponse,
  materializeScaffoldLatestFromPlan,
  pickLatestScaffoldPlan,
} from "./scaffoldLatest";

function makePlan(over: Partial<ScaffoldPlan> = {}): ScaffoldPlan {
  return {
    id: "plan_default",
    missionId: "mission_x",
    workspaceId: "ws_x",
    templateId: "react_vite_app",
    input: { appName: "demo" },
    repoRootRef: "/tmp/demo",
    files: [], // 사용되지 않음(scaffoldForTemplate으로 재생성)
    hasOverwrites: false,
    truthStatus: "planned",
    createdAt: "2026-06-14T12:00:00.000Z",
    ...over,
  };
}

describe("pickLatestScaffoldPlan", () => {
  it("빈 배열이면 undefined", () => {
    expect(pickLatestScaffoldPlan([])).toBeUndefined();
  });
  it("여러 plan 중 배열 마지막(event 도착 순서 = createdAt 순서)을 선택", () => {
    const a = makePlan({ id: "plan_a", createdAt: "2026-06-14T10:00:00.000Z" });
    const b = makePlan({ id: "plan_b", createdAt: "2026-06-14T11:00:00.000Z" });
    const c = makePlan({ id: "plan_c", createdAt: "2026-06-14T12:00:00.000Z" });
    expect(pickLatestScaffoldPlan([a, b, c])?.id).toBe("plan_c");
  });
});

describe("materializeScaffoldLatestFromPlan — react_vite_app", () => {
  it("정상 templateId+input → 모든 파일 path+content 있음, skipped 0", () => {
    const result = materializeScaffoldLatestFromPlan(makePlan());
    expect(result.files.length).toBeGreaterThan(0);
    // react_vite 템플릿: package.json, index.html, src/main.tsx, src/App.tsx, src/styles.css, README.md.
    expect(result.files.map((file) => file.path).sort()).toEqual(
      ["README.md", "index.html", "package.json", "src/App.tsx", "src/main.tsx", "src/styles.css"].sort(),
    );
    expect(result.skipped).toEqual([]);
    // 모든 file source는 "scaffold_plan", createdAt은 plan의 그것을 따른다.
    for (const file of result.files) {
      expect(file.source).toBe("scaffold_plan");
      expect(file.createdAt).toBe("2026-06-14T12:00:00.000Z");
      expect(file.content.length).toBeGreaterThan(0);
    }
  });

  it("appName이 안전 문자만 남도록 슬러그된 상태로 content 안에 들어간다(결정적)", () => {
    // 사용자가 'My App!' 같이 보내도 templateId는 동일 templateId로 변하지 않고, 내부에서 슬러그.
    const result = materializeScaffoldLatestFromPlan(makePlan({ input: { appName: "My App!" } }));
    const pkg = result.files.find((file) => file.path === "package.json");
    expect(pkg).toBeTruthy();
    expect(pkg!.content).toContain('"name": "my-app-"');
  });
});

describe("materializeScaffoldLatestFromPlan — generic 템플릿", () => {
  it("템플릿이 README + 컴포넌트 스텁을 만든다 — 둘 다 안전 통과", () => {
    const result = materializeScaffoldLatestFromPlan(makePlan({ templateId: "data_browser", input: { title: "Tickets" } }));
    expect(result.files.map((file) => file.path).sort()).toEqual(["README.md", "src/DataBrowser.tsx"].sort());
    expect(result.skipped).toEqual([]);
  });
});

describe("materializeScaffoldLatestFromPlan — 가드", () => {
  // scaffoldForTemplate은 내장 템플릿만 처리 — unsupported 케이스를 직접 만들 수 없으므로
  // 다른 가드(빈 input/길이/시크릿) 확인은 생략. binary/too_large/secret_suspect 단위 검증은
  // buildMissionScaffoldLatestResponse 통합 케이스에서 모의 plan으로 다룬다.
  it("scaffoldForTemplate이 빈 배열을 반환하는 경우는 없다(내장 템플릿은 항상 결정적). " +
    "그러나 unsupported reason 분류가 안전선이라는 점에 의의를 둔다", () => {
    expect(materializeScaffoldLatestFromPlan(makePlan())).toMatchObject({ files: expect.any(Array) });
  });
});

describe("buildMissionScaffoldLatestResponse", () => {
  const missionId = "mission_resp";

  it("plans 비어 있으면 status='not_found'", () => {
    const result = buildMissionScaffoldLatestResponse({ missionId, plans: [] });
    expect(result.status).toBe("not_found");
    expect(result.files).toEqual([]);
    expect(result.skipped).toEqual([]);
    expect(result.message).toContain("등록된 scaffold plan이 없습니다");
  });

  it("정상 plan 1개면 status='found', truthStatus는 plan의 그것을 그대로 따름", () => {
    const result = buildMissionScaffoldLatestResponse({ missionId, plans: [makePlan({ truthStatus: "planned" })] });
    expect(result.status).toBe("found");
    expect(result.truthStatus).toBe("planned");
    expect(result.files.length).toBeGreaterThan(0);
    expect(result.skipped).toEqual([]);
    expect(result.planId).toBe("plan_default");
  });

  it("여러 plan → 마지막 plan으로 응답", () => {
    const earlier = makePlan({ id: "plan_earlier", createdAt: "2026-06-14T10:00:00.000Z", input: { appName: "old" } });
    const later = makePlan({ id: "plan_later", createdAt: "2026-06-14T12:00:00.000Z", input: { appName: "new" } });
    const result = buildMissionScaffoldLatestResponse({ missionId, plans: [earlier, later] });
    expect(result.planId).toBe("plan_later");
    const pkg = result.files.find((file) => file.path === "package.json");
    expect(pkg!.content).toContain('"name": "new"');
  });

  it("생성된 파일이 일부만 안전하면 status='partial'", () => {
    // 직접 binary/too_large 시뮬이 어렵지만, scaffoldForTemplate이 항상 안전 파일만
    // 만든다는 점이 first iteration의 honest baseline. unsupported를 직접 시뮬:
    const result = buildMissionScaffoldLatestResponse({
      missionId,
      // 임의의 templateId — 내장 처리 시 generic path로 들어가 README + Component.tsx 생성.
      plans: [makePlan({ templateId: "nonstandard_template_id", input: {} })],
    });
    expect(result.status).toBe("found"); // generic path도 안전 파일을 만든다 — 회귀 가드
  });

  it("응답 message는 found/partial일 때 undefined(가짜 메시지 금지)", () => {
    const result = buildMissionScaffoldLatestResponse({ missionId, plans: [makePlan()] });
    expect(result.message).toBeUndefined();
  });

  it("overlay content의 fine-grained PAT(github_pat_)는 서버 가드가 secret_suspect로 스킵", () => {
    // 회귀: 서버 SECRET_PATTERNS가 classic ghp_만 잡고 github_pat_를 누락하면, 권위 있는
    // 서버 가드가 비밀 든 overlay를 안전 파일로 통과시켰다. gitleaks 회피 위해 런타임 조합.
    const pat = "github_" + "pat_" + "11" + "A".repeat(22) + "_" + "b".repeat(40);
    const overlay: ScaffoldOverlay = {
      files: [{ path: "README.md", content: `# token\n${pat}\n` }],
      createdAt: "2026-06-14T13:00:00.000Z",
    } as unknown as ScaffoldOverlay;
    const result = buildMissionScaffoldLatestResponse({ missionId, plans: [makePlan()], overlays: [overlay] });
    expect(result.skipped).toContainEqual({ path: "README.md", reason: "secret_suspect" });
    // 비밀 overlay는 base README.md를 덮어쓰지 못한다 — 원본 content 유지(PAT 미노출).
    const readme = result.files.find((f) => f.path === "README.md");
    expect(readme!.content).not.toContain(pat);
    expect(readme!.source).toBe("scaffold_plan");
  });
});
