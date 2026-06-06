import { describe, expect, it } from "vitest";
import { createProductionSmokePlan } from "./productionSmokePlan";

describe("productionSmokePlan", () => {
  it("성숙한 OS 검증에 필요한 10개 smoke 축을 만든다", () => {
    const plan = createProductionSmokePlan({
      includeLiveProvider: false,
      includeVisual: true,
    });

    expect(plan.items).toHaveLength(10);
    expect(plan.items.map((item) => item.id)).toEqual([
      "boot",
      "conversation",
      "agent_memory",
      "control_queue",
      "debate_packet",
      "tmux_recovery",
      "provider_fallback",
      "receipts_search",
      "attachments",
      "visual",
    ]);
    expect(plan.items.find((item) => item.id === "provider_fallback")?.mode).toBe("dry_run");
    expect(plan.commandHints).toContain("pnpm --filter @ai-orchestrator/desktop test");
  });

  it("live provider는 명시 opt-in일 때만 smoke 항목에 표시한다", () => {
    const plan = createProductionSmokePlan({
      includeLiveProvider: true,
      includeVisual: false,
    });

    expect(plan.items.find((item) => item.id === "provider_fallback")?.mode).toBe("live_opt_in");
    expect(plan.items.find((item) => item.id === "visual")?.mode).toBe("manual");
  });
});
