// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { MissionBoardItem, MissionBoardSnapshot } from "../lib/missionBoardModel";
import type { PublishHistoryByStep } from "../lib/missionPublishPrefill";
import { MissionBoardPanel, type MissionPublishEnvironment } from "./MissionBoardPanel";

/**
 * Publish Flow 상태 요약 섹션(PublishFlowSummary) — Mission Workspace 상세에서
 *   "GitHub로 어디까지 나갔는지"를 정직하게 보여주는 표면.
 *
 * 사용자 contract:
 *   - getPublishHistory가 undefined이거나 빈 객체면 섹션 자체가 그려지지 않는다(빈 공간 방지).
 *   - branch/file/pr 중 하나라도 entry가 있으면 섹션이 그려지고, 모든 step 3행 표시.
 *   - entry가 없는 step은 "아직 진행 없음" muted 배지 — 거짓말 금지.
 *   - status별로 적절한 StatusBadge variant: observed/already_exists=success, planned/approval_required=primary, blocked/failed=danger.
 *   - summary 텍스트는 GithubPublishPanel.emit이 만든 그대로 보여준다(추측 0).
 *   - 새 GitHub write 표면(merge/review/label/assignee/branch delete) UI 없음 — 회귀 가드.
 */

afterEach(() => cleanup());

