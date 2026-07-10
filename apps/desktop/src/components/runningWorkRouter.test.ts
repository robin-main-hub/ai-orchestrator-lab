import { describe, expect, it, vi } from "vitest";
import { mergeRunningWork, type RunningWorkSource } from "./runningWorkRouter";
import type { RunningWorkItem } from "./RunningWorkCard";

function item(id: string, kind: RunningWorkItem["kind"]): RunningWorkItem {
  return { id, label: id, status: "running", kind };
}

describe("mergeRunningWork", () => {
  it("concatenates items and stoppingIds in source order", () => {
    const autonomy: RunningWorkSource = {
      items: [item("a1", "autonomy")],
      stoppingIds: ["a1"],
      stop: vi.fn(),
    };
    const rmas: RunningWorkSource = {
      items: [item("r1", "rmas"), item("r2", "rmas")],
      stoppingIds: ["r2"],
      stop: vi.fn(),
    };

    const merged = mergeRunningWork([autonomy, rmas]);

    expect(merged.items.map((entry) => entry.id)).toEqual(["a1", "r1", "r2"]);
    expect(merged.stoppingIds).toEqual(["a1", "r2"]);
  });

  it("routes stop() only to the source that owns the id (RMAS-stop regression guard)", () => {
    const autonomyStop = vi.fn();
    const rmasStop = vi.fn();
    const autonomy: RunningWorkSource = {
      items: [item("a1", "autonomy")],
      stoppingIds: [],
      stop: autonomyStop,
    };
    const rmas: RunningWorkSource = {
      items: [item("r1", "rmas")],
      stoppingIds: [],
      stop: rmasStop,
    };
    const merged = mergeRunningWork([autonomy, rmas]);

    // stopping an rmas item hits only the rmas source
    merged.stop("r1");
    expect(rmasStop).toHaveBeenCalledWith("r1");
    expect(autonomyStop).not.toHaveBeenCalled();

    // stopping an autonomy item hits only the autonomy source
    merged.stop("a1");
    expect(autonomyStop).toHaveBeenCalledWith("a1");
    expect(rmasStop).toHaveBeenCalledTimes(1); // unchanged from the earlier r1 call

    // an unknown id routes to no source and does not throw
    expect(() => merged.stop("unknown")).not.toThrow();
    expect(autonomyStop).toHaveBeenCalledTimes(1);
    expect(rmasStop).toHaveBeenCalledTimes(1);
  });
});
