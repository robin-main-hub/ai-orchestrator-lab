// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { MissionBoardItem } from "../lib/missionBoardModel";
import type { MissionScaffoldLatestResponse } from "@ai-orchestrator/protocol";
import type { MissionPublishEnvironment } from "./MissionBoardPanel";

/**
 * App Build → GitHub PR complete flow (한 화면 11단계 smoke).
 *
 * 사용자 contract:
 *   1) AppBuild scaffold가 있는 미션을 펼치면 Container가 GET /missions/:id/scaffold/latest를
 *      lazy fetch하고, Mission Workspace에 PublishFlowSummary 섹션이 노출된다.
 *   2) history 없음 → "다음: 브랜치 준비"(start_step branch) CTA가 보인다.
 *   3) CTA 클릭 → publish panel 열림 + 해당 step section으로 scrollIntoView.
 *   4) Branch plan → planned trace → CTA "브랜치 실행 준비됨"(continue_step branch)
 *   5) Branch execute → observed → CTA "다음: 파일 변경 준비"(start_step file)
 *   6) File plan → planned (scaffold 자동 채움 → src/util.ts 그대로)
 *   7) File execute → observed → CTA "다음: PR 준비"
 *   8) PR plan → planned
 *   9) PR execute → observed (PR URL 표시)
 *   10) 최종 CTA → kind=done, "GitHub PR 완주됨"
 *   11) 가드: GitHub write route 정확히 6회(plan×3 + execute×3), trace에 missionId 첨부,
 *       merge/review/label/assignee/delete branch UI 부재.
 */

/* eslint-disable react-hooks/rules-of-hooks */
const mocks = vi.hoisted(() => ({
  fetchDgxMissions: vi.fn(),
  fetchMissionScaffoldLatest: vi.fn(),
  createDgxMission: vi.fn(),
  mergeDgxMission: vi.fn(),
  verifyDgxMission: vi.fn(),
  appendDgxMissionEvent: vi.fn(),
}));
/* eslint-enable react-hooks/rules-of-hooks */

vi.mock("../runtime/stage47MissionServer", () => ({
  fetchDgxMissions: mocks.fetchDgxMissions,
  fetchMissionScaffoldLatest: mocks.fetchMissionScaffoldLatest,
  createDgxMission: mocks.createDgxMission,
  mergeDgxMission: mocks.mergeDgxMission,
  verifyDgxMission: mocks.verifyDgxMission,
  appendDgxMissionEvent: mocks.appendDgxMissionEvent,
}));

import { MissionBoardContainer } from "./MissionBoardContainer";

const MISSION_ID = "mission_complete_flow_1";

function localMissionItem(): MissionBoardItem {
  return {
    missionId: MISSION_ID,
    title: "App Builder result — todo app",
    goal: "한 흐름으로 GitHub PR 완주",
    status: "ready_to_merge",
    truthStatus: "observed",
    source: "server_observed",
    workers: [],
    artifactCount: 0,
    verificationCount: 1,
    mergeQueueCount: 0,
    workspaceCount: 1,
    workspace: {
      id: "ws_complete_flow",
      name: "robin/lab",
      appType: "web",
      previewStatus: "running",
      previewUrl: "http://localhost:5173",
      previewTruth: "observed",
    },
    designIssues: [],
    errorCards: [],
    selfCorrections: [],
    updatedAt: "2026-06-14T12:00:00.000Z",
  } as MissionBoardItem;
}

