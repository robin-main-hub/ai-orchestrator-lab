// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { MissionBoardItem, MissionBoardSnapshot } from "../lib/missionBoardModel";
import { makePreviewViewportAnnotation } from "../lib/previewAnnotations";
import type { TurboEditGenerator } from "../lib/turboEditGenerator";
import { MissionBoardPanel } from "./MissionBoardPanel";

afterEach(() => cleanup());

const MISSION_ID = "mission_edit_timeline";
const PATCH_TEXT = `src/App.tsx
<<<<<<< SEARCH
hello
=======
world
>>>>>>> REPLACE`;

function item(): MissionBoardItem {
  return {
    missionId: MISSION_ID,
    title: "Edit timeline",
    goal: "show applied patch history",
    status: "running",
    truthStatus: "observed",
    source: "server_observed",
    workers: [],
    artifactCount: 0,
    verificationCount: 0,
    mergeQueueCount: 0,
    workspaceCount: 1,
    workspace: {
      id: "ws_edit_timeline",
      name: "timeline-app",
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

describe("MissionBoardPanel — edit history timeline", () => {
  it("records annotation, provider draft, search/replace apply and restores the last applied patch", async () => {
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
    const generate = vi.fn<TurboEditGenerator>(async () => ({
      ok: true,
      text: PATCH_TEXT,
    }));
    const refreshScaffold = vi.fn();
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith(`/missions/${MISSION_ID}/scaffold/overlay`)) {
        return new Response(JSON.stringify({
          outcome: "recorded",
          overlay: {
            id: "overlay_timeline",
            missionId: MISSION_ID,
            source: "manual",
            files: [{ path: "src/App.tsx", content: "world\n" }],
            truthStatus: "planned",
            createdAt: "2026-06-15T00:00:03.000Z",
          },
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ message: `unexpected ${url}` }), { status: 500 });
    });

    render(
      <MissionBoardPanel
        snapshot={snapshot([item()])}
        onRefresh={() => {}}
        expandedMissionId={MISSION_ID}
        onToggleDetail={() => {}}
        previewAnnotationDraft={{ missionId: MISSION_ID, annotation, sentAt: "2026-06-15T00:00:01.000Z" }}
        publishEnvironment={{
          serverBaseUrl: "http://test-server",
          fetchImpl,
          refreshScaffold,
          getScaffoldFiles: () => [{ path: "src/App.tsx", newContent: "hello\n" }] as any,
          getTurboEditGenerator: () => ({
            generator: generate,
            providerLabel: "test provider · test-model",
          }),
        }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId(`edit-timeline-item-${MISSION_ID}-preview-annotation-click1`)).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId(`turbo-edits-generate-${MISSION_ID}`));
    await waitFor(() => {
      expect(screen.getByTestId(`edit-timeline-item-${MISSION_ID}-turbo-draft-generated`)).toBeTruthy();
    });
    expect(screen.getByTestId(`edit-timeline-${MISSION_ID}`).textContent).not.toContain("<<<<<<< SEARCH");

    fireEvent.click(screen.getByTestId(`search-replace-edit-apply-${MISSION_ID}`));
    await waitFor(() => {
      expect(screen.getByTestId(`edit-timeline-item-${MISSION_ID}-search-replace-applied`)).toBeTruthy();
    });
    expect(refreshScaffold).toHaveBeenCalledWith(MISSION_ID);

    fireEvent.change(screen.getByTestId(`search-replace-edit-textarea-${MISSION_ID}`), {
      target: { value: "" },
    });
    expect((screen.getByTestId(`search-replace-edit-textarea-${MISSION_ID}`) as HTMLTextAreaElement).value).toBe("");

    fireEvent.click(screen.getByTestId(`edit-timeline-restore-last-${MISSION_ID}`));
    expect((screen.getByTestId(`search-replace-edit-textarea-${MISSION_ID}`) as HTMLTextAreaElement).value).toBe(PATCH_TEXT);
  });
});
