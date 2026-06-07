import { useEffect } from "react";
import { Command } from "cmdk";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowRight, CornerDownLeft, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/ui/status-badge";

export type CommandEntry = {
  /** 안정적인 명령 id. */
  id: string;
  /** 짧은 동작 배지. */
  verb: string;
  /** 주 라벨. */
  label: string;
  /** 선택형 한 줄 설명. */
  hint?: string;
  /** 선택형 키보드 단축키. */
  shortcut?: string;
  /** 사용자가 항목을 선택했을 때 실행. */
  run: () => void;
};

export type CommandPaletteProps = {
  open: boolean;
  onClose: () => void;
  commands: CommandEntry[];
  placeholder?: string;
};

export function CommandPalette({
  open,
  onClose,
  commands,
  placeholder = "명령 검색... (예: 토론 전환, 다음 승인, 기억 열기)",
}: CommandPaletteProps) {
  
  // Dialog가 대부분 처리하지만, 안전하게 ESC 닫기를 한 번 더 보장한다.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  // 동작별로 묶어 스캔하기 쉽게 보여준다.
  const grouped = commands.reduce((acc, entry) => {
    const list = acc.get(entry.verb) ?? [];
    list.push(entry);
    acc.set(entry.verb, list);
    return acc;
  }, new Map<string, CommandEntry[]>());

  const groups = Array.from(grouped.entries());

  return (
    <Dialog.Root open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay 
          className="fixed inset-0 z-50 bg-background/55 backdrop-blur-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" 
        />
        <Dialog.Content 
          onCloseAutoFocus={(e) => {
            const mainContainer = document.getElementById("main-container");
            if (mainContainer) {
              e.preventDefault();
              mainContainer.focus();
            }
          }}
          className="fixed left-1/2 top-[12vh] z-50 w-[min(512px,calc(100vw-32px))] -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-card shadow-2xl p-0 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
          aria-label="명령 팔레트 모달"
        >
          <Dialog.Title className="sr-only">명령 팔레트</Dialog.Title>
          <Dialog.Description className="sr-only">
            작업공간 명령을 검색하고 실행합니다.
          </Dialog.Description>
          <Command 
            className="flex flex-col overflow-hidden" 
            label="전역 명령 팔레트"
            onKeyDown={(e) => {
              // Escape is handled by Dialog.Content wrapper, but if any propagation happens:
              if (e.key === "Escape") {
                onClose();
              }
            }}
          >
            {/* 입력 행 */}
            <div className="flex h-12 items-center gap-2.5 border-b border-border px-4">
              <Search className="h-5 w-5 shrink-0 text-muted-foreground/75" />
              <Command.Input 
                autoFocus
                placeholder={placeholder}
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
              <kbd className="rounded border border-border bg-muted/50 px-1.5 py-0.5 text-[10px] font-mono font-medium text-muted-foreground">
                ESC
              </kbd>
            </div>

            {/* 목록 영역 */}
            <Command.List className="max-h-80 overflow-y-auto p-2 scroll-py-1">
              <Command.Empty className="py-6 text-center text-sm text-muted-foreground/80">
                매칭되는 명령이 없습니다.
              </Command.Empty>
              
              {groups.map(([verb, entries]) => (
                <Command.Group 
                  key={verb}
                  heading={
                    <div className="px-2 py-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      {verb}
                    </div>
                  }
                  className="overflow-hidden p-1 mb-2 last:mb-0"
                >
                  {entries.map((entry) => (
                    <Command.Item
                      key={entry.id}
                      onSelect={() => {
                        entry.run();
                        onClose();
                      }}
                      value={`${entry.verb} ${entry.label} ${entry.hint ?? ""}`}
                      className="flex w-full cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm transition-colors text-foreground hover:bg-accent/40 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground aria-selected:bg-accent aria-selected:text-accent-foreground [&_svg]:text-muted-foreground data-[selected=true]:[&_svg]:text-accent-foreground aria-selected:[&_svg]:text-accent-foreground data-[selected=true]:[&_.command-label]:text-accent-foreground aria-selected:[&_.command-label]:text-accent-foreground data-[selected=true]:[&_.command-hint]:text-accent-foreground/70 aria-selected:[&_.command-hint]:text-accent-foreground/70 data-[selected=true]:[&_kbd]:border-accent-foreground/30 data-[selected=true]:[&_kbd]:bg-accent/20 data-[selected=true]:[&_kbd]:text-accent-foreground aria-selected:[&_kbd]:text-accent-foreground"
                    >
                      <StatusBadge 
                        variant="primary" 
                        size="sm" 
                        className="font-mono uppercase shrink-0"
                      >
                        {entry.verb}
                      </StatusBadge>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 transition-transform" />
                      <span className="command-label truncate text-sm text-foreground font-medium">
                        {entry.label}
                      </span>
                      {entry.hint ? (
                        <span className="command-hint truncate text-[11px] text-muted-foreground">
                          {entry.hint}
                        </span>
                      ) : null}
                      {entry.shortcut ? (
                        <kbd className="ml-auto shrink-0 rounded border border-border bg-card/60 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                          {entry.shortcut}
                        </kbd>
                      ) : null}
                    </Command.Item>
                  ))}
                </Command.Group>
              ))}
            </Command.List>

            {/* 하단 도움말 */}
            <div className="flex items-center justify-between border-t border-border px-3 py-2 bg-card/35">
              <span className="text-[10px] text-muted-foreground">
                {commands.length}개 명령 · 동작 · 대상 · 위치
              </span>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <kbd className="rounded border border-border bg-card/60 px-1 py-0.5 font-mono">↑↓</kbd>
                  이동
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="rounded border border-border bg-card/60 px-1 py-0.5 font-mono">
                    <CornerDownLeft className="h-2.5 w-2.5" />
                  </kbd>
                  선택
                </span>
              </div>
            </div>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
