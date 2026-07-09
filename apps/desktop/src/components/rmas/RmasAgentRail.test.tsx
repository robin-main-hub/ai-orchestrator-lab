import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ProviderProfile, RmasAgentSlotConfig } from "@ai-orchestrator/protocol";
import { RmasAgentRail } from "./RmasAgentRail";

const providers: ProviderProfile[] = [
  { id: "provider_dgx02_vllm", name: "DGX vLLM", kind: "openai", enabled: true, tags: [], trustLevel: "trusted" },
];

const agents: RmasAgentSlotConfig[] = [
  { id: "s1", name: "Planner", kind: "planner", providerProfileId: "provider_dgx02_vllm", modelId: "m", systemPrompt: "", enabled: true },
  { id: "s2", name: "Critic", kind: "critic", providerProfileId: "provider_dgx02_vllm", modelId: "m", systemPrompt: "", enabled: true },
  { id: "s3", name: "Hidden", kind: "solver", providerProfileId: "provider_dgx02_vllm", modelId: "m", systemPrompt: "", enabled: false },
];

describe("RmasAgentRail", () => {
  it("renders enabled agents with status dots, token counters, and the pattern description", () => {
    const html = renderToStaticMarkup(
      <RmasAgentRail
        agents={agents}
        perAgentStatus={{ s1: "thinking", s2: "done" }}
        providers={providers}
        tokens={{ input: 1200, output: 3400, total: 4600 }}
        pattern="sequential"
      />,
    );
    expect(html).toContain("Planner");
    expect(html).toContain("Critic");
    // disabled slot is not rendered
    expect(html).not.toContain("Hidden");
    // status dots are CSS-driven by data-tone (thinking pulses via .rmas-dot[data-tone="thinking"])
    expect(html).toContain('data-tone="thinking"');
    expect(html).toContain('data-tone="done"');
    // token counters use full-number grouping (count-up starts at the target on first render)
    expect(html).toContain((4600).toLocaleString());
    expect(html).toContain("입력 토큰");
    expect(html).toContain("계획자 → 비평가 → 해결사 순서로 처리");
  });

  it("shows an honest empty state when no agents are enabled", () => {
    const html = renderToStaticMarkup(
      <RmasAgentRail
        agents={[agents[2]!]}
        perAgentStatus={{}}
        providers={providers}
        tokens={{ input: 0, output: 0, total: 0 }}
        pattern="mixture"
      />,
    );
    expect(html).toContain("활성화된 에이전트가 없습니다");
  });
});
