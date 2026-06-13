import { describe, expect, it } from "vitest";
import type { EventEnvelope, MissionTraceEvent } from "@ai-orchestrator/protocol";
import { MissionTraceBus } from "./missionTraceBus";
import { createMissionStore } from "./missionStore";
import type { SseSession } from "../events/sseSession.js";

/** writeEvent를 캡처하는 가짜 SSE 세션 — fs/소켓 없이 라우팅을 검증한다. */
function fakeSession() {
  const writes: Array<{ event: string; payload: unknown }> = [];
  const session = {
    writeEvent: (event: string, payload: unknown) => writes.push({ event, payload }),
  } as unknown as SseSession;
  return { session, writes };
}

function envelope(type: string, payload: unknown, createdAt = "2026-06-13T00:00:00.000Z"): EventEnvelope {
  return {
    id: `event_${type}_${createdAt}`,
    sessionId: "mission_1",
    type,
    payload,
    createdAt,
    source: "server",
    sourceTrust: "trusted",
    redacted: true,
  };
}

const CREATED = envelope("mission.created", {
  missionId: "mission_1",
  title: "테트리스",
  goal: "g",
  truthStatus: "planned",
  createdBy: "kurumi",
});

describe("MissionTraceBus", () => {
  it("routes a mission.* envelope only to that mission's subscribers", () => {
    const bus = new MissionTraceBus();
    const a = fakeSession();
    const b = fakeSession();
    bus.subscribe("mission_1", a.session);
    bus.subscribe("mission_2", b.session);

    bus.publish("mission_1", [CREATED]);

    expect(a.writes).toHaveLength(1);
    expect(a.writes[0]!.event).toBe("mission.trace");
    expect((a.writes[0]!.payload as MissionTraceEvent).type).toBe("mission.created");
    expect(b.writes).toHaveLength(0); // 다른 미션 스트림에 새지 않는다
  });

  it("stops delivery after unsubscribe and drops empty mission sets", () => {
    const bus = new MissionTraceBus();
    const a = fakeSession();
    bus.subscribe("mission_1", a.session);
    bus.unsubscribe("mission_1", a.session);
    expect(bus.missionCount).toBe(0);

    bus.publish("mission_1", [CREATED]);
    expect(a.writes).toHaveLength(0);
  });

  it("never puts raw secrets on the wire (verification preview is redacted)", () => {
    const bus = new MissionTraceBus();
    const a = fakeSession();
    bus.subscribe("mission_1", a.session);

    bus.publish("mission_1", [
      envelope("mission.verification.recorded", {
        missionId: "mission_1",
        observedDowngraded: false,
        report: {
          id: "v1",
          missionId: "mission_1",
          verifierAgentId: "agent_verifier",
          status: "failed",
          checks: [{ id: "c1", command: "tsc", status: "failed", summary: "leak sk-abcdefgh12345678", startedAt: "t" }],
          artifactIds: [],
          observed: false,
          createdAt: "2026-06-13T00:20:00.000Z",
        },
      }),
    ]);

    const payload = a.writes[0]!.payload as MissionTraceEvent;
    expect(payload.payloadPreview).toContain("[redacted]");
    expect(JSON.stringify(payload)).not.toContain("sk-abcdefgh12345678");
  });

  it("ignores envelopes with no trace mapping (mission.closed)", () => {
    const bus = new MissionTraceBus();
    const a = fakeSession();
    bus.subscribe("mission_1", a.session);
    bus.publish("mission_1", [envelope("mission.closed", { missionId: "mission_1", status: "merged" })]);
    expect(a.writes).toHaveLength(0);
  });
});

describe("mission store onEventsCommitted hook", () => {
  it("fires the observation hook for every committed mission event (L1 wiring)", async () => {
    const events: EventEnvelope[] = [];
    const committed: Array<{ missionId: string; types: string[] }> = [];
    const store = createMissionStore({
      loadEvents: async () => [...events],
      appendEvents: async (_sessionId, envelopes) => {
        for (const e of envelopes) if (!events.some((x) => x.id === e.id)) events.push(e);
      },
      onEventsCommitted: (missionId, envelopes) => {
        committed.push({ missionId, types: envelopes.map((e) => e.type) });
      },
      now: () => "2026-06-13T00:00:00.000Z",
    });

    await store.create({
      id: "mission_1",
      title: "t",
      goal: "g",
      truthStatus: "planned",
      createdBy: "desktop",
      workers: [{ agentId: "agent_builder", role: "builder", displayName: "B", soulMode: "summary", configSource: "internal" }],
    });

    expect(committed).toHaveLength(1);
    expect(committed[0]!.missionId).toBe("mission_1");
    expect(committed[0]!.types).toContain("mission.created");
    expect(committed[0]!.types).toContain("mission.worker.assigned");
  });

  it("does not throw when the hook itself throws (broadcast is best-effort)", async () => {
    const events: EventEnvelope[] = [];
    const store = createMissionStore({
      loadEvents: async () => [...events],
      appendEvents: async (_sessionId, envelopes) => {
        for (const e of envelopes) events.push(e);
      },
      onEventsCommitted: () => {
        throw new Error("subscriber blew up");
      },
      now: () => "2026-06-13T00:00:00.000Z",
    });

    await expect(
      store.create({ id: "mission_1", title: "t", goal: "g", truthStatus: "planned", createdBy: "desktop", workers: [] }),
    ).resolves.toBeDefined();
  });
});
