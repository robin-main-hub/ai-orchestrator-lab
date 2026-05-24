import { useEffect } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  onNewConversation: () => void;
  onOpenSettings: () => void;
  onSignOut: () => void;
};

export function OptionDrawer({
  open,
  onClose,
  onNewConversation,
  onOpenSettings,
  onSignOut,
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
        aria-hidden={!open}
        role="dialog"
        aria-label="옵션"
      >
        <div className="drawer__header">
          <button
            type="button"
            className="drawer__close"
            onClick={onClose}
            aria-label="닫기"
          >
            ×
          </button>
        </div>
        <div className="drawer__items">
          <button type="button" className="drawer__item" onClick={onNewConversation}>
            <span>새 대화</span>
            <span aria-hidden>＋</span>
          </button>
          <button type="button" className="drawer__item">
            <span>이전 대화 목록</span>
            <span aria-hidden>›</span>
          </button>
          <div className="drawer__divider" />
          <button type="button" className="drawer__item" onClick={onOpenSettings}>
            <span>설정</span>
            <span aria-hidden>›</span>
          </button>
          <div className="drawer__divider" />
          <button
            type="button"
            className="drawer__item drawer__item--danger"
            onClick={onSignOut}
          >
            <span>로그아웃</span>
          </button>
        </div>
      </aside>
    </>
  );
}
