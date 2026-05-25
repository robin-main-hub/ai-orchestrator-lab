import { useState } from "react";
import { ChevronRight, X } from "lucide-react";
import type { WindowAuditItem, WindowAuditStatus } from "../types";

const dismissedChecklistStorageKey = "ai-orchestrator.dismissed-window-checklists";

export function auditStatusLabel(status: WindowAuditStatus) {
  const labels: Record<WindowAuditStatus, string> = {
    blocked: "차단",
    partial: "보강",
    ready: "준비",
  };

  return labels[status];
}

function readDismissedChecklists() {
  if (typeof window === "undefined") {
    return new Set<string>();
  }

  try {
    const value = window.localStorage.getItem(dismissedChecklistStorageKey);
    const parsed = value ? JSON.parse(value) : [];
    return new Set<string>(Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : []);
  } catch {
    return new Set<string>();
  }
}

function writeDismissedChecklists(dismissed: Set<string>) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(dismissedChecklistStorageKey, JSON.stringify(Array.from(dismissed)));
}

export function WindowChecklist({ items, title }: { items: WindowAuditItem[]; title: string }) {
  const [collapsed, setCollapsed] = useState(true);
  const [dismissed, setDismissed] = useState(readDismissedChecklists);
  const readyCount = items.filter((item) => item.status === "ready").length;
  const partialCount = items.filter((item) => item.status === "partial").length;
  const blockedCount = items.filter((item) => item.status === "blocked").length;
  const hasAttention = items.some((item) => item.status !== "ready");
  const dismissalKey = `${title}:${readyCount}/${items.length}:${partialCount}:${blockedCount}`;

  if (!hasAttention || dismissed.has(dismissalKey)) {
    return null;
  }

  function dismissChecklist() {
    setDismissed((current) => {
      const next = new Set(current);
      next.add(dismissalKey);
      writeDismissedChecklists(next);
      return next;
    });
  }

  return (
    <section
      className={`window-checklist ${collapsed ? "collapsed" : ""} ${hasAttention ? "needs-attention" : ""}`}
      aria-label={`${title} completeness checklist`}
    >
      <div className="window-checklist-head">
        <button
          aria-expanded={!collapsed}
          className="window-checklist-expand"
          onClick={() => setCollapsed((current) => !current)}
          type="button"
        >
          <strong>{title}</strong>
          <span>
            {readyCount}/{items.length}
          </span>
          <ChevronRight className="window-checklist-toggle" size={13} />
        </button>
        <button aria-label={`${title} 숨기기`} className="window-checklist-dismiss" onClick={dismissChecklist} type="button">
          <X size={12} />
        </button>
      </div>
      {!collapsed ? (
        <div className="window-checklist-list">
          {items.map((item) => (
            <article className={item.status} key={item.id}>
              <div>
                <strong>{item.label}</strong>
                <p>{item.detail}</p>
              </div>
              <em>{auditStatusLabel(item.status)}</em>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
