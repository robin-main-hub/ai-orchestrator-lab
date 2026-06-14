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
    // 자동 파일 수정/scaffold refresh/PR 같은 위험 UI 부재.
    for (const danger of [/적용/i, /apply/i, /refresh/i, /push/i, /merge/i, /create pr/i, /commit/i]) {
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
});
