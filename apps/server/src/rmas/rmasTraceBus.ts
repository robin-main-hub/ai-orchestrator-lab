import { rmasTraceEventFromEnvelope, type EventEnvelope } from "@ai-orchestrator/protocol";
import type { SseSession } from "../events/sseSession.js";

/**
 * RmasTraceBus — the RMAS twin of `MissionTraceBus`. When `rmas.*` events commit
 * to EventStorage (L1), it pushes the derived, redacted trace event to the SSE
 * sessions subscribed to that run.
 *
 *   commit → onEventsCommitted → bus.publish(runId, envelopes)
 *          → rmasTraceEventFromEnvelope(pure, redacted) → session.writeEvent
 *
 * Honesty/security (identical to the mission bus):
 *   - no new storage — EventStorage is the single truth, this only derives.
 *   - routing is per-run (not a global broadcast): one run's trace never leaks
 *     into another run's stream.
 *   - only `rmasTraceEventFromEnvelope`'s output goes on the wire — raw content
 *     is redacted (contentPreview passed through redactTracePreview).
 *   - non-log events (rmas.agent.started / rmas.tokens.tallied) map to null and
 *     are dropped, exactly as the snapshot builder omits them (stream == snapshot).
 *
 * The bus needs the FULL envelope (incl. sessionId): rmasTraceEventFromEnvelope
 * derives the runId from sessionId ("rmas_<runId>").
 */
export class RmasTraceBus {
  private readonly byRun = new Map<string, Set<SseSession>>();

  subscribe(runId: string, session: SseSession): void {
    let set = this.byRun.get(runId);
    if (!set) {
      set = new Set();
      this.byRun.set(runId, set);
    }
    set.add(session);
  }

  unsubscribe(runId: string, session: SseSession): void {
    const set = this.byRun.get(runId);
    if (!set) return;
    set.delete(session);
    if (set.size === 0) this.byRun.delete(runId);
  }

  publish(runId: string, envelopes: ReadonlyArray<EventEnvelope>): void {
    const set = this.byRun.get(runId);
    if (!set || set.size === 0) return;
    for (const envelope of envelopes) {
      const traceEvent = rmasTraceEventFromEnvelope(envelope);
      if (!traceEvent) continue;
      for (const session of set) {
        session.writeEvent("rmas.trace", traceEvent);
      }
    }
  }

  /** Number of streams subscribed to a run (observation/tests). */
  subscriberCount(runId: string): number {
    return this.byRun.get(runId)?.size ?? 0;
  }

  get runCount(): number {
    return this.byRun.size;
  }
}

export const rmasTraceBus = new RmasTraceBus();