function scaffoldResponse(): MissionScaffoldLatestResponse {
  return {
    missionId: MISSION_ID,
    status: "found",
    truthStatus: "planned",
    planId: "plan_complete_1",
    files: [
      {
        path: "src/util.ts",
        content: "export const v = 2;\n",
        source: "scaffold_plan",
        createdAt: "2026-06-14T12:00:00.000Z",
      },
    ],
    skipped: [],
  };
}

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
          id: "gbcp_complete_1",
          repoFullName: "robin/lab",
          sourceRef: "main",
          sourceSha: "SRC_SHA",
          newBranchName: "agent/from-mission",
          newRef: "refs/heads/agent/from-mission",
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
        planId: "gbcp_complete_1",
        ref: "refs/heads/agent/from-mission",
        sha: "NEW_BRANCH_SHA",
        htmlUrl: "https://github.com/robin/lab/tree/agent/from-mission",
        observedAt: "2026-06-14T12:00:01.000Z",
        truthStatus: "observed",
      }), { status: 200 });
    }
    if (url.endsWith("/integrations/github/write/file/plan")) {
      const newContentSha = await sha256Hex(body.newContent ?? "");
      return new Response(JSON.stringify({
        outcome: "planned",
        plan: {
          id: "gfcp_complete_1",
          repoFullName: "robin/lab",
          branchName: "agent/from-mission",
          branchRef: "refs/heads/agent/from-mission",
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
        planId: "gfcp_complete_1",
        commitSha: "FILE_COMMIT_SHA",
        blobSha: "FILE_BLOB_SHA",
        htmlUrl: "https://github.com/robin/lab/blob/agent/from-mission/src/util.ts",
        observedAt: "2026-06-14T12:00:03.000Z",
        truthStatus: "observed",
      }), { status: 200 });
    }
    if (url.endsWith("/integrations/github/write/pr/plan")) {
      return new Response(JSON.stringify({
        outcome: "planned",
        plan: {
          id: "gprp_complete_1",
          repoFullName: "robin/lab",
          baseBranch: "main",
          headBranch: "agent/from-mission",
          baseSha: "BASE_SHA",
          headSha: "HEAD_SHA",
          title: "App Builder result — todo app",
          bodyPreview: "draft",
          titleSha256: "title_sha",
          bodySha256: "body_sha",
          bodyLength: 5,
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
        planId: "gprp_complete_1",
        pullNumber: 7777,
        htmlUrl: "https://github.com/robin/lab/pull/7777",
        headSha: "HEAD_SHA",
        observedAt: "2026-06-14T12:00:05.000Z",
        truthStatus: "observed",
      }), { status: 200 });
    }
    return new Response(JSON.stringify({ outcome: "github_error", message: `unhandled: ${url}` }), { status: 500 });
  });
  return { fetchImpl, calls };
}

const statusOf = (section: HTMLElement) =>
  within(section).getByTestId("publish-step-status").getAttribute("data-status");

/** 전 흐름에서 Mission 서버 mutation(create/verify/merge/append) 0회 보장 — 회귀 가드. */
function assertNoMissionMutations() {
  expect(mocks.createDgxMission).not.toHaveBeenCalled();
  expect(mocks.verifyDgxMission).not.toHaveBeenCalled();
  expect(mocks.mergeDgxMission).not.toHaveBeenCalled();
  expect(mocks.appendDgxMissionEvent).not.toHaveBeenCalled();
}

beforeEach(() => {
  mocks.fetchDgxMissions.mockReset();
  mocks.fetchMissionScaffoldLatest.mockReset();
  mocks.fetchDgxMissions.mockResolvedValue({ missions: [] });
  // jsdom은 scrollIntoView를 구현하지 않음 — no-op 모킹(테스트가 에러 나지 않게).
  if (!(Element.prototype as any).scrollIntoView) {
    (Element.prototype as any).scrollIntoView = vi.fn();
  } else {
    vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => {});
  }
});

afterEach(() => {
  cleanup();
});

