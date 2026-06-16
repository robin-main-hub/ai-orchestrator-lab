import { describe, expect, it } from "vitest";
import {
  RUNNER_SAFE_PRESETS,
  deriveRunnerGateStatus,
  type RunnerGateMode,
} from "./runnerGateStatus";

describe("RUNNER_SAFE_PRESETS", () => {
  it("covers exactly the four safe modes", () => {
    expect(Object.keys(RUNNER_SAFE_PRESETS).sort()).toEqual(
      ["dgx_disabled", "local_read_only", "mock", "opencode_read_only"].sort(),
    );
  });

  it("every preset is read-only", () => {
    for (const preset of Object.values(RUNNER_SAFE_PRESETS)) {
      expect(preset.readOnly).toBe(true);
    }
  });

  it("never mentions --dangerously-skip-permissions anywhere", () => {
    const serialized = JSON.stringify(RUNNER_SAFE_PRESETS);
    expect(serialized).not.toContain("dangerously-skip-permissions");
    expect(serialized.toLowerCase()).not.toContain("skip-permissions");
  });
});

describe("deriveRunnerGateStatus — defaults", () => {
  it("dgx execution disabled by DEFAULT (no flag passed)", () => {
    const s = deriveRunnerGateStatus({ mode: "local_read_only" });
    expect(s.dgxExecutionEnabled).toBe(false);
  });

  it("executor absent by default → observed false", () => {
    const s = deriveRunnerGateStatus({ mode: "opencode_read_only" });
    expect(s.executorPresent).toBe(false);
    expect(s.observed).toBe(false);
  });

  it("dgx_disabled mode is observed:false with default flags", () => {
    const s = deriveRunnerGateStatus({ mode: "dgx_disabled" });
    expect(s.dgxExecutionEnabled).toBe(false);
    expect(s.observed).toBe(false);
    expect(s.reason).toMatch(/게이트/);
  });
});

describe("deriveRunnerGateStatus — mock", () => {
  it("mock is always observed and needs no executor or gate", () => {
    const s = deriveRunnerGateStatus({ mode: "mock" });
    expect(s.observed).toBe(true);
    expect(s.approvalRequired).toBe(false);
    expect(s.reason).toMatch(/시뮬레이션/);
  });
});

describe("deriveRunnerGateStatus — read-only presets", () => {
  const readOnlyModes: RunnerGateMode[] = ["local_read_only", "opencode_read_only"];

  for (const mode of readOnlyModes) {
    it(`${mode}: gate off → observed:false + clear reason`, () => {
      const s = deriveRunnerGateStatus({ mode, dgxExecutionEnabled: false, executorPresent: true });
      expect(s.observed).toBe(false);
      expect(s.reason.length).toBeGreaterThan(0);
      expect(s.reason).toMatch(/게이트/);
    });

    it(`${mode}: gate on but executor missing → observed:false + clear reason`, () => {
      const s = deriveRunnerGateStatus({ mode, dgxExecutionEnabled: true, executorPresent: false });
      expect(s.observed).toBe(false);
      expect(s.reason).toMatch(/executor/);
    });

    it(`${mode}: gate on + executor present → observed:true, still read-only (no approval)`, () => {
      const s = deriveRunnerGateStatus({ mode, dgxExecutionEnabled: true, executorPresent: true });
      expect(s.observed).toBe(true);
      expect(s.approvalRequired).toBe(false);
    });
  }
});

describe("deriveRunnerGateStatus — honesty / invariants", () => {
  it("never reports observed:true when gate off (except mock)", () => {
    const modes: RunnerGateMode[] = ["local_read_only", "opencode_read_only", "dgx_disabled"];
    for (const mode of modes) {
      const s = deriveRunnerGateStatus({ mode, dgxExecutionEnabled: false, executorPresent: true });
      expect(s.observed).toBe(false);
    }
  });

  it("no derived status leaks --dangerously-skip-permissions", () => {
    const modes: RunnerGateMode[] = [
      "mock",
      "local_read_only",
      "opencode_read_only",
      "dgx_disabled",
    ];
    for (const mode of modes) {
      const s = deriveRunnerGateStatus({ mode, dgxExecutionEnabled: true, executorPresent: true });
      expect(JSON.stringify(s)).not.toContain("dangerously-skip-permissions");
    }
  });

  it("preset readOnly flag drives approvalRequired=false for all safe modes", () => {
    const modes: RunnerGateMode[] = [
      "mock",
      "local_read_only",
      "opencode_read_only",
      "dgx_disabled",
    ];
    for (const mode of modes) {
      const s = deriveRunnerGateStatus({ mode, dgxExecutionEnabled: true, executorPresent: true });
      expect(s.approvalRequired).toBe(false);
    }
  });
});
