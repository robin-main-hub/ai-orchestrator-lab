import { describe, expect, it } from "vitest";
import type { EventEnvelope, VerificationReport } from "@ai-orchestrator/protocol";
import { buildMissionIndexFromEvents } from "./missionIndex";
import { normalizeMissionWorker, normalizeVerificationReport } from "./missionPolicy";
import { createMissionStore, MissionEventValidationError } from "./missionStore";

/** in-memory event storage — store 로직을 fs 없이 검증 */
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
      now: () => "2026-06-13T00:00:00.000Z",
    },
  };
}

const CREATE = {
  id: "mission_001",
  title: "Refactor provider fallback",
  goal: "fallback이 실제로 전환되는지 검증",
  truthStatus: "observed" as const,
  createdBy: "desktop",
  workers: [
    {
      agentId: "agent_builder",
      role: "builder" as const,
      displayName: "Builder",
      soulMode: "summary" as const,
      configSource: "internal" as const,
    },
  ],
};

describe("mission store + materialized index", () => {
  it("creates a mission and materializes it through the index", async () => {
    const { deps } = memoryDeps();
    const store = createMissionStore(deps);
    const created = await store.create(CREATE);

    expect(created.mission.missionId).toBe("mission_001");
    expect(created.status).toBe("running"); // worker 1명 배정됨
    expect(created.workers).toHaveLength(1);
    expect((await store.list()).map((m) => m.mission.missionId)).toContain("mission_001");
  });

  it("restores the same mission state from the raw event log (server-restart shape)", async () => {
    const { deps, events } = memoryDeps();
    const store = createMissionStore(deps);
    await store.create(CREATE);
    await store.appendEvent("mission_001", {
      type: "mission.artifact.attached",
      payload: {
        artifact: {
          id: "artifact_1",
          missionId: "mission_001",
          kind: "diff",
          summary: "provider fallback diff",
          truthStatus: "observed",
          createdAt: "2026-06-13T00:00:01.000Z",
        },
      },
    });

    // 재시작 시뮬레이션: 저장된 이벤트만으로 인덱스 재구성
    const restored = buildMissionIndexFromEvents(events);
    expect(restored).toHaveLength(1);
    expect(restored[0]!.workers).toHaveLength(1);
    expect(restored[0]!.artifacts.map((a) => a.id)).toEqual(["artifact_1"]);
  });

  it("keeps the worker's Hermes slot id as continuity metadata", async () => {
    const { deps } = memoryDeps();
    const store = createMissionStore(deps);
    const created = await store.create({
      ...CREATE,
      id: "mission_hermes",
      workers: [
        {
          agentId: "agent_kurumi",
          role: "companion" as const,
          displayName: "쿠루미",
          personaName: "kurumi",
          soulMode: "full" as const,
          configSource: "markdown" as const,
          permissionLevel: "write_files",
          hermesSlotId: "hermes-03",
        },
      ],
    });
    expect(created.workers[0]!.capability.personaContinuity.hermes.slotId).toBe("hermes-03");
  });

  it("rejects unknown mission event types and mission.created via the append channel", async () => {
    const { deps } = memoryDeps();
    const store = createMissionStore(deps);
    await store.create(CREATE);

    await expect(
      store.appendEvent("mission_001", { type: "mission.created", payload: {} }),
    ).rejects.toThrow(MissionEventValidationError);
  });

  it("returns undefined for an append to a mission that does not exist", async () => {
    const { deps } = memoryDeps();
    const store = createMissionStore(deps);
    expect(
      await store.appendEvent("mission_ghost", { type: "mission.closed", payload: { status: "cancelled" } }),
    ).toBeUndefined();
  });
});

describe("truthStatus honesty — observed only with real verification", () => {
  it("a freshly created mission is NOT observed (downgraded to configured if it claims so)", async () => {
    const { deps } = memoryDeps();
    const store = createMissionStore(deps);
    // 클라이언트가 observed를 주장해도 검증 0건이면 강등
    await store.create({ ...CREATE, truthStatus: "observed" });
    const record = (await store.list())[0]!;
    expect(record.truthStatus).toBe("configured"); // observed 아님
  });

  it("becomes observed only after an observed passed verification is recorded", async () => {
    const { deps } = memoryDeps();
    const store = createMissionStore(deps);
    await store.create({ ...CREATE, truthStatus: "planned" });
    await store.appendEvent("mission_001", {
      type: "mission.verification.recorded",
      payload: {
        report: {
          id: "verify_pass",
          missionId: "mission_001",
          verifierAgentId: "agent_verifier",
          status: "passed",
          checks: [{ id: "c1", command: "pnpm test", status: "passed", exitCode: 0, summary: "ok", startedAt: "2026-06-13T00:00:00.000Z" }],
          artifactIds: [],
          observed: true,
          createdAt: "2026-06-13T00:00:00.000Z",
        },
      },
    });
    const record = (await store.list())[0]!;
    expect(record.truthStatus).toBe("observed");
  });
});

