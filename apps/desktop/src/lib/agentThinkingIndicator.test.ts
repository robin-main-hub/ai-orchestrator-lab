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
      label: "잠깐 방향 잡는 중",
      narration: "요청을 쪼개고, 필요한 기억과 도구 후보를 고르는 중입니다.",
      steps: [
        { label: "요청 읽기", state: "active" },
        { label: "기억·도구 고르기", state: "pending" },
        { label: "답변 경로 정하기", state: "pending" },
      ],
    });
  });

  it("surfaces a responding indicator while the reply is being written", () => {
    expect(resolveAgentThinkingIndicator("agent_a", { agent_a: "responding" })).toEqual({
      status: "responding",
      label: "답변을 함께 다듬는 중",
      narration: "확인 가능한 내용과 다음 행동만 남기며 답변을 정리하고 있습니다.",
      steps: [
        { label: "응답 초안 받음", state: "done" },
        { label: "맥락·권한 점검", state: "active" },
        { label: "대화에 남길 요약 정리", state: "pending" },
      ],
    });
  });

  it("surfaces tool, tmux, approval, and error states with visible work narration", () => {
    expect(resolveAgentThinkingIndicator("agent_a", { agent_a: "tooling" })?.label).toBe("도구 후보를 고르는 중");
    expect(resolveAgentThinkingIndicator("agent_a", { agent_a: "capturing" })?.steps[1]).toEqual({
      label: "출력 읽기",
      state: "active",
    });
    expect(resolveAgentThinkingIndicator("agent_a", { agent_a: "dispatching" })?.narration).toContain("명령");
    expect(resolveAgentThinkingIndicator("agent_a", { agent_a: "waiting_approval" })?.label).toBe(
      "운영자 승인을 기다리는 중",
    );
    expect(resolveAgentThinkingIndicator("agent_a", { agent_a: "error" })?.steps[0]).toEqual({
      label: "실패 감지",
      state: "done",
    });
  });

  it("only reflects the selected agent, not other busy agents", () => {
    expect(
      resolveAgentThinkingIndicator("agent_a", { agent_a: "idle", agent_b: "responding" }),
    ).toBeNull();
  });
});
