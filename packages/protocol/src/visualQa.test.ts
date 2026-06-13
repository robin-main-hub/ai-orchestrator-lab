import { describe, expect, it } from "vitest";
import { analyzeVisualQa, visualQaReportSchema, type VisualQaObservation } from "./visualQa.js";

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
