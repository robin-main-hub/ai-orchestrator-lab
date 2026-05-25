import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  CornerDownLeft,
  Search,
} from "lucide-react";
import { cn } from "../lib/utils";

/**
 * Stage 2-4 Global Command Palette — ⌘K.
 *
 * Applies docs/design-decisions.md §6 (verb-first command grammar +
 * 10-priority shortcut set) and §10 (Command Palette migration
 * stage, low Codex conflict risk).
 *
 * The palette is a global overlay opened via ⌘K. Commands follow the
 * grammar `verb + object + target` and are grouped by verb category
 * so the user can scan by intent (Switch → mode, Open → panel,
 * Memory → memento, etc.).
 *
 * Keyboard model inside the palette:
 *   - Type to filter (matches label / verb / object substring)
 *   - ↑ / ↓ to move the highlight
 *   - Enter to execute
 *   - Esc to close
 *
 * The component is intentionally presentation-only. Host wires
 * actual mode switching / drawer opening / memory actions via the
 * `commands` prop. Host also owns the ⌘K listener through
 * `useGlobalShortcuts` (sibling file).
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
  placeholder = "verb + object + target  (예: open memento, switch debate, approve next)",
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset on open
  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      // Focus the input on next tick so the overlay is mounted first.
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
      // tokenized substring match — every token must appear
      return q.split(/\s+/).every((token) => haystack.includes(token));
    });
  }, [commands, query]);

  // Clamp activeIndex when filter changes
  useEffect(() => {
    if (activeIndex >= filtered.length) {
      setActiveIndex(filtered.length === 0 ? 0 : filtered.length - 1);
    }
  }, [activeIndex, filtered.length]);

  // Group by verb (preserves insertion order from `commands`)
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
      className="command-palette__overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
    >
      <div className="command-palette__panel" onKeyDown={handleKeyDown}>
        <div className="command-palette__input-row">
          <Search size={14} />
          <input
            aria-label="Command search"
            className="command-palette__input"
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            placeholder={placeholder}
            ref={inputRef}
            type="text"
            value={query}
          />
          <kbd className="command-palette__esc">esc</kbd>
        </div>

        <div className="command-palette__list">
          {filtered.length === 0 ? (
            <p className="command-palette__empty">매칭되는 명령이 없습니다.</p>
          ) : (
            groups.map(([verb, entries]) => (
              <section className="command-palette__group" key={verb}>
                <header className="command-palette__group-head">{verb}</header>
                {entries.map((entry) => {
                  const globalIndex = filtered.indexOf(entry);
                  const isActive = globalIndex === activeIndex;
                  return (
                    <button
                      aria-selected={isActive}
                      className={cn(
                        "command-palette__row",
                        isActive && "command-palette__row--active",
                      )}
                      key={entry.id}
                      onClick={() => {
                        entry.run();
                        onClose();
                      }}
                      onMouseEnter={() => setActiveIndex(globalIndex)}
                      type="button"
                    >
                      <span className="command-palette__row-verb">{entry.verb}</span>
                      <ArrowRight className="command-palette__row-arrow" size={11} />
                      <span className="command-palette__row-label">{entry.label}</span>
                      {entry.hint ? (
                        <span className="command-palette__row-hint">{entry.hint}</span>
                      ) : null}
                      {entry.shortcut ? (
                        <kbd className="command-palette__row-shortcut">{entry.shortcut}</kbd>
                      ) : null}
                    </button>
                  );
                })}
              </section>
            ))
          )}
        </div>

        <footer className="command-palette__hint-bar">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> 이동
          </span>
          <span>
            <kbd>
              <CornerDownLeft size={10} />
            </kbd>{" "}
            실행
          </span>
          <span>
            <kbd>esc</kbd> 닫기
          </span>
          <span className="command-palette__hint-spacer" />
          <span className="command-palette__hint-grammar">verb · object · target</span>
        </footer>
      </div>
    </div>
  );
}
