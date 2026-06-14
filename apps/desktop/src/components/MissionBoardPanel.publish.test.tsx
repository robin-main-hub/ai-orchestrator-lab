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

  it("기본 prefill: Mission title/goal/missionId → Publish Panel 입력 필드에 들어간다", () => {
    const env: MissionPublishEnvironment = {
      serverBaseUrl: "http://127.0.0.1:4317",
      defaultRepoFullName: "robin/lab",
      onContextEvent: vi.fn(),
      fetchImpl: vi.fn() as unknown as typeof fetch,
    };
    render(
      <MissionBoardPanel
        snapshot={snapshotOf([itemWithWorkspace("mission_prefill_xyz")])}
        onRefresh={() => {}}
        expandedMissionId="mission_prefill_xyz"
        onToggleDetail={() => {}}
        publishEnvironment={env}
      />,
    );
    const publishSection = screen.getByTestId("mission-workspace-publish-section");
    fireEvent.click(within(publishSection).getByRole("button", { name: /GitHub로 내보내기/ }));

    const panel = within(publishSection).getByTestId("github-publish-panel");
    // Step 1: branch — agent/mission-<slug> 프리필
    const branchStep = within(panel).getByTestId("publish-step-branch");
    const newBranchInput = within(branchStep).getByLabelText("new branch name") as HTMLInputElement;
    expect(newBranchInput.value).toMatch(/^agent\/mission-/);
    // Step 3: PR title — mission.title 프리필, base = main
    const prStep = within(panel).getByTestId("publish-step-pr");
    const prTitleInput = within(prStep).getByLabelText("pr title") as HTMLInputElement;
    expect(prTitleInput.value).toBe("App Builder result"); // itemWithWorkspace 의 title
    const prBaseInput = within(prStep).getByLabelText("pr base branch") as HTMLInputElement;
    expect(prBaseInput.value).toBe("main");
    // PR body는 provenance(missionId)를 포함
    const prBodyInput = within(prStep).getByLabelText("pr body") as HTMLTextAreaElement;
    expect(prBodyInput.value).toContain("mission_prefill_xyz");
    expect(prBodyInput.value).toMatch(/draft/i);
  });

  it("custom resolvePrefill override 지원 — builtin 대신 호출자가 직접 결정", () => {
    const env: MissionPublishEnvironment = {
      serverBaseUrl: "http://127.0.0.1:4317",
      defaultRepoFullName: "robin/lab",
      onContextEvent: vi.fn(),
      fetchImpl: vi.fn() as unknown as typeof fetch,
      resolvePrefill: (item) => ({
        newBranchName: `custom/${item.missionId.slice(-4)}`,
        prTitle: `Custom: ${item.title}`,
        prBase: "develop",
        // sourceRef, body는 미지정 — panel은 기본값 사용
      }),
    };
    render(
      <MissionBoardPanel
        snapshot={snapshotOf([itemWithWorkspace("mission_zzzz9999")])}
        onRefresh={() => {}}
        expandedMissionId="mission_zzzz9999"
        onToggleDetail={() => {}}
        publishEnvironment={env}
      />,
    );
    const publishSection = screen.getByTestId("mission-workspace-publish-section");
    fireEvent.click(within(publishSection).getByRole("button", { name: /GitHub로 내보내기/ }));
    const panel = within(publishSection).getByTestId("github-publish-panel");
    const branchStep = within(panel).getByTestId("publish-step-branch");
    expect((within(branchStep).getByLabelText("new branch name") as HTMLInputElement).value).toBe("custom/9999");
    const prStep = within(panel).getByTestId("publish-step-pr");
    expect((within(prStep).getByLabelText("pr title") as HTMLInputElement).value).toBe("Custom: App Builder result");
    expect((within(prStep).getByLabelText("pr base branch") as HTMLInputElement).value).toBe("develop");
  });

  it("getScaffoldFiles로 안전한 파일이 주어지면 file path/content가 prefill되고 notice가 보인다", () => {
    const env: MissionPublishEnvironment = {
      serverBaseUrl: "http://127.0.0.1:4317",
      defaultRepoFullName: "robin/lab",
      onContextEvent: vi.fn(),
      fetchImpl: vi.fn() as unknown as typeof fetch,
      getScaffoldFiles: () => [
        { path: "src/util.ts", newContent: "export const v = 2;\n", operation: "create" },
        { path: "secret.env", newContent: "TOKEN=ghp_abcdefghij1234567890abcd" }, // 시크릿 의심 — 스킵
      ],
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
    fireEvent.click(within(publishSection).getByRole("button", { name: /GitHub로 내보내기/ }));
    const panel = within(publishSection).getByTestId("github-publish-panel");
    const fileStep = within(panel).getByTestId("publish-step-file");
    expect((within(fileStep).getByLabelText("file path") as HTMLInputElement).value).toBe("src/util.ts");
    expect((within(fileStep).getByLabelText("file new content") as HTMLTextAreaElement).value).toContain("export const v = 2;");
    // notice: 2개 중 1개만 자동 채움 + 시크릿 스킵
    const notice = within(fileStep).getByTestId("publish-file-notice");
    expect(notice.textContent).toMatch(/scaffold 2개 중 1개/);
    expect(notice.textContent).toMatch(/시크릿/);
  });

  it("scaffold 전부가 위험하면 file 필드는 비고 notice만 표시(추측 금지)", () => {
    const env: MissionPublishEnvironment = {
      serverBaseUrl: "http://127.0.0.1:4317",
      defaultRepoFullName: "robin/lab",
      onContextEvent: vi.fn(),
      fetchImpl: vi.fn() as unknown as typeof fetch,
      getScaffoldFiles: () => [
        { path: "key.pem", newContent: "-----BEGIN PRIVATE KEY-----\nXYZ" },
      ],
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
    fireEvent.click(within(publishSection).getByRole("button", { name: /GitHub로 내보내기/ }));
    const panel = within(publishSection).getByTestId("github-publish-panel");
    const fileStep = within(panel).getByTestId("publish-step-file");
    expect((within(fileStep).getByLabelText("file path") as HTMLInputElement).value).toBe("");
    expect(within(fileStep).getByTestId("publish-file-notice").textContent).toMatch(/모두 가드에 막혀/);
  });

  it("publishEnvironment 주면 CTA 옆에 보조 텍스트(단계별 승인 안내)가 보인다", () => {
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
    // 보조 텍스트는 접힘 상태에서도 보인다(사용자가 클릭 전에 의도를 알 수 있게).
    expect(publishSection.textContent).toContain("단계별 승인");
    expect(publishSection.textContent).toContain("merge/review/label/assignee 없음");
  });

  it("(App.tsx 현 상태) getScaffoldFiles 미배선이면 file 필드는 비고, 그래도 fetch 0 — branch/PR prefill만", () => {
    // App.tsx는 현재 publishEnvironment에 serverBaseUrl + onContextEvent만 넘기고,
    // getScaffoldFiles는 의도적으로 미배선이다(추측 금지). 이 회귀 가드.
    const fetchImpl = vi.fn(); // 호출되면 안 됨.
    const env: MissionPublishEnvironment = {
      serverBaseUrl: "http://127.0.0.1:4317",
      defaultRepoFullName: "robin/lab",
      onContextEvent: vi.fn(),
      fetchImpl: fetchImpl as unknown as typeof fetch,
      // getScaffoldFiles: 의도적 미배선 — App.tsx 현 상태 미러
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
    fireEvent.click(within(publishSection).getByRole("button", { name: /GitHub로 내보내기/ }));
    const panel = within(publishSection).getByTestId("github-publish-panel");

    // file 필드는 비어 있어야 함(scaffold 없음 → 추측 금지)
    const fileStep = within(panel).getByTestId("publish-step-file");
    expect((within(fileStep).getByLabelText("file path") as HTMLInputElement).value).toBe("");
    expect((within(fileStep).getByLabelText("file new content") as HTMLTextAreaElement).value).toBe("");
    // fileNotice도 없음(scaffoldFiles 자체가 undefined이면 notice도 안 만든다)
    expect(within(fileStep).queryByTestId("publish-file-notice")).toBeNull();

    // branch/PR prefill은 그대로 — 사용자에게 즉시 값 제공
    const branchStep = within(panel).getByTestId("publish-step-branch");
    expect((within(branchStep).getByLabelText("new branch name") as HTMLInputElement).value).toMatch(/^agent\/mission-/);
    const prStep = within(panel).getByTestId("publish-step-pr");
    expect((within(prStep).getByLabelText("pr title") as HTMLInputElement).value).toBe("App Builder result");

    // 핵심: prefill 단계에서 GitHub write route fetch가 절대 발생하지 않는다.
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("(빈 배열도 무탈) getScaffoldFiles가 [] 반환해도 file 필드 비움 + notice 없음", () => {
    const env: MissionPublishEnvironment = {
      serverBaseUrl: "http://127.0.0.1:4317",
      defaultRepoFullName: "robin/lab",
      onContextEvent: vi.fn(),
      fetchImpl: vi.fn() as unknown as typeof fetch,
      getScaffoldFiles: () => [],
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
    fireEvent.click(within(publishSection).getByRole("button", { name: /GitHub로 내보내기/ }));
    const panel = within(publishSection).getByTestId("github-publish-panel");
    const fileStep = within(panel).getByTestId("publish-step-file");
    expect((within(fileStep).getByLabelText("file path") as HTMLInputElement).value).toBe("");
    expect(within(fileStep).queryByTestId("publish-file-notice")).toBeNull();
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
