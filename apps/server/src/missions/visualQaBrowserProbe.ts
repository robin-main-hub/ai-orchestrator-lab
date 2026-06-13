import { join } from "node:path";
import type { VisualQaObservation } from "@ai-orchestrator/protocol";

/**
 * Visual QA browser-tier (D5b-2) — observed preview를 **실제 브라우저(Playwright)**로 열어
 * screenshot/viewport overflow/console·pageerror/a11y를 관측한다. 결과는 analyzeVisualQa의
 * browser obs로 넘어가 observed로 승격된다.
 *
 * 절대 원칙(가짜 visual pass 금지):
 *   - 브라우저가 없거나(미설치) 실행 실패면 **undefined를 돌려준다 → 브라우저 검사는 skipped**.
 *     절대 observed pass로 위장하지 않는다.
 *   - 한 번이라도 관측한 것만 obs에 담는다.
 *   - 드라이버는 DI — 단위 테스트는 진짜 브라우저 없이 가짜 드라이버로.
 */

export type ProbePage = {
  setViewport: (width: number, height: number) => Promise<void>;
  goto: (url: string) => Promise<void>;
  metrics: () => Promise<{ scrollWidth: number; innerWidth: number; iconButtonsMissingAria: number; smallClickTargets: number }>;
  screenshot: (path: string) => Promise<void>;
  consoleErrors: () => ReadonlyArray<string>;
  close: () => Promise<void>;
};
export type ProbeDriver = { newPage: () => Promise<ProbePage>; close: () => Promise<void> };
/** null이면 브라우저 사용 불가(미설치/실행 실패) — 정직하게 skip된다. */
export type LaunchProbeDriver = () => Promise<ProbeDriver | null>;

export const DEFAULT_VISUAL_QA_VIEWPORTS: ReadonlyArray<{ name: "desktop" | "tablet" | "mobile"; width: number; height: number }> = [
  { name: "desktop", width: 1280, height: 800 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "mobile", width: 375, height: 812 },
];

/**
 * 브라우저로 preview를 관측해 browser obs를 만든다. 드라이버가 null이거나 어디서든 실패하면
 * undefined(→ 브라우저 검사 skipped). 부분 성공해도 관측된 viewport만 담는다.
 */
export async function runBrowserProbe(input: {
  url: string;
  screenshotDir: string;
  launch: LaunchProbeDriver;
  mkdir: (dir: string) => Promise<void>;
  viewports?: ReadonlyArray<{ name: "desktop" | "tablet" | "mobile"; width: number; height: number }>;
}): Promise<VisualQaObservation["browser"] | undefined> {
  let driver: ProbeDriver | null = null;
  try {
    driver = await input.launch();
  } catch {
    return undefined;
  }
  if (!driver) return undefined; // 브라우저 미설치/실행 실패 → skip(가짜 pass 금지)

  const viewports = input.viewports ?? DEFAULT_VISUAL_QA_VIEWPORTS;
  const viewportResults: Array<{ name: "desktop" | "tablet" | "mobile"; innerWidth: number; scrollWidth: number }> = [];
  const consoleErrors = new Set<string>();
  const screenshotRefs: string[] = [];
  let iconButtonsMissingAria = 0;
  let smallClickTargets = 0;

  try {
    await input.mkdir(input.screenshotDir);
    for (const viewport of viewports) {
      const page = await driver.newPage();
      try {
        await page.setViewport(viewport.width, viewport.height);
        await page.goto(input.url);
        const metrics = await page.metrics();
        viewportResults.push({ name: viewport.name, innerWidth: metrics.innerWidth, scrollWidth: metrics.scrollWidth });
        iconButtonsMissingAria = Math.max(iconButtonsMissingAria, metrics.iconButtonsMissingAria);
        smallClickTargets = Math.max(smallClickTargets, metrics.smallClickTargets);
        const shotPath = join(input.screenshotDir, `${viewport.name}.png`);
        await page.screenshot(shotPath);
        screenshotRefs.push(shotPath);
        for (const error of page.consoleErrors()) consoleErrors.add(error);
      } finally {
        await page.close().catch(() => {});
      }
    }
  } catch {
    // 관측 도중 실패 — 관측된 게 하나도 없으면 skip, 있으면 부분 결과를 정직히 반환
    if (viewportResults.length === 0) {
      await driver.close().catch(() => {});
      return undefined;
    }
  } finally {
    await driver.close().catch(() => {});
  }

  if (viewportResults.length === 0) return undefined;
  return { viewports: viewportResults, consoleErrors: [...consoleErrors], screenshotRefs, iconButtonsMissingAria, smallClickTargets };
}

