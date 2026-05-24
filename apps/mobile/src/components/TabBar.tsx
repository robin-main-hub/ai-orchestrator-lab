import type { MobileTab } from "../types";

type Props = {
  active: MobileTab;
  onChange: (tab: MobileTab) => void;
};

const ITEMS: Array<{ key: MobileTab; icon: string; label: string }> = [
  { key: "chat", icon: "💬", label: "채팅" },
  { key: "souls", icon: "🧠", label: "SOUL" },
  { key: "system", icon: "⚙️", label: "시스템" },
  { key: "more", icon: "⋯", label: "더보기" },
];

export function TabBar({ active, onChange }: Props) {
  return (
    <nav className="tabbar" aria-label="주 메뉴">
      {ITEMS.map((item) => {
        const isActive = item.key === active;
        return (
          <button
            key={item.key}
            type="button"
            className={`tabbar__item${isActive ? " tabbar__item--active" : ""}`}
            onClick={() => onChange(item.key)}
            aria-current={isActive ? "page" : undefined}
          >
            <span className="tabbar__icon" aria-hidden>
              {item.icon}
            </span>
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
