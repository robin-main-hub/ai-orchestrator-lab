// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { GithubConnectorStatus } from "@ai-orchestrator/protocol";
import { GithubPullRequestPanel } from "./GithubPullRequestPanel";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

const status = (configured: boolean): GithubConnectorStatus => ({
  id: "github",
  name: "GitHub (읽기 전용)",
  mode: "read_only",
  configured,
  tokenPresent: configured,
  scopesNeeded: ["repo (read-only)"],
  note: configured ? "읽기 전용으로 조회 가능" : "미설정 — 서버 GITHUB_TOKEN 필요",
});

/** routes the panel's global-fetch calls by URL */
function stubFetch(routes: { status: GithubConnectorStatus; pulls?: unknown; detail?: unknown }) {
  const fetchMock = vi.fn(async (url: string | URL | Request) => {
    const href = String(url);
    if (href.includes("/integrations/github/status")) return jsonResponse({ status: routes.status });
    if (/\/pulls\/\d+$/.test(href)) return jsonResponse(routes.detail ?? { outcome: "observed", pullRequest: {} });
    if (href.includes("/pulls")) return jsonResponse(routes.pulls ?? { outcome: "observed", pullRequests: [] });
    return jsonResponse({ outcome: "observed" });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("GithubPullRequestPanel (jsdom) — 정직 read-only 표면", () => {
  it("미설정이면 안내만 표시하고 PR을 불러오지 않는다(컨트롤 없음, GitHub 미호출)", async () => {
    const fetchMock = stubFetch({ status: status(false) });
    render(<GithubPullRequestPanel serverBaseUrl="http://x" />);
    await waitFor(() => expect(screen.getAllByText(/미설정/).length).toBeGreaterThan(0));
    // 설정 안 됐으면 repo 입력/불러오기 버튼이 없다
    expect(screen.queryByLabelText("저장소 (owner/repo)")).toBeNull();
    // status만 호출, PR 리소스는 호출 안 함
    expect(fetchMock.mock.calls.every(([url]) => String(url).includes("/status"))).toBe(true);
  });

  it("설정됨 + 불러오기 → 실제 200 PR을 관측됨으로 표시하고, 클릭하면 상세를 연다", async () => {
    stubFetch({
      status: status(true),
      pulls: {
        outcome: "observed",
        observedAt: "2026-06-13T00:00:00.000Z",
        pullRequests: [{ number: 7, title: "honest PR", state: "open", author: "robin", draft: false, htmlUrl: "u", createdAt: "c", updatedAt: "u" }],
      },
      detail: {
        outcome: "observed",
        observedAt: "2026-06-13T00:00:00.000Z",
        pullRequest: {
          number: 7,
          title: "honest PR",
          state: "open",
          author: "robin",
          draft: false,
          htmlUrl: "u",
          createdAt: "c",
          updatedAt: "u",
          body: "PR 본문 내용",
          baseRef: "main",
          headRef: "feat",
          merged: false,
          additions: 5,
          deletions: 1,
          changedFiles: 2,
          commits: 3,
        },
      },
    });
    render(<GithubPullRequestPanel serverBaseUrl="http://x" />);
    const input = await screen.findByLabelText("저장소 (owner/repo)");
    fireEvent.change(input, { target: { value: "robin/repo" } });
    fireEvent.click(screen.getByRole("button", { name: /PR 불러오기/ }));

    const card = await screen.findByText("honest PR");
    expect(screen.getByText("관측됨")).toBeTruthy();
    fireEvent.click(card);
    await waitFor(() => expect(screen.getByText("PR 본문 내용")).toBeTruthy());
    expect(screen.getByText(/main ← feat/)).toBeTruthy();
  });

  it("권한 부족(permission_denied)은 빈 목록이 아니라 '권한 부족'으로 구분 표시", async () => {
    stubFetch({ status: status(true), pulls: { outcome: "permission_denied", message: "권한 부족 — 스코프 확인" } });
    render(<GithubPullRequestPanel serverBaseUrl="http://x" />);
    const input = await screen.findByLabelText("저장소 (owner/repo)");
    fireEvent.change(input, { target: { value: "robin/repo" } });
    fireEvent.click(screen.getByRole("button", { name: /PR 불러오기/ }));
    await waitFor(() => expect(screen.getByText("권한 부족")).toBeTruthy());
    expect(screen.queryByText(/열린 PR 없음/)).toBeNull();
  });

  it("쓰기 버튼이 존재하지 않는다(읽기 전용)", async () => {
    stubFetch({ status: status(true) });
    render(<GithubPullRequestPanel serverBaseUrl="http://x" />);
    await screen.findByLabelText("저장소 (owner/repo)");
    const buttonNames = screen.getAllByRole("button").map((b) => b.textContent ?? "");
    expect(buttonNames.some((name) => /머지|merge|commit|push|생성|create|닫기 PR/i.test(name))).toBe(false);
  });
});
