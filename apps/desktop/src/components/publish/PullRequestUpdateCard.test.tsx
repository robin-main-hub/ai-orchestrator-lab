// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PullRequestUpdateCard } from "./PullRequestUpdateCard";

/**
 * W5c PR title/body update card — 적대적 체크리스트(좁은 범위):
 *
 *   - title/body만 노출. draft/state/base/labels/assignees/review/merge UI 부재(회귀).
 *   - Plan 클릭 → /pr/update/plan 호출. 성공 시 plan(currentTitle/newTitle/diff summary) 표시.
 *   - approval ID 입력 + Execute → /pr/update/execute 호출. observed 표시.
 *   - 자동 실행 없음.
 *   - trace에 raw body 본문 누설 X(서버가 응답에 body raw를 안 주는 것과 별개로, 클라이언트도 보내지 않는다).
 */

afterEach(() => cleanup());

const REPO = "robin/lab";
const PR_NUMBER = 42;
const CURRENT_TITLE = "Add login flow";
const NEW_TITLE = "Add login flow (cleaned up)";

function makeMockFetch(
  planResponse: (body: any) => any,
  executeResponse?: (body: any) => any,
) {
  const calls: Array<{ url: string; body: any }> = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ url, body });
    if (url.endsWith("/integrations/github/write/pr/update/plan")) {
      return new Response(JSON.stringify(planResponse(body)), { status: 200 });
    }
    if (url.endsWith("/integrations/github/write/pr/update/execute")) {
      return new Response(
        JSON.stringify(executeResponse ? executeResponse(body) : { outcome: "failed", message: "no executeResponse" }),
        { status: 200 },
      );
    }
    return new Response(JSON.stringify({ outcome: "github_error", message: `unhandled: ${url}` }), { status: 500 });
  });
  return { fetchImpl, calls };
}

const PLAN_OK = (): any => ({
  outcome: "planned",
  plan: {
    id: "pr-update-test-1",
    repoFullName: REPO,
    pullNumber: PR_NUMBER,
    currentTitle: CURRENT_TITLE,
    currentTitleSha256: "current-title-sha",
    currentBodySha256: "current-body-sha",
    currentBodyLength: 30,
    newTitle: NEW_TITLE,
    newTitleSha256: "new-title-sha",
    newBodyExcerpt: undefined,
    newBodySha256: undefined,
    newBodyLength: undefined,
    changeSummary: { titleChanged: true, bodyChanged: false, bodyDelta: 0 },
    status: "approval_required",
    truthStatus: "planned",
    createdAt: "2026-06-14T12:00:00.000Z",
    expiresAt: "2026-06-14T12:10:00.000Z",
  },
});

