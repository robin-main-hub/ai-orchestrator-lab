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
      label: "요청을 해석하는 중",
      steps: [
        { label: "요청 해석", state: "active" },
        { label: "Provider 호출 준비", state: "pending" },
        { label: "도구·명령 후보 정리", state: "pending" },
      ],
    });
  });

  it("surfaces a responding indicator while the reply is being written", () => {
    expect(resolveAgentThinkingIndicator("agent_a", { agent_a: "responding" })).toEqual({
      status: "responding",
      label: "답변을 작성하는 중",
      steps: [
        { label: "Provider 응답 수신", state: "done" },
        { label: "마스킹·검증 점검", state: "active" },
        { label: "작업 영수증 저장", state: "pending" },
      ],
    });
  });

  it("only reflects the selected agent, not other busy agents", () => {
    expect(
      resolveAgentThinkingIndicator("agent_a", { agent_a: "idle", agent_b: "responding" }),
    ).toBeNull();
  });
});
