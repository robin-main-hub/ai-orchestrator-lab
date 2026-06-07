import { describe, expect, it } from "vitest";
import { resolveAgentThinkingIndicator } from "./agentThinkingIndicator";

describe("resolveAgentThinkingIndicator", () => {
  it("returns null when no agent is selected", () => {
    expect(resolveAgentThinkingIndicator(undefined, { agent_a: "preparing" })).toBeNull();
  });

  it("returns null when the selected agent is idle or has no recorded activity", () => {
    expect(resolveAgentThinkingIndicator("agent_a", { agent_a: "idle" })).toBeNull();
    expect(resolveAgentThinkingIndicator("agent_a", {})).toBeNull();
    expect(resolveAgentThinkingIndicator("agent_a", undefined)).toBeNull();
  });

  it("surfaces a preparing indicator while the reply is being prepared", () => {
    expect(resolveAgentThinkingIndicator("agent_a", { agent_a: "preparing" })).toEqual({
      status: "preparing",
      label: "응답 준비 중",
      steps: [
        { label: "기억 조회", state: "active" },
        { label: "도구 후보", state: "pending" },
        { label: "응답 초안", state: "pending" },
      ],
    });
  });

  it("surfaces a responding indicator while the reply is being written", () => {
    expect(resolveAgentThinkingIndicator("agent_a", { agent_a: "responding" })).toEqual({
      status: "responding",
      label: "응답 작성 중",
      steps: [
        { label: "Provider 호출", state: "done" },
        { label: "마스킹 점검", state: "active" },
        { label: "영수증 저장", state: "pending" },
      ],
    });
  });

  it("only reflects the selected agent, not other busy agents", () => {
    expect(
      resolveAgentThinkingIndicator("agent_a", { agent_a: "idle", agent_b: "responding" }),
    ).toBeNull();
  });
});
