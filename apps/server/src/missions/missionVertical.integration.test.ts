import { describe, expect, it } from "vitest";
import type { EventEnvelope } from "@ai-orchestrator/protocol";
import { buildMissionIndexFromEvents } from "./missionIndex";
import { createMissionStore, MissionEventValidationError } from "./missionStore";

function memoryDeps() {
  const events: EventEnvelope[] = [];
  return {
    events,
    deps: {
      loadEvents: async () => [...events],
      appendEvents: async (_sessionId: string, envelopes: EventEnvelope[]) => {
        for (const envelope of envelopes) {
          if (!events.some((existing) => existing.id === envelope.id)) {
            events.push(envelope);
          }
        }
      },
      now: () => "2026-06-25T00:00:00.000Z",
    },
  };
}

const MISSION_A = {
  id: "mission_A",
  title: "Mission A — provider fallback",
  goal: "verify fallback",
  truthStatus: "observed" as const,
  createdBy: "desktop",
  workers: [
    { agentId: "agent_builder", role: "builder" as const, displayName: "Builder", soulMode: "summary" as const, configSource: "internal" as const },
    { agentId: "agent_verifier", role: "verifier" as const, displayName: "Verifier", soulMode: "summary" as const, configSource: "internal" as const },
  ],
};

const MISSION_B = {
  ...MISSION_A,
  id: "mission_B",
  title: "Mission B — unrelated",
};

const ARTIFACT_A = {
  id: "artifact_A",
  missionId: "mission_A",
  kind: "diff" as const,
  summary: "provider fallback diff",
  truthStatus: "observed" as const,
  createdAt: "2026-06-25T00:00:01.000Z",
};

const PASSED_REPORT_A = {
  id: "verify_A",
  missionId: "mission_A",
  verifierAgentId: "agent_verifier",
  status: "passed" as const,
  checks: [{ id: "c1", command: "pnpm test", status: "passed" as const, exitCode: 0, summary: "ok", startedAt: "2026-06-25T00:00:00.000Z" }],
  artifactIds: ["artifact_A"],
  observed: true,
  createdAt: "2026-06-25T00:00:02.000Z",
};

const MERGE_ITEM_A = {
  id: "merge_A",
  missionId: "mission_A",
  branchName: "agent/mission_A",
  status: "queued" as const,
  requiredVerificationReportId: "verify_A",
  reason: "verified",
  queuedAt: "2026-06-25T00:00:03.000Z",
};

