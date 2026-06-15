// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { MissionBoardItem, MissionBoardSnapshot } from "../lib/missionBoardModel";
import { makePreviewViewportAnnotation } from "../lib/previewAnnotations";
import type { TurboEditGenerator } from "../lib/turboEditGenerator";
import { MissionBoardPanel } from "./MissionBoardPanel";

afterEach(() => cleanup());

const MISSION_ID = "mission_preview_viewport";
const VALID_OUTPUT = `src/App.tsx
<<<<<<< SEARCH
export default null;
=======
export default function App() {
  return <main>Annotated preview fix</main>;
}
>>>>>>> REPLACE`;

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

  it("uses the annotated prompt for in-app generation and only injects Search/Replace text", async () => {
    const annotation = makePreviewViewportAnnotation({
      id: "click2",
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
      text: VALID_OUTPUT,
    }));
    const fetchImpl = vi.fn<typeof fetch>();

    render(
      <MissionBoardPanel
        snapshot={snapshot([item()])}
        onRefresh={() => {}}
        expandedMissionId={MISSION_ID}
        onToggleDetail={() => {}}
        previewAnnotationDraft={{ missionId: MISSION_ID, annotation, sentAt: "2026-06-15T00:00:01.000Z" }}
        publishEnvironment={{
          fetchImpl,
          getScaffoldFiles: () => [
            { path: "src/App.tsx", newContent: "export default null;" },
          ] as any,
          getTurboEditGenerator: () => ({
            generator: generate,
            providerLabel: "test provider · test-model",
          }),
        }}
      />,
    );

    await waitFor(() => {
      const prompt = screen.getByTestId(`turbo-edits-prompt-body-${MISSION_ID}`).textContent ?? "";
      expect(prompt).toContain("DOM selector unknown due to iframe boundary");
    });

    fireEvent.click(screen.getByTestId(`turbo-edits-generate-${MISSION_ID}`));

    await waitFor(() => {
      expect(generate).toHaveBeenCalledTimes(1);
    });
    const sentPrompt = generate.mock.calls[0]![0]!.userPrompt;
    expect(sentPrompt).toContain("User clicked preview at 43% x, 62% y on http://127.0.0.1:5173/");
    expect(sentPrompt).toContain("DOM selector unknown due to iframe boundary");

    await waitFor(() => {
      expect(
        (screen.getByTestId(`search-replace-edit-textarea-${MISSION_ID}`) as HTMLTextAreaElement).value,
      ).toBe(VALID_OUTPUT);
    });
    expect(screen.getByTestId(`turbo-edits-generate-injected-${MISSION_ID}`)).toBeTruthy();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
