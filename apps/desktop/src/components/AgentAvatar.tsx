import type { AgentVisualSettings, WorkbenchAgent } from "../types";
import { getAgentInitials } from "../lib/helpers";

export function AgentAvatar({
  agent,
  size = "medium",
  visual,
}: {
  agent?: WorkbenchAgent;
  size?: "small" | "medium" | "large";
  visual?: AgentVisualSettings;
}) {
  const label = agent ? getAgentInitials(agent.name) : "AI";
  return (
    <span className={`agent-avatar ${size} ${visual?.avatarDataUrl ? "has-image" : ""}`}>
      {visual?.avatarDataUrl ? <img alt={`${agent?.name ?? "Agent"} avatar`} src={visual.avatarDataUrl} /> : label}
    </span>
  );
}
