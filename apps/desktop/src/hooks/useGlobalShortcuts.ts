import { useEffect } from "react";

/**
 * Stage 2-4 — global keyboard shortcut registry.
 *
 * Wires the 10 high-priority shortcuts from
 * docs/design-decisions.md §6:
 *
 *   ⌘K      Command Palette
 *   ⌘1/2/3/4 Switch mode (conversation / debate / tmux / cockpit)
 *   ⌘⇧A     Control Queue (approval drawer)
 *   ⌘⇧M     EvolveMemento — remember current context
 *   ⌘I      Ask / Invoke Orchestrator
 *   ⌘.      Stop / interrupt
 *   ⌘Enter  Approve selected draft
 *   Esc     Close overlay
 *   ?       Help cheat-sheet
 *
 * The hook is intentionally callback-driven so individual handlers
 * stay in App.tsx where the runtime state lives. Any handler can be
 * omitted; the shortcut simply becomes a no-op.
 *
 * Inputs (text fields, textareas, contentEditable) are skipped for
 * all unmodified keys (`?` typing should still work in inputs) but
 * ⌘-based shortcuts always fire so users can still summon the
 * palette while typing.
 */

export type GlobalShortcutHandlers = {
  onCommandPalette?: () => void;
  onSwitchConversation?: () => void;
  onSwitchDebate?: () => void;
  onSwitchTmux?: () => void;
  onSwitchCockpit?: () => void;
  onControlQueue?: () => void;
  onMementoRemember?: () => void;
  onInvokeOrchestrator?: () => void;
  onStop?: () => void;
  onApprove?: () => void;
  onEscape?: () => void;
  onHelp?: () => void;
};

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}

export function useGlobalShortcuts(handlers: GlobalShortcutHandlers) {
  useEffect(() => {
    function handle(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      const shift = e.shiftKey;
      const inEditable = isEditableTarget(e.target);

      // ⌘ shortcuts fire regardless of focus
      if (mod) {
        const key = e.key.toLowerCase();

        if (key === "k" && !shift) {
          e.preventDefault();
          handlers.onCommandPalette?.();
          return;
        }
        if (key === "1" && !shift) {
          e.preventDefault();
          handlers.onSwitchConversation?.();
          return;
        }
        if (key === "2" && !shift) {
          e.preventDefault();
          handlers.onSwitchDebate?.();
          return;
        }
        if (key === "3" && !shift) {
          e.preventDefault();
          handlers.onSwitchTmux?.();
          return;
        }
        if (key === "4" && !shift) {
          e.preventDefault();
          handlers.onSwitchCockpit?.();
          return;
        }
        if (key === "a" && shift) {
          e.preventDefault();
          handlers.onControlQueue?.();
          return;
        }
        if (key === "m" && shift) {
          e.preventDefault();
          handlers.onMementoRemember?.();
          return;
        }
        if (key === "i" && !shift) {
          e.preventDefault();
          handlers.onInvokeOrchestrator?.();
          return;
        }
        if (key === ".") {
          e.preventDefault();
          handlers.onStop?.();
          return;
        }
        if (key === "enter") {
          // Don't intercept in editable areas (might be a multi-line submit).
          if (!inEditable) {
            e.preventDefault();
            handlers.onApprove?.();
            return;
          }
        }
        return;
      }

      // Unmodified keys
      if (e.key === "Escape") {
        handlers.onEscape?.();
        return;
      }
      if (e.key === "?" && !inEditable) {
        e.preventDefault();
        handlers.onHelp?.();
        return;
      }
    }

    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [handlers]);
}
