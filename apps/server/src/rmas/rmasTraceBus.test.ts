import { describe, expect, it } from "vitest";
import type { EventEnvelope, RmasTraceEvent } from "@ai-orchestrator/protocol";
import { RmasTraceBus } from "./rmasTraceBus";
import type { SseSession } from "../events/sseSession.js";

/** Capture writeEvent calls without fs/sockets. */
function fakeSession() {
  const writes: Array<{ event: string; payload: unknown }> = [];
  const session = {
    writeEvent: (event: string, payload: unknown) => writes.push({ event, payload }),
  } as unknown as SseSession;
  return { session, writes };
}

function envelope(type: string, payload: unknown, createdAt = "2026-07-09T00:00:00.000Z"): EventEnvelope {
  return {
    id: `event_${type}_${createdAt}`,
    sessionId: "rmas_run_1",
    type,
    payload,
    createdAt,
    source: "server",
    sourceTrust: "trusted",
    redacted: true,
  };
}

describe("RmasTraceBus", () => {
  it("routes an rmas.* envelope only to that run's subscribers", () => {
    const bus = new RmasTraceBus();
    const a = fakeSession();
    const b = fakeSession();
    bus.subscribe("run_1", a.session);
    bus.subscribe("run_2", b.session);

    bus.publish("run_1", [envelope("rmas.run.started", {})]);

    expect(a.writes).toHaveLength(1);
    expect(a.writes[0]!.event).toBe("rmas.trace");
    expect((a.writes[0]!.payload as RmasTraceEvent).type).toBe("rmas.run.started");
    expect((a.writes[0]!.payload as RmasTraceEvent).runId).toBe("run_1");
    expect(b.writes).toHaveLength(0); // never leaks to another run's stream
  });

  it("stops delivery after unsubscribe and drops empty run sets", () => {
    const bus = new RmasTraceBus();
    const a = fakeSession();
    bus.subscribe("run_1", a.session);
    bus.unsubscribe("run_1", a.session);
    expect(bus.runCount).toBe(0);

    bus.publish("run_1", [envelope("rmas.run.started", {})]);
    expect(a.writes).toHaveLength(0);
  });

  it("never puts raw secrets on the wire (agent message preview is redacted)", () => {
    const bus = new RmasTraceBus();
    const a = fakeSession();
    bus.subscribe("run_1", a.session);

    bus.publish("run_1", [
      envelope("rmas.agent.message", {
        slotId: "a1",
        name: "작업자",
        kind: "producer",
        iteration: 1,
        content: "leak sk-abcdefgh12345678 in output",
      }),
    ]);

    const payload = a.writes[0]!.payload as RmasTraceEvent;
    expect(JSON.stringify(payload)).not.toContain("sk-abcdefgh12345678");
    expect(payload.contentPreview).toContain("[redacted]");
  });

  it("ignores non-log envelopes so stream == snapshot (rmas.agent.started / rmas.tokens.tallied)", () => {
    const bus = new RmasTraceBus();
    const a = fakeSession();
    bus.subscribe("run_1", a.session);
    bus.publish("run_1", [
      envelope("rmas.agent.started", { slotId: "a1", name: "P", kind: "planner", iteration: 1 }),
      envelope("rmas.tokens.tallied", { input: 1, output: 1, total: 2 }),
    ]);
    expect(a.writes).toHaveLength(0);
  });
});
