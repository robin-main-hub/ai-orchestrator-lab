// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { VisualQaReport } from "@ai-orchestrator/protocol";
import { VisualQaCard } from "./VisualQaCard";
import { buildAppFixDraftFromVisualQa } from "../lib/appFixDraft";

/**
 * Visual QA vertical(single file slice — pure + card + draft).
 *
 * 사용자 contract:
 *   1) preview URL 없음 → CTA disabled, 안내 노출(fake observed 금지).
 *   2) 실행 + passed → status 표시, 수정안 초안 CTA 미노출.
 *   3) 실행 + warning/failed → 이슈 리스트 + "수정안 초안 만들기" CTA → 초안에 파일별 묶음 표시.
 *   4) console_error는 미리보기 최대 3개. 그 이상은 안내문구만(전문 dump 금지).
 *   5) 스크린샷 미지원은 정직하게 노출(fake 이미지 금지).
 *   6) AppFixDraft pure: kind→파일 결정적 매핑(visual_overflow → styles.css, console_error → main.tsx 등).
 *   7) 자동 파일 수정/scaffold refresh/GitHub write 0(이 카드 안에 그런 버튼 부재 회귀).
 */

afterEach(() => cleanup());

function makeFetch(report: VisualQaReport, status = 200) {
  const calls: Array<{ url: string }> = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    calls.push({ url });
    return new Response(JSON.stringify({ mission: {}, report }), { status });
  });
  return { fetchImpl, calls };
}

function makeReport(over: Partial<VisualQaReport> = {}): VisualQaReport {
  return {
    id: "qa_1",
    missionId: "mission_x",
    workspaceId: "ws_1",
    previewUrl: "http://127.0.0.1:4567",
    checks: [
      { id: "c1", kind: "http", status: "passed", summary: "HTTP 200 + DOCTYPE 존재" },
      { id: "c2", kind: "browser", status: "skipped", summary: "browser-tier 미연결" },
    ],
    issues: [],
    status: "passed",
    truthStatus: "observed",
    createdAt: "2026-06-14T12:00:00.000Z",
    ...over,
  };
}