describe("PullRequestUpdateCard — W5c", () => {
  it("(#1) 기본: title 편집 → Plan → 응답 plan summary 표시 + approval 카드 노출", async () => {
    const { fetchImpl, calls } = makeMockFetch(PLAN_OK);
    render(
      <PullRequestUpdateCard
        defaultRepoFullName={REPO}
        defaultPullNumber={PR_NUMBER}
        defaultCurrentTitle={CURRENT_TITLE}
        serverBaseUrl="http://127.0.0.1:4317"
        fetchImpl={fetchImpl as unknown as typeof fetch}
      />,
    );
    // 새 title 입력
    fireEvent.change(screen.getByLabelText("pr-update new title"), { target: { value: NEW_TITLE } });
    fireEvent.click(screen.getByTestId("publish-pr-update-plan"));
    await waitFor(() => {
      expect(calls.filter((c) => c.url.endsWith("/pr/update/plan")).length).toBe(1);
    });
    const planCall = calls.find((c) => c.url.endsWith("/pr/update/plan"))!;
    expect(planCall.body.repoFullName).toBe(REPO);
    expect(planCall.body.pullNumber).toBe(PR_NUMBER);
    expect(planCall.body.newTitle).toBe(NEW_TITLE);
    // newBody는 비어 있으므로 undefined로 보내야 함(빈 string으로 보내면 GitHub가 body 비우는 의도로 해석).
    expect(planCall.body.newBody).toBeUndefined();
    // UI 검증
    await waitFor(() => {
      expect(screen.getByTestId("publish-pr-update-plan-summary").textContent).toMatch(/title 변경/);
      expect(screen.getByTestId("publish-pr-update-title-diff").textContent).toContain(NEW_TITLE);
      expect(screen.getByTestId("publish-pr-update-execute")).toBeTruthy();
    });
  });

  it("(#2) Plan + approval + Execute → /pr/update/execute 호출 + observed UI", async () => {
    const { fetchImpl, calls } = makeMockFetch(
      PLAN_OK,
      () => ({
        outcome: "observed",
        planId: "pr-update-test-1",
        pullNumber: PR_NUMBER,
        htmlUrl: "https://github.com/robin/lab/pull/42",
        title: NEW_TITLE,
        bodyLength: 30,
        bodySha256: "body-sha",
        updatedAt: "2026-06-14T13:00:00.000Z",
        truthStatus: "observed",
      }),
    );
    const onContextEvent = vi.fn();
    render(
      <PullRequestUpdateCard
        defaultRepoFullName={REPO}
        defaultPullNumber={PR_NUMBER}
        defaultCurrentTitle={CURRENT_TITLE}
        serverBaseUrl="http://127.0.0.1:4317"
        fetchImpl={fetchImpl as unknown as typeof fetch}
        onContextEvent={onContextEvent}
      />,
    );

    fireEvent.change(screen.getByLabelText("pr-update new title"), { target: { value: NEW_TITLE } });
    fireEvent.click(screen.getByTestId("publish-pr-update-plan"));
    await waitFor(() => screen.getByTestId("publish-pr-update-plan-summary"));
    // approval + execute
    fireEvent.change(screen.getByLabelText("pr-update approval ID"), { target: { value: "appr-xyz" } });
    fireEvent.click(screen.getByTestId("publish-pr-update-execute"));
    await waitFor(() => {
      const execCall = calls.find((c) => c.url.endsWith("/pr/update/execute"));
      expect(execCall).toBeTruthy();
      expect(execCall!.body.planId).toBe("pr-update-test-1");
      expect(execCall!.body.approvalId).toBe("appr-xyz");
      expect(execCall!.body.expectedCurrentTitleSha256).toBe("current-title-sha");
      expect(execCall!.body.expectedCurrentBodySha256).toBe("current-body-sha");
      expect(execCall!.body.newTitleSha256).toBe("new-title-sha");
    });
    await waitFor(() => {
      expect(screen.getByTestId("publish-pr-update-observed").textContent).toContain("PR #42");
      const link = screen.getByTestId("publish-pr-update-link") as HTMLAnchorElement;
      expect(link.href).toBe("https://github.com/robin/lab/pull/42");
    });
    // trace에는 raw body가 들어가서는 안 된다 — sha/length만.
    const observedEvent = onContextEvent.mock.calls.find(
      (c) => c[0] === "github.publish.pr.update.observed",
    );
    expect(observedEvent).toBeTruthy();
    const tracePayload = JSON.stringify(observedEvent?.[1]);
    expect(tracePayload).toContain("bodyLength");
    expect(tracePayload).toContain("bodySha256");
  });

  it("(#3) no_op 응답 → 안내 메시지 표시 + execute 비활성", async () => {
    const { fetchImpl } = makeMockFetch(
      () => ({ outcome: "no_op", message: "변경할 게 없습니다 — 새 값이 현재와 동일." }),
    );
    render(
      <PullRequestUpdateCard
        defaultRepoFullName={REPO}
        defaultPullNumber={PR_NUMBER}
        defaultCurrentTitle={CURRENT_TITLE}
        serverBaseUrl="http://127.0.0.1:4317"
        fetchImpl={fetchImpl as unknown as typeof fetch}
      />,
    );
    fireEvent.change(screen.getByLabelText("pr-update new title"), { target: { value: CURRENT_TITLE } });
    fireEvent.click(screen.getByTestId("publish-pr-update-plan"));
    await waitFor(() => {
      expect(screen.getByTestId("publish-pr-update-plan-message").textContent).toContain("변경할 게 없습니다");
    });
    // execute 버튼은 plan이 없으므로 렌더되지 않는다.
    expect(screen.queryByTestId("publish-pr-update-execute")).toBeNull();
  });

  it("(#4) blocked(PR closed) → 메시지 표시 + execute 부재", async () => {
    const { fetchImpl } = makeMockFetch(
      () => ({ outcome: "blocked", message: "PR #42은(는) closed 상태입니다 — open PR만 update 가능" }),
    );
    render(
      <PullRequestUpdateCard
        defaultRepoFullName={REPO}
        defaultPullNumber={PR_NUMBER}
        defaultCurrentTitle={CURRENT_TITLE}
        serverBaseUrl="http://127.0.0.1:4317"
        fetchImpl={fetchImpl as unknown as typeof fetch}
      />,
    );
    fireEvent.change(screen.getByLabelText("pr-update new title"), { target: { value: NEW_TITLE } });
    fireEvent.click(screen.getByTestId("publish-pr-update-plan"));
    await waitFor(() => {
      expect(screen.getByTestId("publish-pr-update-plan-message").textContent).toContain("closed");
    });
    expect(screen.queryByTestId("publish-pr-update-execute")).toBeNull();
  });

  it("(#5 회귀) 위험 UI 부재 — draft toggle / close PR / base 변경 / labels / assignees / merge / review submit / branch delete", () => {
    render(
      <PullRequestUpdateCard
        defaultRepoFullName={REPO}
        defaultPullNumber={PR_NUMBER}
        defaultCurrentTitle={CURRENT_TITLE}
        serverBaseUrl="http://127.0.0.1:4317"
      />,
    );
    for (const danger of [
      /^merge$/i,
      /^close$/i,
      /^close pr$/i,
      /^draft toggle$/i,
      /^toggle draft$/i,
      /^submit review$/i,
      /^request review$/i,
      /^add label/i,
      /^assign/i,
      /^delete branch/i,
      /^change base/i,
    ]) {
      expect(screen.queryByRole("button", { name: danger })).toBeNull();
    }
    // base/draft/state/labels 같은 입력 필드도 없어야 함.
    expect(screen.queryByLabelText(/base/i)).toBeNull();
    expect(screen.queryByLabelText(/draft/i)).toBeNull();
    expect(screen.queryByLabelText(/state/i)).toBeNull();
    expect(screen.queryByLabelText(/label/i)).toBeNull();
    expect(screen.queryByLabelText(/assignee/i)).toBeNull();
    expect(screen.queryByLabelText(/reviewer/i)).toBeNull();
  });
});
