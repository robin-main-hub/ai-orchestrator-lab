import { describe, expect, it } from "vitest";
import {
  analyzeVisualQa,
  designIssueKindSchema,
  visualQaCheckStatusSchema,
  visualQaReportSchema,
  type VisualQaObservation,
} from "./visualQa.js";

const now = () => "2026-06-13T00:00:00.000Z";
const ids = { id: "vq1", missionId: "m1", workspaceId: "ws1", now };

function run(obs: VisualQaObservation) {
  const report = analyzeVisualQa({ ...ids, obs });
  expect(() => visualQaReportSchema.parse(report)).not.toThrow();
  return report;
}

describe("analyzeVisualQa — honesty (no fake visual pass)", () => {
  it("blocks (not observed) when there is no observed preview", () => {
    const report = run({ previewObserved: false, previewUrl: "http://x" });
    expect(report.status).toBe("blocked");
    expect(report.truthStatus).toBe("configured");
    expect(report.issues).toHaveLength(0);
  });

  it("HTTP-tier: a page with heading + button passes those checks (observed)", () => {
    const report = run({
      previewObserved: true,
      previewUrl: "http://x",
      http: { ok: true, status: 200, html: "<html><body><h1>App</h1><button>Go</button></body></html>" },
    });
    expect(report.truthStatus).toBe("observed"); // 실제 HTML 관측
    expect(report.checks.find((c) => c.kind === "hierarchy")?.status).toBe("passed");
    expect(report.checks.find((c) => c.kind === "missing_primary_action")?.status).toBe("passed");
    // 브라우저 의존 검사는 probe 없으면 skipped(가짜 pass 금지)
    expect(report.checks.find((c) => c.kind === "overflow")?.status).toBe("skipped");
    expect(report.checks.find((c) => c.kind === "console_error")?.status).toBe("skipped");
  });

  it("HTTP-tier: no heading + no primary action → issues + failed", () => {
    const report = run({
      previewObserved: true,
      previewUrl: "http://x",
      http: { ok: true, status: 200, html: "<html><body><div>hello</div></body></html>" },
    });
    expect(report.status).toBe("failed"); // missing primary action = failed
    expect(report.issues.map((i) => i.kind)).toContain("missing_primary_action");
    expect(report.issues.map((i) => i.kind)).toContain("hierarchy");
    expect(report.issues.every((i) => i.truthStatus === "observed")).toBe(true);
  });

  it("HTTP load failure is a failed check, never a pass", () => {
    const report = run({ previewObserved: true, previewUrl: "http://x", http: { ok: false, status: 500, html: "" } });
    expect(report.checks.find((c) => c.kind === "load")?.status).toBe("failed");
    expect(report.status).toBe("failed");
  });

  it("browser-tier: overflow + console error produce issues", () => {
    const report = run({
      previewObserved: true,
      previewUrl: "http://x",
      http: { ok: true, status: 200, html: "<h1>A</h1><button>x</button>" },
      browser: {
        viewports: [
          { name: "desktop", innerWidth: 1280, scrollWidth: 1280 },
          { name: "mobile", innerWidth: 375, scrollWidth: 520 },
        ],
        consoleErrors: ["TypeError: x is undefined"],
        screenshotRefs: ["shot://desktop.png"],
        iconButtonsMissingAria: 2,
        smallClickTargets: 1,
      },
    });
    expect(report.status).toBe("failed");
    const kinds = report.issues.map((i) => i.kind);
    expect(kinds).toContain("mobile_break"); // mobile overflow
    expect(kinds).toContain("console_error");
    expect(kinds).toContain("accessibility");
    expect(kinds).toContain("click_target");
    // screenshot evidence
    expect(report.checks.find((c) => c.kind === "screenshot")?.evidenceRef).toBe("shot://desktop.png");
  });

  it("everything unobservable → configured, status warning (never a silent pass)", () => {
    const report = run({ previewObserved: true, previewUrl: "http://x" }); // http undefined, browser undefined
    expect(report.truthStatus).toBe("configured");
    expect(report.status).not.toBe("passed");
  });
});

