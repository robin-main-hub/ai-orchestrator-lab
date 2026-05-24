import type { AgentVisualSettings, WorkbenchAgent } from "../types";
import { agentRoleLabel } from "../lib/helpers";
import { AgentAvatar } from "./AgentAvatar";

export function TmuxPaneCard({
  pane,
  visual,
}: {
  pane: {
    id: string;
    roleKey: string;
    title: string;
    role: string;
    state: string;
    agent?: WorkbenchAgent;
    signal: string;
  };
  visual?: AgentVisualSettings;
}) {
  return (
    <article className="tmux-pane-card">
      <header>
        <AgentAvatar agent={pane.agent} size="small" visual={visual} />
        <div>
          <span>{pane.id}</span>
          <strong>{pane.title}</strong>
        </div>
        <em>{pane.state}</em>
      </header>
      <p>{pane.role}</p>
      <div className="tmux-pane-agent-line">
        <strong>{pane.agent ? pane.agent.name : "담당 agent 미정"}</strong>
        <span>{pane.agent ? agentRoleLabel(pane.agent.role) : "future slot"}</span>
        <small>{pane.agent?.modelId ?? "model pending"}</small>
      </div>
      <code>{pane.signal}</code>
    </article>
  );
}
