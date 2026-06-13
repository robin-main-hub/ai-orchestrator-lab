import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ControlStripAvailability, ControlStripState } from "@ai-orchestrator/protocol";
import { ControlStrip } from "./ControlStrip";

const availability: ControlStripAvailability = { models: ["claude-opus-4-8"], runners: ["local", "tmux_observation"] };
const state = (over: Partial<ControlStripState> = {}): ControlStripState => ({
  modelId: "claude-opus-4-8",
  mode: "build",
  thinking: "high",
  toolPermission: "read_only",
  runner: "local",
  ...over,
});

describe("ControlStrip", () => {
  it("shows the invariant notes (thinking ≠ permission, build ≠ bypass)", () => {
    const html = renderToStaticMarkup(<ControlStrip state={state()} availability={availability} />);
    expect(html).toContain("권한을 올리지 않는다");
    expect(html).toContain("approval/sandbox를 우회하지 않는다");
    expect(html).toContain("권한 read_only"); // build 모드여도 권한 그대로
  });

  it("marks an unavailable runner as blocked + disables it", () => {
    const html = renderToStaticMarkup(<ControlStrip state={state({ runner: "gvisor" })} availability={availability} />);
    expect(html).toContain("러너 blocked"); // gvisor 미가용 → blocked
    expect(html).toContain("사용 불가");
    expect(html).toContain("실행 안 함"); // 사용 불가 runner → 실행 안 함
  });
});
