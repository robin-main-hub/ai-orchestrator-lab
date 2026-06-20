import { describe, expect, it } from "vitest";
import {
  controlModeSchema,
  controlStripStateSchema,
  resolveControlStrip,
  thinkingEffortSchema,
  toolPermissionSchema,
  type ControlStripAvailability,
  type ControlStripState,
} from "./controlStrip.js";

const avail: ControlStripAvailability = { models: ["claude-opus-4-8"], runners: ["local", "tmux_observation"] };
const state = (over: Partial<ControlStripState> = {}): ControlStripState => ({
  modelId: "claude-opus-4-8",
  mode: "build",
  thinking: "high",
  toolPermission: "read_only",
  runner: "local",
  ...over,
});

describe("resolveControlStrip — invariants", () => {
  it("thinking effort does NOT raise permission (read_only stays read_only at high thinking)", () => {
    const low = resolveControlStrip(state({ thinking: "low" }), avail);
    const high = resolveControlStrip(state({ thinking: "high" }), avail);
    expect(low.effectiveToolPermission).toBe("read_only");
    expect(high.effectiveToolPermission).toBe("read_only"); // thinking이 권한 안 올림
    expect(high.invariants.some((n) => n.includes("권한을 올리지 않는다"))).toBe(true);
  });

  it("Build mode does NOT escalate the tool permission", () => {
    const planned = resolveControlStrip(state({ mode: "plan", toolPermission: "read_only" }), avail);
    const built = resolveControlStrip(state({ mode: "build", toolPermission: "read_only" }), avail);
    expect(built.effectiveToolPermission).toBe("read_only"); // build 모드도 권한 그대로
    expect(planned.executionMode).toBe("none"); // plan은 실행 안 함
  });

  it("an unavailable runner resolves to blocked (no fake availability)", () => {
    const resolved = resolveControlStrip(state({ runner: "gvisor" }), avail); // gvisor not in avail
    expect(resolved.runnerAvailable).toBe(false);
    expect(resolved.effectiveRunner).toBe("blocked");
    expect(resolved.executionMode).toBe("none"); // 사용 불가 runner → 실행 안 함
    expect(resolved.invariants.some((n) => n.includes("사용 불가"))).toBe(true);
  });

  it("build + available runner → sandboxed execution (but approval/sandbox still apply)", () => {
    const resolved = resolveControlStrip(state({ mode: "build", runner: "local" }), avail);
    expect(resolved.executionMode).toBe("sandboxed");
    expect(resolved.invariants.some((n) => n.includes("approval/sandbox를 우회하지 않는다"))).toBe(true);
  });
});

// The control-strip vocabulary schemas (mode / thinking / toolPermission) and
// the composite state schema are 0-ref across the test tree, yet they define
// what a valid strip even is — a silent enum widening (e.g. a new permission
// that resolveControlStrip would pass straight through to effectiveTool-
// Permission with no escalation guard) would quietly broaden authority. Pin the
// exact memberships and the state shape. And the resolver's "review" mode plus
// non-read_only pass-through are untested branches: review must never execute,
// and a higher starting permission must pass through unchanged (no escalation
// AND no silent de-escalation).
describe("controlStrip vocabulary schemas", () => {
  it("pins mode / thinking / toolPermission enum memberships", () => {
    expect(controlModeSchema.options).toEqual(["plan", "build", "review"]);
    expect(thinkingEffortSchema.options).toEqual(["low", "medium", "high", "auto"]);
    expect(toolPermissionSchema.options).toEqual(["read_only", "verify", "build", "approval_required"]);
  });

  it("controlStripStateSchema accepts a well-formed state and rejects bad enum / missing fields", () => {
    const ok = controlStripStateSchema.safeParse({
      modelId: "claude-opus-4-8",
      mode: "build",
      thinking: "high",
      toolPermission: "approval_required",
      runner: "local",
    });
    expect(ok.success).toBe(true);
    // wrong mode literal
    expect(controlStripStateSchema.safeParse({ modelId: "m", mode: "ship", thinking: "high", toolPermission: "read_only", runner: "local" }).success).toBe(false);
    // missing runner
    expect(controlStripStateSchema.safeParse({ modelId: "m", mode: "build", thinking: "high", toolPermission: "read_only" }).success).toBe(false);
  });
});

describe("resolveControlStrip — review mode + permission pass-through", () => {
  it("review mode never executes (observation/plan only), like plan", () => {
    const resolved = resolveControlStrip(state({ mode: "review", runner: "local" }), avail);
    expect(resolved.executionMode).toBe("none"); // review !== build → no execution
    expect(resolved.invariants.some((n) => n.includes("review"))).toBe(true);
  });

  it("a higher starting toolPermission passes through unchanged — no escalation and no silent de-escalation", () => {
    for (const permission of toolPermissionSchema.options) {
      const resolved = resolveControlStrip(state({ mode: "build", toolPermission: permission, runner: "local" }), avail);
      expect(resolved.effectiveToolPermission).toBe(permission);
    }
  });
});
