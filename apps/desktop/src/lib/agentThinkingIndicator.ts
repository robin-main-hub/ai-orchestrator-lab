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
      label: "응답 준비 중",
      steps: [
        { label: "기억 조회", state: "active" },
        { label: "도구 후보", state: "pending" },
        { label: "응답 초안", state: "pending" },
      ],
    };
  }
  if (activity === "responding") {
    return {
      status: "responding",
      label: "응답 작성 중",
      steps: [
        { label: "Provider 호출", state: "done" },
        { label: "마스킹 점검", state: "active" },
        { label: "영수증 저장", state: "pending" },
      ],
    };
  }
  return null;
}
