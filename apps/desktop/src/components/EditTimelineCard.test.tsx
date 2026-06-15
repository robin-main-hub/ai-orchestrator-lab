// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { EditTimelineCard } from "./EditTimelineCard";
import type { EditTimelineItem } from "../lib/editTimeline";

afterEach(() => cleanup());

const PATCH_TEXT = `src/App.tsx
<<<<<<< SEARCH
old
=======
new
>>>>>>> REPLACE`;

describe("EditTimelineCard", () => {
  it("renders compact timeline metadata without raw patch text and restores the last applied patch on click", () => {
    const onRestorePatch = vi.fn();
    const items: EditTimelineItem[] = [
      {
        id: "ann",
        kind: "preview_annotation_captured",
        source: "preview",
        status: "captured",
        timestamp: "2026-06-15T00:00:01.000Z",
        affectedFiles: [],
        summary: "User clicked preview at 43% x, 62% y",
      },
      {
        id: "applied",
        kind: "scaffold_overlay_applied",
        source: "scaffold_overlay",
        status: "applied",
        timestamp: "2026-06-15T00:00:02.000Z",
        affectedFiles: ["src/App.tsx"],
        summary: "overlay recorded for 1 file",
        restoreText: PATCH_TEXT,
      },
    ];

    render(
      <EditTimelineCard
        missionId="m1"
        items={items}
        onRestorePatch={onRestorePatch}
      />,
    );

    expect(screen.getByTestId("edit-timeline-m1").getAttribute("data-count")).toBe("2");
    expect(screen.getByTestId("edit-timeline-item-m1-ann").textContent).toContain("preview");
    expect(screen.getByTestId("edit-timeline-item-m1-applied").textContent).toContain("src/App.tsx");
    expect(screen.getByTestId("edit-timeline-m1").textContent).not.toContain("<<<<<<< SEARCH");

    fireEvent.click(screen.getByTestId("edit-timeline-restore-last-m1"));
    expect(onRestorePatch).toHaveBeenCalledWith(PATCH_TEXT);
  });
});
