// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { MissionScaffoldLatestResponse } from "@ai-orchestrator/protocol";
import type { MissionBoardItem } from "../lib/missionBoardModel";
import { MissionBoardContainer } from "./MissionBoardContainer";

const mocks = vi.hoisted(() => ({
  fetchDgxMissions: vi.fn(),
  fetchMissionScaffoldLatest: vi.fn(),
  createDgxMission: vi.fn(),
  mergeDgxMission: vi.fn(),
  verifyDgxMission: vi.fn(),
}));

vi.mock("../runtime/stage47MissionServer", async () => {
  const actual = await vi.importActual<typeof import("../runtime/stage47MissionServer")>("../runtime/stage47MissionServer");
  return {
    ...actual,
    fetchDgxMissions: mocks.fetchDgxMissions,
    fetchMissionScaffoldLatest: mocks.fetchMissionScaffoldLatest,
    createDgxMission: mocks.createDgxMission,
    mergeDgxMission: mocks.mergeDgxMission,
    verifyDgxMission: mocks.verifyDgxMission,
  };
});

const MISSION_ID = "mission_preview_container";

function localMissionItem(): MissionBoardItem {
  return {
    missionId: MISSION_ID,
    title: "Preview container wiring",
    goal: "observed preview callback reaches App props",
    status: "running",
    truthStatus: "observed",
    source: "server_observed",
    workers: [],
    artifactCount: 0,
    verificationCount: 0,
    mergeQueueCount: 0,
    workspaceCount: 1,
    workspace: {
      id: "ws_preview_container",
      name: "preview-app",
      appType: "react_vite",
      previewStatus: "unknown",
      previewTruth: "planned",
    },
    designIssues: [],
    errorCards: [],
    selfCorrections: [],
    updatedAt: "2026-06-15T00:00:00.000Z",
  };
}

function scaffoldResponse(): MissionScaffoldLatestResponse {
  return {
    missionId: MISSION_ID,
    status: "found",
    truthStatus: "planned",
    planId: "plan_preview",
    files: [{ path: "src/App.tsx", content: "export default null;", source: "scaffold_plan", createdAt: "2026-06-15T00:00:00.000Z" }],
    skipped: [],
  };
}

function observedFetch(url: string) {
  return vi.fn(async () =>
    new Response(JSON.stringify({
      outcome: "observed",
      repoRoot: "/tmp/mission_preview_container",
      materializedFileCount: 1,
      preview: { status: "running", port: 5174, url, truthStatus: "observed" },
    }), { status: 200 }),
  );
}

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.fetchDgxMissions.mockResolvedValue({ missions: [] });
  mocks.fetchMissionScaffoldLatest.mockResolvedValue(scaffoldResponse());
});

afterEach(() => cleanup());

describe("MissionBoardContainer — preview observed callback", () => {
  it("forwards observed PreviewRunCard URL through MissionBoardPanel to the container parent", async () => {
    const onPreviewObserved = vi.fn();
    const previewFetch = observedFetch("http://127.0.0.1:5174/");
    render(
      <MissionBoardContainer
        serverBaseUrl="http://127.0.0.1:4317"
        localItems={[localMissionItem()]}
        onPreviewObserved={onPreviewObserved}
        publishEnvironment={{
          serverBaseUrl: "http://127.0.0.1:4317",
          fetchImpl: previewFetch as unknown as typeof fetch,
          getScaffoldFiles: () => [{ path: "src/App.tsx", newContent: "export default null;" }] as any,
        }}
      />,
    );

    fireEvent.click(await screen.findByText("Workspace 상세"));
    await waitFor(() => {
      const currentCta = screen.getByTestId(`mission-preview-run-cta-${MISSION_ID}`) as HTMLButtonElement;
      expect(currentCta.disabled).toBe(false);
    });
    fireEvent.click(screen.getByTestId(`mission-preview-run-cta-${MISSION_ID}`));

    await waitFor(() => expect(previewFetch).toHaveBeenCalled());
    await waitFor(() => {
      expect(onPreviewObserved).toHaveBeenCalledWith({
        missionId: MISSION_ID,
        url: "http://127.0.0.1:5174/",
        observedAt: expect.any(String),
      });
    });
  });
});
