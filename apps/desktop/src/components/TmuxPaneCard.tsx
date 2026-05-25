import { Eye, Loader2, SendHorizontal } from "lucide-react";
import type { AgentVisualSettings, WorkbenchAgent } from "../types";
import { agentRoleLabel } from "../lib/helpers";
import { AgentAvatar } from "./AgentAvatar";

export function TmuxPaneCard({
  busy,
  commandDraft,
  lastOutput,
  onCapture,
  onCommandDraftChange,
  onDispatch,
  pane,
  visual,
}: {
  busy?: "capture" | "dispatch";
  commandDraft?: string;
  lastOutput?: string;
  onCapture?: () => void;
  onCommandDraftChange?: (value: string) => void;
  onDispatch?: () => void;
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
      {onCapture || onDispatch ? (
        <div className="tmux-pane-controls">
          <input
            aria-label={`${pane.title} command preview`}
            onChange={(event) => onCommandDraftChange?.(event.target.value)}
            placeholder="명령 의도"
            value={commandDraft ?? ""}
          />
          <button aria-label={`${pane.title} capture`} disabled={Boolean(busy)} onClick={onCapture} type="button">
            {busy === "capture" ? <Loader2 size={13} /> : <Eye size={13} />}
            <span>읽기</span>
          </button>
          <button aria-label={`${pane.title} dispatch`} disabled={Boolean(busy)} onClick={onDispatch} type="button">
            {busy === "dispatch" ? <Loader2 size={13} /> : <SendHorizontal size={13} />}
            <span>보내기</span>
          </button>
        </div>
      ) : null}
      {lastOutput ? <pre className="tmux-pane-output">{lastOutput}</pre> : null}
    </article>
  );
}
