import { classifyEvent, type EventCategory } from "./eventClassification";

/**
 * Batch 9 LINE D — a read-only, WorkItem-LIKE view over generic OS signals.
 *
 * This is NOT full WorkItem automation (no creation, no write, no lifecycle). It
 * just gives the desk a richer, uniform row shape derived from real event-log
 * entries (and, best-effort, project records) so the queue/replay surfaces can
 * show category + source + observed honesty. Pure; no side effect / Date.now / I/O.
 */
export type WorkItemLite = {
  id: string;
  title: string;
  category: EventCategory;
  /** Generic lifecycle hint — "observed" for real events, "suggested" for records. */
  status: string;
  /** Where it came from — the event source, or "project_record". */
  source: string;
  createdAt: string;
  /** Honest observation flag — events are observed facts; records are not written. */
  observed: boolean;
};

type EventLike = { id: string; type: string; createdAt: string; source?: string };
type RecordLike = { missionId: string; title: string };

/** An observed event → a WorkItem-lite row. */
export function workItemFromEvent(e: EventLike): WorkItemLite {
  return {
    id: e.id,
    title: e.type,
    category: classifyEvent(e.type),
    status: "observed",
    source: e.source ?? "event",
    createdAt: e.createdAt,
    observed: true,
  };
}

/** A persisted project record → a WorkItem-lite candidate (honest: not written). */
export function workItemFromRecord(r: RecordLike): WorkItemLite {
  return {
    id: `project-${r.missionId}`,
    title: r.title,
    category: "project",
    status: "suggested",
    source: "project_record",
    createdAt: "",
    observed: false,
  };
}

/**
 * Read-only WorkItem-lite projection from real events (+ optional records),
 * newest first. Pure — never mutates inputs, never fabricates a live row.
 */
export function projectWorkItemsLite(
  events: ReadonlyArray<EventLike> = [],
  records: ReadonlyArray<RecordLike> = [],
): WorkItemLite[] {
  const items = [...events.map(workItemFromEvent), ...records.map(workItemFromRecord)];
  return items.sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));
}
