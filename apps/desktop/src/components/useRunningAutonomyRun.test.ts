// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createAutonomyRunStore } from "../lib/autonomyRunStore";
import { useRunningAutonomyRun } from "./useRunningAutonomyRun";

describe("useRunningAutonomyRun", () => {
  it("exposes exactly one autonomy work item while a run is active", () => {
    const store = createAutonomyRunStore({
      running: true,
      runId: "desktop_1",
      goal: "목표 A",
      startedAt: "2026-06-10T00:00:00.000Z",
      steps: [],
      abort: vi.fn(),
    });
    const { result } = renderHook(() => useRunningAutonomyRun({ store }));

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]).toMatchObject({
      id: "desktop_1",
      kind: "autonomy",
      label: "목표 A",
      goal: "목표 A",
      status: "running",
      iterations: 0,
    });
    expect(result.current.stoppingIds).toEqual([]);
  });

  it("stop() invokes the store's abort handle", () => {
    const abort = vi.fn();
    const store = createAutonomyRunStore({
      running: true,
      runId: "desktop_1",
      goal: "목표 A",
      startedAt: "2026-06-10T00:00:00.000Z",
      steps: [],
      abort,
    });
    const { result } = renderHook(() => useRunningAutonomyRun({ store }));

    act(() => {
      result.current.stop("desktop_1");
    });

    expect(abort).toHaveBeenCalledTimes(1);
  });

  it("lists the run in stoppingIds while it is cancelling", () => {
    const store = createAutonomyRunStore({
      running: true,
      runId: "desktop_1",
      goal: "목표 A",
      startedAt: "2026-06-10T00:00:00.000Z",
      steps: [],
      cancelling: true,
      abort: vi.fn(),
    });
    const { result } = renderHook(() => useRunningAutonomyRun({ store }));

    expect(result.current.stoppingIds).toEqual(["desktop_1"]);
    expect(result.current.items).toHaveLength(1);
  });

  it("exposes nothing when no run is active", () => {
    const store = createAutonomyRunStore({ running: false });
    const { result } = renderHook(() => useRunningAutonomyRun({ store }));

    expect(result.current.items).toEqual([]);
    expect(result.current.stoppingIds).toEqual([]);
  });

  it("reacts to store updates (a finishing run empties the list)", () => {
    const store = createAutonomyRunStore({
      running: true,
      runId: "desktop_1",
      goal: "목표 A",
      startedAt: "2026-06-10T00:00:00.000Z",
      steps: [],
      abort: vi.fn(),
    });
    const { result } = renderHook(() => useRunningAutonomyRun({ store }));
    expect(result.current.items).toHaveLength(1);

    act(() => {
      store.set({ running: false });
    });

    expect(result.current.items).toEqual([]);
    expect(result.current.stoppingIds).toEqual([]);
  });
});