describe("VisualQaCard — vertical slice", () => {
  it("(#1) preview URL 없음 → CTA disabled + 안내", () => {
    render(
      <VisualQaCard missionId="mission_x" workspaceId="ws_1" serverBaseUrl="http://x" />,
    );
    const cta = screen.getByTestId("visual-qa-run-mission_x") as HTMLButtonElement;
    expect(cta.disabled).toBe(true);
    expect(screen.getByTestId("visual-qa-no-preview-mission_x").textContent).toContain("preview URL");
  });

  it("(#2) 실행 + passed → 통과 표시, 수정안 CTA 미노출", async () => {
    const { fetchImpl, calls } = makeFetch(makeReport({ status: "passed", truthStatus: "observed" }));
    render(
      <VisualQaCard
        missionId="mission_x"
        workspaceId="ws_1"
        previewUrl="http://127.0.0.1:4567"
        serverBaseUrl="http://x"
        fetchImpl={fetchImpl as unknown as typeof fetch}
      />,
    );
    fireEvent.click(screen.getByTestId("visual-qa-run-mission_x"));
    await waitFor(() => {
      expect(calls[0]?.url).toContain("/missions/mission_x/workspace/ws_1/visual-qa");
      expect(screen.getByTestId("visual-qa-status-mission_x").textContent).toContain("통과");
    });
    expect(screen.queryByTestId("visual-qa-draft-cta-mission_x")).toBeNull();
    expect(screen.getByTestId("visual-qa-screenshot-note-mission_x").textContent).toContain("스크린샷");
  });

  it("(#3) 실행 + failed + 이슈 → 리스트 표시 + 수정안 초안 만들기 → 초안 패널", async () => {
    const report = makeReport({
      status: "failed",
      issues: [
        {
          id: "i1", missionId: "mission_x", workspaceId: "ws_1",
          kind: "visual_overflow", severity: "high",
          summary: ".app-screens 가로 스크롤 발생",
          recommendation: "그리드 minmax를 줄이세요",
          truthStatus: "observed", createdAt: "t",
        },
        {
          id: "i2", missionId: "mission_x", workspaceId: "ws_1",
          kind: "console_error", severity: "high",
          summary: "Uncaught ReferenceError: foo is not defined",
          recommendation: "main.tsx 진입점 확인",
          truthStatus: "observed", createdAt: "t",
        },
        {
          id: "i3", missionId: "mission_x", workspaceId: "ws_1",
          kind: "accessibility", severity: "medium",
          summary: "주요 액션 버튼에 aria-label 없음",
          recommendation: "aria-label 추가",
          truthStatus: "observed", createdAt: "t",
        },
      ],
    });
    const { fetchImpl } = makeFetch(report);
    const onContextEvent = vi.fn();
    render(
      <VisualQaCard
        missionId="mission_x"
        workspaceId="ws_1"
        previewUrl="http://127.0.0.1:4567"
        serverBaseUrl="http://x"
        fetchImpl={fetchImpl as unknown as typeof fetch}
        onContextEvent={onContextEvent}
      />,
    );
    fireEvent.click(screen.getByTestId("visual-qa-run-mission_x"));
    await waitFor(() => screen.getByTestId("visual-qa-status-mission_x"));
    expect(screen.getByTestId("visual-qa-status-mission_x").textContent).toContain("실패");
    // 일반 이슈 리스트(console_error 제외 — 별도 영역).
    expect(screen.getByTestId("visual-qa-issues-mission_x").textContent).toContain("레이아웃 overflow");
    expect(screen.getByTestId("visual-qa-issues-mission_x").textContent).toContain("접근성");
    // 콘솔 에러 영역.
    expect(screen.getByTestId("visual-qa-console-mission_x").textContent).toContain("Uncaught ReferenceError");
    // 수정안 초안 만들기 CTA.
    const draftCta = screen.getByTestId("visual-qa-draft-cta-mission_x");
    fireEvent.click(draftCta);
    await waitFor(() => screen.getByTestId("visual-qa-draft-mission_x"));
    // 파일별 묶음: styles.css(visual_overflow), main.tsx(console_error), App.tsx(accessibility).
    expect(screen.getByTestId(`visual-qa-draft-file-mission_x-src/styles.css`)).toBeTruthy();
    expect(screen.getByTestId(`visual-qa-draft-file-mission_x-src/main.tsx`)).toBeTruthy();
    expect(screen.getByTestId(`visual-qa-draft-file-mission_x-src/App.tsx`)).toBeTruthy();
    // 자동 scaffold refresh/PR 같은 위험 UI 부재. (사용자 명시 patch 적용 버튼은 vertical에서 별도 검증.)
    for (const danger of [/refresh/i, /push/i, /merge/i, /create pr/i, /commit/i]) {
      expect(screen.queryByRole("button", { name: danger })).toBeNull();
    }
    // trace
    const types = onContextEvent.mock.calls.map((c) => c[0] as string);
    expect(types).toContain("mission.visual_qa.requested");
    expect(types).toContain("mission.visual_qa.observed");
    expect(types).toContain("mission.visual_qa.revision_draft.requested");
  });

  it("(#4) console_error 4건 → 미리보기 3건 + 안내", async () => {
    const consoleIssues = [1, 2, 3, 4].map((n) => ({
      id: `c${n}`, missionId: "mission_x", workspaceId: "ws_1",
      kind: "console_error" as const, severity: "high" as const,
      summary: `error #${n}`, recommendation: "main.tsx 확인",
      truthStatus: "observed" as const, createdAt: "t",
    }));
    const { fetchImpl } = makeFetch(makeReport({ status: "warning", issues: consoleIssues }));
    render(
      <VisualQaCard
        missionId="mission_x"
        workspaceId="ws_1"
        previewUrl="http://127.0.0.1:4567"
        serverBaseUrl="http://x"
        fetchImpl={fetchImpl as unknown as typeof fetch}
      />,
    );
    fireEvent.click(screen.getByTestId("visual-qa-run-mission_x"));
    await waitFor(() => screen.getByTestId("visual-qa-console-mission_x"));
    const listItems = screen.getByTestId("visual-qa-console-mission_x").querySelectorAll("ul > li");
    expect(listItems.length).toBe(3);
    expect(screen.getByTestId("visual-qa-console-more-mission_x").textContent).toContain("나머지 1건");
  });

  it("(#pure) buildAppFixDraftFromVisualQa kind→file 결정적 매핑", () => {
    const report = makeReport({
      status: "failed",
      issues: [
        { id: "a", missionId: "m", workspaceId: "w", kind: "visual_overflow", severity: "high", summary: "s", recommendation: "r1", truthStatus: "observed", createdAt: "t" },
        { id: "b", missionId: "m", workspaceId: "w", kind: "mobile_break",    severity: "high", summary: "s", recommendation: "r2", truthStatus: "observed", createdAt: "t" },
        { id: "c", missionId: "m", workspaceId: "w", kind: "console_error",   severity: "high", summary: "s", recommendation: "r3", truthStatus: "observed", createdAt: "t" },
        { id: "d", missionId: "m", workspaceId: "w", kind: "accessibility",   severity: "low",  summary: "s", recommendation: "r4", truthStatus: "observed", createdAt: "t" },
        // 분류 불가 kind는 unmapped로.
        { id: "e", missionId: "m", workspaceId: "w", kind: "hierarchy",       severity: "low",  summary: "s", recommendation: "",   truthStatus: "observed", createdAt: "t" },
      ] as any,
    });
    const draft = buildAppFixDraftFromVisualQa(report);
    expect(draft.status).toBe("has_fixes");
    // styles.css에 visual_overflow + mobile_break 묶임, main.tsx에 console_error, App.tsx에 accessibility + hierarchy.
    const fileMap = Object.fromEntries(draft.fileSuggestions.map((s) => [s.file, s] as const));
    expect(fileMap["src/styles.css"]!.kindHints).toContain("mobile_break");
    expect(fileMap["src/styles.css"]!.kindHints).toContain("visual_overflow");
    expect(fileMap["src/main.tsx"]!.kindHints).toEqual(["console_error"]);
    expect(fileMap["src/App.tsx"]!.kindHints).toContain("accessibility");
    expect(fileMap["src/App.tsx"]!.kindHints).toContain("hierarchy");
    // 분류 불가 issue 없음(전부 매핑됨 — hierarchy는 App.tsx로 매핑).
    expect(draft.counts.unmappedIssues).toBe(0);
  });

  it("(#pure) status=passed → no_issues, status=blocked → blocked", () => {
    expect(buildAppFixDraftFromVisualQa(makeReport({ status: "passed" })).status).toBe("no_issues");
    expect(buildAppFixDraftFromVisualQa(makeReport({ status: "blocked" })).status).toBe("blocked");
  });

  it("(#vertical) issues_found → AppFixDraft → patch preview → include/exclude → 적용 → overlay POST → 적용됨 표시", async () => {
    const report = makeReport({
      status: "failed",
      issues: [
        {
          id: "i_overflow", missionId: "mission_apply", workspaceId: "ws_1",
          kind: "visual_overflow", severity: "high",
          summary: ".app-screens 가로 스크롤",
          recommendation: "minmax 줄이기",
          truthStatus: "observed", createdAt: "t",
        },
        {
          id: "i_a11y", missionId: "mission_apply", workspaceId: "ws_1",
          kind: "accessibility", severity: "medium",
          summary: "버튼 aria-label 없음",
          recommendation: "aria-label 추가",
          truthStatus: "observed", createdAt: "t",
        },
        {
          id: "i_console", missionId: "mission_apply", workspaceId: "ws_1",
          kind: "console_error", severity: "high",
          summary: "Uncaught Error",
          recommendation: "main.tsx 확인",
          truthStatus: "observed", createdAt: "t",
        },
      ],
    });
    // 현재 scaffold 파일 — Blueprint-aware scaffold가 만드는 표준 form.
    const currentFiles = [
      {
        path: "src/styles.css",
        content: `.app-screens {\n  display: grid;\n  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));\n  gap: 1rem;\n}\n\n.screen-card {\n  background: #181b22;\n  padding: 1.25rem;\n}\n\n.screen-card__action {\n  padding: 0.5rem 0.85rem;\n}\n`,
      },
      {
        path: "src/App.tsx",
        content: `import "./styles.css";\nexport function App() {\n  return (\n    <main className="app-shell">\n      <button type="button" className="screen-card__action">새 작업 추가</button>\n    </main>\n  );\n}\n`,
      },
      {
        path: "src/main.tsx",
        content: `import { createRoot } from "react-dom/client";\nimport { App } from "./App";\ncreateRoot(document.getElementById("root")!).render(<App />);\n`,
      },
    ];
    const calls: Array<{ url: string; body: any }> = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const body = init?.body ? JSON.parse(init.body as string) : undefined;
      calls.push({ url, body });
      if (url.endsWith(`/missions/mission_apply/workspace/ws_1/visual-qa`)) {
        return new Response(JSON.stringify({ mission: {}, report }), { status: 200 });
      }
      if (url.endsWith(`/missions/mission_apply/scaffold/overlay`)) {
        return new Response(JSON.stringify({
          outcome: "recorded",
          overlay: {
            id: "overlay_1",
            missionId: "mission_apply",
            source: "appfix",
            files: body.files,
            truthStatus: "planned",
            createdAt: "2026-06-14T13:00:00.000Z",
          },
          skipped: [],
        }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });
    const onContextEvent = vi.fn();
    const onRefreshScaffold = vi.fn();
    render(
      <VisualQaCard
        missionId="mission_apply"
        workspaceId="ws_1"
        previewUrl="http://127.0.0.1:4567"
        currentScaffoldFiles={currentFiles}
        serverBaseUrl="http://x"
        fetchImpl={fetchImpl as unknown as typeof fetch}
        onContextEvent={onContextEvent}
        onRefreshScaffold={onRefreshScaffold}
      />,
    );
    fireEvent.click(screen.getByTestId("visual-qa-run-mission_apply"));
    await waitFor(() => screen.getByTestId("visual-qa-status-mission_apply"));
    fireEvent.click(screen.getByTestId("visual-qa-draft-cta-mission_apply"));
    await waitFor(() => screen.getByTestId("visual-qa-patch-mission_apply"));

    // 3개 파일 patch 표시(styles.css/App.tsx/main.tsx). styles.css와 App.tsx는 applied=true,
    // main.tsx(console_error)는 applied=false(자동 규칙 없음 — 정직 표시).
    const stylesPatch = screen.getByTestId("visual-qa-patch-mission_apply-src/styles.css");
    expect(stylesPatch.getAttribute("data-applied")).toBe("true");
    const appPatch = screen.getByTestId("visual-qa-patch-mission_apply-src/App.tsx");
    expect(appPatch.getAttribute("data-applied")).toBe("true");
    const mainPatch = screen.getByTestId("visual-qa-patch-mission_apply-src/main.tsx");
    expect(mainPatch.getAttribute("data-applied")).toBe("false");

    // 기본 선택: applied=true인 styles.css/App.tsx 자동 체크. main.tsx는 disabled.
    const stylesCheck = screen.getByTestId(`visual-qa-patch-mission_apply-src/styles.css-include`) as HTMLInputElement;
    const appCheck = screen.getByTestId(`visual-qa-patch-mission_apply-src/App.tsx-include`) as HTMLInputElement;
    const mainCheck = screen.getByTestId(`visual-qa-patch-mission_apply-src/main.tsx-include`) as HTMLInputElement;
    expect(stylesCheck.checked).toBe(true);
    expect(appCheck.checked).toBe(true);
    expect(mainCheck.checked).toBe(false);
    expect(mainCheck.disabled).toBe(true);

    // exclude 하나 → 적용 카운트 1로.
    fireEvent.click(stylesCheck);
    expect((screen.getByTestId("visual-qa-patch-apply-mission_apply") as HTMLButtonElement).textContent).toMatch(/선택한 1개/);
    // 다시 include.
    fireEvent.click(stylesCheck);

    // 적용 클릭.
    fireEvent.click(screen.getByTestId("visual-qa-patch-apply-mission_apply"));
    await waitFor(() => {
      const overlayCall = calls.find((c) => c.url.endsWith("/scaffold/overlay"));
      expect(overlayCall).toBeTruthy();
      expect(overlayCall!.body.source).toBe("appfix");
      expect(overlayCall!.body.files.length).toBe(2);
      const paths = (overlayCall!.body.files as Array<{ path: string }>).map((f) => f.path).sort();
      expect(paths).toEqual(["src/App.tsx", "src/styles.css"]);
      // styles.css 새 content에는 minmax(200px가 들어가 있어야 한다(visual_overflow rule).
      const stylesContent = (overlayCall!.body.files as Array<{ path: string; content: string }>).find((f) => f.path === "src/styles.css")!.content;
      expect(stylesContent).toContain("minmax(200px, 1fr)");
      // App.tsx 새 content에는 aria-label이 들어가 있어야 한다(accessibility rule).
      const appContent = (overlayCall!.body.files as Array<{ path: string; content: string }>).find((f) => f.path === "src/App.tsx")!.content;
      expect(appContent).toContain('aria-label="새 작업 추가"');
    });

    // 적용 후 상태 표시 + scaffold refresh + Preview rerun 안내.
    await waitFor(() => {
      expect(screen.getByTestId("visual-qa-patch-applied-mission_apply").textContent).toContain("수정안 적용됨");
      expect(screen.getByTestId("visual-qa-patch-rerun-hint-mission_apply").textContent).toContain("Preview 실행");
    });
    expect(onRefreshScaffold).toHaveBeenCalledWith("mission_apply");

    // trace appfix.patch.applied 발생, paths 포함.
    const appliedTrace = onContextEvent.mock.calls.find((c) => c[0] === "appfix.patch.applied");
    expect(appliedTrace).toBeTruthy();
    expect((appliedTrace![1] as any).paths.sort()).toEqual(["src/App.tsx", "src/styles.css"]);

    // 위험 UI 부재(GitHub write/PR 관련 버튼 — 이 카드 안에는 절대 없음).
    for (const danger of [/create pr/i, /push/i, /merge/i, /commit/i, /branch/i, /github/i]) {
      expect(screen.queryByRole("button", { name: danger })).toBeNull();
    }
  });

  it("(#pure verify) buildVisualQaDiff — passed/improved/no_change/regressed/blocked 결정적", async () => {
    const { buildVisualQaDiff } = await import("../lib/visualQaDiff");
    const base = makeReport({
      status: "failed",
      issues: [
        { id: "a", missionId: "m", workspaceId: "w", kind: "visual_overflow", severity: "high", summary: "Overflow X", recommendation: "r", truthStatus: "observed", createdAt: "t" },
        { id: "b", missionId: "m", workspaceId: "w", kind: "accessibility",  severity: "low",  summary: "aria missing", recommendation: "r", truthStatus: "observed", createdAt: "t" },
      ] as any,
    });
    // 1) passed — after에 issue 없음.
    const passed = makeReport({ status: "passed", issues: [] });
    const dp = buildVisualQaDiff(base, passed);
    expect(dp.status).toBe("passed");
    expect(dp.counts.resolved).toBe(2);
    expect(dp.counts.remaining).toBe(0);
    expect(dp.counts.new).toBe(0);

    // 2) improved — overflow 해결, accessibility 남음.
    const improved = makeReport({
      status: "warning",
      issues: [
        { id: "b2", missionId: "m", workspaceId: "w", kind: "accessibility", severity: "low", summary: "aria missing", recommendation: "r", truthStatus: "observed", createdAt: "t" },
      ] as any,
    });
    const di = buildVisualQaDiff(base, improved);
    expect(di.status).toBe("improved");
    expect(di.counts.resolved).toBe(1);
    expect(di.counts.remaining).toBe(1);
    expect(di.counts.new).toBe(0);

    // 3) no_change — 같은 두 issue.
    const same = makeReport({
      status: "failed",
      issues: [
        { id: "a2", missionId: "m", workspaceId: "w", kind: "visual_overflow", severity: "high", summary: "Overflow X", recommendation: "r", truthStatus: "observed", createdAt: "t" },
        { id: "b2", missionId: "m", workspaceId: "w", kind: "accessibility",  severity: "low",  summary: "aria missing", recommendation: "r", truthStatus: "observed", createdAt: "t" },
      ] as any,
    });
    const dn = buildVisualQaDiff(base, same);
    expect(dn.status).toBe("no_change");
    expect(dn.counts.resolved).toBe(0);
    expect(dn.counts.remaining).toBe(2);

    // 4) regressed — overflow 해결됐지만 새 console_error 생김.
    const regressed = makeReport({
      status: "failed",
      issues: [
        { id: "b3", missionId: "m", workspaceId: "w", kind: "accessibility", severity: "low", summary: "aria missing", recommendation: "r", truthStatus: "observed", createdAt: "t" },
        { id: "n1", missionId: "m", workspaceId: "w", kind: "console_error", severity: "high", summary: "Uncaught", recommendation: "r", truthStatus: "observed", createdAt: "t" },
      ] as any,
    });
    const dr = buildVisualQaDiff(base, regressed);
    expect(dr.status).toBe("regressed");
    expect(dr.counts.new).toBe(1);

    // 5) blocked — observed preview 없음 → 비교 의미 없음.
    const blocked = makeReport({ status: "blocked", issues: [] });
    expect(buildVisualQaDiff(base, blocked).status).toBe("blocked");
    expect(buildVisualQaDiff(blocked, base).status).toBe("blocked");
  });

  it("(#vertical verify) apply → '수정 검증 실행' → preview rerun + QA rerun → diff 패널 + trace", async () => {
    const initialReport = makeReport({
      status: "failed",
      issues: [
        { id: "i1", missionId: "mvf", workspaceId: "ws_a", kind: "visual_overflow", severity: "high", summary: "Overflow X", recommendation: "r", truthStatus: "observed", createdAt: "t" },
        { id: "i2", missionId: "mvf", workspaceId: "ws_a", kind: "accessibility",  severity: "low",  summary: "aria missing", recommendation: "r", truthStatus: "observed", createdAt: "t" },
      ] as any,
    });
    const afterReport = makeReport({
      missionId: "mvf",
      workspaceId: "ws_b",
      status: "warning",
      issues: [
        // visual_overflow 사라짐. accessibility 남음.
        { id: "j1", missionId: "mvf", workspaceId: "ws_b", kind: "accessibility", severity: "low", summary: "aria missing", recommendation: "r", truthStatus: "observed", createdAt: "t" },
      ] as any,
    });
    const calls: Array<{ url: string; body: any }> = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const body = init?.body ? JSON.parse(init.body as string) : undefined;
      calls.push({ url, body });
      if (url.endsWith(`/missions/mvf/workspace/ws_a/visual-qa`)) {
        return new Response(JSON.stringify({ mission: {}, report: initialReport }), { status: 200 });
      }
      if (url.endsWith(`/missions/mvf/scaffold/overlay`)) {
        return new Response(JSON.stringify({
          outcome: "recorded",
          overlay: { id: "ov1", missionId: "mvf", source: "appfix", files: body.files, truthStatus: "planned", createdAt: "t" },
          skipped: [],
        }), { status: 200 });
      }
      if (url.endsWith(`/missions/mvf/preview/run-scaffold`)) {
        return new Response(JSON.stringify({
          outcome: "observed",
          repoRoot: "/tmp/x",
          materializedFileCount: 6,
          workspaceId: "ws_b",
          preview: { status: "running", url: "http://127.0.0.1:4568", port: 4568, truthStatus: "observed" },
        }), { status: 200 });
      }
      if (url.endsWith(`/missions/mvf/workspace/ws_b/visual-qa`)) {
        return new Response(JSON.stringify({ mission: {}, report: afterReport }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });
    const onContextEvent = vi.fn();
    const currentFiles = [
      { path: "src/styles.css", content: `.app-screens { grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); } .screen-card { padding: 1.25rem; } .screen-card__action { padding: 0.5rem 0.85rem; }` },
      { path: "src/App.tsx",    content: `import "./styles.css"; export function App() { return (<main><button className="screen-card__action">시작</button></main>); }` },
    ];
    render(
      <VisualQaCard
        missionId="mvf"
        workspaceId="ws_a"
        previewUrl="http://127.0.0.1:4567"
        currentScaffoldFiles={currentFiles}
        serverBaseUrl="http://x"
        fetchImpl={fetchImpl as unknown as typeof fetch}
        onContextEvent={onContextEvent}
      />,
    );
    // 1) QA 실행 → failed.
    fireEvent.click(screen.getByTestId("visual-qa-run-mvf"));
    await waitFor(() => screen.getByTestId("visual-qa-status-mvf"));
    // 2) 초안 생성.
    fireEvent.click(screen.getByTestId("visual-qa-draft-cta-mvf"));
    await waitFor(() => screen.getByTestId("visual-qa-patch-mvf"));
    // 3) 적용.
    fireEvent.click(screen.getByTestId("visual-qa-patch-apply-mvf"));
    await waitFor(() => screen.getByTestId("visual-qa-patch-applied-mvf"));
    // 4) 수정 검증 실행 CTA 활성.
    const verifyCta = screen.getByTestId("visual-qa-verify-cta-mvf") as HTMLButtonElement;
    expect(verifyCta.disabled).toBe(false);
    fireEvent.click(verifyCta);

    await waitFor(() => {
      const previewCall = calls.find((c) => c.url.endsWith("/missions/mvf/preview/run-scaffold"));
      expect(previewCall).toBeTruthy();
      const reRunQaCall = calls.find((c) => c.url.endsWith("/missions/mvf/workspace/ws_b/visual-qa"));
      expect(reRunQaCall).toBeTruthy();
    });
    // 5) Diff 패널 표시.
    await waitFor(() => {
      const status = screen.getByTestId("visual-qa-verify-status-mvf");
      expect(status.textContent).toMatch(/개선됨|추가 수정 필요/);
      const counts = screen.getByTestId("visual-qa-verify-counts-mvf");
      expect(counts.textContent).toContain("해결 1");
      expect(counts.textContent).toContain("남음 1");
      expect(counts.textContent).toContain("새로 0");
    });
    // 해결됨/남음 리스트.
    expect(screen.getByTestId("visual-qa-verify-resolved-mvf").textContent).toContain("Overflow X");
    expect(screen.getByTestId("visual-qa-verify-remaining-mvf").textContent).toContain("aria missing");

    // trace 검증.
    const types = onContextEvent.mock.calls.map((c) => c[0] as string);
    expect(types).toContain("mission.fix_verification.requested");
    expect(types).toContain("mission.fix_verification.observed");
    const observedTrace = onContextEvent.mock.calls.find((c) => c[0] === "mission.fix_verification.observed");
    expect((observedTrace![1] as any).diffStatus).toBe("improved");
    expect((observedTrace![1] as any).resolved).toBe(1);
    expect((observedTrace![1] as any).remaining).toBe(1);
  });

  it("(#verify failure) preview rerun 실패 → Visual QA rerun 안 함 + preview_failed 표시", async () => {
    const initialReport = makeReport({
      status: "failed",
      issues: [
        { id: "i1", missionId: "mvf2", workspaceId: "ws_a", kind: "visual_overflow", severity: "high", summary: "X", recommendation: "r", truthStatus: "observed", createdAt: "t" },
      ] as any,
    });
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith(`/missions/mvf2/workspace/ws_a/visual-qa`)) {
        return new Response(JSON.stringify({ mission: {}, report: initialReport }), { status: 200 });
      }
      if (url.endsWith(`/missions/mvf2/scaffold/overlay`)) {
        return new Response(JSON.stringify({ outcome: "recorded", overlay: { id: "ov2", missionId: "mvf2", source: "appfix", files: [], truthStatus: "planned", createdAt: "t" }, skipped: [] }), { status: 200 });
      }
      if (url.endsWith(`/missions/mvf2/preview/run-scaffold`)) {
        return new Response(JSON.stringify({ outcome: "preview_not_running", preview: { status: "failed", truthStatus: "configured", detail: "spawn ENOENT" } }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });
    const currentFiles = [
      { path: "src/styles.css", content: `.app-screens { grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); }` },
    ];
    render(
      <VisualQaCard
        missionId="mvf2"
        workspaceId="ws_a"
        previewUrl="http://127.0.0.1:4567"
        currentScaffoldFiles={currentFiles}
        serverBaseUrl="http://x"
        fetchImpl={fetchImpl as unknown as typeof fetch}
      />,
    );
    fireEvent.click(screen.getByTestId("visual-qa-run-mvf2"));
    await waitFor(() => screen.getByTestId("visual-qa-status-mvf2"));
    fireEvent.click(screen.getByTestId("visual-qa-draft-cta-mvf2"));
    await waitFor(() => screen.getByTestId("visual-qa-patch-mvf2"));
    fireEvent.click(screen.getByTestId("visual-qa-patch-apply-mvf2"));
    await waitFor(() => screen.getByTestId("visual-qa-patch-applied-mvf2"));
    fireEvent.click(screen.getByTestId("visual-qa-verify-cta-mvf2"));
    await waitFor(() => {
      expect(screen.getByTestId("visual-qa-verify-preview-failed-mvf2").textContent).toContain("preview 재실행 실패");
    });
    // qa 재실행 안 함 — qa_failed 노출 X.
    expect(screen.queryByTestId("visual-qa-verify-qa-failed-mvf2")).toBeNull();
    // diff 패널 노출 X.
    expect(screen.queryByTestId("visual-qa-verify-diff-mvf2")).toBeNull();
  });

  it("(#pure evidence) computePublishReadiness — 보수적 결정", async () => {
    const { computePublishReadiness, extractScreenshotRef, extractConsoleSummary } = await import("../lib/visualEvidence");

    // preview 없음 → blocked
    expect(computePublishReadiness({}).readiness).toBe("blocked");
    // preview 있고 report 없음 → blocked
    expect(computePublishReadiness({ previewUrl: "http://x" }).readiness).toBe("blocked");
    // report.status=blocked → blocked
    const blockedReport = makeReport({ status: "blocked", issues: [] });
    expect(computePublishReadiness({ previewUrl: "http://x", report: blockedReport }).readiness).toBe("blocked");
    // verifyFailedStep=preview → blocked
    expect(computePublishReadiness({ previewUrl: "http://x", verifyFailedStep: "preview" }).readiness).toBe("blocked");

    // passed report + no diff → ready
    const passed = makeReport({ status: "passed", issues: [] });
    expect(computePublishReadiness({ previewUrl: "http://x", report: passed }).readiness).toBe("ready");

    // failed report + no diff → needs_fix
    const failed = makeReport({
      status: "failed",
      issues: [{ id: "i", missionId: "m", workspaceId: "w", kind: "visual_overflow", severity: "high", summary: "x", recommendation: "r", truthStatus: "observed", createdAt: "t" }] as any,
    });
    expect(computePublishReadiness({ previewUrl: "http://x", report: failed }).readiness).toBe("needs_fix");

    // diff with new=0 + remaining=0 → ready
    expect(
      computePublishReadiness({
        previewUrl: "http://x",
        report: failed,
        diff: { status: "passed", resolved: [], remaining: [], newIssues: [], counts: { before: 1, after: 0, resolved: 1, remaining: 0, new: 0 }, summary: "" },
      }).readiness,
    ).toBe("ready");

    // diff with new>0 → needs_fix
    expect(
      computePublishReadiness({
        previewUrl: "http://x",
        report: failed,
        diff: { status: "regressed", resolved: [], remaining: [], newIssues: [], counts: { before: 1, after: 2, resolved: 0, remaining: 1, new: 1 }, summary: "" },
      }).readiness,
    ).toBe("needs_fix");

    // screenshot extractor: evidenceRef에 image 패턴 있으면 추출, 없으면 undefined
    const withScreenshot = makeReport({
      status: "passed",
      issues: [],
      checks: [{ id: "c1", kind: "browser", status: "passed", summary: "ok", evidenceRef: "/snap/qa_1.png" }],
    });
    expect(extractScreenshotRef(withScreenshot)?.ref).toBe("/snap/qa_1.png");
    expect(extractScreenshotRef(withScreenshot)?.source).toBe("check");
    expect(extractScreenshotRef(makeReport({ status: "passed", issues: [] }))).toBeUndefined();

    // console summary는 최대 3개 + severity high 우선.
    const consoleReport = makeReport({
      status: "failed",
      issues: [
        { id: "a", missionId: "m", workspaceId: "w", kind: "console_error", severity: "low",    summary: "low err", recommendation: "", truthStatus: "observed", createdAt: "t" },
        { id: "b", missionId: "m", workspaceId: "w", kind: "console_error", severity: "high",   summary: "high err", recommendation: "", truthStatus: "observed", createdAt: "t" },
        { id: "c", missionId: "m", workspaceId: "w", kind: "console_error", severity: "medium", summary: "med err", recommendation: "", truthStatus: "observed", createdAt: "t" },
        { id: "d", missionId: "m", workspaceId: "w", kind: "console_error", severity: "high",   summary: "high err 2", recommendation: "", truthStatus: "observed", createdAt: "t" },
      ] as any,
    });
    const cs = extractConsoleSummary(consoleReport);
    expect(cs.total).toBe(4);
    expect(cs.preview.length).toBe(3);
    expect(cs.preview[0].severity).toBe("high");
  });

  it("(#vertical evidence) preview observed + QA passed → Evidence Card에 'Publish 진행 가능' + screenshot 없음 안내", async () => {
    const report = makeReport({ status: "passed", truthStatus: "observed", issues: [] });
    const { fetchImpl } = makeFetch(report);
    const onContextEvent = vi.fn();
    render(
      <VisualQaCard
        missionId="mev_ready"
        workspaceId="ws_1"
        previewUrl="http://127.0.0.1:4567"
        serverBaseUrl="http://x"
        fetchImpl={fetchImpl as unknown as typeof fetch}
        onContextEvent={onContextEvent}
      />,
    );
    fireEvent.click(screen.getByTestId("visual-qa-run-mev_ready"));
    await waitFor(() => screen.getByTestId("visual-qa-status-mev_ready"));
    // Evidence Card readiness = ready, 'Publish로 진행' CTA 보임, screenshot 없음 안내.
    expect(screen.getByTestId("visual-evidence-mev_ready").getAttribute("data-readiness")).toBe("ready");
    expect(screen.getByTestId("visual-evidence-readiness-mev_ready").textContent).toContain("Publish 진행 가능");
    expect(screen.getByTestId("visual-evidence-screenshot-none-mev_ready").textContent).toContain("screenshot 없음");
    const cta = screen.getByTestId("visual-evidence-publish-ready-cta-mev_ready");
    fireEvent.click(cta);
    const types = onContextEvent.mock.calls.map((c) => c[0] as string);
    expect(types).toContain("mission.visual_evidence.publish_ready_clicked");
  });

  it("(#vertical evidence) QA failed → Evidence Card에 needs_fix CTA + 컨솔 요약 3개 cap", async () => {
    const report = makeReport({
      status: "failed",
      truthStatus: "observed",
      issues: [
        { id: "v1", missionId: "m", workspaceId: "w", kind: "visual_overflow", severity: "high", summary: "Overflow", recommendation: "r", truthStatus: "observed", createdAt: "t" },
        { id: "c1", missionId: "m", workspaceId: "w", kind: "console_error", severity: "high", summary: "Uncaught A", recommendation: "", truthStatus: "observed", createdAt: "t" },
        { id: "c2", missionId: "m", workspaceId: "w", kind: "console_error", severity: "high", summary: "Uncaught B", recommendation: "", truthStatus: "observed", createdAt: "t" },
        { id: "c3", missionId: "m", workspaceId: "w", kind: "console_error", severity: "medium", summary: "Uncaught C", recommendation: "", truthStatus: "observed", createdAt: "t" },
        { id: "c4", missionId: "m", workspaceId: "w", kind: "console_error", severity: "low", summary: "Uncaught D", recommendation: "", truthStatus: "observed", createdAt: "t" },
      ] as any,
    });
    const { fetchImpl } = makeFetch(report);
    render(
      <VisualQaCard
        missionId="mev_fix"
        workspaceId="ws_1"
        previewUrl="http://127.0.0.1:4567"
        serverBaseUrl="http://x"
        fetchImpl={fetchImpl as unknown as typeof fetch}
      />,
    );
    fireEvent.click(screen.getByTestId("visual-qa-run-mev_fix"));
    await waitFor(() => screen.getByTestId("visual-qa-status-mev_fix"));
    expect(screen.getByTestId("visual-evidence-mev_fix").getAttribute("data-readiness")).toBe("needs_fix");
    expect(screen.getByTestId("visual-evidence-readiness-mev_fix").textContent).toContain("추가 수정 필요");
    expect(screen.getByTestId("visual-evidence-needs-fix-cta-mev_fix")).toBeTruthy();
    // console preview는 4개 중 3개만 — high 우선.
    const consoleBox = screen.getByTestId("visual-evidence-console-mev_fix");
    expect(consoleBox.textContent).toContain("총 4건");
    expect(consoleBox.textContent).toContain("미리보기 3건");
    expect(consoleBox.textContent).toContain("Uncaught A");
    expect(consoleBox.textContent).toContain("Uncaught B");
    // 최저 우선순위는 cap에서 잘림(Uncaught D).
    expect(consoleBox.textContent).not.toContain("Uncaught D");
  });

  it("(#vertical evidence) preview URL 없음 → blocked + 'Preview/QA 재실행 필요' CTA + preview 없음 안내", () => {
    render(
      <VisualQaCard
        missionId="mev_block"
        workspaceId="ws_1"
        // previewUrl 의도적으로 미주입
        serverBaseUrl="http://x"
      />,
    );
    expect(screen.getByTestId("visual-evidence-mev_block").getAttribute("data-readiness")).toBe("blocked");
    expect(screen.getByTestId("visual-evidence-readiness-mev_block").textContent).toContain("검증 차단");
    expect(screen.getByTestId("visual-evidence-blocked-cta-mev_block")).toBeTruthy();
    expect(screen.getByTestId("visual-evidence-preview-none-mev_block").textContent).toContain("Preview 실행이 필요");
  });

  it("(#vertical evidence) screenshot evidenceRef 있는 report → Evidence Card에 참조 표시(fake 이미지 X)", async () => {
    const report = makeReport({
      status: "passed",
      truthStatus: "observed",
      issues: [],
      checks: [
        { id: "c1", kind: "browser", status: "passed", summary: "screenshot captured", evidenceRef: "visual-qa/abc/snap.png" },
      ],
    });
    const { fetchImpl } = makeFetch(report);
    render(
      <VisualQaCard
        missionId="mev_snap"
        workspaceId="ws_1"
        previewUrl="http://127.0.0.1:4567"
        serverBaseUrl="http://x"
        fetchImpl={fetchImpl as unknown as typeof fetch}
      />,
    );
    fireEvent.click(screen.getByTestId("visual-qa-run-mev_snap"));
    await waitFor(() => screen.getByTestId("visual-qa-status-mev_snap"));
    const snap = screen.getByTestId("visual-evidence-screenshot-mev_snap");
    expect(snap.textContent).toContain("visual-qa/abc/snap.png");
    // fake img element 없음 — 참조 텍스트만.
    expect(snap.querySelector("img")).toBeNull();
  });
});