// The honesty model + the mobile-overflow / all-problem browser path are covered
// above, but several branches stay unpinned: the two 0-ref enums (designIssue-
// Kind / checkStatus vocab), the *non-mobile* overflow branch (a desktop/tablet
// overflow must be classified visual_overflow, NOT mobile_break), a fully-CLEAN
// browser observation (which must report passed/observed with ZERO issues — the
// inverse of "no fake pass": no fake FAIL either), an empty screenshotRefs list
// (screenshot check → skipped even with a preview), http===undefined (load check
// → skipped, the "not attempted" tier), an empty body (empty_state → warning),
// and evidence/targetSurface propagation onto the issue cards. Pin them, self-
// consistent (derived from the observation shape, no magic literals).
describe("visualQa vocabulary + uncovered analyze branches", () => {
  it("pins the design-issue-kind and check-status enum memberships", () => {
    expect(designIssueKindSchema.options).toEqual([
      "visual_overflow",
      "console_error",
      "contrast",
      "hierarchy",
      "missing_primary_action",
      "mobile_break",
      "click_target",
      "accessibility",
    ]);
    expect(visualQaCheckStatusSchema.options).toEqual(["passed", "warning", "failed", "skipped"]);
  });

  it("a DESKTOP overflow is classified visual_overflow (not mobile_break), carrying console evidence + targetSurface", () => {
    const report = analyzeVisualQa({
      ...ids,
      targetSurface: "dashboard",
      obs: {
        previewObserved: true,
        previewUrl: "http://x",
        http: { ok: true, status: 200, html: "<h1>A</h1><button>x</button>" },
        browser: {
          viewports: [{ name: "desktop", innerWidth: 1280, scrollWidth: 1400 }], // desktop overflows
          consoleErrors: ["ReferenceError: boom"],
          screenshotRefs: ["shot://d.png"],
          iconButtonsMissingAria: 0,
          smallClickTargets: 0,
        },
      },
    });
    expect(() => visualQaReportSchema.parse(report)).not.toThrow();
    const kinds = report.issues.map((i) => i.kind);
    expect(kinds).toContain("visual_overflow"); // desktop → NOT mobile_break
    expect(kinds).not.toContain("mobile_break");
    // console_error issue carries the FIRST console error as evidence
    const consoleIssue = report.issues.find((i) => i.kind === "console_error")!;
    expect(consoleIssue.evidenceRef).toBe("ReferenceError: boom");
    // targetSurface propagates onto every issue card
    expect(report.issues.every((i) => i.targetSurface === "dashboard")).toBe(true);
  });

  it("a fully CLEAN browser observation → all checks passed, observed, ZERO issues (no fake fail)", () => {
    const report = run({
      previewObserved: true,
      previewUrl: "http://x",
      http: { ok: true, status: 200, html: "<h1>App</h1><button>Go</button>" },
      browser: {
        viewports: [
          { name: "desktop", innerWidth: 1280, scrollWidth: 1280 },
          { name: "mobile", innerWidth: 375, scrollWidth: 375 },
        ],
        consoleErrors: [],
        screenshotRefs: ["shot://ok.png"],
        iconButtonsMissingAria: 0,
        smallClickTargets: 0,
      },
    });
    expect(report.status).toBe("passed");
    expect(report.truthStatus).toBe("observed");
    expect(report.issues).toHaveLength(0); // honesty cuts both ways — no invented problems
    expect(report.checks.every((c) => c.status === "passed")).toBe(true);
  });

  it("empty screenshotRefs → screenshot check is skipped (not a fake pass), other checks still observed", () => {
    const report = run({
      previewObserved: true,
      previewUrl: "http://x",
      http: { ok: true, status: 200, html: "<h1>App</h1><button>Go</button>" },
      browser: {
        viewports: [{ name: "desktop", innerWidth: 1280, scrollWidth: 1280 }],
        consoleErrors: [],
        screenshotRefs: [], // no screenshot captured
        iconButtonsMissingAria: 0,
        smallClickTargets: 0,
      },
    });
    expect(report.checks.find((c) => c.kind === "screenshot")?.status).toBe("skipped");
    expect(report.truthStatus).toBe("observed"); // other browser checks were observed
  });

  it("http===undefined (HTTP tier not attempted) → load check skipped, not failed", () => {
    const report = run({ previewObserved: true, previewUrl: "http://x" }); // no http key at all
    expect(report.checks.find((c) => c.kind === "load")?.status).toBe("skipped");
    // and a not-attempted tier is configured, never observed
    expect(report.truthStatus).toBe("configured");
  });

  it("an empty body (no text) → empty_state check is a warning, never a pass", () => {
    const report = run({
      previewObserved: true,
      previewUrl: "http://x",
      http: { ok: true, status: 200, html: "<h1></h1><button></button>" }, // heading+button tags but no visible text
    });
    expect(report.checks.find((c) => c.kind === "empty_state")?.status).toBe("warning");
    expect(report.status).toBe("warning"); // empty body warning, nothing failed
  });
});
