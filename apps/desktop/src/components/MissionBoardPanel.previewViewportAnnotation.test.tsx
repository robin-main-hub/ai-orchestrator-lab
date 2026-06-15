// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { MissionBoardItem, MissionBoardSnapshot } from "../lib/missionBoardModel";
import { makePreviewViewportAnnotation } from "../lib/previewAnnotations";
import { MissionBoardPanel } from "./MissionBoardPanel";

afterEach(() => cleanup());

const MISSION_ID = "mission_preview_viewport";

function item(): MissionBoardItem {
  return {
    missionId: MISSION_ID,
    title: "Preview viewport annotation",
    goal: "route clicked preview coordinates into Turbo Edits prompt",
    status: "running",
    truthStatus: "observed",
    source: "server_observed",
    workers: [],
    artifactCount: 0,
    verificationCount: 0,
    mergeQueueCount: 0,
    workspaceCount: 1,
    workspace: {
      id: "ws_preview_viewport",
      name: "preview-app",
      appType: "react_vite",
      previewStatus: "running",
      previewTruth: "observed",
      previewUrl: "http://127.0.0.1:5173/",
    },
    designIssues: [],
    errorCards: [],
    selfCorrections: [],
    updatedAt: "2026-06-15T00:00:00.000Z",
  };
}

function snapshot(items: MissionBoardItem[]): MissionBoardSnapshot {
  return { items, serverReachable: true };
}

describe("MissionBoardPanel — preview viewport annotation draft", () => {
  it("adds the sent preview coordinate annotation to the Turbo Edits prompt", async () => {
    const annotation = makePreviewViewportAnnotation({
      id: "click1",
      click: {
        url: "http://127.0.0.1:5173/",
        x: 43,
        y: 62,
        percentX: 43,
        percentY: 62,
        viewportWidth: 100,
        viewportHeight: 100,
        capturedAt: "2026-06-15T00:00:00.000Z",
      },
    });

    render(
      <MissionBoardPanel
        snapshot={snapshot([item()])}
        onRefresh={() => {}}
        expandedMissionId={MISSION_ID}
        onToggleDetail={() => {}}
        previewAnnotationDraft={{ missionId: MISSION_ID, annotation, sentAt: "2026-06-15T00:00:01.000Z" }}
        publishEnvironment={{
          getScaffoldFiles: () => [{ path: "src/App.tsx", newContent: "export default null;" }] as any,
        }}
      />,
    );

    await waitFor(() => {
      const prompt = screen.getByTestId(`turbo-edits-prompt-body-${MISSION_ID}`).textContent ?? "";
      expect(prompt).toContain("User clicked preview at 43% x, 62% y on http://127.0.0.1:5173/");
      expect(prompt).toContain("DOM selector unknown due to iframe boundary");
    });
  });
});
