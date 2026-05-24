import { Database, Pencil, Plus, RefreshCw } from "lucide-react";
import type { Stage20SessionIndexState } from "../runtime/stage20SessionIndex";
import type { WindowAuditItem } from "../types";
import { WindowChecklist } from "./WindowChecklist";

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
  const auditItems: WindowAuditItem[] = [
    {
      id: "session-select",
      label: "세션 선택",
      status: index.sessions.length > 0 ? "ready" : "partial",
      detail: index.sessions.length > 0 ? "DGX-02 인덱스에서 세션을 고르고 즉시 replay합니다." : "DGX-02 세션 인덱스가 아직 비어 있습니다.",
    },
    {
      id: "session-create",
      label: "새 작업 세션",
      status: "ready",
      detail: "맥북 outbox에 먼저 남기고 온라인이면 DGX-02로 동기화합니다.",
    },
    {
      id: "session-rename",
      label: "이름 변경",
      status: activeSessionId ? "ready" : "partial",
      detail: "현재 세션명을 이벤트로 남겨 다른 클라이언트에서도 같은 이름을 봅니다.",
    },
    {
      id: "session-delete",
      label: "삭제/보존",
      status: "blocked",
      detail: "Event Storage 원본 삭제는 아직 막고, forget/tombstone 정책 확정 후 엽니다.",
    },
  ];

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
      <WindowChecklist items={auditItems} title="세션 창 점검" />
    </section>
  );
}
