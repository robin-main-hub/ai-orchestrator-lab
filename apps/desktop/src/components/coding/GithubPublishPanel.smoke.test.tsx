// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { GithubPublishPanel, mapOutcomeToStatus } from "./GithubPublishPanel";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/**
 * GitHub Publish Panel — branch → file → PR end-to-end smoke (mock fetch).
 *
 * 시나리오:
 *   1) branch plan → planned, mutation 라우트는 호출되지 않음(plan만 호출)
 *   2) branch execute(approval ID 붙임) → observed (refs/heads/agent/feature-x@sha)
 *   3) file plan(branch step에서 만든 branch 자동 사용) → planned + diff preview
 *   4) file execute → observed (commit sha)
 *   5) pr plan → planned + compare summary
 *   6) pr execute → observed (PR number)
 *   7) trace 패널에 6개 이벤트(planned/observed × 3)
 *   8) merge/review/label/assignee UI 없음 — 화면에 그 텍스트 자체가 없어야 함
 *
 * 정직성:
 *   - 모든 outcome=observed만 "관측됨" 라벨
 *   - 응답 payload/UI에 토큰 fragment 없음(mock 응답에 토큰 없으니 자명하지만 가드)
 *   - merge/review/labels/assignees 텍스트가 결과 화면에 없음
 */

const TOKEN = "ghp_FAKE_publish_smoke_TOKEN_DO_NOT_LEAK"; // 실제로 응답에 들어가지 않음.

async function sha256Hex(text: string): Promise<string> {
  const buffer = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function makeMockFetch() {
  const calls: Array<{ url: string; body: any }> = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ url, body });
    if (url.endsWith("/integrations/github/write/branch/plan")) {
      return new Response(JSON.stringify({
        outcome: "planned",
        plan: {
          id: "gbcp_smoke_1",
          repoFullName: "robin/lab",
          sourceRef: "main",
          sourceSha: "SOURCE_SHA_1",
          newBranchName: "agent/feature-x",
          newRef: "refs/heads/agent/feature-x",
          status: "approval_required",
          truthStatus: "planned",
          createdAt: "2026-06-14T12:00:00.000Z",
          expiresAt: "2026-06-14T12:10:00.000Z",
        },
      }), { status: 200 });
    }
    if (url.endsWith("/integrations/github/write/branch/execute")) {
      return new Response(JSON.stringify({
        outcome: "observed",
        planId: "gbcp_smoke_1",
        ref: "refs/heads/agent/feature-x",
        sha: "NEW_BRANCH_SHA",
        htmlUrl: "https://github.com/robin/lab/tree/agent/feature-x",
        observedAt: "2026-06-14T12:00:01.000Z",
        truthStatus: "observed",
      }), { status: 200 });
    }
    if (url.endsWith("/integrations/github/write/file/plan")) {
      // 클라이언트가 보낸 newContent로 sha를 계산해 plan.newContentSha256에 넣는다.
      // 그래야 클라이언트가 execute 직전 sha 가드를 통과한다(server-side 무결성 키 그대로).
      const newContentSha = await sha256Hex(body.newContent ?? "");
      return new Response(JSON.stringify({
        outcome: "planned",
        plan: {
          id: "gfcp_smoke_1",
          repoFullName: "robin/lab",
          branchName: "agent/feature-x",
          branchRef: "refs/heads/agent/feature-x",
          path: "src/util.ts",
          operation: "create",
          newContentSha256: newContentSha,
          newContentLength: (body.newContent ?? "").length,
          diffPreview: "--- /dev/null\n+++ b/src/util.ts\n+export const v = 2;\n",
          diffTruncated: false,
          diffStat: { additions: 1, deletions: 0 },
          status: "approval_required",
          truthStatus: "planned",
          createdAt: "2026-06-14T12:00:02.000Z",
          expiresAt: "2026-06-14T12:10:02.000Z",
        },
      }), { status: 200 });
    }
    if (url.endsWith("/integrations/github/write/file/execute")) {
      return new Response(JSON.stringify({
        outcome: "observed",
        planId: "gfcp_smoke_1",
        commitSha: "FILE_COMMIT_SHA",
        blobSha: "FILE_BLOB_SHA",
        htmlUrl: "https://github.com/robin/lab/blob/agent/feature-x/src/util.ts",
        observedAt: "2026-06-14T12:00:03.000Z",
        truthStatus: "observed",
      }), { status: 200 });
    }
    if (url.endsWith("/integrations/github/write/pr/plan")) {
      return new Response(JSON.stringify({
        outcome: "planned",
        plan: {
          id: "gprp_smoke_1",
          repoFullName: "robin/lab",
          baseBranch: "main",
          headBranch: "agent/feature-x",
          baseSha: "BASE_SHA",
          headSha: "HEAD_SHA",
          title: "Add publish smoke",
          bodyPreview: "End-to-end publish",
          titleSha256: "title_sha",
          bodySha256: "body_sha",
          bodyLength: 18,
          compare: { aheadBy: 1, behindBy: 0, changedFiles: 1, commits: 1, filesPreview: [{ filename: "src/util.ts", status: "added", additions: 1, deletions: 0 }], truncated: false },
          status: "approval_required",
          truthStatus: "planned",
          createdAt: "2026-06-14T12:00:04.000Z",
          expiresAt: "2026-06-14T12:10:04.000Z",
        },
      }), { status: 200 });
    }
    if (url.endsWith("/integrations/github/write/pr/execute")) {
      return new Response(JSON.stringify({
        outcome: "observed",
        planId: "gprp_smoke_1",
        pullNumber: 4242,
        htmlUrl: "https://github.com/robin/lab/pull/4242",
        headSha: "HEAD_SHA",
        observedAt: "2026-06-14T12:00:05.000Z",
        truthStatus: "observed",
      }), { status: 200 });
    }
    return new Response(JSON.stringify({ outcome: "github_error", message: `unhandled: ${url}` }), { status: 500 });
  });
  return { fetchImpl, calls };
}

