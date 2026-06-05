export type AgentExpression =
  | "neutral"
  | "thinking"
  | "speaking"
  | "agreeing"
  | "disagreeing"
  | "surprised"
  | "focused"
  | "idle"
  | "error"
  | "success";

export interface AgentPortraitSet {
  agentId: string;
  defaultExpression: AgentExpression;
  glowColor: string;
  imageAssetsAvailable?: boolean;
  name: string;
  portraits: Record<AgentExpression, string>;
}
