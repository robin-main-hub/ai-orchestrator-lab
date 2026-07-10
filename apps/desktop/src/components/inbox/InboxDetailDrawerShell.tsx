import { useEffect } from "react";
import type { ReactNode, KeyboardEvent as ReactKeyboardEvent } from "react";
import { X, ChevronUp, ChevronDown } from "lucide-react";
import { useDialogFocus } from "../../hooks/useDialogFocus";

/**
 * INB-B — shared v2 shell for the inbox detail drawers (source detail + work-item
 * candidate detail). Unifies the modal chrome so both drawers read as one surface:
 *
 *   - `useDialogFocus` (F1 primitive, U1): initial focus + Tab trap + Escape close
 *     + focus re-capture (focus can't leak to the dimmed background) + restore to
 *     the trigger on close.
 *   - a `--z-dialog` backdrop (U8 modal 2단 규칙): dims + pointer-blocks the
 *     background (the "inert" intent — the F1 hook by design does not touch body
 *     `inert`, so the scrim + focus re-capture provide the isolation here).
 *   - optional prev/next navigation (§6 UX-4 / R1 대안 A): review consecutive rows
 *     WITHOUT the open/close round-trip — both the header ▲/▼ controls and the
 *     document-level ↑/↓ keys walk the underlying list while the drawer stays open.
 *
 * Read-only: every affordance is a `role="button"` div (not a `<button>` — the
 * inbox preserves its button-free scan), carries `data-action-scope="local-detail"`,
 * and has an action-verb-free label. No side effect is ever fired.
 */

export interface InboxDrawerNav {
  /** Human position, e.g. "3 / 12". */
  position: string;
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
}

/** A view-only, keyboard-activatable control rendered as a role="button" div. */
function DrawerControl({
  label,
  testid,
  onActivate,
  disabled,
  className,
  children,
}: {
  label: string;
  testid: string;
  onActivate: () => void;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-disabled={disabled ? "true" : undefined}
      data-action-scope="local-detail"
      data-testid={testid}
      onClick={disabled ? undefined : onActivate}
      onKeyDown={
        disabled
          ? undefined
          : (e: ReactKeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onActivate();
              }
            }
      }
      className={`flex items-center rounded text-muted-foreground transition-colors ${
        disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer hover:text-zinc-200"
      } ${className ?? ""}`}
    >
      {children}
    </div>
  );
}

export function InboxDetailDrawerShell({
  open,
  onClose,
  title,
  testid,
  closeTestid,
  kind,
  width = "w-80",
  ariaLabel,
  nav,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  testid: string;
  closeTestid: string;
  kind?: string;
  width?: string;
  ariaLabel: string;
  nav?: InboxDrawerNav;
  children: ReactNode;
}) {
  const { containerRef } = useDialogFocus<HTMLElement>({ open, onClose });

  // ↑/↓ walk the list while the drawer is open (UX-4). Document-level so it works
  // regardless of which control inside the trapped drawer holds focus; suppressed
  // while typing or with a modifier held.
  const onPrev = nav?.onPrev;
  const onNext = nav?.onNext;
  const hasPrev = nav?.hasPrev ?? false;
  const hasNext = nav?.hasNext ?? false;
  useEffect(() => {
    if (!open || (!onPrev && !onNext)) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (e.key === "ArrowUp" && hasPrev && onPrev) {
        e.preventDefault();
        onPrev();
      } else if (e.key === "ArrowDown" && hasNext && onNext) {
        e.preventDefault();
        onNext();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onPrev, onNext, hasPrev, hasNext]);

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[1px]"
        data-testid={`${testid}-backdrop`}
        aria-hidden="true"
        onClick={onClose}
      />
      <aside
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
        data-testid={testid}
        data-kind={kind}
        className={`fixed right-3 top-16 z-50 ${width} max-h-[calc(100vh-5rem)] overflow-y-auto rounded-lg border border-white/15 bg-zinc-950/95 p-3 shadow-xl outline-none backdrop-blur`}
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
            {title}
          </span>
          <div className="flex shrink-0 items-center gap-1">
            {nav ? (
              <div className="mr-1 flex items-center gap-0.5" data-testid={`${testid}-nav`}>
                <DrawerControl
                  label="이전 항목"
                  testid={`${testid}-prev`}
                  onActivate={nav.onPrev}
                  disabled={!nav.hasPrev}
                  className="border border-white/10 bg-white/[0.03] px-1 py-0.5"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </DrawerControl>
                <span
                  className="px-0.5 text-[12px] tabular-nums text-muted-foreground/70"
                  data-testid={`${testid}-position`}
                >
                  {nav.position}
                </span>
                <DrawerControl
                  label="다음 항목"
                  testid={`${testid}-next`}
                  onActivate={nav.onNext}
                  disabled={!nav.hasNext}
                  className="border border-white/10 bg-white/[0.03] px-1 py-0.5"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </DrawerControl>
              </div>
            ) : null}
            <DrawerControl label="닫기" testid={closeTestid} onActivate={onClose} className="px-1">
              <X className="h-3.5 w-3.5" />
            </DrawerControl>
          </div>
        </div>
        {children}
      </aside>
    </>
  );
}
