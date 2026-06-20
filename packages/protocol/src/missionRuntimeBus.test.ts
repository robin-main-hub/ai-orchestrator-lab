import { describe, expect, it } from "vitest";
import type { MissionTraceEvent } from "./missionBoard.js";
import { toMissionRuntimeBusEvent } from "./missionRuntimeBus.js";

// toMissionRuntimeBusEvent is the *compressed projection* that flows on the
// lightweight mission.* runtime bus. Its whole reason to exist is to carry only
// ordering/severity/truthStatus and NEVER the disclosure-bearing fields
// (title/summary/payloadPreview/workerId) — EventStorage + the GET trace
// endpoints remain the single source for the full text. This was previously
// 0-ref in tests, so the "preview/secret is never on the bus" invariant was
// unpinned. Pin both the exact field mapping and the non-disclosure guarantee.

function makeTraceEvent(overrides: Partial<MissionTraceEvent> = {}): MissionTraceEvent {
  return {
    id: "evt_1",
    missionId: "mission_42",
    workerId: "worker_7",
    type: "sandbox.exec.completed",
    severity: "success",
    title: "샌드박스 실행 완료",
    summary: "빌드가 통과했습니다 — 토큰 sk-ABCDEF1234567890",
    payloadPreview: "stdout: Bearer abcdefgh12345678 leaked here",
    truthStatus: "observed",
    createdAt: "2026-06-21T00:00:00.000Z",
    ...overrides,
  };
}

describe("toMissionRuntimeBusEvent", () => {
  it("maps exactly the six ordering/severity/truth fields, renaming id→traceEventId and type→eventType", () => {
    const event = makeTraceEvent();
    const bus = toMissionRuntimeBusEvent(event);

    expect(bus.missionId).toBe(event.missionId);
    expect(bus.traceEventId).toBe(event.id); // id is renamed for the projection
    expect(bus.eventType).toBe(event.type); // type is renamed
    expect(bus.severity).toBe(event.severity);
    expect(bus.truthStatus).toBe(event.truthStatus);
    expect(bus.createdAt).toBe(event.createdAt);
  });

  it("carries no disclosure-bearing fields — only the six projection keys, never title/summary/payloadPreview/workerId", () => {
    const bus = toMissionRuntimeBusEvent(makeTraceEvent());

    expect(Object.keys(bus).sort()).toEqual(
      ["createdAt", "eventType", "missionId", "severity", "traceEventId", "truthStatus"].sort(),
    );
    const asRecord = bus as Record<string, unknown>;
    expect(asRecord.title).toBeUndefined();
    expect(asRecord.summary).toBeUndefined();
    expect(asRecord.payloadPreview).toBeUndefined();
    expect(asRecord.workerId).toBeUndefined();
  });

  it("never leaks secret-looking preview/summary text onto the bus even when the trace carries it", () => {
    const event = makeTraceEvent({
      summary: "key sk-DEADBEEF12345678 in summary",
      payloadPreview: "AKIA0123456789ABCD in preview",
      title: "ghp_0123456789abcdef0123",
    });
    const serialized = JSON.stringify(toMissionRuntimeBusEvent(event));

    expect(serialized).not.toContain("sk-DEADBEEF12345678");
    expect(serialized).not.toContain("AKIA0123456789ABCD");
    expect(serialized).not.toContain("ghp_0123456789abcdef0123");
    expect(serialized).not.toContain("preview");
    expect(serialized).not.toContain("summary");
  });

  it("passes severity/truthStatus through unchanged for a warning, non-observed event", () => {
    const bus = toMissionRuntimeBusEvent(
      makeTraceEvent({ type: "zombie.detected", severity: "warning", truthStatus: "planned" }),
    );
    expect(bus.eventType).toBe("zombie.detected");
    expect(bus.severity).toBe("warning");
    expect(bus.truthStatus).toBe("planned");
  });
});
