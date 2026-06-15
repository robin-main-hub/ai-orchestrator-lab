// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { useProjectRecordController } from "./useProjectRecordController";
import { useProjectRecordSync } from "./useProjectRecordSync";
import { RecentProjectsPanel } from "../components/RecentProjectsPanel";
import type { JsonStorageLike } from "../lib/persistentJsonState";
import type { EditTimelineItem } from "../lib/editTimeline";

afterEach(() => cleanup());

/**
 * H10 slice 6 — end-to-end smoke for the 4-layer stack
 * (lib/projectRecord ↔ useProjectRecordController ↔ useProjectRecordSync ↔ RecentProjectsPanel).
 *
 * This test does NOT exercise any existing Mission Workspace component;
 * it only proves that the H10 layers compose into a coherent loop with
 * the same data shapes the future wiring slice will pass in.
 */

class MemoryStorage implements JsonStorageLike {
  private readonly values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

function makeClock(seed: string) {
  let n = 0;
  const base = new Date(seed).getTime();
  return () => new Date(base + n++ * 1000).toISOString();
}

function makeTimelineItem(
  partial: Partial<EditTimelineItem> & { id: string; timestamp: string },
): EditTimelineItem {
  return {
    id: partial.id,
    kind: partial.kind ?? "search_replace_preview_created",
    source: partial.source ?? "search_replace",
    status: partial.status ?? "preview",
    timestamp: partial.timestamp,
    affectedFiles: partial.affectedFiles ?? [],
    summary: partial.summary ?? "stub",
    restoreText: partial.restoreText,
  };
}

describe("H10 ProjectRecord 4-layer integration", () => {
  it("controller → sync → panel renders a fresh record with honest defaults", () => {
    const storage = new MemoryStorage();
    const now = makeClock("2026-06-15T01:00:00.000Z");

    const { result } = renderHook(() => useProjectRecordController({ now, storage }));
    expect(result.current.records).toEqual([]);

    // Sync wiring (what the future MissionBoardPanel adapter call will look like).
    renderHook(() =>
      useProjectRecordSync({
        controller: result.current,
        missionId: "m1",
        title: "App One",
        goal: "Make an app",
      }),
    );

    expect(result.current.records).toHaveLength(1);
    const record = result.current.records[0]!;
    expect(record.title).toBe("App One");
    expect(record.goal).toBe("Make an app");
    expect(record.scaffold).toBe("unknown");
    expect(record.lastPreviewUrl).toBeUndefined();
    expect(record.visualQa).toBeUndefined();
    expect(record.publish).toBeUndefined();

    // Mount the panel — it should show the record (no auto-callback triggered).
    render(
      <RecentProjectsPanel
        records={result.current.records}
        onSelectProject={() => {}}
      />,
    );
    expect(screen.getByText("App One")).toBeTruthy();
    expect(screen.getByText(/scaffold unknown/)).toBeTruthy();
    expect(screen.getByText("no observed preview")).toBeTruthy();
  });

  it("observed preview update flows through controller → panel", () => {
    const storage = new MemoryStorage();
    const now = makeClock("2026-06-15T01:00:00.000Z");

    const { result } = renderHook(() => useProjectRecordController({ now, storage }));

    // Step 1: ensure record exists.
    renderHook(() =>
      useProjectRecordSync({
        controller: result.current,
        missionId: "m1",
        title: "App One",
      }),
    );
    expect(result.current.find("m1")).toBeTruthy();

    // Step 2: feed an observed preview through the adapter.
    renderHook(() =>
      useProjectRecordSync({
        controller: result.current,
        missionId: "m1",
        title: "App One",
        observedPreview: {
          url: "http://127.0.0.1:5174/",
          truth: "observed",
          observedAt: "2026-06-15T02:00:00.000Z",
        },
      }),
    );

    // Step 3: the panel should render the observed URL.
    render(
      <RecentProjectsPanel records={result.current.records} onSelectProject={() => {}} />,
    );
    expect(screen.getByText("http://127.0.0.1:5174/")).toBeTruthy();
  });

  it("stale preview clears the URL — panel falls back to 'preview stale'", () => {
    const storage = new MemoryStorage();
    const now = makeClock("2026-06-15T01:00:00.000Z");

    const { result } = renderHook(() => useProjectRecordController({ now, storage }));
    renderHook(() =>
      useProjectRecordSync({
        controller: result.current,
        missionId: "m1",
        title: "App One",
        observedPreview: {
          url: "http://127.0.0.1:5174/",
          truth: "observed",
          observedAt: "2026-06-15T02:00:00.000Z",
        },
      }),
    );
    expect(result.current.find("m1")?.lastPreviewUrl).toBe("http://127.0.0.1:5174/");

    // Now the same URL with stale truth — should clear (honesty contract).
    act(() => {
      result.current.recordPreview("m1", {
        url: "http://127.0.0.1:5174/",
        truth: "stale",
        observedAt: "2026-06-15T03:00:00.000Z",
      });
    });
    expect(result.current.find("m1")?.lastPreviewUrl).toBeUndefined();

    render(
      <RecentProjectsPanel records={result.current.records} onSelectProject={() => {}} />,
    );
    expect(screen.queryByText("http://127.0.0.1:5174/")).toBeNull();
    expect(screen.getByText(/preview stale/)).toBeTruthy();
  });

  it("editTimelineItems derive into the project record and surface in the panel", () => {
    const storage = new MemoryStorage();
    const now = makeClock("2026-06-15T01:00:00.000Z");

    const { result } = renderHook(() => useProjectRecordController({ now, storage }));
    const items: EditTimelineItem[] = [
      makeTimelineItem({ id: "1", timestamp: "2026-06-15T02:00:00.000Z", source: "preview", status: "captured" }),
      makeTimelineItem({ id: "2", timestamp: "2026-06-15T02:30:00.000Z", source: "search_replace", status: "applied", restoreText: "patch" }),
    ];

    renderHook(() =>
      useProjectRecordSync({
        controller: result.current,
        missionId: "m1",
        title: "App One",
        editTimelineItems: items,
      }),
    );

    const record = result.current.find("m1");
    expect(record?.editTimeline.totalEvents).toBe(2);
    expect(record?.editTimeline.hasRestorablePatch).toBe(true);
    expect(record?.editTimeline.lastSource).toBe("search_replace");

    render(
      <RecentProjectsPanel records={result.current.records} onSelectProject={() => {}} />,
    );
    expect(screen.getByText(/2개 edit/)).toBeTruthy();
    expect(screen.getByText(/last: search_replace/)).toBeTruthy();
    expect(screen.getByText("restorable patch")).toBeTruthy();
  });

  it("panel '이어서' click only emits onSelectProject — no controller mutation", () => {
    const storage = new MemoryStorage();
    const now = makeClock("2026-06-15T01:00:00.000Z");

    const { result } = renderHook(() => useProjectRecordController({ now, storage }));
    renderHook(() =>
      useProjectRecordSync({
        controller: result.current,
        missionId: "m1",
        title: "App One",
      }),
    );
    const recordBefore = JSON.stringify(result.current.find("m1"));

    let received: string | undefined;
    render(
      <RecentProjectsPanel
        records={result.current.records}
        onSelectProject={(id) => {
          received = id;
        }}
      />,
    );

    fireEvent.click(screen.getByTestId("recent-projects-resume-m1"));
    expect(received).toBe("m1");

    // Resume must not mutate the record — honesty contract: no auto rerun.
    expect(JSON.stringify(result.current.find("m1"))).toBe(recordBefore);
  });

  it("storage persists across controller remounts", () => {
    const storage = new MemoryStorage();
    const now1 = makeClock("2026-06-15T01:00:00.000Z");
    const first = renderHook(() => useProjectRecordController({ now: now1, storage }));
    renderHook(() =>
      useProjectRecordSync({
        controller: first.result.current,
        missionId: "m1",
        title: "Persisted App",
        scaffold: "available",
        visualQa: { status: "passed", checkedAt: "2026-06-15T02:00:00.000Z" },
      }),
    );
    expect(first.result.current.find("m1")?.scaffold).toBe("available");

    // Simulate full app remount (new controller, same storage).
    first.unmount();
    const now2 = makeClock("2026-06-15T10:00:00.000Z");
    const second = renderHook(() => useProjectRecordController({ now: now2, storage }));

    const restored = second.result.current.find("m1");
    expect(restored?.title).toBe("Persisted App");
    expect(restored?.scaffold).toBe("available");
    expect(restored?.visualQa?.status).toBe("passed");
  });
});
