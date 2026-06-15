// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { RecentProjectsPanel } from "./RecentProjectsPanel";
import { createProjectRecord, type ProjectRecord } from "../lib/projectRecord";

afterEach(() => cleanup());

const NOW_A = "2026-06-15T01:00:00.000Z";
const NOW_B = "2026-06-15T02:00:00.000Z";

function makeRecord(missionId: string, overrides: Partial<ProjectRecord> = {}): ProjectRecord {
  return {
    ...createProjectRecord({ missionId, title: `App ${missionId}`, now: NOW_A }),
    ...overrides,
  };
}

describe("RecentProjectsPanel", () => {
  it("shows the empty state when there are no records", () => {
    render(<RecentProjectsPanel records={[]} onSelectProject={vi.fn()} />);
    expect(screen.getByTestId("recent-projects-empty")).toBeTruthy();
    expect(screen.queryByTestId("recent-projects-list")).toBeNull();
  });

  it("renders one card per record with the title and updatedAt timestamp", () => {
    const records = [
      makeRecord("m1", { title: "Alpha", updatedAt: NOW_B }),
      makeRecord("m2", { title: "Beta", updatedAt: NOW_A }),
    ];
    render(<RecentProjectsPanel records={records} onSelectProject={vi.fn()} />);

    expect(screen.getByText("Alpha")).toBeTruthy();
    expect(screen.getByText("Beta")).toBeTruthy();
    const alpha = screen.getByTestId("recent-projects-item-m1");
    expect(within(alpha).getByText(NOW_B)).toBeTruthy();
  });

  it("renders the observed preview URL only when truth === observed", () => {
    const records = [
      makeRecord("observed", {
        lastPreviewUrl: "http://127.0.0.1:5174/",
        lastPreviewTruth: "observed",
      }),
      makeRecord("stale", {
        lastPreviewUrl: undefined,
        lastPreviewTruth: "stale",
      }),
      makeRecord("missing-truth", {}),
    ];
    render(<RecentProjectsPanel records={records} onSelectProject={vi.fn()} />);

    expect(screen.getByText("http://127.0.0.1:5174/")).toBeTruthy();
    const stale = screen.getByTestId("recent-projects-preview-stale");
    expect(within(stale).getByText(/preview stale/)).toBeTruthy();
    const missing = screen.getByTestId("recent-projects-preview-missing-truth");
    expect(within(missing).getByText("no observed preview")).toBeTruthy();
  });

  it("shows scaffold + visual QA + publish badges with status enums", () => {
    const records = [
      makeRecord("m1", {
        scaffold: "available",
        visualQa: { status: "passed", checkedAt: NOW_B, summary: "0 issues" },
        publish: { hasDraft: true, prNumber: 515, prUrl: "https://example/pr/515" },
      }),
    ];
    render(<RecentProjectsPanel records={records} onSelectProject={vi.fn()} />);

    expect(screen.getByTestId("recent-projects-scaffold-m1").textContent).toContain("scaffold ready");
    expect(screen.getByTestId("recent-projects-qa-m1").textContent).toContain("QA passed");
    expect(screen.getByTestId("recent-projects-publish-m1").textContent).toContain("PR #515");
  });

  it("hides publish badge when hasDraft is false / undefined", () => {
    const records = [makeRecord("m1")];
    render(<RecentProjectsPanel records={records} onSelectProject={vi.fn()} />);
    expect(screen.queryByTestId("recent-projects-publish-m1")).toBeNull();
  });

  it("shows the edit timeline count + last source/status enum strings", () => {
    const records = [
      makeRecord("m1", {
        editTimeline: {
          totalEvents: 4,
          lastEventAt: NOW_B,
          lastSource: "search_replace",
          lastStatus: "applied",
          hasRestorablePatch: true,
        },
      }),
    ];
    render(<RecentProjectsPanel records={records} onSelectProject={vi.fn()} />);

    const timeline = screen.getByTestId("recent-projects-timeline-m1");
    expect(timeline.textContent).toContain("4개 edit");
    expect(timeline.textContent).toContain("last: search_replace");
    expect(timeline.textContent).toContain("applied");
    expect(screen.getByTestId("recent-projects-restorable-m1").textContent).toContain("restorable patch");
  });

  it("hides restorable patch badge when hasRestorablePatch is false", () => {
    const records = [makeRecord("m1")];
    render(<RecentProjectsPanel records={records} onSelectProject={vi.fn()} />);
    expect(screen.queryByTestId("recent-projects-restorable-m1")).toBeNull();
  });

  it("calls onSelectProject with missionId when 이어서 is clicked", () => {
    const onSelect = vi.fn();
    const records = [makeRecord("m1")];
    render(<RecentProjectsPanel records={records} onSelectProject={onSelect} />);

    fireEvent.click(screen.getByTestId("recent-projects-resume-m1"));
    expect(onSelect).toHaveBeenCalledWith("m1");
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("renders remove button only when onRemoveProject is provided", () => {
    const records = [makeRecord("m1")];
    const { rerender } = render(<RecentProjectsPanel records={records} onSelectProject={vi.fn()} />);
    expect(screen.queryByTestId("recent-projects-remove-m1")).toBeNull();

    rerender(
      <RecentProjectsPanel records={records} onSelectProject={vi.fn()} onRemoveProject={vi.fn()} />,
    );
    expect(screen.getByTestId("recent-projects-remove-m1")).toBeTruthy();
  });

  it("calls onRemoveProject with missionId when 삭제 is clicked", () => {
    const onRemove = vi.fn();
    const records = [makeRecord("m1")];
    render(
      <RecentProjectsPanel records={records} onSelectProject={vi.fn()} onRemoveProject={onRemove} />,
    );

    fireEvent.click(screen.getByTestId("recent-projects-remove-m1"));
    expect(onRemove).toHaveBeenCalledWith("m1");
  });

  it("never auto-triggers any callback on mount (no auto-rerun)", () => {
    const onSelect = vi.fn();
    const onRemove = vi.fn();
    const records = [
      makeRecord("m1", {
        lastPreviewUrl: "http://127.0.0.1:5174/",
        lastPreviewTruth: "observed",
        visualQa: { status: "passed" },
        publish: { hasDraft: true, prNumber: 1 },
      }),
    ];
    render(
      <RecentProjectsPanel
        records={records}
        onSelectProject={onSelect}
        onRemoveProject={onRemove}
      />,
    );
    expect(onSelect).not.toHaveBeenCalled();
    expect(onRemove).not.toHaveBeenCalled();
  });

  it("renders the header count badge matching record length", () => {
    render(
      <RecentProjectsPanel
        records={[makeRecord("a"), makeRecord("b"), makeRecord("c")]}
        onSelectProject={vi.fn()}
      />,
    );
    expect(screen.getByText("3개")).toBeTruthy();
    expect(screen.getByTestId("recent-projects-panel").getAttribute("data-count")).toBe("3");
  });
});
