import { describe, expect, it, vi } from "vitest";
import type { TmuxPaneRole } from "@ai-orchestrator/protocol";
import { tmuxPaneRoleSchema } from "@ai-orchestrator/protocol";
import {
  applyCapture,
  createLiveTerminalState,
  setPolling,
  setRole,
  startLiveCaptureLoop,
  SWARM_ROLE_LABEL,
  SWARM_ROLES,
} from "./liveTerminal";

const NOW = "2026-06-10T00:00:00.000Z";

describe("liveTerminal state", () => {
  it("capture 성공은 live로, 출력/pane/라인수를 반영", () => {
    let state = createLiveTerminalState({ role: "code", sessionName: "dgx-swarm" });
    state = setPolling(state);
    expect(state.status).toBe("polling");
    state = applyCapture(state, { status: "captured", output: "$ pnpm test\nok", paneId: "%3", lineCount: 2 }, NOW);
    expect(state.status).toBe("live");
    expect(state.output).toContain("pnpm test");
    expect(state.paneId).toBe("%3");
    expect(state.updatedAt).toBe(NOW);
  });

  it("disabled/failed 전이를 구분한다", () => {
    let state = createLiveTerminalState({});
    state = applyCapture(state, { status: "disabled", reason: "send-keys gate off" }, NOW);
    expect(state.status).toBe("disabled");
    state = applyCapture(state, { status: "failed", reason: "session not running" }, NOW);
    expect(state.status).toBe("error");
    expect(state.error).toContain("session");
  });

  it("역할 변경은 이전 pane 잔상을 비운다", () => {
    let state = applyCapture(createLiveTerminalState({}), { status: "captured", output: "old", paneId: "%1" }, NOW);
    state = setRole(state, "qa");
    expect(state.role).toBe("qa");
    expect(state.output).toBe("");
    expect(state.paneId).toBeUndefined();
    expect(state.status).toBe("idle");
  });
});

describe("startLiveCaptureLoop", () => {
  it("즉시 1회 실행 + 주기 반복, 겹침은 스킵", async () => {
    let handler: (() => void) | null = null;
    const timers = {
      setInterval: vi.fn((h: () => void) => {
        handler = h;
        return "h1";
      }),
      clearInterval: vi.fn(),
    };
    let resolve: (() => void) | null = null;
    let ticks = 0;
    const loop = startLiveCaptureLoop({
      intervalMs: 1000,
      timers,
      tick: () =>
        new Promise<void>((r) => {
          ticks += 1;
          resolve = r;
        }),
    });
    expect(ticks).toBe(1); // 즉시 1회
    handler!(); // 겹침 — 아직 안 끝남
    expect(ticks).toBe(1);
    resolve!();
    await Promise.resolve();
    await Promise.resolve();
    handler!();
    expect(ticks).toBe(2);
    loop.stop();
    expect(timers.clearInterval).toHaveBeenCalledWith("h1");
  });
});

// Characterization tests (no behavior change) for the two previously-unasserted
// constant exports SWARM_ROLES and SWARM_ROLE_LABEL. The state/loop blocks above
// drive the reducers but never the swarm pane catalog that the live-terminal UI
// iterates to build its role tabs. Load-bearing:
//   - SWARM_ROLES is the ordered enumeration of every tmux pane role — it must match
//     the protocol tmuxPaneRoleSchema exactly (same members, same order, no dupes), so
//     the UI tab order tracks the protocol and a new pane role can't be silently
//     dropped from the catalog;
//   - SWARM_ROLE_LABEL is a TOTAL Record<TmuxPaneRole, string> with non-empty, distinct
//     Korean labels — every role the catalog lists has a human label, and the two
//     constants stay coupled (same key set).
describe("SWARM_ROLES / SWARM_ROLE_LABEL", () => {
  const paneOptions = tmuxPaneRoleSchema.options as TmuxPaneRole[];

  it("SWARM_ROLES is the full pane-role union in protocol order, with no duplicates", () => {
    expect([...SWARM_ROLES]).toEqual(paneOptions); // same members AND same order
    expect(new Set(SWARM_ROLES).size).toBe(SWARM_ROLES.length);
    for (const role of SWARM_ROLES) {
      expect(tmuxPaneRoleSchema.safeParse(role).success).toBe(true);
    }
  });

  it("SWARM_ROLE_LABEL is a total map over exactly the pane-role union", () => {
    expect(Object.keys(SWARM_ROLE_LABEL).sort()).toEqual([...paneOptions].sort());
  });

  it("gives every pane role a non-empty, distinct label", () => {
    const labels = paneOptions.map((role) => SWARM_ROLE_LABEL[role]);
    for (const label of labels) {
      expect(label.trim().length).toBeGreaterThan(0);
    }
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("keeps the catalog and label table coupled (every listed role is labeled)", () => {
    for (const role of SWARM_ROLES) {
      expect(SWARM_ROLE_LABEL[role]).toBeDefined();
    }
    expect(Object.keys(SWARM_ROLE_LABEL).sort()).toEqual([...SWARM_ROLES].sort());
  });
});
