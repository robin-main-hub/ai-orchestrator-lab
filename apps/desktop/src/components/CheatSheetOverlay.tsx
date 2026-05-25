import { Keyboard, X } from "lucide-react";

/**
 * Stage 2-4 follow-up — Help cheat-sheet overlay (`?` shortcut).
 *
 * design-decisions.md §6 의 10-priority shortcut 카탈로그를 modal 로
 * 노출. 이전에는 `?` 가 그냥 Command Palette 를 재오픈했지만 그건
 * 학습용으로 부적절 — palette 는 명령 실행 도구지 학습 도구가 아님.
 * 이 overlay 는 "키 → 액션 → 우선순위" 3-열 표로 사용자가 한 화면에
 * 전체 단축키 체계를 학습할 수 있게 함.
 *
 * Presentation-only — 호스트가 `open` / `onClose` 만 관리.
 */

export type CheatSheetOverlayProps = {
  open: boolean;
  onClose: () => void;
};

type ShortcutRow = {
  keys: string[];
  label: string;
  priority: "핵심" | "보조" | "안전" | "빈번" | "보편" | "학습";
};

const SHORTCUTS: ShortcutRow[] = [
  { keys: ["⌘", "K"], label: "Global Command Palette", priority: "핵심" },
  { keys: ["⌘", "I"], label: "Ask / Invoke Orchestrator (현재 context로 AI 호출)", priority: "핵심" },
  { keys: ["⌘", "1"], label: "Conversation 모드 전환", priority: "핵심" },
  { keys: ["⌘", "2"], label: "Debate 모드 전환", priority: "핵심" },
  { keys: ["⌘", "3"], label: "Tmux 모드 전환", priority: "핵심" },
  { keys: ["⌘", "⇧", "A"], label: "Control Queue 열기 / 닫기", priority: "핵심" },
  { keys: ["⌘", "⇧", "M"], label: "EvolveMemento — 현재 맥락 기억", priority: "보조" },
  { keys: ["⌘", "⇧", "D"], label: "Debate 생성 또는 pane split-down", priority: "보조" },
  { keys: ["⌘", "."], label: "Stop / interrupt active agent", priority: "안전" },
  { keys: ["⌘", "⏎"], label: "Selected draft 승인 / 전송", priority: "빈번" },
  { keys: ["Esc"], label: "Overlay 닫기 / focus reset", priority: "보편" },
  { keys: ["?"], label: "이 단축키 도움말", priority: "학습" },
];

export function CheatSheetOverlay({ open, onClose }: CheatSheetOverlayProps) {
  if (!open) return null;

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  }

  return (
    <div
      aria-label="Keyboard shortcut cheat sheet"
      aria-modal="true"
      className="cheat-sheet__overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={handleKeyDown}
      role="dialog"
    >
      <div className="cheat-sheet__panel">
        <header className="cheat-sheet__header">
          <span className="cheat-sheet__title">
            <Keyboard size={14} />
            <strong>Keyboard Shortcuts</strong>
          </span>
          <span className="cheat-sheet__subtitle">design-decisions §6 · verb-first grammar</span>
          <button
            aria-label="close cheat sheet"
            className="cheat-sheet__close"
            onClick={onClose}
            type="button"
          >
            <X size={14} />
          </button>
        </header>

        <table className="cheat-sheet__table">
          <thead>
            <tr>
              <th>Key</th>
              <th>Action</th>
              <th>Priority</th>
            </tr>
          </thead>
          <tbody>
            {SHORTCUTS.map((row) => (
              <tr key={row.keys.join("-") + row.label}>
                <td>
                  <span className="cheat-sheet__key-row">
                    {row.keys.map((k, i) => (
                      <kbd className="cheat-sheet__kbd" key={`${row.label}-${k}-${i}`}>
                        {k}
                      </kbd>
                    ))}
                  </span>
                </td>
                <td className="cheat-sheet__action">{row.label}</td>
                <td>
                  <span className={`cheat-sheet__priority cheat-sheet__priority--${priorityClass(row.priority)}`}>
                    {row.priority}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <footer className="cheat-sheet__footer">
          <span>Command Palette 에서 같은 액션 검색 가능 — </span>
          <kbd className="cheat-sheet__kbd">⌘</kbd>
          <kbd className="cheat-sheet__kbd">K</kbd>
        </footer>
      </div>
    </div>
  );
}

function priorityClass(p: ShortcutRow["priority"]): string {
  // 한글 → CSS-safe 매핑
  const map: Record<ShortcutRow["priority"], string> = {
    핵심: "critical",
    보조: "secondary",
    안전: "safety",
    빈번: "frequent",
    보편: "universal",
    학습: "learning",
  };
  return map[p];
}
