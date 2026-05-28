import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { ApprovalQueueItem } from "@ai-orchestrator/protocol";
import { cn } from "@/lib/utils";

export function InboxApprovalStrip({ queue }: { queue: ApprovalQueueItem[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const pending = queue.filter((q) => q.state === "required").length;
  if (queue.length === 0) return null;
  return (
    <div className="shrink-0 border-t border-border bg-card/30">
      <button
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between px-4 py-2 transition-colors hover:bg-card/60"
        onClick={() => setIsOpen((o) => !o)}
        type="button"
      >
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-foreground">
            Assistant Inbox
          </span>
          <span className="text-[10px] text-muted-foreground">
            {queue.length} tasks / {pending} pending
          </span>
        </div>
        {isOpen ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      {isOpen ? (
        <div className="flex gap-2 overflow-x-auto px-4 pb-3">
          {queue.slice(0, 8).map((item) => (
            <div
              className={cn(
                "flex w-52 shrink-0 flex-col rounded-md border border-border bg-card p-2",
                item.state === "required" && "border-primary/40",
              )}
              key={item.id}
            >
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>{item.requestedBy}</span>
                <span className="font-mono">{item.state}</span>
              </div>
              <p className="mt-1 text-xs font-medium text-foreground line-clamp-1">
                {item.summary}
              </p>
              <p className="mt-0.5 text-[10px] text-muted-foreground line-clamp-2">
                {item.permissions.join(" · ")}
              </p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