function itemWithWorkspace(missionId = "mission_summary_1"): MissionBoardItem {
  return {
    missionId,
    title: "App Builder result",
    goal: "publish to GitHub",
    status: "ready_to_merge",
    truthStatus: "observed",
    source: "server_observed",
    workers: [],
    artifactCount: 1,
    verificationCount: 1,
    mergeQueueCount: 0,
    workspaceCount: 1,
    workspace: {
      id: "ws_1",
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

function snapshotOf(items: MissionBoardItem[]): MissionBoardSnapshot {
  return { items, serverReachable: true };
}

function envWithHistory(history?: PublishHistoryByStep): MissionPublishEnvironment {
  return {
    serverBaseUrl: "http://127.0.0.1:4317",
    defaultRepoFullName: "robin/lab",
    onContextEvent: vi.fn(),
    fetchImpl: vi.fn() as unknown as typeof fetch,
    getPublishHistory: history ? () => history : undefined,
  };
}

describe("MissionBoardPanel — PublishFlowSummary", () => {
  it("(#1) publishEnvironment 자체가 미배선 → 요약 섹션 미노출", () => {
    render(
      <MissionBoardPanel
        snapshot={snapshotOf([itemWithWorkspace()])}
        onRefresh={() => {}}
        expandedMissionId="mission_summary_1"
        onToggleDetail={() => {}}
        publishEnvironment={undefined}
      />,
    );
    expect(screen.queryByTestId("mission-workspace-publish-summary")).toBeNull();
  });

  it("(#2) publishEnvironment는 있지만 history 없음 → 단계 행은 미노출, 'start_step branch' CTA만 노출", () => {
    render(
      <MissionBoardPanel
        snapshot={snapshotOf([itemWithWorkspace()])}
        onRefresh={() => {}}
        expandedMissionId="mission_summary_1"
        onToggleDetail={() => {}}
        publishEnvironment={envWithHistory({})}
      />,
    );
    // 섹션 자체는 노출(다음 할 일 CTA 때문)
    const section = screen.getByTestId("mission-workspace-publish-summary");
    // 단계 행은 그리지 않음(빈 공간 방지)
    expect(within(section).queryByTestId("mission-publish-row-branch")).toBeNull();
    // CTA는 첫 단계(branch start)를 가리킨다
    const cta = within(section).getByTestId("mission-workspace-publish-next");
    expect(cta.getAttribute("data-kind")).toBe("start_step");
    expect(cta.getAttribute("data-step")).toBe("branch");
    expect(cta.textContent).toContain("브랜치 준비");
  });

  it("(#3) branch만 있는 history → 섹션 노출, branch 행에 planned, file/pr은 '아직 진행 없음'", () => {
    const history: PublishHistoryByStep = {
      branch: { step: "branch", status: "planned", summary: "agent/feature-x ← main@abc1234", ts: "2026-06-14T12:00:00.000Z" },
    };
    render(
      <MissionBoardPanel
        snapshot={snapshotOf([itemWithWorkspace()])}
        onRefresh={() => {}}
        expandedMissionId="mission_summary_1"
        onToggleDetail={() => {}}
        publishEnvironment={envWithHistory(history)}
      />,
    );
    const section = screen.getByTestId("mission-workspace-publish-summary");
    const branchRow = within(section).getByTestId("mission-publish-row-branch");
    expect(branchRow.getAttribute("data-status")).toBe("planned");
    expect(branchRow.textContent).toContain("계획됨");
    expect(branchRow.textContent).toContain("agent/feature-x");

    const fileRow = within(section).getByTestId("mission-publish-row-file");
    expect(fileRow.getAttribute("data-status")).toBe("not_started");
    expect(fileRow.textContent).toContain("아직 진행 없음");

    const prRow = within(section).getByTestId("mission-publish-row-pr");
    expect(prRow.getAttribute("data-status")).toBe("not_started");
  });

  it("(#4) 3단계 모두 진행 — branch observed / file blocked / pr planned", () => {
    const history: PublishHistoryByStep = {
      branch: { step: "branch", status: "observed", summary: "agent/x@abc1234", ts: "2026-06-14T12:01:00.000Z" },
      file: { step: "file", status: "blocked", summary: "needs approval", ts: "2026-06-14T12:02:00.000Z" },
      pr: { step: "pr", status: "planned", summary: "#1234 draft", ts: "2026-06-14T12:03:00.000Z" },
    };
    render(
      <MissionBoardPanel
        snapshot={snapshotOf([itemWithWorkspace()])}
        onRefresh={() => {}}
        expandedMissionId="mission_summary_1"
        onToggleDetail={() => {}}
        publishEnvironment={envWithHistory(history)}
      />,
    );
    const section = screen.getByTestId("mission-workspace-publish-summary");
    expect(within(section).getByTestId("mission-publish-row-branch").getAttribute("data-status")).toBe("observed");
    expect(within(section).getByTestId("mission-publish-row-file").getAttribute("data-status")).toBe("blocked");
    expect(within(section).getByTestId("mission-publish-row-pr").getAttribute("data-status")).toBe("planned");
    expect(section.textContent).toContain("agent/x@abc1234");
    expect(section.textContent).toContain("needs approval");
    expect(section.textContent).toContain("#1234 draft");
  });

  it("(#5) status별 한국어 라벨 매핑 — observed→관측 완료, blocked→차단됨, failed→실패, already_exists→이미 존재, approval_required→승인 필요", () => {
    const history: PublishHistoryByStep = {
      branch: { step: "branch", status: "already_exists", summary: "이미 있음", ts: "t" },
      file: { step: "file", status: "failed", summary: "오류", ts: "t" },
      pr: { step: "pr", status: "approval_required", summary: "승인 대기", ts: "t" },
    };
    render(
      <MissionBoardPanel
        snapshot={snapshotOf([itemWithWorkspace()])}
        onRefresh={() => {}}
        expandedMissionId="mission_summary_1"
        onToggleDetail={() => {}}
        publishEnvironment={envWithHistory(history)}
      />,
    );
    const section = screen.getByTestId("mission-workspace-publish-summary");
    expect(section.textContent).toContain("이미 존재");
    expect(section.textContent).toContain("실패");
    expect(section.textContent).toContain("승인 필요");
  });

  it("(#7 polish observed link) observed entry에 htmlUrl이 있으면 행이 GitHub 링크로 렌더된다", () => {
    const history: PublishHistoryByStep = {
      branch: {
        step: "branch",
        status: "observed",
        summary: "refs/heads/agent/x@abc1234",
        ts: "t",
        htmlUrl: "https://github.com/robin/lab/tree/agent/x",
      },
    };
    render(
      <MissionBoardPanel
        snapshot={snapshotOf([itemWithWorkspace()])}
        onRefresh={() => {}}
        expandedMissionId="mission_summary_1"
        onToggleDetail={() => {}}
        publishEnvironment={envWithHistory(history)}
      />,
    );
    const link = screen.getByTestId("mission-publish-link-branch") as HTMLAnchorElement;
    expect(link.href).toBe("https://github.com/robin/lab/tree/agent/x");
    expect(link.target).toBe("_blank");
    expect(link.rel).toContain("noopener");
  });

  it("(#8 polish done link) 모든 단계 observed + pr.htmlUrl이면 done CTA가 PR로 가는 anchor", () => {
    const history: PublishHistoryByStep = {
      branch: { step: "branch", status: "observed", summary: "", ts: "t" },
      file: { step: "file", status: "observed", summary: "", ts: "t" },
      pr: {
        step: "pr",
        status: "observed",
        summary: "PR #7",
        ts: "t",
        htmlUrl: "https://github.com/robin/lab/pull/7",
      },
    };
    render(
      <MissionBoardPanel
        snapshot={snapshotOf([itemWithWorkspace()])}
        onRefresh={() => {}}
        expandedMissionId="mission_summary_1"
        onToggleDetail={() => {}}
        publishEnvironment={envWithHistory(history)}
      />,
    );
    const cta = screen.getByTestId("mission-workspace-publish-next") as HTMLAnchorElement;
    expect(cta.getAttribute("data-kind")).toBe("done");
    // done은 button이 아닌 a 태그
    expect(cta.tagName.toLowerCase()).toBe("a");
    expect(cta.href).toBe("https://github.com/robin/lab/pull/7");
    expect(cta.textContent).toContain("PR 열기");
  });

  it("(#6 회귀) 요약 섹션이 있어도 merge/review/label/assignee/delete branch 행은 절대 없음", () => {
    const history: PublishHistoryByStep = {
      branch: { step: "branch", status: "observed", summary: "ok", ts: "t" },
    };
    render(
      <MissionBoardPanel
        snapshot={snapshotOf([itemWithWorkspace()])}
        onRefresh={() => {}}
        expandedMissionId="mission_summary_1"
        onToggleDetail={() => {}}
        publishEnvironment={envWithHistory(history)}
      />,
    );
    const section = screen.getByTestId("mission-workspace-publish-summary");
    expect(within(section).queryByText(/^merge$/i)).toBeNull();
    expect(within(section).queryByText(/^review$/i)).toBeNull();
    expect(within(section).queryByText(/^label/i)).toBeNull();
    expect(within(section).queryByText(/^assign/i)).toBeNull();
    expect(within(section).queryByText(/delete branch/i)).toBeNull();
  });
});
