import { describe, expect, it } from "vitest";
import { computeProgressRail } from "./appBuildProgressRail";

function status(rail: ReturnType<typeof computeProgressRail>): Record<string, string> {
  return Object.fromEntries(rail.map((s) => [s.stage, s.status]));
}

describe("computeProgressRail", () => {
  it("mission만 있고 scaffold 없음 → create=done, run=not_started", () => {
    const s = status(computeProgressRail({
      missionExists: true, hasScaffoldFiles: false, previewObserved: false, fixApplied: false,
    }));
    expect(s.create).toBe("done");
    expect(s.run).toBe("not_started");
    expect(s.qa).toBe("not_started");
    expect(s.publish).toBe("not_started");
  });

  it("scaffold 있고 preview 안 띄움 → run=current", () => {
    const s = status(computeProgressRail({
      missionExists: true, hasScaffoldFiles: true, previewObserved: false, fixApplied: false,
    }));
    expect(s.create).toBe("done");
    expect(s.run).toBe("current");
  });

  it("preview observed → run=done, qa=current(미실행)", () => {
    const s = status(computeProgressRail({
      missionExists: true, hasScaffoldFiles: true, previewObserved: true, fixApplied: false,
    }));
    expect(s.run).toBe("done");
    expect(s.qa).toBe("current");
  });

  it("QA passed + 이슈 없음 → qa=done, fix=not_started, verify=not_started, publish=current", () => {
    const s = status(computeProgressRail({
      missionExists: true, hasScaffoldFiles: true, previewObserved: true, fixApplied: false,
      qaReport: { status: "passed", issueCount: 0 },
    }));
    expect(s.qa).toBe("done");
    expect(s.fix).toBe("not_started");
    expect(s.verify).toBe("not_started");
    expect(s.publish).toBe("current");
  });

  it("QA failed 이슈 있음 → qa=current(미통과), fix=current", () => {
    const s = status(computeProgressRail({
      missionExists: true, hasScaffoldFiles: true, previewObserved: true, fixApplied: false,
      qaReport: { status: "failed", issueCount: 3 },
    }));
    expect(s.qa).toBe("current");
    expect(s.fix).toBe("current");
  });

  it("fix applied + verify 안 됨 → fix=done, verify=current", () => {
    const s = status(computeProgressRail({
      missionExists: true, hasScaffoldFiles: true, previewObserved: true, fixApplied: true,
      qaReport: { status: "failed", issueCount: 3 },
    }));
    expect(s.fix).toBe("done");
    expect(s.verify).toBe("current");
  });

  it("verify passed → verify=done, publish=current", () => {
    const s = status(computeProgressRail({
      missionExists: true, hasScaffoldFiles: true, previewObserved: true, fixApplied: true,
      qaReport: { status: "failed", issueCount: 3 },
      verifyDiff: { status: "passed" },
    }));
    expect(s.verify).toBe("done");
    expect(s.publish).toBe("current");
  });

  it("verify regressed → verify=current(미통과), publish=not_started", () => {
    const s = status(computeProgressRail({
      missionExists: true, hasScaffoldFiles: true, previewObserved: true, fixApplied: true,
      qaReport: { status: "failed", issueCount: 3 },
      verifyDiff: { status: "regressed" },
    }));
    expect(s.verify).toBe("current");
    expect(s.publish).toBe("not_started");
  });

  it("verifyFailedStep=preview → run=blocked, verify=blocked", () => {
    const s = status(computeProgressRail({
      missionExists: true, hasScaffoldFiles: true, previewObserved: true, fixApplied: true,
      qaReport: { status: "failed", issueCount: 3 },
      verifyFailedStep: "preview",
    }));
    expect(s.run).toBe("blocked");
    expect(s.verify).toBe("blocked");
  });

  it("verifyFailedStep=qa → qa=blocked", () => {
    const s = status(computeProgressRail({
      missionExists: true, hasScaffoldFiles: true, previewObserved: true, fixApplied: true,
      qaReport: { status: "failed", issueCount: 3 },
      verifyFailedStep: "qa",
    }));
    expect(s.qa).toBe("blocked");
  });

  it("publishObserved → publish=done(다른 단계가 아직 not_started여도)", () => {
    const s = status(computeProgressRail({
      missionExists: true, hasScaffoldFiles: true, previewObserved: false, fixApplied: false,
      publishObserved: true,
    }));
    expect(s.publish).toBe("done");
  });
});
