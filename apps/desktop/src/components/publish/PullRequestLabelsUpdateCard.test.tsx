// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PullRequestLabelsUpdateCard } from "./PullRequestLabelsUpdateCard";

/**
 * W5d-Phase-1 PR labels update card — 적대적 체크리스트(좁은 범위):
 *
 *   - labels add/remove 입력만 노출. assignees/milestone/project/draft/close/merge/review/branch
 *     delete UI 부재.
 *   - Plan 클릭 → /pr/labels/plan 호출. 응답 plan 표시(currentLabels/finalLabels/changeSummary).
 *   - approval ID + Execute → /pr/labels/execute 호출. observed appliedLabels 표시.
 *   - no_op → 안내 표시 + execute 부재.
 *   - 자동 실행 없음.
 */

afterEach(() => cleanup());

const REPO = "robin/lab";
const PR_NUMBER = 42;

function makeMockFetch(
  planResponse: (body: any) => any,
  executeResponse?: (body: any) => any,
) {
  const calls: Array<{ url: string; body: any }> = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ url, body });
    if (url.endsWith("/integrations/github/write/pr/labels/plan")) {
      return new Response(JSON.stringify(planResponse(body)), { status: 200 });
    }
    if (url.endsWith("/integrations/github/write/pr/labels/execute")) {
      return new Response(
        JSON.stringify(executeResponse ? executeResponse(body) : { outcome: "failed", message: "no executeResponse" }),
        { status: 200 },
      );
    }
    return new Response(JSON.stringify({ outcome: "github_error", message: `unhandled: ${url}` }), { status: 500 });
  });
  return { fetchImpl, calls };
}

const PLAN_OK_FACTORY = (): any => ({
  outcome: "planned",
  plan: {
    id: "pr-labels-test-1",
    repoFullName: REPO,
    pullNumber: PR_NUMBER,
    currentLabels: ["bug", "needs-review"],
    currentLabelsHash: "current-labels-hash",
    finalLabels: ["bug", "enhancement"],
    changeSummary: {
      actuallyAdded: ["enhancement"],
      actuallyRemoved: ["needs-review"],
      noopAdd: [],
      noopRemove: [],
    },
    status: "approval_required",
    truthStatus: "planned",
    createdAt: "2026-06-14T12:00:00.000Z",
    expiresAt: "2026-06-14T12:10:00.000Z",
  },
});

