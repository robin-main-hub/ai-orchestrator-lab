import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, CornerDownLeft, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/ui/status-badge";

/**
 * Command Palette — strict v0 port.
 * source: docs/v0/v0-output/components/shared/command-palette.tsx
 *
 * v0 layout (Dialog overlay):
 *   <Dialog>
 *     <DialogContent border bg-card>
 *       <search row: Search icon + input + ESC kbd>
 *       <list grouped by heading (Quick Actions / Core / Specialists / ...)>
 *       <footer: agents count + ↑↓ / ↵ hints>
 *
 * 우리 데이터 모델은 v0 의 agent-switching 중심과 다름 — 우리는
 * verb-grouped command entries (Switch / Open / Memory / Approve /
 * Help). 그래서:
 *   - v0 의 visual / layout / spacing 그대로
 *   - 우리 commands 가 verb 별로 grouped (v0 의 Quick Actions/Core/
 *     Specialists 와 동일한 group pattern)
 *
 * Stage 2-4 의 host contract (commands[], open, onClose) 0 변경.
 * cmdk package 도입 안 함 — 내장 useState + filter 로 충분.
 */

export type CommandEntry = {
  /** Stable id. */
  id: string;
  /** Short verb chip (Switch / Open / Memory / Approve / Help). */
  verb: string;
  /** Primary label (object + target). */
  label: string;
  /** Optional one-line hint. */
  hint?: string;
  /** Optional keyboard shortcut hint, e.g. "⌘1". */
  shortcut?: string;
  /** Invoked when the user picks this entry. */
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
  placeholder = "Search commands... (예: switch debate, approve next, open memento)",
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      const id = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
    return undefined;
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((entry) => {
      const haystack = `${entry.verb} ${entry.label} ${entry.hint ?? ""}`.toLowerCase();
      return q.split(/\s+/).every((token) => haystack.includes(token));
    });
  }, [commands, query]);

  useEffect(() => {
    if (activeIndex >= filtered.length) {
      setActiveIndex(filtered.length === 0 ? 0 : filtered.length - 1);
    }
  }, [activeIndex, filtered.length]);

  const groups = useMemo(() => {
    const map = new Map<string, CommandEntry[]>();
    for (const entry of filtered) {
      const list = map.get(entry.verb) ?? [];
      list.push(entry);
      map.set(entry.verb, list);
    }
    return Array.from(map.entries());
  }, [filtered]);

  if (!open) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const entry = filtered[activeIndex];
      if (entry) {
        entry.run();
        onClose();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div
      aria-label="Command Palette"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-start justify-center bg-background/55 p-4 pt-[12vh] backdrop-blur-md"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
    >
      <div
        className="flex max-h-[64vh] w-[min(640px,calc(100vw-32px))] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
        onKeyDown={handleKeyDown}
      >
        {/* Search input row */}
        <div className="flex items-center gap-2 border-b border-border px-3 py-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            aria-label="Command search"
            className="flex-1 bg-transparent font-mono text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            placeholder={placeholder}
            ref={inputRef}
            type="text"
            value={query}
          />
          <kbd className="rounded border border-border bg-card/60 px-1.5 py-0.5 text-[10px] font-mono font-medium text-muted-foreground">
            ESC
          </kbd>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              매칭되는 명령이 없습니다.
            </p>
          ) : (
            groups.map(([verb, entries]) => (
              <div className="mb-2" key={verb}>
                <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {verb}
                </div>
                {entries.map((entry) => {
                  const globalIndex = filtered.indexOf(entry);
                  const isActive = globalIndex === activeIndex;
                  return (
                    <button
                      aria-selected={isActive}
                      className={cn(
                        "flex w-full cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-left text-sm transition-colors",
                        isActive
                          ? "bg-primary/10 text-foreground"
                          : "text-foreground hover:bg-card/60",
                      )}
                      key={entry.id}
                      onClick={() => {
                        entry.run();
                        onClose();
                      }}
                      onMouseEnter={() => setActiveIndex(globalIndex)}
                      type="button"
                    >
                      <StatusBadge variant="primary" size="sm" className="font-mono uppercase shrink-0">
                        {entry.verb}
                      </StatusBadge>
                      <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                      <span className="truncate text-sm text-foreground">
                        {entry.label}
                      </span>
                      {entry.hint ? (
                        <span className="truncate text-[11px] text-muted-foreground">
                          {entry.hint}
                        </span>
                      ) : null}
                      {entry.shortcut ? (
                        <kbd className="ml-auto shrink-0 rounded border border-border bg-card/60 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                          {entry.shortcut}
                        </kbd>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border px-3 py-2">
          <span className="text-[10px] text-muted-foreground">
            {commands.length} commands · verb · object · target
          </span>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-border bg-card/60 px-1 py-0.5 font-mono">↑↓</kbd>
              navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-border bg-card/60 px-1 py-0.5 font-mono">
                <CornerDownLeft className="h-2.5 w-2.5" />
              </kbd>
              select
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
