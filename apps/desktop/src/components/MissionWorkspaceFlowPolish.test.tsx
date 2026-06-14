// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { VisualQaReport } from "@ai-orchestrator/protocol";
import type { VisualQaDiff } from "../lib/visualQaDiff";
import { AppBuildProgressRail } from "./AppBuildProgressRail";
import { MissionWorkspaceSummary } from "./MissionWorkspaceSummary";

afterEach(() => cleanup());

function report(over: Partial<VisualQaReport> = {}): VisualQaReport {
  return {
    id: "r", missionId: "m", workspaceId: "w", previewUrl: "http://x",
    checks: [], issues: [], status: "passed", truthStatus: "observed",
    createdAt: "t",
    ...over,
  };
}

function diff(over: Partial<VisualQaDiff> = {}): VisualQaDiff {
  return {
    status: "passed",
    resolved: [], remaining: [], newIssues: [],
    counts: { before: 0, after: 0, resolved: 0, remaining: 0, new: 0 },
    summary: "",
    ...over,
  };
}

describe("AppBuildProgressRail — render", () => {
  it("(R1) 6단계가 정확히 한 번씩 렌더된다", () => {
    render(
      <AppBuildProgressRail
        missionId="m1"
        missionExists={true}
        hasScaffoldFiles={false}
        previewObserved={false}
        fixApplied={false}
      />,
    );
    expect(screen.getByTestId("app-build-rail-m1")).toBeTruthy();
    for (const stage of ["create", "run", "qa", "fix", "verify", "publish"]) {
      expect(screen.getByTestId(`app-build-rail-step-m1-${stage}`)).toBeTruthy();
    }
  });

  it("(R2) preview observed → run done, qa current — data-status로 표면화", () => {
    render(
      <AppBuildProgressRail
        missionId="m2"
        missionExists={true}
        hasScaffoldFiles={true}
        previewObserved={true}
        fixApplied={false}
      />,
    );
    const run = screen.getByTestId("app-build-rail-step-m2-run");
    const qa = screen.getByTestId("app-build-rail-step-m2-qa");
    expect(run.getAttribute("data-status")).toBe("done");
    expect(qa.getAttribute("data-status")).toBe("current");
  });

  it("(R3) verifyFailedStep=preview → run/verify blocked, 정직하게 표시", () => {
    render(
      <AppBuildProgressRail
        missionId="m3"
        missionExists={true}
        hasScaffoldFiles={true}
        previewObserved={true}
        fixApplied={true}
        qaReport={{ status: "failed", issueCount: 2 }}
        verifyFailedStep="preview"
      />,
    );
    expect(screen.getByTestId("app-build-rail-step-m3-run").getAttribute("data-status")).toBe("blocked");
    expect(screen.getByTestId("app-build-rail-step-m3-verify").getAttribute("data-status")).toBe("blocked");
  });

  it("(R4) publishObserved → publish done", () => {
    render(
      <AppBuildProgressRail
        missionId="m4"
        missionExists={true}
        hasScaffoldFiles={false}
        previewObserved={false}
        fixApplied={false}
        publishObserved={true}
      />,
    );
    expect(screen.getByTestId("app-build-rail-step-m4-publish").getAttribute("data-status")).toBe("done");
  });
});

describe("MissionWorkspaceSummary — render", () => {
  it("(S1) preview URL 없음 → '미실행' 표시(가짜 observed 금지)", () => {
    render(
      <MissionWorkspaceSummary
        missionId="m1"
        title="대시보드"
        previewUrl={undefined}
        fixApplied={false}
      />,
    );
    expect(screen.getByTestId("mws-summary-preview-none-m1")).toBeTruthy();
    expect(screen.queryByTestId("mws-summary-preview-m1")).toBeNull();
    expect(screen.getByTestId("mws-summary-app-m1").textContent).toContain("대시보드");
  });

  it("(S2) preview URL 있음 → 외부 링크로 노출(target=_blank, rel=noopener)", () => {
    render(
      <MissionWorkspaceSummary
        missionId="m2"
        previewUrl="http://localhost:5050"
        fixApplied={false}
      />,
    );
    const link = screen.getByTestId("mws-summary-preview-m2") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("http://localhost:5050");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("(S3) QA passed + 이슈 0 → Readiness '진행 가능', data-readiness=ready", () => {
    render(
      <MissionWorkspaceSummary
        missionId="m3"
        previewUrl="http://x"
        qaReport={report({ status: "passed", issues: [] })}
        fixApplied={false}
      />,
    );
    const root = screen.getByTestId("mws-summary-m3");
    expect(root.getAttribute("data-readiness")).toBe("ready");
    expect(screen.getByTestId("mws-summary-readiness-m3").textContent).toContain("진행");
  });

  it("(S4) QA failed + fix 미적용 → fix='—', readiness=needs_fix", () => {
    render(
      <MissionWorkspaceSummary
        missionId="m4"
        previewUrl="http://x"
        qaReport={report({ status: "failed", issues: [{ id: "x" } as any] })}
        fixApplied={false}
      />,
    );
    const root = screen.getByTestId("mws-summary-m4");
    expect(root.getAttribute("data-readiness")).toBe("needs_fix");
    expect(screen.getByTestId("mws-summary-fix-m4").textContent).toBe("—");
  });

  it("(S5) verifyFailedStep → readiness=blocked, verify 라벨에 '실패' 표시", () => {
    render(
      <MissionWorkspaceSummary
        missionId="m5"
        previewUrl="http://x"
        qaReport={report({ status: "failed", issues: [{ id: "x" } as any] })}
        fixApplied={true}
        verifyFailedStep="preview"
      />,
    );
    const root = screen.getByTestId("mws-summary-m5");
    expect(root.getAttribute("data-readiness")).toBe("blocked");
    expect(screen.getByTestId("mws-summary-verify-m5").textContent).toContain("실패");
  });

  it("(S6) verify diff passed → Verify에 'passed' + Readiness=ready", () => {
    render(
      <MissionWorkspaceSummary
        missionId="m6"
        previewUrl="http://x"
        qaReport={report({ status: "failed", issues: [{ id: "a" } as any] })}
        fixApplied={true}
        verifyDiff={diff({ status: "passed", counts: { before: 1, after: 0, resolved: 1, remaining: 0, new: 0 } })}
      />,
    );
    expect(screen.getByTestId("mws-summary-m6").getAttribute("data-readiness")).toBe("ready");
    expect(screen.getByTestId("mws-summary-verify-m6").textContent).toContain("passed");
  });
});