describe("MissionBoardContainer — App Build → GitHub PR complete flow", () => {
  it("11단계 완주: scaffold prefill → branch → file → PR → done(완주 표식)", async () => {
    mocks.fetchMissionScaffoldLatest.mockResolvedValue(scaffoldResponse());
    const { fetchImpl, calls } = makeMockFetch();
    const onContextEvent = vi.fn();
    const publishEnvironment: MissionPublishEnvironment = {
      serverBaseUrl: "http://127.0.0.1:4317",
      defaultRepoFullName: "robin/lab",
      onContextEvent,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    };

    render(
      <MissionBoardContainer
        serverBaseUrl="http://127.0.0.1:4317"
        localItems={[localMissionItem()]}
        publishEnvironment={publishEnvironment}
      />,
    );

    // 1) Workspace 상세 토글 → expandedMissionId set → scaffold lazy fetch
    fireEvent.click(await screen.findByRole("button", { name: /Workspace 상세/ }));
    await waitFor(() => expect(mocks.fetchMissionScaffoldLatest).toHaveBeenCalledTimes(1));

    // 2) PublishFlowSummary가 노출되고 첫 CTA는 "다음: 브랜치 준비"(start_step branch)
    const summary = await screen.findByTestId("mission-workspace-publish-summary");
    const cta1 = within(summary).getByTestId("mission-workspace-publish-next");
    expect(cta1.getAttribute("data-kind")).toBe("start_step");
    expect(cta1.getAttribute("data-step")).toBe("branch");
    expect(cta1.textContent).toContain("브랜치 준비");

    // 3) CTA 클릭 → publish panel 마운트 + targetStep=branch로 scrollIntoView 호출
    fireEvent.click(cta1);
    const panel = await screen.findByTestId("github-publish-panel");

    // 4) Branch plan
    const branchSection = within(panel).getByTestId("publish-step-branch");
    fireEvent.change(within(branchSection).getByLabelText("new branch name"), {
      target: { value: "agent/from-mission" },
    });
    fireEvent.click(within(branchSection).getByRole("button", { name: /Plan/ }));
    await waitFor(() => expect(statusOf(branchSection)).toBe("planned"));

    // CTA가 "브랜치 실행 준비됨"(continue_step branch)으로 갱신
    await waitFor(() => {
      const cta = within(screen.getByTestId("mission-workspace-publish-summary"))
        .getByTestId("mission-workspace-publish-next");
      expect(cta.getAttribute("data-kind")).toBe("continue_step");
      expect(cta.getAttribute("data-step")).toBe("branch");
    });

    // 5) Branch execute → observed
    fireEvent.change(within(branchSection).getByLabelText("branch approval ID"), {
      target: { value: "appr_branch" },
    });
    fireEvent.click(within(branchSection).getByRole("button", { name: /Execute/ }));
    await waitFor(() => expect(statusOf(branchSection)).toBe("observed"));

    // CTA가 "다음: 파일 변경 준비"로 갱신 + summary에 branch row가 observed
    await waitFor(() => {
      const cta = within(screen.getByTestId("mission-workspace-publish-summary"))
        .getByTestId("mission-workspace-publish-next");
      expect(cta.getAttribute("data-kind")).toBe("start_step");
      expect(cta.getAttribute("data-step")).toBe("file");
    });
    const branchRow = within(screen.getByTestId("mission-workspace-publish-summary"))
      .getByTestId("mission-publish-row-branch");
    expect(branchRow.getAttribute("data-status")).toBe("observed");

    // 6) File plan — scaffold prefill로 path/content가 이미 채워져 있음
    const fileSection = within(panel).getByTestId("publish-step-file");
    expect((within(fileSection).getByLabelText("file path") as HTMLInputElement).value).toBe("src/util.ts");
    expect((within(fileSection).getByLabelText("file new content") as HTMLTextAreaElement).value).toBe(
      "export const v = 2;\n",
    );
    fireEvent.click(within(fileSection).getByRole("button", { name: /Plan/ }));
    await waitFor(() => expect(statusOf(fileSection)).toBe("planned"));

    // 7) File execute → observed
    fireEvent.change(within(fileSection).getByLabelText("file approval ID"), {
      target: { value: "appr_file" },
    });
    fireEvent.click(within(fileSection).getByRole("button", { name: /Execute/ }));
    await waitFor(() => expect(statusOf(fileSection)).toBe("observed"));

    // CTA가 "다음: PR 준비"로 갱신
    await waitFor(() => {
      const cta = within(screen.getByTestId("mission-workspace-publish-summary"))
        .getByTestId("mission-workspace-publish-next");
      expect(cta.getAttribute("data-kind")).toBe("start_step");
      expect(cta.getAttribute("data-step")).toBe("pr");
    });

    // 8) PR plan
    const prSection = within(panel).getByTestId("publish-step-pr");
    fireEvent.click(within(prSection).getByRole("button", { name: /Plan/ }));
    await waitFor(() => expect(statusOf(prSection)).toBe("planned"));

    // 9) PR execute → observed (PR URL/번호 표시)
    fireEvent.change(within(prSection).getByLabelText("pr approval ID"), {
      target: { value: "appr_pr" },
    });
    fireEvent.click(within(prSection).getByRole("button", { name: /Create PR/ }));
    await waitFor(() => expect(statusOf(prSection)).toBe("observed"));
    expect(prSection.textContent).toContain("PR #7777");

    // 10) 최종 CTA = done, "GitHub PR 완주됨"
    await waitFor(() => {
      const cta = within(screen.getByTestId("mission-workspace-publish-summary"))
        .getByTestId("mission-workspace-publish-next");
      expect(cta.getAttribute("data-kind")).toBe("done");
      expect(cta.textContent).toContain("GitHub PR 완주됨");
    });

    // 11a) GitHub write 호출 정확히 6회(plan×3 + execute×3), 순서 보존
    expect(calls.filter((c) => c.url.endsWith("/branch/plan")).length).toBe(1);
    expect(calls.filter((c) => c.url.endsWith("/branch/execute")).length).toBe(1);
    expect(calls.filter((c) => c.url.endsWith("/file/plan")).length).toBe(1);
    expect(calls.filter((c) => c.url.endsWith("/file/execute")).length).toBe(1);
    expect(calls.filter((c) => c.url.endsWith("/pr/plan")).length).toBe(1);
    expect(calls.filter((c) => c.url.endsWith("/pr/execute")).length).toBe(1);

    // 11b) trace 이벤트가 미션 컨텍스트(missionId)와 함께 전달됨
    const eventTypes = onContextEvent.mock.calls.map((c) => c[0] as string);
    expect(eventTypes).toContain("github.publish.branch.planned");
    expect(eventTypes).toContain("github.publish.branch.observed");
    expect(eventTypes).toContain("github.publish.file.planned");
    expect(eventTypes).toContain("github.publish.file.observed");
    expect(eventTypes).toContain("github.publish.pr.planned");
    expect(eventTypes).toContain("github.publish.pr.observed");
    const branchPlanned = onContextEvent.mock.calls.find((c) => c[0] === "github.publish.branch.planned");
    expect((branchPlanned![1] as Record<string, unknown>).missionId).toBe(MISSION_ID);

    // 11c) merge/review/label/assignee/delete branch UI 부재(회귀 가드)
    for (const danger of [/^merge$/i, /^review$/i, /^submit review$/i, /^label/i, /^assign/i, /^delete branch/i]) {
      expect(screen.queryByRole("button", { name: danger })).toBeNull();
      expect(screen.queryByRole("link", { name: danger })).toBeNull();
    }

    // 11d) Mission 서버 mutation 0회 — complete flow는 GitHub write 호출만 하고
    //      mission state는 trace로만 흐른다(append-event 0회는 publish가 별도 영속화하지 않음을 보장).
    assertNoMissionMutations();
  }, 30_000);

  it("Blocked 단계 처리: branch execute가 blocked로 응답 시 CTA는 'retry_step' + reason 표시", async () => {
    mocks.fetchMissionScaffoldLatest.mockResolvedValue(scaffoldResponse());
    const blockedFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const body = init?.body ? JSON.parse(init.body as string) : undefined;
      if (url.endsWith("/integrations/github/write/branch/plan")) {
        return new Response(JSON.stringify({
          outcome: "planned",
          plan: {
            id: "gbcp_b1",
            repoFullName: "robin/lab",
            sourceRef: "main",
            sourceSha: "S",
            newBranchName: "agent/x",
            newRef: "refs/heads/agent/x",
            status: "approval_required",
            truthStatus: "planned",
            createdAt: "t",
            expiresAt: "t",
          },
        }), { status: 200 });
      }
      if (url.endsWith("/integrations/github/write/branch/execute")) {
        return new Response(JSON.stringify({
          outcome: "blocked",
          planId: "gbcp_b1",
          message: "rate limited by GitHub",
          truthStatus: "planned",
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ outcome: "github_error", message: `unhandled: ${url}` }), { status: 500 });
    });
    const publishEnvironment: MissionPublishEnvironment = {
      serverBaseUrl: "http://127.0.0.1:4317",
      defaultRepoFullName: "robin/lab",
      onContextEvent: vi.fn(),
      fetchImpl: blockedFetch as unknown as typeof fetch,
    };

    render(
      <MissionBoardContainer
        serverBaseUrl="http://127.0.0.1:4317"
        localItems={[localMissionItem()]}
        publishEnvironment={publishEnvironment}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: /Workspace 상세/ }));
    await waitFor(() => expect(mocks.fetchMissionScaffoldLatest).toHaveBeenCalled());

    // CTA 클릭 → panel 열림 → branch plan/execute 진행
    fireEvent.click(within(await screen.findByTestId("mission-workspace-publish-summary"))
      .getByTestId("mission-workspace-publish-next"));
    const panel = await screen.findByTestId("github-publish-panel");
    const branchSection = within(panel).getByTestId("publish-step-branch");
    fireEvent.change(within(branchSection).getByLabelText("new branch name"), { target: { value: "agent/x" } });
    fireEvent.click(within(branchSection).getByRole("button", { name: /Plan/ }));
    await waitFor(() => expect(statusOf(branchSection)).toBe("planned"));
    fireEvent.change(within(branchSection).getByLabelText("branch approval ID"), { target: { value: "appr_b" } });
    fireEvent.click(within(branchSection).getByRole("button", { name: /Execute/ }));
    await waitFor(() => expect(statusOf(branchSection)).toBe("blocked"));

    // CTA가 'retry_step' 유형으로 바뀌고 reason은 trace summary가 아닌(아직 branch.blocked로 trace됐다면)
    // computeNextPublishStep이 history.branch의 summary를 reason으로 보여준다.
    await waitFor(() => {
      const cta = within(screen.getByTestId("mission-workspace-publish-summary"))
        .getByTestId("mission-workspace-publish-next");
      expect(cta.getAttribute("data-kind")).toBe("retry_step");
      expect(cta.getAttribute("data-step")).toBe("branch");
      expect(cta.textContent).toContain("브랜치 재시도");
    });
    // blocked 케이스에서도 Mission mutation 0회.
    assertNoMissionMutations();
  }, 20_000);
});
