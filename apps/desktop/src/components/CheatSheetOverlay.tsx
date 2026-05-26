import { Keyboard, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/ui/button";
import { StatusBadge, type StatusBadgeVariant } from "@/ui/status-badge";

/**
 * Help cheat-sheet overlay (`?` shortcut) — v0 visual.
 *
 * v0 mockup 에는 cheat sheet 자체가 없음 (v0 는 CommandPalette 하나로
 * 모든 진입 통일). 우리는 design-decisions §6 의 10-priority shortcut
 * catalog 를 학습용으로 별도 모달로 분리.
 *
 * Visual language 만 v0 정렬 — Tailwind utility + ui/Button.
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/55 p-4 backdrop-blur-md"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={handleKeyDown}
      role="dialog"
    >
      <div className="flex max-h-[min(72vh,640px)] w-[min(580px,calc(100vw-32px))] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-b border-border px-3 py-3">
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
            <Keyboard className="h-4 w-4" />
            Keyboard Shortcuts
          </span>
          <span className="truncate text-[10px] font-mono text-muted-foreground">
            design-decisions §6 · verb-first grammar
          </span>
          <Button
            aria-label="close cheat sheet"
            className="h-6 w-6"
            onClick={onClose}
            size="icon"
            variant="ghost"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-card">
              <tr>
                <th className="border-b border-border px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Key
                </th>
                <th className="border-b border-border px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Action
                </th>
                <th className="border-b border-border px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Priority
                </th>
              </tr>
            </thead>
            <tbody>
              {SHORTCUTS.map((row) => (
                <tr
                  className="border-b border-border/40 transition-colors hover:bg-primary/5"
                  key={row.keys.join("-") + row.label}
                >
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1 whitespace-nowrap">
                      {row.keys.map((k, i) => (
                        <kbd
                          className="inline-flex min-w-[18px] items-center justify-center rounded border border-border bg-card/60 px-1.5 py-0 text-[10px] font-mono text-muted-foreground"
                          key={`${row.label}-${k}-${i}`}
                        >
                          {k}
                        </kbd>
                      ))}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-foreground">{row.label}</td>
                  <td className="px-3 py-2">
                    <StatusBadge
                      className="font-mono"
                      size="sm"
                      variant={priorityVariant(row.priority)}
                    >
                      {row.priority}
                    </StatusBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-1 border-t border-border px-3 py-2 text-[10.5px] text-muted-foreground">
          <span>Command Palette 에서 같은 액션 검색 가능 —</span>
          <kbd className="rounded border border-border bg-card/60 px-1 py-0 font-mono">⌘</kbd>
          <kbd className="rounded border border-border bg-card/60 px-1 py-0 font-mono">K</kbd>
        </div>
      </div>
    </div>
  );
}

function priorityVariant(p: ShortcutRow["priority"]): StatusBadgeVariant {
  switch (p) {
    case "핵심":
      return "primary";
    case "보조":
      return "success";
    case "안전":
      return "danger";
    case "빈번":
      return "warning";
    case "보편":
      return "muted";
    case "학습":
      return "companion";
    default:
      return "muted";
  }
}
