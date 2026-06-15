// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { MissionBoardItem, MissionBoardSnapshot } from "../lib/missionBoardModel";
import { MissionBoardPanel } from "./MissionBoardPanel";

afterEach(() => cleanup());

function item(overrides: Partial<MissionBoardItem> = {}): MissionBoardItem {
  return {
    missionId: "mission_preview_panel",
    title: "Preview wiring",
    goal: "observed preview callback reaches parent",
    status: "running",
    truthStatus: "observed",
    source: "server_observed",
    workers: [],
    artifactCount: 0,
    verificationCount: 0,
    mergeQueueCount: 0,
    workspaceCount: 1,
    workspace: {
      id: "ws_preview",
      name: "preview-app",
      appType: "react_vite",
      previewStatus: "unknown",
      previewTruth: "planned",
    },
    designIssues: [],
    errorCards: [],
    selfCorrections: [],
    updatedAt: "2026-06-15T00:00:00.000Z",
    ...overrides,
  };
}

function snapshot(items: MissionBoardItem[]): MissionBoardSnapshot {
  return { items, serverReachable: true };
}

function observedFetch(url: string) {
  return vi.fn(async () =>
    new Response(JSON.stringify({
      outcome: "observed",
      repoRoot: "/tmp/mission_preview_panel",
      materializedFileCount: 1,
      preview: { status: "running", port: 5173, url, truthStatus: "observed" },
    }), { status: 200 }),
  );
}

describe("MissionBoardPanel — preview observed callback", () => {
  it("PreviewRunCard observed result is forwarded to the panel parent", async () => {
    const onPreviewObserved = vi.fn();
    render(
      <MissionBoardPanel
        snapshot={snapshot([item()])}
        onRefresh={() => {}}
        expandedMissionId="mission_preview_panel"
        onToggleDetail={() => {}}
        onPreviewObserved={onPreviewObserved}
        publishEnvironment={{
          fetchImpl: observedFetch("http://127.0.0.1:5173/") as unknown as typeof fetch,
          getScaffoldFiles: () => [{ path: "src/App.tsx", newContent: "export default null;" }] as any,
        }}
      />,
    );

    fireEvent.click(screen.getByTestId("mission-preview-run-cta-mission_preview_panel"));

    await waitFor(() => {
      expect(onPreviewObserved).toHaveBeenCalledWith({
        missionId: "mission_preview_panel",
        url: "http://127.0.0.1:5173/",
        observedAt: expect.any(String),
      });
    });
  });
});
