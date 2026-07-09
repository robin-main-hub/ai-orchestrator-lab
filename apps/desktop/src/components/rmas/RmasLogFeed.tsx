import { useEffect, useRef } from "react";
import type { RmasRunRecord, RmasTraceEvent } from "@ai-orchestrator/protocol";
import { terminalBannerFor } from "./rmasViewModel";

/**
 * Center column: the live run feed. Renders trace events styled by severity —
 * agent utterances (name + iteration + content preview), judge verdicts
 * (판정 수용/보완 필요 + feedback) and iteration dividers, auto-scrolling to the
 * newest (new items fade-slide-in). A terminal banner appears once the run
 * ends; on completion the accepted final output is shown.
 */
export function RmasLogFeed({ trace, record }: { trace: RmasTraceEvent[]; record: RmasRunRecord | null }) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [trace.length]);

  const banner = terminalBannerFor(record);

  return (
    <div className="rmas__feed">
      {banner ? (
        <div className="rmas__banner" data-tone={banner.tone} role="status">
          {banner.title}
          {record?.status === "completed" && record.finalOutput ? (
            <pre className="rmas__final rmas-mono">{record.finalOutput}</pre>
          ) : null}
        </div>
      ) : null}

      <div ref={scrollRef} className="rmas__feed-scroll" aria-label="실행 피드" aria-live="polite">
        {trace.length === 0 ? (
          <p className="rmas__feed-empty">아직 이벤트가 없습니다. 목표를 입력하고 실행하세요.</p>
        ) : (
          <ol className="rmas__feed-list">
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
      <li className="rmas-divider" aria-label={event.title}>
        {event.title}
      </li>
    );
  }

  return (
    <li className="rmas-utterance" data-severity={event.severity}>
      <div className="rmas-utterance__head">
        <span className="rmas-utterance__title">{event.title}</span>
        <span className="rmas-utterance__summary">{event.summary}</span>
      </div>
      {event.contentPreview ? <p className="rmas-utterance__body">{event.contentPreview}</p> : null}
    </li>
  );
}