describe("PullRequestLabelsUpdateCard — W5d Phase 1", () => {
  it("(#1) add + remove 입력 → Plan → 응답 plan summary + diff preview 표시", async () => {
    const { fetchImpl, calls } = makeMockFetch(PLAN_OK_FACTORY);
    render(
      <PullRequestLabelsUpdateCard
        defaultRepoFullName={REPO}
        defaultPullNumber={PR_NUMBER}
        serverBaseUrl="http://127.0.0.1:4317"
        fetchImpl={fetchImpl as unknown as typeof fetch}
      />,
    );
    fireEvent.change(screen.getByLabelText("pr-labels add"), { target: { value: "enhancement, bug" } });
    fireEvent.change(screen.getByLabelText("pr-labels remove"), { target: { value: "needs-review" } });
    fireEvent.click(screen.getByTestId("publish-pr-labels-plan"));
    await waitFor(() => {
      expect(calls.filter((c) => c.url.endsWith("/pr/labels/plan")).length).toBe(1);
    });
    const planCall = calls.find((c) => c.url.endsWith("/pr/labels/plan"))!;
    expect(planCall.body.repoFullName).toBe(REPO);
    expect(planCall.body.pullNumber).toBe(PR_NUMBER);
    expect(planCall.body.addLabels).toEqual(["enhancement", "bug"]);
    expect(planCall.body.removeLabels).toEqual(["needs-review"]);
    await waitFor(() => {
      expect(screen.getByTestId("publish-pr-labels-plan-summary").textContent).toMatch(/\+1 -1/);
      const diff = screen.getByTestId("publish-pr-labels-diff");
      expect(diff.textContent).toContain("bug, enhancement"); // finalLabels
      expect(diff.textContent).toContain("enhancement"); // actually added
    });
  });

  it("(#2) Plan + approval + Execute → /pr/labels/execute 호출 + observed UI(appliedLabels)", async () => {
    const { fetchImpl, calls } = makeMockFetch(
      PLAN_OK_FACTORY,
      () => ({
        outcome: "observed",
        planId: "pr-labels-test-1",
        pullNumber: PR_NUMBER,
        htmlUrl: "https://github.com/robin/lab/pull/42",
        appliedLabels: ["bug", "enhancement"],
        observedAt: "2026-06-14T13:00:00.000Z",
        truthStatus: "observed",
      }),
    );
    const onContextEvent = vi.fn();
    render(
      <PullRequestLabelsUpdateCard
        defaultRepoFullName={REPO}
        defaultPullNumber={PR_NUMBER}
        serverBaseUrl="http://127.0.0.1:4317"
        fetchImpl={fetchImpl as unknown as typeof fetch}
        onContextEvent={onContextEvent}
      />,
    );
    fireEvent.change(screen.getByLabelText("pr-labels add"), { target: { value: "enhancement" } });
    fireEvent.change(screen.getByLabelText("pr-labels remove"), { target: { value: "needs-review" } });
    fireEvent.click(screen.getByTestId("publish-pr-labels-plan"));
    await waitFor(() => screen.getByTestId("publish-pr-labels-plan-summary"));
    fireEvent.change(screen.getByLabelText("pr-labels approval ID"), { target: { value: "appr-z" } });
    fireEvent.click(screen.getByTestId("publish-pr-labels-execute"));
    await waitFor(() => {
      const exec = calls.find((c) => c.url.endsWith("/pr/labels/execute"));
      expect(exec).toBeTruthy();
      expect(exec!.body.planId).toBe("pr-labels-test-1");
      expect(exec!.body.expectedCurrentLabelsHash).toBe("current-labels-hash");
      expect(exec!.body.approvalId).toBe("appr-z");
    });
    await waitFor(() => {
      const observed = screen.getByTestId("publish-pr-labels-observed");
      expect(observed.textContent).toContain("PR #42");
      expect(observed.textContent).toContain("bug, enhancement");
      const link = screen.getByTestId("publish-pr-labels-link") as HTMLAnchorElement;
      expect(link.href).toBe("https://github.com/robin/lab/pull/42");
    });
    // trace forwarded; appliedCount, not raw label list, in payload
    const observedFwd = onContextEvent.mock.calls.find(
      (c) => c[0] === "github.publish.pr.labels.observed",
    );
    expect(observedFwd).toBeTruthy();
    expect((observedFwd?.[1] as any).appliedCount).toBe(2);
  });

  it("(#3) no_op 응답 → 안내 + execute 부재", async () => {
    const { fetchImpl } = makeMockFetch(
      () => ({ outcome: "no_op", message: "이미 원하는 상태입니다 — 변경 없음." }),
    );
    render(
      <PullRequestLabelsUpdateCard
        defaultRepoFullName={REPO}
        defaultPullNumber={PR_NUMBER}
        serverBaseUrl="http://127.0.0.1:4317"
        fetchImpl={fetchImpl as unknown as typeof fetch}
      />,
    );
    fireEvent.change(screen.getByLabelText("pr-labels add"), { target: { value: "bug" } });
    fireEvent.click(screen.getByTestId("publish-pr-labels-plan"));
    await waitFor(() => {
      expect(screen.getByTestId("publish-pr-labels-plan-message").textContent).toContain("변경 없음");
    });
    expect(screen.queryByTestId("publish-pr-labels-execute")).toBeNull();
  });

  it("(#4 회귀) 위험 UI 부재 — assignees / milestone / draft / close / merge / review / branch delete", () => {
    render(
      <PullRequestLabelsUpdateCard
        defaultRepoFullName={REPO}
        defaultPullNumber={PR_NUMBER}
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
      /^add milestone/i,
      /^assign/i,
      /^delete branch/i,
      /^change base/i,
    ]) {
      expect(screen.queryByRole("button", { name: danger })).toBeNull();
    }
    expect(screen.queryByLabelText(/assignee/i)).toBeNull();
    expect(screen.queryByLabelText(/milestone/i)).toBeNull();
    expect(screen.queryByLabelText(/draft/i)).toBeNull();
    expect(screen.queryByLabelText(/^state/i)).toBeNull();
    expect(screen.queryByLabelText(/reviewer/i)).toBeNull();
    expect(screen.queryByLabelText(/base/i)).toBeNull();
  });
});
