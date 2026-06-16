/**
 * Batch 9 LINE A — generic OS event classifier.
 *
 * Maps an EventEnvelope `type` string to a READABLE, generic work-like category.
 * Best-effort + deterministic: ordered substring rules over the lowercased type,
 * unknown stays unknown. NO ERP/domain/domain logic — these are OS-core categories
 * only. Pure: no side effect, no Date.now, no I/O.
 */
export type EventCategory =
  | "failure"
  | "learning"
  | "runner"
  | "approval"
  | "memory"
  | "project"
  | "system"
  | "unknown";

/** The categories surfaced in the UI (excludes "unknown" for filters/legends). */
export const EVENT_CATEGORIES: ReadonlyArray<EventCategory> = [
  "failure",
  "learning",
  "runner",
  "approval",
  "memory",
  "project",
  "system",
];

/**
 * Ordered, generic rules. Order matters: learning is checked before failure so a
 * learning-loop "failure_recorded" event reads as learning, not a raw failure.
 */
const RULES: ReadonlyArray<{ category: EventCategory; test: RegExp }> = [
  { category: "learning", test: /learn|hypothes|investigat|loop/ },
  { category: "failure", test: /fail|error|reject|crash/ },
  { category: "approval", test: /approv|permission|consent/ },
  { category: "runner", test: /runner|gate|execut|sandbox|shell/ },
  { category: "memory", test: /memory|remember|evidence|candidate|distill/ },
  { category: "project", test: /project|mission|record|task/ },
  { category: "system", test: /system|session|boot|config|startup|ready|provider|heartbeat/ },
];

/** Classify an event type string into a generic OS category. */
export function classifyEvent(type: string | undefined | null): EventCategory {
  const t = (type ?? "").toLowerCase().trim();
  if (!t) return "unknown";
  for (const rule of RULES) {
    if (rule.test.test(t)) return rule.category;
  }
  return "unknown";
}
