import { useState } from "react";
import { ChevronRight } from "lucide-react";
import type { WindowAuditItem, WindowAuditStatus } from "../types";

export function auditStatusLabel(status: WindowAuditStatus) {
  const labels: Record<WindowAuditStatus, string> = {
    blocked: "잠금",
    partial: "보강",
    ready: "준비",
  };

  return labels[status];
}

export function WindowChecklist({ items, title }: { items: WindowAuditItem[]; title: string }) {
  const [collapsed, setCollapsed] = useState(true);
  const readyCount = items.filter((item) => item.status === "ready").length;
  const hasAttention = items.some((item) => item.status !== "ready");

  return (
    <section
      className={`window-checklist ${collapsed ? "collapsed" : ""} ${hasAttention ? "needs-attention" : ""}`}
      aria-label={`${title} completeness checklist`}
    >
      <button
        aria-expanded={!collapsed}
        className="window-checklist-head"
        onClick={() => setCollapsed((current) => !current)}
        type="button"
      >
        <strong>{title}</strong>
        <span>
          {readyCount}/{items.length}
        </span>
        <ChevronRight className="window-checklist-toggle" size={13} />
      </button>
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
