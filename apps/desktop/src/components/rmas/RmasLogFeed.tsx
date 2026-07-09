import { useEffect, useRef } from "react";
import type { RmasRunRecord, RmasTraceEvent, RmasTraceSeverity } from "@ai-orchestrator/protocol";
import { terminalBannerFor } from "./rmasViewModel";

/**
 * Center column: the live run feed. Renders trace events styled by severity —
 * agent messages (name + kind + iteration + content preview), judge verdicts
 * (판정 채택/수정 필요 + feedback), iteration dividers — auto-scrolling to the
 * newest. A terminal banner appears once the run ends; on completion the
 * accepted final output is shown.
 */

const SEVERITY_ACCENT: Record<RmasTraceSeverity, string> = {
  info: "border-l-border",
  success: "border-l-emerald-500",
  warning: "border-l-amber-500",
  error: "border-l-red-500",
};

const BANNER_TONE: Record<"success" | "warning" | "danger", string> = {
  success: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  warning: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  danger: "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400",
};

export function RmasLogFeed({ trace, record }: { trace: RmasTraceEvent[]; record: RmasRunRecord | null }) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [trace.length]);

  const banner = terminalBannerFor(record);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {banner ? (
        <div className={`m-3 rounded-md border px-3 py-2 text-sm font-medium ${BANNER_TONE[banner.tone]}`} role="status">
          {banner.title}
          {record?.status === "completed" && record.finalOutput ? (
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-background/60 p-2 text-xs font-normal text-foreground">
              {record.finalOutput}
            </pre>
          ) : null}
        </div>
      ) : null}

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-2" aria-label="실행 피드" aria-live="polite">
        {trace.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            아직 이벤트가 없습니다. 목표를 입력하고 실행하세요.
          </p>
        ) : (
          <ol className="flex flex-col gap-1.5">
            {trace.map((event) => (
              <FeedRow key={event.id} event={event} />
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function FeedRow({ event }: { event: RmasTraceEvent }) {
  if (event.type === "rmas.iteration.started") {
    return (
      <li className="my-1 flex items-center gap-2 text-xs text-muted-foreground" aria-label={event.title}>
        <span className="h-px flex-1 bg-border" />
        <span className="shrink-0 font-medium">{event.title}</span>
        <span className="h-px flex-1 bg-border" />
      </li>
    );
  }

  return (
    <li className={`rounded-md border-l-2 bg-card/40 px-3 py-2 ${SEVERITY_ACCENT[event.severity]}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-foreground">{event.title}</span>
        <span className="shrink-0 text-[11px] text-muted-foreground">{event.summary}</span>
      </div>
      {event.contentPreview ? (
        <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-snug text-muted-foreground">
          {event.contentPreview}
        </p>
      ) : null}
    </li>
  );
}