describe("mission vertical integration — cross-mission contamination end-to-end", () => {
  it("full lifecycle: create A + B → artifact → verify → merge queue → reload → rebuild, no contamination", async () => {
    const { deps, events } = memoryDeps();
    const store = createMissionStore(deps);

    // 1. create mission A
    await store.create(MISSION_A);
    // 2. create mission B
    await store.create(MISSION_B);

    // 3. mission A에 artifact append
    await store.appendEvent("mission_A", {
      type: "mission.artifact.attached",
      payload: { artifact: ARTIFACT_A },
    });

    // 4. mission A에 verification record
    await store.appendEvent("mission_A", {
      type: "mission.verification.recorded",
      payload: { report: PASSED_REPORT_A },
    });

    // 5. mission A에 merge queue item
    await store.appendEvent("mission_A", {
      type: "mission.merge.queued",
      payload: { item: MERGE_ITEM_A },
    });

    // 6. reload raw events (server-restart simulation)
    const rawEvents = [...events];

    // 7. rebuild materialized missions from raw events
    const rebuilt = buildMissionIndexFromEvents(rawEvents);
    const missionA = rebuilt.find((m) => m.mission.missionId === "mission_A");
    const missionB = rebuilt.find((m) => m.mission.missionId === "mission_B");

    // 8. mission B의 데이터가 mission A에 섞이지 않는지 확인
    expect(missionA).toBeDefined();
    expect(missionB).toBeDefined();
    expect(missionA!.artifacts.map((a) => a.id)).toEqual(["artifact_A"]);
    expect(missionA!.artifacts.every((a) => a.missionId === "mission_A")).toBe(true);
    expect(missionA!.verificationReports.map((r) => r.id)).toEqual(["verify_A"]);
    expect(missionA!.verificationReports.every((r) => r.missionId === "mission_A")).toBe(true);
    expect(missionA!.mergeQueueItems.map((i) => i.id)).toEqual(["merge_A"]);
    expect(missionA!.mergeQueueItems.every((i) => i.missionId === "mission_A")).toBe(true);

    // mission B는 깨끗하다
    expect(missionB!.artifacts).toHaveLength(0);
    expect(missionB!.verificationReports).toHaveLength(0);
    expect(missionB!.mergeQueueItems).toHaveLength(0);

    // 9. observed truth는 실제 observed evidence에서만 유지
    expect(missionA!.verificationReports[0]!.observed).toBe(true);
    expect(missionA!.truthStatus).toBe("observed");

    // merge queue는 observed + passed verification 기반
    expect(missionA!.mergeQueueItems[0]!.requiredVerificationReportId).toBe("verify_A");
    const report = missionA!.verificationReports.find((r) => r.id === "verify_A");
    expect(report?.status).toBe("passed");
    expect(report?.observed).toBe(true);
  });

  it("rejects cross-mission artifact injection and leaves no trace in raw events or replay", async () => {
    const { deps, events } = memoryDeps();
    const store = createMissionStore(deps);
    await store.create(MISSION_A);
    await store.create(MISSION_B);

    const eventCountBefore = events.length;

    // cross-mission artifact injection attempt
    await expect(
      store.appendEvent("mission_A", {
        type: "mission.artifact.attached",
        payload: {
          artifact: { ...ARTIFACT_A, id: "artifact_evil", missionId: "mission_B" },
        },
      }),
    ).rejects.toThrow("artifact missionId mismatch");

    // reject 후 raw event count는 증가하지 않는다
    expect(events.length).toBe(eventCountBefore);

    // replay 후에도 부활하지 않는다
    const rebuilt = buildMissionIndexFromEvents([...events]);
    const missionA = rebuilt.find((m) => m.mission.missionId === "mission_A")!;
    const missionB = rebuilt.find((m) => m.mission.missionId === "mission_B")!;
    expect(missionA.artifacts).not.toContainEqual(expect.objectContaining({ id: "artifact_evil" }));
    expect(missionB.artifacts).not.toContainEqual(expect.objectContaining({ id: "artifact_evil" }));
  });

  it("rejects cross-mission verification report injection and leaves no trace in replay", async () => {
    const { deps, events } = memoryDeps();
    const store = createMissionStore(deps);
    await store.create(MISSION_A);
    await store.create(MISSION_B);

    const eventCountBefore = events.length;

    await expect(
      store.appendEvent("mission_A", {
        type: "mission.verification.recorded",
        payload: {
          report: { ...PASSED_REPORT_A, id: "verify_evil", missionId: "mission_B" },
        },
      }),
    ).rejects.toThrow("verification missionId mismatch");

    expect(events.length).toBe(eventCountBefore);

    const rebuilt = buildMissionIndexFromEvents([...events]);
    const missionA = rebuilt.find((m) => m.mission.missionId === "mission_A")!;
    const missionB = rebuilt.find((m) => m.mission.missionId === "mission_B")!;
    expect(missionA.verificationReports).not.toContainEqual(expect.objectContaining({ id: "verify_evil" }));
    expect(missionB.verificationReports).not.toContainEqual(expect.objectContaining({ id: "verify_evil" }));
  });

  it("rejects cross-mission merge queue item injection and leaves no trace in replay", async () => {
    const { deps, events } = memoryDeps();
    const store = createMissionStore(deps);
    await store.create(MISSION_A);
    await store.create(MISSION_B);

    // mission A에 정상 verification 먼저 기록 (merge queue 전제조건)
    await store.appendEvent("mission_A", {
      type: "mission.verification.recorded",
      payload: { report: PASSED_REPORT_A },
    });

    const eventCountBefore = events.length;

    // cross-mission merge queue injection — item.missionId가 mission_B
    await expect(
      store.appendEvent("mission_A", {
        type: "mission.merge.queued",
        payload: {
          item: { ...MERGE_ITEM_A, id: "merge_evil", missionId: "mission_B" },
        },
      }),
    ).rejects.toThrow("merge queue missionId mismatch");

    expect(events.length).toBe(eventCountBefore);

    const rebuilt = buildMissionIndexFromEvents([...events]);
    const missionA = rebuilt.find((m) => m.mission.missionId === "mission_A")!;
    const missionB = rebuilt.find((m) => m.mission.missionId === "mission_B")!;
    expect(missionA.mergeQueueItems).not.toContainEqual(expect.objectContaining({ id: "merge_evil" }));
    expect(missionB.mergeQueueItems).not.toContainEqual(expect.objectContaining({ id: "merge_evil" }));
  });

  it("read-side materializer defends against a contaminated event already in the log", async () => {
    // 이 테스트는 raw event log에 이미 잘못된 nested missionId를 가진 event가
    // 들어있다고 가정하고, read-side가 이를 skip하는지 검증한다.
    // (write-side가 뚫렸거나, 수동으로 event log가 조작된 경우)
    const { deps } = memoryDeps();
    const store = createMissionStore(deps);
    await store.create(MISSION_A);
    await store.create(MISSION_B);

    // 정상적으로 artifact 하나 attach
    await store.appendEvent("mission_A", {
      type: "mission.artifact.attached",
      payload: { artifact: ARTIFACT_A },
    });

    // raw event log에 직접 contaminated event를 주입
    // (write-side가 통과시켰다고 가정 — read-side 방어가 마지막 보루)
    const contaminatedEvent: EventEnvelope = {
      id: "event_contaminated_1",
      sessionId: "mission_A",
      type: "mission.artifact.attached",
      payload: {
        missionId: "mission_A",
        artifact: { ...ARTIFACT_A, id: "artifact_contaminated", missionId: "mission_B" },
      },
      createdAt: "2026-06-25T00:00:05.000Z",
      source: "server",
      sourceTrust: "trusted",
      redacted: true,
    };

    const rebuilt = buildMissionIndexFromEvents([
      ...(await deps.loadEvents()),
      contaminatedEvent,
    ]);

    const missionA = rebuilt.find((m) => m.mission.missionId === "mission_A")!;
    const missionB = rebuilt.find((m) => m.mission.missionId === "mission_B")!;

    // read-side가 contaminated artifact를 mission_A에 붙이지 않는다
    expect(missionA.artifacts.map((a) => a.id)).toEqual(["artifact_A"]);
    expect(missionA.artifacts).not.toContainEqual(expect.objectContaining({ id: "artifact_contaminated" }));
    // mission_B에도 붙지 않는다 (top-level missionId가 mission_A이므로 mission_B record를 찾지도 않음)
    expect(missionB.artifacts).not.toContainEqual(expect.objectContaining({ id: "artifact_contaminated" }));
  });

  it("merge queue requires observed + passed verification — no shortcut to ready_to_merge", async () => {
    const { deps } = memoryDeps();
    const store = createMissionStore(deps);
    await store.create(MISSION_A);

    // verification 없이 merge queue 시도 → reject
    await expect(
      store.appendEvent("mission_A", {
        type: "mission.merge.queued",
        payload: { item: MERGE_ITEM_A },
      }),
    ).rejects.toThrow(MissionEventValidationError);

    // observed가 아닌 (exitCode 없는) verification으로 merge queue 시도 → reject
    await store.appendEvent("mission_A", {
      type: "mission.verification.recorded",
      payload: {
        report: {
          ...PASSED_REPORT_A,
          id: "verify_downgraded",
          checks: [{ id: "c1", command: "pnpm test", status: "passed" as const, summary: "claimed", startedAt: "2026-06-25T00:00:00.000Z" }],
        },
      },
    });

    const recordAfterDowngrade = await store.get("mission_A");
    const downgradedReport = recordAfterDowngrade?.verificationReports.find((r) => r.id === "verify_downgraded");
    expect(downgradedReport?.observed).toBe(false);

    await expect(
      store.appendEvent("mission_A", {
        type: "mission.merge.queued",
        payload: { item: { ...MERGE_ITEM_A, requiredVerificationReportId: "verify_downgraded" } },
      }),
    ).rejects.toThrow(/observed passed/);

    // observed + passed verification 기록 후에야 merge queue 가능
    await store.appendEvent("mission_A", {
      type: "mission.verification.recorded",
      payload: { report: PASSED_REPORT_A },
    });

    const queued = await store.appendEvent("mission_A", {
      type: "mission.merge.queued",
      payload: { item: MERGE_ITEM_A },
    });
    expect(queued?.mergeQueueItems.map((i) => i.id)).toContain("merge_A");
    expect(queued?.status).toBe("ready_to_merge");
  });
});
