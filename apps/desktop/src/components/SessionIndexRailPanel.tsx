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
    <section className="mgmt-mini-panel mgmt-panel session-index-panel">
      <header>
        <Database size={16} />
        <span>세션</span>
        <button className="mgmt-icon-button" onClick={onCreateSession} aria-label="새 세션 만들기" title="새 세션 만들기" type="button">
          <Plus size={13} />
        </button>
        <button className="mgmt-icon-button" onClick={onRenameActiveSession} aria-label="현재 세션 이름 변경" title="현재 세션 이름 변경" type="button">
          <Pencil size={13} />
        </button>
        <button className="mgmt-icon-button" onClick={onRefresh} aria-label="DGX-02 세션 다시 조회" title="DGX-02 세션 다시 조회" type="button">
          <RefreshCw size={13} />
        </button>
      </header>
      <div className="mgmt-session-summary">
        <strong>{index.status}</strong>
        <span>DGX-02 rev {index.serverRevision ?? "-"}</span>
      </div>
      <div className="session-index-list">
        {visibleSessions.length === 0 ? (
          <p>DGX-02 세션 색인 대기 중 · 새로고침으로 다시 조회</p>
        ) : (
          visibleSessions.map((session) => (
            <button
              className={session.sessionId === activeSessionId ? "active" : ""}
              key={session.sessionId}
              onClick={() => onReplaySession(session.sessionId)}
              type="button"
            >
              <strong>{session.title ?? session.sessionId}</strong>
              <span>{session.sessionId} / 이벤트 {session.eventCount}개 / {session.lastEventType ?? "이벤트"}</span>
            </button>
          ))
        )}
      </div>
    </section>
  );
}
