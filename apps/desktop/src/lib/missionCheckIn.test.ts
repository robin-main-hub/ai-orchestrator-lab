import { describe, expect, it, vi } from "vitest";
import {
  createCheckInState,
  DEFAULT_CHECKIN_NUDGE,
  runCheckInSweep,
  startCheckInLoop,
  type CheckInTarget,
} from "./missionCheckIn";

const target = (missionId: string, outputs: string[], nudge = vi.fn()): CheckInTarget & { nudge: ReturnType<typeof vi.fn> } => {
  let call = 0;
  return {
    missionId,
    capture: vi.fn(async () => outputs[Math.min(call++, outputs.length - 1)]!),
    nudge,
  };
};

describe("runCheckInSweep", () => {
  it("first sighting records output without nudging; unchanged output nudges; changed output stays quiet", async () => {
    const quiet = target("quiet", ["same", "same", "same"]);
    const busy = target("busy", ["a", "b", "c"]);

    let state = createCheckInState();
    const first = await runCheckInSweep({ targets: [quiet, busy], state });
    expect(first.rows.every((row) => !row.nudged)).toBe(true); // baseline sweep

    const second = await runCheckInSweep({ targets: [quiet, busy], state: first.state });
    expect(second.rows.find((r) => r.missionId === "quiet")).toMatchObject({ status: "stalled", nudged: true });
    expect(second.rows.find((r) => r.missionId === "busy")).toMatchObject({ status: "active", nudged: false });
    expect(quiet.nudge).toHaveBeenCalledWith(DEFAULT_CHECKIN_NUDGE);
    expect(busy.nudge).not.toHaveBeenCalled();
  });

  it("reports capture failures without nudging and survives nudge failures", async () => {
    const dead: CheckInTarget = {
      missionId: "dead",
      capture: vi.fn(async () => {
        throw new Error("pane gone");
      }),
      nudge: vi.fn(),
    };
    const stubbornNudge = vi.fn(async () => {
      throw new Error("dispatch rejected");
    });
    const stalled = target("stalled", ["x", "x"], stubbornNudge);

    let state = createCheckInState();
    ({ state } = await runCheckInSweep({ targets: [dead, stalled], state }));
    const { rows } = await runCheckInSweep({ targets: [dead, stalled], state });
    expect(rows.find((r) => r.missionId === "dead")).toMatchObject({ status: "capture_failed", nudged: false });
    expect(rows.find((r) => r.missionId === "stalled")).toMatchObject({ status: "nudge_failed", nudged: false });
  });

  it("uses a custom nudge message", async () => {
    const stalled = target("s", ["x", "x"]);
    let state = createCheckInState();
    ({ state } = await runCheckInSweep({ targets: [stalled], state }));
    await runCheckInSweep({ targets: [stalled], state, nudgeMessage: "보고해" });
    expect(stalled.nudge).toHaveBeenCalledWith("보고해");
  });
});

describe("startCheckInLoop", () => {
  it("ticks on the interval, skips overlapping ticks, and stops cleanly", async () => {
    let handler: (() => void) | null = null;
    const timers = {
      setInterval: vi.fn((h: () => void) => {
        handler = h;
        return "h1";
      }),
      clearInterval: vi.fn(),
    };

    let resolveTick: (() => void) | null = null;
    const ticks: number[] = [];
    const loop = startCheckInLoop({
      intervalMs: 1000,
      timers,
      tick: () =>
        new Promise<void>((resolve) => {
          ticks.push(ticks.length + 1);
          resolveTick = resolve;
        }),
    });

    handler!(); // tick 1 starts (slow — not resolved yet)
    handler!(); // overlapping fire — must be skipped
    expect(ticks).toHaveLength(1);

    resolveTick!();
    await Promise.resolve();
    await Promise.resolve();
    handler!(); // tick 2 after the first finished
    expect(ticks).toHaveLength(2);

    loop.stop();
    expect(timers.clearInterval).toHaveBeenCalledWith("h1");
  });
});
