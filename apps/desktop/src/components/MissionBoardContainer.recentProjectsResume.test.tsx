// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { MissionBoardItem } from "../lib/missionBoardModel";
import { MissionBoardContainer } from "./MissionBoardContainer";
import type { ProjectRecordController } from "../hooks/useProjectRecordController";
import { createProjectRecord, type ProjectRecord } from "../lib/projectRecord";

const mocks = vi.hoisted(() => ({
  fetchDgxMissions: vi.fn(),
  fetchMissionScaffoldLatest: vi.fn(),
  createDgxMission: vi.fn(),
  mergeDgxMission: vi.fn(),
  verifyDgxMission: vi.fn(),
}));

vi.mock("../runtime/stage47MissionServer", async () => {
  const actual = await vi.importActual<typeof import("../runtime/stage47MissionServer")>(
    "../runtime/stage47MissionServer",
  );
  return {
    ...actual,
    fetchDgxMissions: mocks.fetchDgxMissions,
    fetchMissionScaffoldLatest: mocks.fetchMissionScaffoldLatest,
    createDgxMission: mocks.createDgxMission,
    mergeDgxMission: mocks.mergeDgxMission,
    verifyDgxMission: mocks.verifyDgxMission,
  };
});

const MISSION_ID = "mission_resume";

function localMissionItem(): MissionBoardItem {
  return {
    missionId: MISSION_ID,
    title: "Resume target app",
    goal: "verify resume opens this detail",
    status: "running",
    truthStatus: "observed",
    source: "server_observed",
    workers: [],
    artifactCount: 0,
    verificationCount: 0,
    mergeQueueCount: 0,
    workspaceCount: 1,
    workspace: {
      id: "ws_resume",
      name: "resume-app",
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

function makeStubController(records: ReadonlyArray<ProjectRecord>): ProjectRecordController & {
  __calls: { remove: string[] };
} {
  const calls = { remove: [] as string[] };
  return {
    __calls: calls,
    records,
    find: (missionId) => records.find((r) => r.missionId === missionId),
    ensureRecord: (input) => ({
      ...createProjectRecord({ missionId: input.missionId, title: input.title, now: "t" }),
      goal: input.goal,
    }),
    recordPreview: vi.fn(),
    recordVisualQa: vi.fn(),
    recordScaffold: vi.fn(),
    recordEditTimeline: vi.fn(),
    recordPublishStatus: vi.fn(),
    remove: (missionId) => {
      calls.remove.push(missionId);
    },
  };
}

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.fetchDgxMissions.mockResolvedValue({ missions: [] });
});

afterEach(() => cleanup());

describe("MissionBoardContainer + RecentProjectsPanel — resume / sync", () => {
  it("mounts RecentProjectsPanel only when a controller is provided", () => {
    const { rerender } = render(<MissionBoardContainer localItems={[localMissionItem()]} />);
    expect(screen.queryByTestId("recent-projects-empty")).toBeNull();
    expect(screen.queryByTestId("recent-projects-list")).toBeNull();

    rerender(
      <MissionBoardContainer
        localItems={[localMissionItem()]}
        projectRecordController={makeStubController([])}
      />,
    );
    // empty state visible now (no records)
    expect(screen.getByTestId("recent-projects-empty")).toBeTruthy();
  });

  it("expands the matching mission when pendingResumeMissionId arrives, then notifies onResumeConsumed", () => {
    const onResumeConsumed = vi.fn();
    const controller = makeStubController([]);
    const { rerender } = render(
      <MissionBoardContainer
        localItems={[localMissionItem()]}
        projectRecordController={controller}
        onResumeConsumed={onResumeConsumed}
      />,
    );
    // Detail not expanded yet
    expect(screen.queryByTestId("preview-iframe-frame-board-" + MISSION_ID)).toBeNull();

    rerender(
      <MissionBoardContainer
        localItems={[localMissionItem()]}
        projectRecordController={controller}
        onResumeConsumed={onResumeConsumed}
        pendingResumeMissionId={MISSION_ID}
      />,
    );

    // The Workspace 상세 button should now show ChevronDown (expanded state).
    const detailToggle = screen.getByText("Workspace 상세").closest("button");
    expect(detailToggle?.getAttribute("aria-expanded")).toBe("true");
    expect(onResumeConsumed).toHaveBeenCalledTimes(1);
  });

  it("RecentProjectsPanel 'Resume' click expands the matching mission detail without firing any controller mutator", () => {
    const records: ReadonlyArray<ProjectRecord> = [
      {
        ...createProjectRecord({ missionId: MISSION_ID, title: "Resume target app", now: "2026-06-15T00:00:00Z" }),
        updatedAt: "2026-06-15T00:00:00Z",
      },
    ];
    const controller = makeStubController(records);
    const recordPreviewCount = (controller.recordPreview as ReturnType<typeof vi.fn>).mock.calls.length;
    const recordVisualQaCount = (controller.recordVisualQa as ReturnType<typeof vi.fn>).mock.calls.length;

    render(
      <MissionBoardContainer
        localItems={[localMissionItem()]}
        projectRecordController={controller}
      />,
    );

    const card = screen.getByTestId(`recent-projects-item-${MISSION_ID}`);
    const resumeBtn = card.querySelector(`[data-testid="recent-projects-resume-${MISSION_ID}"]`) as HTMLButtonElement | null;
    expect(resumeBtn).toBeTruthy();
    fireEvent.click(resumeBtn!);

    // The expansion is signaled via aria-expanded on the Workspace 상세 toggle.
    const detailToggle = screen.getByText("Workspace 상세").closest("button");
    expect(detailToggle?.getAttribute("aria-expanded")).toBe("true");

    // Resume must NOT bump any mutator beyond what the per-card sync already did at mount.
    // Specifically, no extra recordPreview / recordVisualQa called by the resume action itself.
    const recordPreviewAfter = (controller.recordPreview as ReturnType<typeof vi.fn>).mock.calls.length;
    const recordVisualQaAfter = (controller.recordVisualQa as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(recordPreviewAfter).toBe(recordPreviewCount);
    expect(recordVisualQaAfter).toBe(recordVisualQaCount);
  });

  it("forwards the remove callback to RecentProjectsPanel '삭제' button", () => {
    const records: ReadonlyArray<ProjectRecord> = [
      {
        ...createProjectRecord({ missionId: MISSION_ID, title: "Removable app", now: "2026-06-15T00:00:00Z" }),
        updatedAt: "2026-06-15T00:00:00Z",
      },
    ];
    const controller = makeStubController(records);
    render(
      <MissionBoardContainer
        localItems={[localMissionItem()]}
        projectRecordController={controller}
      />,
    );

    const card = screen.getByTestId(`recent-projects-item-${MISSION_ID}`);
    const removeBtn = card.querySelector(`[data-testid="recent-projects-remove-${MISSION_ID}"]`) as HTMLButtonElement | null;
    expect(removeBtn).toBeTruthy();
    fireEvent.click(removeBtn!);
    expect(controller.__calls.remove).toEqual([MISSION_ID]);
  });
});
