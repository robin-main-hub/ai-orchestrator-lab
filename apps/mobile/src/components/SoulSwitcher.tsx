import { useEffect } from "react";
import type { MobileSoul } from "../types";

type Props = {
  open: boolean;
  souls: MobileSoul[];
  activeSoulId: string;
  onSelect: (soulId: string) => void;
  onClose: () => void;
};

export function SoulSwitcher({ open, souls, activeSoulId, onSelect, onClose }: Props) {
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
        aria-label="SOUL 전환"
      >
        <div className="drawer__header">
          <div style={{ flex: 1, paddingLeft: 16, fontSize: 17, fontWeight: 600 }}>
            대화 상대 변경
          </div>
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
          {souls.map((soul) => {
            const isActive = soul.id === activeSoulId;
            return (
              <button
                key={soul.id}
                type="button"
                className="drawer__item"
                onClick={() => {
                  onSelect(soul.id);
                  onClose();
                }}
                style={{ alignItems: "center", gap: 12 }}
              >
                <div
                  className="soul-card__avatar"
                  style={{ background: soul.accentColor, width: 36, height: 36, fontSize: 18 }}
                >
                  {soul.avatarEmoji}
                </div>
                <span style={{ flex: 1, textAlign: "left" }}>
                  <span style={{ display: "block" }}>{soul.name}</span>
                  <span style={{ display: "block", fontSize: 12, color: "var(--text-muted)" }}>
                    {soul.tagline}
                  </span>
                </span>
                {isActive ? <span aria-hidden>✓</span> : null}
              </button>
            );
          })}
        </div>
      </aside>
    </>
  );
}
