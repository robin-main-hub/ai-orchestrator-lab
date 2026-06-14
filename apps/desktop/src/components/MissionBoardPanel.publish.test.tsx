// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { MissionBoardItem, MissionBoardSnapshot } from "../lib/missionBoardModel";
import { MissionBoardPanel, type MissionPublishEnvironment } from "./MissionBoardPanel";

/**
 * Publish Panel mount smoke — Mission Workspace 상세에 GithubPublishPanel이 opt-in으로
 * 마운트되고, "GitHub로 내보내기" CTA로 펼쳐지고, trace 이벤트가 부모(Mission trace)에
 * provenance(missionId)와 함께 전달되는지.
 *
 * 사용자 contract:
 *   - publishEnvironment를 안 주면 CTA가 보이지 않는다(다른 미션 카드 동작 회귀 없음)
 *   - publishEnvironment를 주면 CTA가 보이고, 기본 접힘
 *   - CTA 클릭 → GithubPublishPanel 마운트 + mission.publish.opened trace emit
 *   - Branch plan 호출 후 trace에 github.publish.branch.planned(missionId 포함) 전달
 *   - GithubPublishPanel이 emit한 모든 trace에 missionId가 자동 첨부
 *   - 다시 CTA 클릭 → mission.publish.closed + panel 언마운트
 */

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function itemWithWorkspace(missionId = "mission_publish_1"): MissionBoardItem {
  return {
    missionId,
    title: "App Builder result",
    goal: "publish to GitHub",
    status: "ready_to_merge",
    truthStatus: "observed",
    source: "server_observed",
    workers: [
      {
        agentId: "agent_verifier",
        displayName: "Verifier",
        role: "verifier",
        capabilityMode: "sandbox_verify",
        canMutateFiles: false,
        hermesSlotId: "hermes-05",
      },
    ],
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

function makeMockFetch() {
  const calls: Array<{ url: string; body?: Record<string, unknown> }> = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ url, body });
    if (url.endsWith("/integrations/github/write/branch/plan")) {
      return new Response(JSON.stringify({
        outcome: "planned",
        plan: {
          id: "gbcp_mount_1",
          repoFullName: "robin/lab",
          sourceRef: "main",
          sourceSha: "SOURCE_SHA",
          newBranchName: "agent/from-mission",
          newRef: "refs/heads/agent/from-mission",
          status: "approval_required",
          truthStatus: "planned",
          createdAt: "2026-06-14T12:00:00.000Z",
          expiresAt: "2026-06-14T12:10:00.000Z",
        },
      }), { status: 200 });
    }
    return new Response(JSON.stringify({ outcome: "github_error", message: "unhandled" }), { status: 500 });
  });
  return { fetchImpl, calls };
}

describe("MissionBoardPanel — Publish Panel mount in Workspace detail", () => {
  it("publishEnvironment 없으면 CTA가 노출되지 않는다(기존 동작 회귀 방지)", () => {
    render(
      <MissionBoardPanel
        snapshot={snapshotOf([itemWithWorkspace()])}
        onRefresh={() => {}}
        expandedMissionId="mission_publish_1"
        onToggleDetail={() => {}}
      />,
    );
    expect(screen.queryByTestId("mission-workspace-publish-section")).toBeNull();
  });

  it("publishEnvironment 주면 CTA가 보이고, 클릭하면 GithubPublishPanel이 마운트된다", async () => {
    const { fetchImpl } = makeMockFetch();
    const onContextEvent = vi.fn();
    const env: MissionPublishEnvironment = {
      serverBaseUrl: "http://127.0.0.1:4317",
      defaultRepoFullName: "robin/lab",
      onContextEvent,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    };
    render(
      <MissionBoardPanel
        snapshot={snapshotOf([itemWithWorkspace()])}
        onRefresh={() => {}}
        expandedMissionId="mission_publish_1"
        onToggleDetail={() => {}}
        publishEnvironment={env}
      />,
    );

    const publishSection = screen.getByTestId("mission-workspace-publish-section");
    // 기본 접힘 — panel 자체가 아직 마운트되지 않음.
    expect(within(publishSection).queryByTestId("github-publish-panel")).toBeNull();

    // CTA 클릭 → 펼침 + mission.publish.opened
    const toggle = within(publishSection).getByRole("button", { name: /GitHub로 내보내기/ });
    fireEvent.click(toggle);
    expect(within(publishSection).getByTestId("github-publish-panel")).not.toBeNull();
    expect(onContextEvent.mock.calls.find((c) => c[0] === "mission.publish.opened")).toBeTruthy();
    const openedPayload = onContextEvent.mock.calls.find((c) => c[0] === "mission.publish.opened")![1] as Record<string, unknown>;
    expect(openedPayload.missionId).toBe("mission_publish_1");

    // Branch plan 호출 → trace에 missionId가 함께 첨부됨
    const panel = within(publishSection).getByTestId("github-publish-panel");
    const branchStep = within(panel).getByTestId("publish-step-branch");
    fireEvent.change(within(branchStep).getByLabelText("new branch name"), { target: { value: "agent/from-mission" } });
    fireEvent.click(within(branchStep).getByRole("button", { name: /Plan/ }));
    await waitFor(() => expect(onContextEvent.mock.calls.find((c) => c[0] === "github.publish.branch.planned")).toBeTruthy());
    const branchTrace = onContextEvent.mock.calls.find((c) => c[0] === "github.publish.branch.planned")![1] as Record<string, unknown>;
    expect(branchTrace.missionId).toBe("mission_publish_1");
    expect(branchTrace.summary).toContain("agent/from-mission");

    // 다시 클릭 → 닫힘 + mission.publish.closed + 패널 언마운트
    fireEvent.click(toggle);
    expect(within(publishSection).queryByTestId("github-publish-panel")).toBeNull();
    expect(onContextEvent.mock.calls.find((c) => c[0] === "mission.publish.closed")).toBeTruthy();
  });

  it("CTA는 다른 위험 액션 버튼을 추가하지 않는다(merge/review/labels 자동 노출 회귀 차단)", () => {
    const env: MissionPublishEnvironment = {
      serverBaseUrl: "http://127.0.0.1:4317",
      defaultRepoFullName: "robin/lab",
      onContextEvent: vi.fn(),
      fetchImpl: vi.fn() as unknown as typeof fetch,
    };
    render(
      <MissionBoardPanel
        snapshot={snapshotOf([itemWithWorkspace()])}
        onRefresh={() => {}}
        expandedMissionId="mission_publish_1"
        onToggleDetail={() => {}}
        publishEnvironment={env}
      />,
    );
    const publishSection = screen.getByTestId("mission-workspace-publish-section");
    // 패널이 닫힌 상태에서 위험 액션 버튼은 존재하지 않음.
    for (const danger of [/^merge$/i, /^submit review$/i, /^add label/i, /^delete branch$/i]) {
      expect(within(publishSection).queryByRole("button", { name: danger })).toBeNull();
    }
  });
});