describe("server verification execution (E1)", () => {
  it("runs the verification runner and records an observed report", async () => {
    const { deps } = memoryDeps();
    const store = createMissionStore({
      ...deps,
      runVerification: async ({ commands, missionId, verifierAgentId, reportId }) => ({
        id: reportId,
        missionId,
        verifierAgentId,
        status: "passed",
        checks: commands.map((command, i) => ({
          id: `c${i}`,
          command,
          status: "passed" as const,
          exitCode: 0,
          summary: "ok",
          startedAt: "2026-06-13T00:00:00.000Z",
        })),
        artifactIds: [],
        observed: true,
        createdAt: "2026-06-13T00:00:00.000Z",
      }),
      nextNonce: () => "n1",
    });
    await store.create({ ...CREATE, workers: [{ agentId: "agent_verifier", role: "verifier", displayName: "Verifier", soulMode: "summary", configSource: "internal" }] });

    const updated = await store.verify("mission_001", { commands: ["pnpm test"] });
    expect(updated?.verificationReports).toHaveLength(1);
    expect(updated?.verificationReports[0]!.observed).toBe(true);
    expect(updated?.status).toBe("ready_to_merge");
  });

  it("rejects verify when no sandbox_verify worker exists", async () => {
    const { deps } = memoryDeps();
    const store = createMissionStore({ ...deps, runVerification: async () => ({}) as never });
    await store.create({ ...CREATE, workers: [] }); // worker 없음
    await expect(store.verify("mission_001", { commands: ["pnpm test"] })).rejects.toThrow(/sandbox_verify/);
  });
});

describe("merge execution (E2/D4a)", () => {
  async function seedQueued(runMerge?: Parameters<typeof createMissionStore>[0]["runMerge"]) {
    const { deps } = memoryDeps();
    const store = createMissionStore({
      ...deps,
      runMerge:
        runMerge ??
        (async ({ item }) => ({
          status: "merged" as const,
          mergeCommitSha: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
          reason: "merged",
          conflictFiles: [],
          completedAt: "2026-06-13T00:00:02.000Z",
        })),
    });
    await store.create(CREATE);
    await store.appendEvent("mission_001", {
      type: "mission.verification.recorded",
      payload: {
        report: {
          id: "verify_pass",
          missionId: "mission_001",
          verifierAgentId: "agent_verifier",
          status: "passed",
          checks: [{ id: "c1", command: "pnpm test", status: "passed", exitCode: 0, summary: "ok", startedAt: "2026-06-13T00:00:00.000Z" }],
          artifactIds: [],
          observed: true,
          createdAt: "2026-06-13T00:00:00.000Z",
        },
      },
    });
    await store.appendEvent("mission_001", {
      type: "mission.merge.queued",
      payload: {
        item: {
          id: "merge_1",
          missionId: "mission_001",
          branchName: "agent/mission_001",
          status: "queued",
          requiredVerificationReportId: "verify_pass",
          reason: "verified",
          queuedAt: "2026-06-13T00:00:01.000Z",
        },
      },
    });
    return store;
  }

  it("merges via the runner, storing the runner's REAL sha (not a client value) and closing the mission", async () => {
    const store = await seedQueued();
    const merged = await store.merge("mission_001", { mergeQueueItemId: "merge_1" });
    expect(merged?.status).toBe("merged");
    expect(merged?.mergeQueueItems[0]!.status).toBe("merged");
    expect(merged?.mergeQueueItems[0]!.mergeCommitSha).toBe("a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2");
  });

  it("does NOT close the mission as merged on a conflict (records conflict instead)", async () => {
    const store = await seedQueued(async ({ item }) => ({
      status: "conflict",
      reason: "merge conflict — aborted",
      conflictFiles: ["src/a.ts"],
      completedAt: "2026-06-13T00:00:02.000Z",
    }));
    const result = await store.merge("mission_001", { mergeQueueItemId: "merge_1" });
    expect(result?.status).not.toBe("merged");
    expect(result?.mergeQueueItems[0]!.status).toBe("conflict");
    expect(result?.mergeQueueItems[0]!.conflictFiles).toEqual(["src/a.ts"]);
  });

  it("a dry_run (repo not allowlisted) does not close the mission and carries no sha", async () => {
    const store = await seedQueued(async () => ({
      status: "dry_run",
      reason: "repoRoot not allowlisted",
      conflictFiles: [],
      completedAt: "2026-06-13T00:00:02.000Z",
    }));
    const result = await store.merge("mission_001", { mergeQueueItemId: "merge_1" });
    expect(result?.status).not.toBe("merged");
    expect(result?.mergeQueueItems[0]!.status).toBe("dry_run");
    expect(result?.mergeQueueItems[0]!.mergeCommitSha).toBeUndefined();
  });

  it("rejects merging an unknown queue item", async () => {
    const store = await seedQueued();
    await expect(store.merge("mission_001", { mergeQueueItemId: "merge_ghost" })).rejects.toThrow(MissionEventValidationError);
  });
});

