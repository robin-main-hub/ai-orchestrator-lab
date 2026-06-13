import { describe, expect, it, vi } from "vitest";
import { runBrowserProbe, type ProbeDriver, type ProbePage } from "./visualQaBrowserProbe";

function fakePage(metrics: { scrollWidth: number; innerWidth: number; iconButtonsMissingAria: number; smallClickTargets: number }, errors: string[] = []): ProbePage {
  return {
    setViewport: async () => {},
    goto: async () => {},
    metrics: async () => metrics,
    screenshot: async () => {},
    consoleErrors: () => errors,
    close: async () => {},
  };
}

describe("runBrowserProbe — honesty (skip when no browser)", () => {
  it("returns undefined when the browser is unavailable (launch → null)", async () => {
    const result = await runBrowserProbe({ url: "http://x", screenshotDir: "/tmp/shots", launch: async () => null, mkdir: async () => {} });
    expect(result).toBeUndefined(); // 브라우저 미설치 → skip(가짜 observed 금지)
  });

  it("returns undefined when launch throws", async () => {
    const result = await runBrowserProbe({ url: "http://x", screenshotDir: "/tmp/shots", launch: async () => { throw new Error("no chromium"); }, mkdir: async () => {} });
    expect(result).toBeUndefined();
  });

  it("collects observed metrics per viewport + console errors + screenshots", async () => {
    let vp = 0;
    const driver: ProbeDriver = {
      newPage: async () => {
        // mobile(3번째)에서만 overflow 나도록
        const m = vp++ === 2 ? { scrollWidth: 520, innerWidth: 375, iconButtonsMissingAria: 1, smallClickTargets: 0 } : { scrollWidth: 1000, innerWidth: 1280, iconButtonsMissingAria: 1, smallClickTargets: 0 };
        return fakePage(m, ["TypeError: boom"]);
      },
      close: async () => {},
    };
    const mkdir = vi.fn(async () => {});
    const result = await runBrowserProbe({ url: "http://x", screenshotDir: "/tmp/shots", launch: async () => driver, mkdir });
    expect(result).toBeDefined();
    expect(result!.viewports).toHaveLength(3);
    expect(result!.viewports.find((v) => v.name === "mobile")!.scrollWidth).toBe(520);
    expect(result!.consoleErrors).toContain("TypeError: boom");
    expect(result!.screenshotRefs.length).toBe(3);
    expect(result!.iconButtonsMissingAria).toBe(1);
    expect(mkdir).toHaveBeenCalled();
  });

  it("returns undefined if every viewport fails (no observation)", async () => {
    const driver: ProbeDriver = {
      newPage: async () => ({ ...fakePage({ scrollWidth: 0, innerWidth: 0, iconButtonsMissingAria: 0, smallClickTargets: 0 }), goto: async () => { throw new Error("nav failed"); } }),
      close: async () => {},
    };
    const result = await runBrowserProbe({ url: "http://x", screenshotDir: "/tmp/shots", launch: async () => driver, mkdir: async () => {} });
    expect(result).toBeUndefined();
  });
});