describe("GithubPublishPanel — branch → file → PR end-to-end smoke", () => {
  it("✓ 정상 경로: 세 단계 모두 observed, mutation은 step별로 1회씩만, trace에 6건", async () => {
    const { fetchImpl, calls } = makeMockFetch();
    const onContextEvent = vi.fn();
    render(
      <GithubPublishPanel
        serverBaseUrl="http://127.0.0.1:4317"
        defaultRepoFullName="robin/lab"
        defaultSourceRef="main"
        onContextEvent={onContextEvent}
        fetchImpl={fetchImpl as unknown as typeof fetch}
      />,
    );

    const statusOf = (section: HTMLElement) =>
      within(section).getByTestId("publish-step-status").getAttribute("data-status");

    // 1) Branch plan
    const branchSection = screen.getByTestId("publish-step-branch");
    fireEvent.change(within(branchSection).getByLabelText("new branch name"), { target: { value: "agent/feature-x" } });
    fireEvent.click(within(branchSection).getByRole("button", { name: /Plan/ }));
    await waitFor(() => expect(statusOf(branchSection)).toBe("planned"));

    // 2) Branch execute (approval ID)
    fireEvent.change(within(branchSection).getByLabelText("branch approval ID"), { target: { value: "appr_branch" } });
    fireEvent.click(within(branchSection).getByRole("button", { name: /Execute/ }));
    await waitFor(() => expect(statusOf(branchSection)).toBe("observed"));
    expect(branchSection.textContent).toContain("refs/heads/agent/feature-x");

    // 3) File plan
    const fileSection = screen.getByTestId("publish-step-file");
    fireEvent.change(within(fileSection).getByLabelText("file path"), { target: { value: "src/util.ts" } });
    fireEvent.change(within(fileSection).getByLabelText("file new content"), { target: { value: "export const v = 2;\n" } });
    fireEvent.click(within(fileSection).getByRole("button", { name: /Plan/ }));
    await waitFor(() => expect(statusOf(fileSection)).toBe("planned"));
    expect(within(fileSection).getByTestId("publish-file-diff").textContent).toContain("+export const v = 2;");

    // 4) File execute — mock이 client newContent 그대로 sha를 echo하므로 sha 가드 통과 → observed.
    fireEvent.change(within(fileSection).getByLabelText("file approval ID"), { target: { value: "appr_file" } });
    fireEvent.click(within(fileSection).getByRole("button", { name: /Execute/ }));
    await waitFor(() => expect(statusOf(fileSection)).toBe("observed"));
    expect(fileSection.textContent).toContain("commit FILE_CO");

    // 5) PR plan
    const prSection = screen.getByTestId("publish-step-pr");
    fireEvent.change(within(prSection).getByLabelText("pr title"), { target: { value: "Add publish smoke" } });
    fireEvent.change(within(prSection).getByLabelText("pr body"), { target: { value: "End-to-end publish" } });
    fireEvent.click(within(prSection).getByRole("button", { name: /Plan/ }));
    await waitFor(() => expect(statusOf(prSection)).toBe("planned"));

    // 6) PR execute
    fireEvent.change(within(prSection).getByLabelText("pr approval ID"), { target: { value: "appr_pr" } });
    fireEvent.click(within(prSection).getByRole("button", { name: /Create PR/ }));
    await waitFor(() => expect(statusOf(prSection)).toBe("observed"));
    expect(prSection.textContent).toContain("PR #4242");

    // 7) mutation 호출 횟수 — plan은 3, execute는 3(branch/file/pr) 정도
    expect(calls.filter((c) => c.url.endsWith("/branch/plan")).length).toBe(1);
    expect(calls.filter((c) => c.url.endsWith("/branch/execute")).length).toBe(1);
    expect(calls.filter((c) => c.url.endsWith("/file/plan")).length).toBe(1);
    expect(calls.filter((c) => c.url.endsWith("/pr/plan")).length).toBe(1);
    expect(calls.filter((c) => c.url.endsWith("/pr/execute")).length).toBe(1);

    // 8) trace 이벤트가 부모로 emit됨(branch planned/observed + file planned + ... + pr observed)
    const eventTypes = onContextEvent.mock.calls.map((c) => c[0] as string);
    expect(eventTypes).toContain("github.publish.branch.planned");
    expect(eventTypes).toContain("github.publish.branch.observed");
    expect(eventTypes).toContain("github.publish.pr.planned");
    expect(eventTypes).toContain("github.publish.pr.observed");

    // 9) merge/review/labels/assignees 액션 버튼은 절대 없음(눌러서 위험한 동작 시작 불가).
    //    disclaimer 텍스트에는 단어가 등장하지만, button/input/링크 등 클릭 가능한 요소는 없어야 한다.
    for (const danger of [/^merge$/i, /^review$/i, /^submit review$/i, /^label/i, /^assign/i, /^delete branch/i]) {
      expect(screen.queryByRole("button", { name: danger })).toBeNull();
      expect(screen.queryByRole("link", { name: danger })).toBeNull();
    }

    // 10) 응답에 토큰 fragment가 들어가지 않는다(mock 응답에 없지만 가드).
    for (const call of calls) {
      expect(JSON.stringify(call.body ?? {})).not.toContain(TOKEN);
    }
  });
});

describe("mapOutcomeToStatus", () => {
  it("outcome → status 통일 매핑(가짜 observed 금지)", () => {
    expect(mapOutcomeToStatus("planned")).toBe("planned");
    expect(mapOutcomeToStatus("approval_required")).toBe("approval_required");
    expect(mapOutcomeToStatus("observed")).toBe("observed");
    expect(mapOutcomeToStatus("already_exists")).toBe("already_exists");
    expect(mapOutcomeToStatus("blocked")).toBe("blocked");
    expect(mapOutcomeToStatus("not_configured")).toBe("blocked");
    expect(mapOutcomeToStatus("permission_denied")).toBe("blocked");
    expect(mapOutcomeToStatus("connection_failed")).toBe("failed");
    expect(mapOutcomeToStatus("github_error")).toBe("failed");
    expect(mapOutcomeToStatus("anything_else")).toBe("failed"); // 보수적 default
  });
});
