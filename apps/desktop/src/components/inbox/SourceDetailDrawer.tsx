import { useEffect, useRef } from "react";
import type { PluginSourceHealth } from "../../lib/plugins/pluginManifest";

/**
 * Batch 15 LINE E — read-only detail for a clicked Source Dock row. A typed,
 * primitive-only view of a source row or an evidence candidate. There is NO
 * free-form metadata bag on the plugin contract, so "raw metadata" is exactly
 * these whitelisted generic fields — never a spread of an arbitrary object.
 */
export type SourceDetailItem =
  | {
      kind: "source";
      pluginId: string;
      sourceRef: string;
      title: string;
      category: string;
      status: string;
      observed: boolean;
      health: PluginSourceHealth;
      generatedAt?: string;
    }
  | {
      kind: "evidence";
      pluginId: string;
      sourceRef: string;
      title: string;
      status: "suggested";
      observed: false;
      trust: string;
    };

function fieldsFor(item: SourceDetailItem): ReadonlyArray<[string, string]> {
  const out: Array<[string, string]> = [
    ["pluginId", item.pluginId],
    ["sourceRef", item.sourceRef],
  ];
  if (item.kind === "source") {
    out.push(
      ["category", item.category],
      ["status", item.status],
      ["health", item.health],
      ["observed", String(item.observed)],
    );
    if (item.generatedAt) out.push(["generatedAt", item.generatedAt]);
  } else {
    out.push(
      ["status", item.status],
      ["trust", item.trust],
      ["observed", String(item.observed)],
    );
  }
  return out;
}

/**
 * View-only side drawer. Renders null when nothing is selected (so it adds ZERO
 * DOM — and zero <button> — at mount, preserving the inbox's button-free scans).
 * The close affordance is a role="button" div (NOT a <button>), plus Esc; focus
 * is moved into the drawer on open and restored to the trigger on close.
 *
 * `onClose` MUST be stable (memoized) — the open/focus effect keys on it.
 */
export function SourceDetailDrawer({
  item,
  onClose,
}: {
  item: SourceDetailItem | null;
  onClose: () => void;
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!item) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [item, onClose]);

  if (!item) return null;

  return (
    <aside
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label="source detail"
      tabIndex={-1}
      data-testid="source-detail-drawer"
      data-kind={item.kind}
      className="fixed right-3 top-16 z-50 w-72 rounded-lg border border-white/15 bg-zinc-950/95 p-3 shadow-xl outline-none backdrop-blur"
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {item.kind === "source" ? "Source detail" : "Source evidence detail"} · read-only
        </span>
        <div
          role="button"
          tabIndex={0}
          aria-label="닫기"
          data-testid="source-detail-close"
          onClick={onClose}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onClose();
            }
          }}
          className="cursor-pointer rounded px-1 text-xs text-muted-foreground hover:text-zinc-200"
        >
          ✕
        </div>
      </div>
      <p className="mb-2 truncate text-[12px] font-medium text-zinc-200" data-testid="source-detail-title">
        {item.title}
      </p>
      <dl className="space-y-1">
        {fieldsFor(item).map(([k, v]) => (
          <div
            key={k}
            data-testid={`source-detail-field-${k}`}
            data-field={k}
            className="flex items-center justify-between gap-2 text-[10px]"
          >
            <dt className="uppercase tracking-wide text-muted-foreground/60">{k}</dt>
            <dd className="min-w-0 truncate text-right text-zinc-300">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-[9px] text-muted-foreground/45">view-only · no action</p>
    </aside>
  );
}