describe("merge queue — only verified results may queue (D3)", () => {
  const passedReport = {
    report: {
      id: "verify_pass",
      missionId: "mission_001",
      verifierAgentId: "agent_verifier",
      status: "passed" as const,
      checks: [
        {
          id: "check_1",
          command: "pnpm test",
          status: "passed" as const,
          exitCode: 0,
          summary: "green",
          startedAt: "2026-06-13T00:00:00.000Z",
        },
      ],
      artifactIds: [],
      observed: true,
      createdAt: "2026-06-13T00:00:00.000Z",
    },
  };
  const queueItem = (reportId: string) => ({
    item: {
      id: "merge_1",
      missionId: "mission_001",
      branchName: "agent/mission_001",
      status: "queued" as const,
      requiredVerificationReportId: reportId,
      reason: "verification passed",
      queuedAt: "2026-06-13T00:00:02.000Z",
    },
  });

  it("queues a merge when an observed passed report exists", async () => {
    const { deps } = memoryDeps();
    const store = createMissionStore(deps);
    await store.create(CREATE);
    await store.appendEvent("mission_001", { type: "mission.verification.recorded", payload: passedReport });

    const updated = await store.appendEvent("mission_001", {
      type: "mission.merge.queued",
      payload: queueItem("verify_pass"),
    });
    expect(updated?.mergeQueueItems.map((item) => item.id)).toEqual(["merge_1"]);
  });

  it("rejects queueing without a verification report", async () => {
    const { deps } = memoryDeps();
    const store = createMissionStore(deps);
    await store.create(CREATE);
    await expect(
      store.appendEvent("mission_001", { type: "mission.merge.queued", payload: queueItem("verify_missing") }),
    ).rejects.toThrow(MissionEventValidationError);
  });

  it("rejects queueing on a failed or unobserved report", async () => {
    const { deps } = memoryDeps();
    const store = createMissionStore(deps);
    await store.create(CREATE);
    // observed 주장이지만 exit code 증거가 없어 서버가 강등하는 report
    await store.appendEvent("mission_001", {
      type: "mission.verification.recorded",
      payload: {
        report: {
          ...passedReport.report,
          id: "verify_claimed",
          checks: [{ ...passedReport.report.checks[0]!, exitCode: undefined }],
        },
      },
    });
    await expect(
      store.appendEvent("mission_001", { type: "mission.merge.queued", payload: queueItem("verify_claimed") }),
    ).rejects.toThrow(/observed passed/);
  });
});

describe("server-side policy — payloads are not trusted", () => {
  it("companion cannot become sandbox_build through a persistence payload", () => {
    // 클라이언트가 capability를 뭐라고 주장하든 요청 스키마가 받지 않고,
    // 서버가 역할에서 재계산한다 — 쿠루미는 여전히 파일 변경 불가
    const worker = normalizeMissionWorker(
      {
        agentId: "agent_kurumi",
        role: "companion",
        displayName: "쿠루미",
        personaName: "kurumi",
        soulMode: "full",
        configSource: "markdown",
        permissionLevel: "write_files",
      },
      "mission_x",
      "2026-06-13T00:00:00.000Z",
    );
    expect(worker.capability.mode).toBe("merge_recommend");
    expect(worker.capability.canMutateFiles).toBe(false);
    expect(worker.capability.personaContinuity.voice.preserveCharacterVoice).toBe(true);
  });

  it("verification cannot silently claim observed without exit-code evidence", () => {
    const claimed: VerificationReport = {
      id: "verify_1",
      missionId: "mission_x",
      verifierAgentId: "agent_verifier",
      status: "passed",
      checks: [
        {
          id: "check_1",
          command: "pnpm test",
          status: "passed",
          summary: "all green (claimed)",
          startedAt: "2026-06-13T00:00:00.000Z",
        },
      ],
      artifactIds: [],
      observed: true, // 주장
      createdAt: "2026-06-13T00:00:00.000Z",
    };
    const normalized = normalizeVerificationReport(claimed);
    expect(normalized.observedDowngraded).toBe(true);
    expect(normalized.report.observed).toBe(false);

    const withEvidence = normalizeVerificationReport({
      ...claimed,
      checks: [{ ...claimed.checks[0]!, exitCode: 0 }],
    });
    expect(withEvidence.observedDowngraded).toBe(false);
    expect(withEvidence.report.observed).toBe(true);
  });
});
