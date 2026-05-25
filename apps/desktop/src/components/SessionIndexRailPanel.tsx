import { Database, Pencil, Plus, RefreshCw } from "lucide-react";
import type { Stage20SessionIndexState } from "../runtime/stage20SessionIndex";

export function SessionIndexRailPanel({
  activeSessionId,
  index,
  onCreateSession,
  onRefresh,
  onRenameActiveSession,
  onReplaySession,
}: {
  activeSessionId: string;
  index: Stage20SessionIndexState;
  onCreateSession: () => void;
  onRefresh: () => void;
  onRenameActiveSession: () => void;
  onReplaySession: (sessionId: string) => void;
}) {
  const visibleSessions = index.sessions.slice(0, 3);

  return (
    <section className="mini-panel rail-panel session-index-panel">
      <header>
        <Database size={16} />
        <span>Sessions</span>
        <button className="rail-icon-button" onClick={onCreateSession} title="Create a new session" type="button">
          <Plus size={13} />
        </button>
        <button className="rail-icon-button" onClick={onRenameActiveSession} title="Rename active session" type="button">
          <Pencil size={13} />
        </button>
        <button className="rail-icon-button" onClick={onRefresh} title="Refresh sessions from DGX-02" type="button">
          <RefreshCw size={13} />
        </button>
      </header>
      <div className="session-index-summary">
        <strong>{index.status}</strong>
        <span>DGX-02 rev {index.serverRevision ?? "-"}</span>
      </div>
      <div className="session-index-list">
        {visibleSessions.length === 0 ? (
          <p>DGX-02 session index pending</p>
        ) : (
          visibleSessions.map((session) => (
            <button
              className={session.sessionId === activeSessionId ? "active" : ""}
              key={session.sessionId}
              onClick={() => onReplaySession(session.sessionId)}
              type="button"
            >
              <strong>{session.title ?? session.sessionId}</strong>
              <span>{session.sessionId} / {session.eventCount} events / {session.lastEventType ?? "event"}</span>
            </button>
          ))
        )}
      </div>
    </section>
  );
}
