import * as Dialog from "@radix-ui/react-dialog";
import { Keyboard, X } from "lucide-react";
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
  { keys: ["⌘", "K"], label: "전역 명령 팔레트", priority: "핵심" },
  { keys: ["⌘", "I"], label: "오케스트레이터 호출", priority: "핵심" },
  { keys: ["⌘", "1"], label: "Conversation 모드 전환", priority: "핵심" },
  { keys: ["⌘", "2"], label: "Debate 모드 전환", priority: "핵심" },
  { keys: ["⌘", "3"], label: "Tmux 모드 전환", priority: "핵심" },
  { keys: ["⌘", "⇧", "A"], label: "Control Queue 열기 / 닫기", priority: "핵심" },
  { keys: ["⌘", "⇧", "M"], label: "EvolveMemento — 현재 맥락 기억", priority: "보조" },
  { keys: ["⌘", "⇧", "D"], label: "토론 생성 또는 패널 분할", priority: "보조" },
  { keys: ["⌘", "."], label: "활성 에이전트 중단", priority: "안전" },
  { keys: ["⌘", "⏎"], label: "Selected draft 승인 / 전송", priority: "빈번" },
  { keys: ["Esc"], label: "Overlay 닫기 / focus reset", priority: "보편" },
  { keys: ["?"], label: "이 단축키 도움말", priority: "학습" },
];

export function CheatSheetOverlay({ open, onClose }: CheatSheetOverlayProps) {
  if (!open) return null;

  return (
    <Dialog.Root open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-background/55 backdrop-blur-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[min(72vh,640px)] w-[min(580px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
        {/* Header */}
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-b border-border px-3 py-3">
          <Dialog.Title className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
            <Keyboard className="h-4 w-4" />
            키보드 단축키
          </Dialog.Title>
          <Dialog.Description className="sr-only">
            전역 앱 명령에 대한 키보드 단축키 안내입니다.
          </Dialog.Description>
          <span className="truncate text-[10px] font-mono text-muted-foreground">
            운영 단축키 · 명령 우선 흐름
          </span>
          <Dialog.Close asChild>
            <Button
              aria-label="단축키 도움말 닫기"
              className="h-6 w-6"
              size="icon"
              variant="ghost"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </Dialog.Close>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-card">
              <tr>
                <th className="border-b border-border px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  키
                </th>
                <th className="border-b border-border px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  동작
                </th>
                <th className="border-b border-border px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  우선순위
                </th>
              </tr>
            </thead>
            <tbody>
              {SHORTCUTS.map((row) => (
                <tr
                  className="border-b border-border/40 transition-colors hover:bg-primary/5"
                  key={row.keys.join("-") + row.label}
                >
                  <td className="px-3 py-1.5">
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
                  <td className="px-3 py-1.5 text-xs text-foreground">{row.label}</td>
                  <td className="px-3 py-1.5">
                    <StatusBadge size="sm" variant={priorityBadgeVariant(row.priority)}>
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
          <span>명령 팔레트에서 같은 동작을 검색할 수 있습니다 —</span>
          <kbd className="rounded border border-border bg-card/60 px-1 py-0 font-mono">⌘</kbd>
          <kbd className="rounded border border-border bg-card/60 px-1 py-0 font-mono">K</kbd>
        </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function priorityBadgeVariant(priority: ShortcutRow["priority"]): StatusBadgeVariant {
  switch (priority) {
    case "핵심":
      return "primary";
    case "보조":
      return "success";
    case "안전":
      return "danger";
    case "빈번":
      return "warning";
    case "보편":
    case "학습":
      return "muted";
  }
}