/**
 * 실제 Playwright 드라이버 — playwright가 설치돼 있고 chromium이 실행될 때만. 어떤 이유로든
 * 실패하면 null(→ skip). playwright는 optionalDependency라 미설치 환경에서도 서버는 뜬다.
 */
export function createPlaywrightProbeDriver(): LaunchProbeDriver {
  return async () => {
    try {
      // 변수 specifier로 dynamic import — 미설치 시 빌드/타입 영향 없음, 런타임 skip.
      // playwright(full) 우선, 없으면 playwright-core. 둘 다 없으면 catch → null(skip).
      let playwright: { chromium: { launch: (opts: { headless: boolean; executablePath?: string }) => Promise<PlaywrightBrowser> } };
      try {
        const full = "playwright";
        playwright = (await import(full)) as typeof playwright;
      } catch {
        const core = "playwright-core";
        playwright = (await import(core)) as typeof playwright;
      }
      // 캐시된 chromium 경로를 명시할 수 있다(playwright 버전과 브라우저 빌드 불일치 회피).
      const executablePath = process.env.ORCHESTRATOR_VISUAL_QA_CHROMIUM_PATH?.trim() || undefined;
      const browser = await playwright.chromium.launch({ headless: true, executablePath });
      return {
        newPage: async () => {
          const page = await browser.newPage();
          const errors: string[] = [];
          page.on("console", (message) => {
            if (message.type() === "error") errors.push(String(message.text()).slice(0, 200));
          });
          page.on("pageerror", (error) => errors.push(String(error).slice(0, 200)));
          return {
            setViewport: (width: number, height: number) => page.setViewportSize({ width, height }),
            goto: async (url: string) => {
              await page.goto(url, { waitUntil: "domcontentloaded", timeout: 8_000 });
            },
            // DOM 코드는 브라우저에서 돈다 — 문자열 표현식으로 넘겨 서버 tsc(DOM lib 없음)를 우회.
            metrics: () =>
              page.evaluate(BROWSER_METRICS_EXPR) as Promise<{
                scrollWidth: number;
                innerWidth: number;
                iconButtonsMissingAria: number;
                smallClickTargets: number;
              }>,
            screenshot: async (path: string) => {
              await page.screenshot({ path });
            },
            consoleErrors: () => errors,
            close: () => page.close(),
          };
        },
        close: () => browser.close(),
      };
    } catch {
      return null; // playwright 미설치 또는 chromium 실행 실패 → skip(정직)
    }
  };
}

/** 브라우저에서 실행되는 metrics 수집(문자열 — 서버 tsc가 DOM을 검사하지 않게). */
const BROWSER_METRICS_EXPR = `(() => {
  const docEl = document.documentElement;
  const isIconOnly = (el) => !((el.textContent || '').trim()) && !el.getAttribute('aria-label') && !el.getAttribute('title');
  const iconButtons = Array.from(document.querySelectorAll('button, a[role=button], [role=button]')).filter(isIconOnly);
  const small = Array.from(document.querySelectorAll('button, a, input')).filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && (r.width < 24 || r.height < 24);
  });
  return { scrollWidth: docEl.scrollWidth, innerWidth: window.innerWidth, iconButtonsMissingAria: iconButtons.length, smallClickTargets: small.length };
})()`;

type PlaywrightBrowser = {
  newPage: () => Promise<PlaywrightPage>;
  close: () => Promise<void>;
};
type PlaywrightPage = {
  on: (event: string, cb: (arg: { type: () => string; text: () => string }) => void) => void;
  setViewportSize: (size: { width: number; height: number }) => Promise<void>;
  goto: (url: string, opts: { waitUntil: string; timeout: number }) => Promise<unknown>;
  evaluate: (expression: string) => Promise<unknown>;
  screenshot: (opts: { path: string }) => Promise<unknown>;
  close: () => Promise<void>;
};
