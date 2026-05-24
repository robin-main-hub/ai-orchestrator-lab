import { useEffect } from "react";

export type MobileSessionEntry = {
  id: string;
  title: string;
  soulId: string;
  lastMessagePreview: string;
  updatedAt: string;
};

type Props = {
  open: boolean;
  sessions: MobileSessionEntry[];
  onSelect: (sessionId: string) => void;
  onNewSession: () => void;
  onClose: () => void;
};

export function SessionListSheet({
  open,
  sessions,
  onSelect,
  onNewSession,
  onClose,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  return (
    <>
      <div
        className={`drawer-overlay${open ? " drawer-overlay--open" : ""}`}
        onClick={onClose}
        aria-hidden={!open}
      />
      <aside
        className={`drawer${open ? " drawer--open" : ""}`}
        style={{ left: 0, right: "auto", transform: open ? "translateX(0)" : "translateX(-100%)" }}
        aria-hidden={!open}
        role="dialog"
        aria-label="이전 대화 목록"
      >
        <div className="drawer__header" style={{ justifyContent: "space-between" }}>
          <button
            type="button"
            className="drawer__close"
            onClick={onClose}
            aria-label="닫기"
          >
            ×
          </button>
          <button
            type="button"
            className="screen__action"
            onClick={() => {
              onNewSession();
              onClose();
            }}
          >
            + 새 대화
          </button>
        </div>
        <div className="drawer__items">
          {sessions.length === 0 ? (
            <div className="screen__empty">아직 대화가 없습니다.</div>
          ) : (
            sessions.map((session) => (
              <button
                key={session.id}
                type="button"
                className="drawer__item"
                onClick={() => {
                  onSelect(session.id);
                  onClose();
                }}
                style={{ flexDirection: "column", alignItems: "flex-start", gap: 4 }}
              >
                <span style={{ fontSize: 15, fontWeight: 600 }}>{session.title}</span>
                <span
                  style={{
                    fontSize: 12,
                    color: "var(--text-muted)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: "100%",
                  }}
                >
                  {session.lastMessagePreview}
                </span>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  {new Date(session.updatedAt).toLocaleString("ko-KR")}
                </span>
              </button>
            ))
          )}
        </div>
      </aside>
    </>
  );
}
