/**
 * Self-scheduled check-ins for parallel missions — the Tmux-Orchestrator
 * pattern: a periodic sweep captures each running mission's pane and, when the
 * output has not changed since the previous sweep (the agent has gone quiet),
 * dispatches a nudge instruction through the same gated path as every other
 * command. Active missions (output still moving) are left alone.
 *
 * Pure sweep + injectable-timer driver, so both are unit-tested without real
 * panes or real time.
 */

export const DEFAULT_CHECKIN_NUDGE =
  "[정기 체크인] 현재 진행 상황을 한 줄로 보고하세요. 막혀 있다면 무엇이 막혔는지와 필요한 도움을 말한 뒤, 가능한 작업을 계속하세요.";

export type CheckInTarget = {
  missionId: string;
  /** capture the pane's latest output preview (gated in the runtime) */
  capture: () => Promise<string>;
  /** dispatch a nudge instruction to the pane (gated in the runtime) */
  nudge: (message: string) => Promise<void>;
};

export type CheckInRow = {
  missionId: string;
  status: "active" | "stalled" | "capture_failed" | "nudge_failed";
  nudged: boolean;
};

export type CheckInState = {
  /** last seen output preview per mission, compared across sweeps */
  lastOutput: ReadonlyMap<string, string>;
};

export function createCheckInState(): CheckInState {
  return { lastOutput: new Map() };
}

/**
 * One sweep over the running missions. First sighting of a mission only
 * records its output (no nudge — we cannot know it is stalled yet); identical
 * output on a later sweep means stalled -> nudge. Capture failures are
 * reported but never nudged (the pane may be gone).
 */
export async function runCheckInSweep(input: {
  targets: ReadonlyArray<CheckInTarget>;
  state: CheckInState;
  nudgeMessage?: string;
}): Promise<{ state: CheckInState; rows: CheckInRow[] }> {
  const message = input.nudgeMessage ?? DEFAULT_CHECKIN_NUDGE;
  const nextOutput = new Map(input.state.lastOutput);
  const rows: CheckInRow[] = [];

  for (const target of input.targets) {
    let output: string;
    try {
      output = await target.capture();
    } catch {
      rows.push({ missionId: target.missionId, status: "capture_failed", nudged: false });
      continue;
    }

    const previous = nextOutput.get(target.missionId);
    nextOutput.set(target.missionId, output);
    if (previous === undefined || previous !== output) {
      rows.push({ missionId: target.missionId, status: "active", nudged: false });
      continue;
    }

    try {
      await target.nudge(message);
      rows.push({ missionId: target.missionId, status: "stalled", nudged: true });
    } catch {
      rows.push({ missionId: target.missionId, status: "nudge_failed", nudged: false });
    }
  }

  return { state: { lastOutput: nextOutput }, rows };
}

export type CheckInTimers = {
  setInterval: (handler: () => void, ms: number) => unknown;
  clearInterval: (handle: unknown) => void;
};

/**
 * Fire `tick` every `intervalMs` until stopped. Overlapping ticks are skipped
 * (a slow sweep never stacks). Timers are injectable for tests.
 */
export function startCheckInLoop(input: {
  intervalMs: number;
  tick: () => Promise<void>;
  timers?: CheckInTimers;
}): { stop: () => void } {
  const timers = input.timers ?? {
    setInterval: (handler, ms) => globalThis.setInterval(handler, ms),
    clearInterval: (handle) => globalThis.clearInterval(handle as Parameters<typeof globalThis.clearInterval>[0]),
  };
  let inFlight = false;
  const handle = timers.setInterval(() => {
    if (inFlight) return;
    inFlight = true;
    void input
      .tick()
      .catch(() => {
        // a failed sweep must not kill the loop; the next interval retries
      })
      .finally(() => {
        inFlight = false;
      });
  }, input.intervalMs);
  return { stop: () => timers.clearInterval(handle) };
}
