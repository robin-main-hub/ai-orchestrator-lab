import type { AgentExpression } from "./types/agent-expressions";

export function useAgentExpression({
  isActive,
  isTyping,
  lastMessageSentiment,
  taskStatus,
}: {
  isActive: boolean;
  isTyping?: boolean;
  lastMessageSentiment?: "positive" | "negative" | "neutral";
  taskStatus?: "pending" | "running" | "success" | "error";
}): AgentExpression {
  if (taskStatus === "error") return "error";
  if (taskStatus === "success") return "success";
  if (isTyping) return "thinking";
  if (isActive || taskStatus === "running") return "speaking";
  if (lastMessageSentiment === "positive") return "agreeing";
  if (lastMessageSentiment === "negative") return "disagreeing";
  return "neutral";
}
