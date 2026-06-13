import { describe, expect, it } from "vitest";
import { resolveControlStrip, type ControlStripAvailability, type ControlStripState } from "./controlStrip.js";

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
