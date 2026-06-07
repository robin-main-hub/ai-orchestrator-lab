import type { AgentActivityStatus } from "../types";

export type AgentThinkingIndicator = {
  status: Extract<AgentActivityStatus, "preparing" | "responding">;
  label: string;
  steps: AgentThinkingStep[];
};

export type AgentThinkingStep = {
  label: string;
  state: "active" | "done" | "pending";
};

/**
 * Decides whether the conversation thread should show a live "the agent is
 * working on a reply" affordance for the currently selected agent.
 *
 * The activity state machine (preparing -> responding -> idle) already exists
 * and drives avatar status dots, but those only attach to messages that are
 * already in the thread. On the first turn — or any time the selected agent
 * has not yet posted — the user gets no feedback while a (potentially multi-
 * second DGX) completion is in flight. This surfaces that pending state at the
 * bottom of the thread so the workbench reads as a live operator surface, not
 * a static mockup.
 *
 * Returns null when there is no selected agent or it is idle.
 */
export function resolveAgentThinkingIndicator(
  selectedAgentId: string | undefined,
  agentActivityById: Record<string, AgentActivityStatus> | undefined,
): AgentThinkingIndicator | null {
  if (!selectedAgentId) return null;
  const activity = agentActivityById?.[selectedAgentId] ?? "idle";
  if (activity === "preparing") {
    return {
      status: "preparing",
      label: "요청을 해석하는 중",
      steps: [
        { label: "요청 해석", state: "active" },
        { label: "공급자 호출 준비", state: "pending" },
        { label: "도구·명령 후보 정리", state: "pending" },
      ],
    };
  }
  if (activity === "responding") {
    return {
      status: "responding",
      label: "답변을 작성하는 중",
      steps: [
        { label: "공급자 응답 수신", state: "done" },
        { label: "마스킹·검증 점검", state: "active" },
        { label: "작업 영수증 저장", state: "pending" },
      ],
    };
  }
  return null;
}
