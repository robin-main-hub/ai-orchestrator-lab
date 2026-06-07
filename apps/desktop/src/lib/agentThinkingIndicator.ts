import type { AgentActivityStatus } from "../types";
import { PUBLIC_WORK_PHASES } from "./publicWorkPhases";

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
        { label: PUBLIC_WORK_PHASES.thinking.label, state: "active" },
        { label: PUBLIC_WORK_PHASES.toolCall.label, state: "pending" },
        { label: PUBLIC_WORK_PHASES.commandGeneration.label, state: "pending" },
      ],
    };
  }
  if (activity === "responding") {
    return {
      status: "responding",
      label: "응답 작성 중",
      steps: [
        { label: PUBLIC_WORK_PHASES.toolCall.label, state: "done" },
        { label: PUBLIC_WORK_PHASES.verification.label, state: "active" },
        { label: PUBLIC_WORK_PHASES.receipt.label, state: "pending" },
      ],
    };
  }
  return null;
}
