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

  it("rejects an artifact whose artifact.missionId differs from the path missionId (cross-mission injection)", async () => {
    const { deps } = memoryDeps();
    const store = createMissionStore(deps);
    await store.create(CREATE);

    await expect(
      store.appendEvent("mission_001", {
        type: "mission.artifact.attached",
        payload: {
          artifact: {
            id: "artifact_evil",
            missionId: "mission_999",
            kind: "diff",
            summary: "cross-mission injection attempt",
            truthStatus: "observed",
            createdAt: "2026-06-13T00:00:01.000Z",
          },
        },
      }),
    ).rejects.toThrow("artifact missionId mismatch");

    const record = await store.get("mission_001");
    expect(record?.artifacts.map((a) => a.id)).not.toContain("artifact_evil");
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

describe("auto checkpoint hooks (L3)", () => {
  const VERIFIER = { agentId: "agent_verifier", role: "verifier" as const, displayName: "Verifier", soulMode: "summary" as const, configSource: "internal" as const };
  const checkpoint = (reason: string) => ({
    status: "created" as const,
    checkpoint: {
      id: `cp_${reason}`,
      missionId: "mission_001",
      repoRootRef: "/repo",
      gitRef: "HEAD",
      headSha: "abc1234def567890",
      reason: reason as never,
      createdAt: "2026-06-13T00:00:00.500Z",
      truthStatus: "observed" as const,
    },
  });
  const passedRun = ({ reportId, missionId, verifierAgentId }: { reportId: string; missionId: string; verifierAgentId: string }): VerificationReport => ({
    id: reportId,
    missionId,
    verifierAgentId,
    status: "passed",
    checks: [{ id: "c1", command: "pnpm test", status: "passed", exitCode: 0, summary: "ok", startedAt: "2026-06-13T00:00:00.000Z" }],
    artifactIds: [],
    observed: true,
    createdAt: "2026-06-13T00:00:01.000Z",
  });

  it("records an observed before_verification checkpoint ahead of verify", async () => {
    const { deps } = memoryDeps();
    const store = createMissionStore({
      ...deps,
      runVerification: async (input) => passedRun(input),
      autoCheckpoint: async (_missionId, reason) => checkpoint(reason),
      nextNonce: () => "n1",
    });
    await store.create({ ...CREATE, workers: [VERIFIER] });
    const updated = await store.verify("mission_001", { commands: ["pnpm test"] });
    expect(updated?.checkpoints).toHaveLength(1);
    expect(updated?.checkpoints[0]!.reason).toBe("before_verification");
    expect(updated?.checkpoints[0]!.truthStatus).toBe("observed");
    expect(updated?.verificationReports).toHaveLength(1);
  });

  it("a failed (non-critical) checkpoint does NOT block verification", async () => {
    const { deps } = memoryDeps();
    const store = createMissionStore({
      ...deps,
      runVerification: async (input) => passedRun(input),
      autoCheckpoint: async () => ({ status: "failed", reason: "git rev-parse failed" }),
      nextNonce: () => "n1",
    });
    await store.create({ ...CREATE, workers: [VERIFIER] });
    const updated = await store.verify("mission_001", { commands: ["pnpm test"] });
    expect(updated?.checkpoints).toHaveLength(0);
    expect(updated?.verificationReports).toHaveLength(1); // 검증은 진행됨
  });

  async function seedQueuedFor(autoCheckpoint: Parameters<typeof createMissionStore>[0]["autoCheckpoint"]) {
    const { deps } = memoryDeps();
    const store = createMissionStore({
      ...deps,
      autoCheckpoint,
      runMerge: async () => ({
        status: "merged" as const,
        mergeCommitSha: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
        reason: "merged",
        conflictFiles: [],
        completedAt: "2026-06-13T00:00:02.000Z",
      }),
    });
    await store.create(CREATE);
    await store.appendEvent("mission_001", {
      type: "mission.verification.recorded",
      payload: { report: passedRun({ reportId: "verify_pass", missionId: "mission_001", verifierAgentId: "agent_verifier" }) },
    });
    await store.appendEvent("mission_001", {
      type: "mission.merge.queued",
      payload: { item: { id: "merge_1", missionId: "mission_001", branchName: "agent/mission_001", status: "queued", requiredVerificationReportId: "verify_pass", reason: "verified", queuedAt: "2026-06-13T00:00:01.500Z" } },
    });
    return store;
  }

  it("a critical before_merge checkpoint failure BLOCKS the merge (no unrecoverable merge)", async () => {
    const store = await seedQueuedFor(async () => ({ status: "failed", reason: "worktree dirty" }));
    await expect(store.merge("mission_001", { mergeQueueItemId: "merge_1" })).rejects.toThrow(/checkpoint\(before_merge\)/);
    // 머지가 실행되지 않았다 — 미션은 merged로 닫히지 않음
    const record = await store.get("mission_001");
    expect(record?.status).not.toBe("merged");
  });

  it("a skipped checkpoint (deployment without allowlist) lets the merge proceed", async () => {
    const store = await seedQueuedFor(async () => ({ status: "skipped", reason: "no allowlist" }));
    const merged = await store.merge("mission_001", { mergeQueueItemId: "merge_1" });
    expect(merged?.status).toBe("merged");
    expect(merged?.checkpoints).toHaveLength(0);
  });
});

describe("error card + bounded self-correction (L4/L5)", () => {
  const VERIFIER = { agentId: "agent_verifier", role: "verifier" as const, displayName: "V", soulMode: "summary" as const, configSource: "internal" as const };
  const TS_FAIL = "exit 2 · src/x.ts(10,5): error TS2532: Object is possibly 'undefined'.";

  function clocked() {
    const events: EventEnvelope[] = [];
    let t = 0;
    const now = () => `2026-06-13T00:00:${String(t++).padStart(2, "0")}.000Z`;
    let n = 0;
    return {
      events,
      base: {
        loadEvents: async () => [...events],
        appendEvents: async (_s: string, envs: EventEnvelope[]) => {
          for (const e of envs) if (!events.some((x) => x.id === e.id)) events.push(e);
        },
        now,
        nextNonce: () => `n${n++}`,
      },
      now,
    };
  }

  const failingRun = (now: () => string) => async (input: { reportId: string; missionId: string; verifierAgentId: string }): Promise<VerificationReport> => ({
    id: input.reportId,
    missionId: input.missionId,
    verifierAgentId: input.verifierAgentId,
    status: "failed",
    checks: [{ id: "c1", command: "pnpm typecheck", status: "failed", exitCode: 2, summary: TS_FAIL, startedAt: "t" }],
    artifactIds: [],
    observed: true,
    createdAt: now(),
  });
  const passingRun = (now: () => string) => async (input: { reportId: string; missionId: string; verifierAgentId: string }): Promise<VerificationReport> => ({
    id: input.reportId,
    missionId: input.missionId,
    verifierAgentId: input.verifierAgentId,
    status: "passed",
    checks: [{ id: "c1", command: "pnpm typecheck", status: "passed", exitCode: 0, summary: "ok", startedAt: "t" }],
    artifactIds: [],
    observed: true,
    createdAt: now(),
  });

  it("emits a deterministic error card + a retry suggestion on a failed verification", async () => {
    const { base, now } = clocked();
    const store = createMissionStore({ ...base, runVerification: failingRun(now) });
    await store.create({ ...CREATE, workers: [VERIFIER] });
    const updated = await store.verify("mission_001", { commands: ["pnpm typecheck"] });
    expect(updated?.errorCards).toHaveLength(1);
    expect(updated?.errorCards[0]!.errorClass).toBe("TS2532");
    expect(updated?.errorCards[0]!.targetFile).toBe("src/x.ts");
    expect(updated?.errorCards[0]!.truthStatus).toBe("observed"); // 실측 실행 에러
    expect(updated?.selfCorrections).toHaveLength(1);
    expect(updated?.selfCorrections[0]!.action).toBe("retry");
    expect(updated?.selfCorrections[0]!.directive).toBeTruthy();
    expect(updated?.selfCorrections[0]!.attempt).toBe(1);
  });

  it("does NOT emit error cards or self-corrections on a passed verification", async () => {
    const { base, now } = clocked();
    const store = createMissionStore({ ...base, runVerification: passingRun(now) });
    await store.create({ ...CREATE, workers: [VERIFIER] });
    const updated = await store.verify("mission_001", { commands: ["pnpm typecheck"] });
    expect(updated?.errorCards).toHaveLength(0);
    expect(updated?.selfCorrections).toHaveLength(0);
  });

  it("stops self-correction when the same error repeats (no infinite loop, no file mutation)", async () => {
    const { base, now } = clocked();
    const store = createMissionStore({ ...base, runVerification: failingRun(now) });
    await store.create({ ...CREATE, workers: [VERIFIER] });
    await store.verify("mission_001", { commands: ["pnpm typecheck"] });
    const second = await store.verify("mission_001", { commands: ["pnpm typecheck"] });
    expect(second?.selfCorrections).toHaveLength(2);
    expect(second?.selfCorrections[1]!.action).toBe("stop_same_error");
    // 제안만 — 파일 변경 아티팩트는 없다
    expect(second?.artifacts).toHaveLength(0);
  });

  it("resets the self-correction loop after a passing verification", async () => {
    const { base, now } = clocked();
    let mode: "fail" | "pass" = "fail";
    const store = createMissionStore({
      ...base,
      runVerification: async (input) => (mode === "fail" ? failingRun(now)(input) : passingRun(now)(input)),
    });
    await store.create({ ...CREATE, workers: [VERIFIER] });
    mode = "fail";
    await store.verify("mission_001", { commands: ["pnpm typecheck"] });
    mode = "pass";
    await store.verify("mission_001", { commands: ["pnpm typecheck"] });
    mode = "fail";
    const last = await store.verify("mission_001", { commands: ["pnpm typecheck"] });
    const corrections = last?.selfCorrections ?? [];
    expect(corrections.at(-1)!.action).toBe("retry"); // 같은 에러여도 통과로 리셋됨
    expect(corrections.at(-1)!.attempt).toBe(1);
  });
});

describe("skill archive candidates + curator (L6)", () => {
  const passedReport = {
    report: {
      id: "verify_pass",
      missionId: "mission_001",
      verifierAgentId: "agent_verifier",
      status: "passed" as const,
      checks: [{ id: "c1", command: "pnpm test", status: "passed" as const, exitCode: 0, summary: "ok", startedAt: "2026-06-13T00:00:00.000Z" }],
      artifactIds: [],
      observed: true,
      createdAt: "2026-06-13T00:00:00.000Z",
    },
  };
  const queueItem = {
    item: {
      id: "merge_1",
      missionId: "mission_001",
      branchName: "agent/mission_001",
      status: "queued" as const,
      requiredVerificationReportId: "verify_pass",
      reason: "verified",
      queuedAt: "2026-06-13T00:00:01.000Z",
    },
  };

  async function mergedStore(exportApprovedSkill?: (c: { id: string }) => Promise<void>) {
    const { deps } = memoryDeps();
    const store = createMissionStore({
      ...deps,
      exportApprovedSkill: exportApprovedSkill as never,
      runMerge: async () => ({
        status: "merged" as const,
        mergeCommitSha: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
        reason: "merged",
        conflictFiles: [],
        completedAt: "2026-06-13T00:00:02.000Z",
      }),
    });
    await store.create(CREATE);
    await store.appendEvent("mission_001", { type: "mission.verification.recorded", payload: passedReport });
    await store.appendEvent("mission_001", { type: "mission.merge.queued", payload: queueItem });
    await store.merge("mission_001", { mergeQueueItemId: "merge_1" });
    return store;
  }

  it("a merged mission auto-creates suggested skill candidate(s)", async () => {
    const store = await mergedStore();
    const candidates = (await store.skills("mission_001"))!;
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.every((c) => c.trustStatus === "suggested")).toBe(true); // 자동 trusted 승격 없음
  });

  it("a non-merged mission auto-creates NOTHING (failed missions never seed trusted skills)", async () => {
    const { deps } = memoryDeps();
    const store = createMissionStore(deps);
    await store.create(CREATE);
    expect(await store.skills("mission_001")).toEqual([]);
  });

  it("curator approve → curator_approved + exports; the queue reflects the promotion", async () => {
    const exported: string[] = [];
    const store = await mergedStore(async (c) => {
      exported.push(c.id);
    });
    const id = (await store.skills("mission_001"))![0]!.id;
    const updated = await store.curateSkill("mission_001", id, "approve");
    expect(updated?.trustStatus).toBe("curator_approved");
    expect(exported).toContain(id);
    const after = (await store.skills("mission_001"))!;
    expect(after.find((c) => c.id === id)?.trustStatus).toBe("curator_approved");
  });

  it("curator reject → rejected and does NOT export", async () => {
    const exported: string[] = [];
    const store = await mergedStore(async (c) => {
      exported.push(c.id);
    });
    const id = (await store.skills("mission_001"))![0]!.id;
    const updated = await store.curateSkill("mission_001", id, "reject");
    expect(updated?.trustStatus).toBe("rejected");
    expect(exported).toHaveLength(0);
  });

  it("curating an unknown candidate returns undefined", async () => {
    const store = await mergedStore();
    expect(await store.curateSkill("mission_001", "skill_ghost", "approve")).toBeUndefined();
  });
});

describe("app workspace (D2)", () => {
  it("attaches a workspace to a mission, materialized + survives restart", async () => {
    const { deps, events } = memoryDeps();
    const store = createMissionStore(deps);
    await store.create(CREATE);
    const updated = await store.attachWorkspace("mission_001", { repoRootRef: "/repo", appType: "react_vite", terminalMode: "read_only", runnerKind: "local" });
    expect(updated?.workspaces).toHaveLength(1);
    expect(updated?.workspaces[0]!.appType).toBe("react_vite");
    expect(updated?.workspaces[0]!.preview.truthStatus).toBe("planned"); // 시작 전 observed 아님

    // 재시작 시뮬레이션 — 이벤트만으로 복원
    const restored = buildMissionIndexFromEvents(events);
    expect(restored[0]!.workspaces).toHaveLength(1);
  });

  it("returns undefined for an unknown mission", async () => {
    const { deps } = memoryDeps();
    const store = createMissionStore(deps);
    expect(await store.attachWorkspace("ghost", { repoRootRef: "/repo", appType: "unknown", terminalMode: "read_only", runnerKind: "local" })).toBeUndefined();
  });

  it("records a preview as observed only when probe says bound", async () => {
    const { deps } = memoryDeps();
    const store = createMissionStore(deps);
    await store.create(CREATE);
    const attached = await store.attachWorkspace("mission_001", { repoRootRef: "/repo", appType: "react_vite", terminalMode: "read_only", runnerKind: "local" });
    const wsId = attached!.workspaces[0]!.id;

    const running = await store.recordPreview("mission_001", wsId, { status: "running", port: 4401, url: "http://127.0.0.1:4401", truthStatus: "observed" });
    expect(running?.workspaces[0]!.preview.status).toBe("running");
    expect(running?.workspaces[0]!.preview.truthStatus).toBe("observed");

    // 미바인딩 갱신은 observed가 아니다
    const failed = await store.recordPreview("mission_001", wsId, { status: "failed", port: 4401, truthStatus: "configured" });
    expect(failed?.workspaces[0]!.preview.status).toBe("failed");
    expect(failed?.workspaces[0]!.preview.truthStatus).not.toBe("observed");
  });

  it("recordPreview returns undefined for an unknown workspace", async () => {
    const { deps } = memoryDeps();
    const store = createMissionStore(deps);
    await store.create(CREATE);
    expect(await store.recordPreview("mission_001", "ws_ghost", { status: "running", port: 1, truthStatus: "observed" })).toBeUndefined();
  });

  it("records a visual QA report + its design issues (D5b), survives restart", async () => {
    const { deps, events } = memoryDeps();
    const store = createMissionStore(deps);
    await store.create(CREATE);
    const report = {
      id: "vq1",
      missionId: "mission_001",
      workspaceId: "ws1",
      previewUrl: "http://127.0.0.1:4401",
      checks: [{ id: "c1", kind: "missing_primary_action", status: "failed" as const, summary: "no button" }],
      issues: [
        { id: "vq1_missing_primary_action", missionId: "mission_001", workspaceId: "ws1", kind: "missing_primary_action" as const, severity: "medium" as const, summary: "no primary action", recommendation: "add a button", truthStatus: "observed" as const, createdAt: "t" },
      ],
      status: "failed" as const,
      truthStatus: "observed" as const,
      createdAt: "t",
    };
    const updated = await store.recordVisualQa("mission_001", report);
    expect(updated?.visualQaReports).toHaveLength(1);
    expect(updated?.designIssues).toHaveLength(1);
    expect(updated?.designIssues[0]!.kind).toBe("missing_primary_action");

    const restored = buildMissionIndexFromEvents(events);
    expect(restored[0]!.visualQaReports).toHaveLength(1);
    expect(restored[0]!.designIssues).toHaveLength(1);
  });
});

describe("design blueprint (D3)", () => {
  const blueprintInput = {
    title: "콕핏 정리",
    userIntent: "정보 과부하 줄이기",
    targetSurface: "cockpit" as const,
    screens: [
      { name: "히어로", purpose: "건강 신호", primaryAction: "다음 액션", secondaryActions: [], dataNeeded: ["health"], emptyState: "데이터 없음", errorState: "실패" },
    ],
    designTokens: { density: "compact" as const, tone: "cyber_glass" as const, motion: "subtle" as const },
    acceptanceCriteria: ["red/yellow/green 단일 신호"],
  };

  it("records a blueprint + planned artifacts on a mission, survives restart", async () => {
    const { deps, events } = memoryDeps();
    const store = createMissionStore(deps);
    await store.create(CREATE);
    const result = await store.attachDesignBlueprint("mission_001", blueprintInput);
    expect(result?.blueprint.screens[0]!.id).toContain("screen_1");
    expect(result?.mission.designBlueprints).toHaveLength(1);
    // 화면(1) + 수용기준(1) = 2 planned 아티팩트
    expect(result?.mission.artifacts).toHaveLength(2);
    expect(result?.mission.artifacts.every((a) => a.truthStatus === "planned")).toBe(true);

    const restored = buildMissionIndexFromEvents(events);
    expect(restored[0]!.designBlueprints).toHaveLength(1);
  });

  it("returns undefined for an unknown mission", async () => {
    const { deps } = memoryDeps();
    const store = createMissionStore(deps);
    expect(await store.attachDesignBlueprint("ghost", blueprintInput)).toBeUndefined();
  });
});

describe("nested missionId rejection — cross-mission contamination guard", () => {
  it("recordVisualQa rejects a report whose report.missionId differs from the path missionId", async () => {
    const { deps } = memoryDeps();
    const store = createMissionStore(deps);
    await store.create(CREATE);
    await expect(
      store.recordVisualQa("mission_001", {
        id: "vq_evil",
        missionId: "mission_999",
        workspaceId: "ws1",
        previewUrl: "http://127.0.0.1:4401",
        checks: [],
        issues: [],
        status: "failed",
        truthStatus: "observed",
        createdAt: "t",
      }),
    ).rejects.toThrow("visual QA report missionId mismatch");
  });

  it("recordVisualQa rejects a report whose issue.missionId differs from the path missionId", async () => {
    const { deps } = memoryDeps();
    const store = createMissionStore(deps);
    await store.create(CREATE);
    await expect(
      store.recordVisualQa("mission_001", {
        id: "vq_ok",
        missionId: "mission_001",
        workspaceId: "ws1",
        previewUrl: "http://127.0.0.1:4401",
        checks: [],
        issues: [
          { id: "issue_evil", missionId: "mission_999", workspaceId: "ws1", kind: "missing_primary_action", severity: "medium", summary: "x", recommendation: "y", truthStatus: "observed", createdAt: "t" },
        ],
        status: "failed",
        truthStatus: "observed",
        createdAt: "t",
      }),
    ).rejects.toThrow("visual QA report missionId mismatch");
  });

  it("recordScaffoldPlan rejects a plan whose plan.missionId differs from the path missionId", async () => {
    const { deps } = memoryDeps();
    const store = createMissionStore(deps);
    await store.create(CREATE);
    await expect(
      store.recordScaffoldPlan("mission_001", {
        id: "plan_evil",
        missionId: "mission_999",
        repoRootRef: "/repo",
        steps: [],
        truthStatus: "planned",
        createdAt: "t",
      } as never),
    ).rejects.toThrow("scaffold plan missionId mismatch");
  });

  it("recordScaffoldOverlay rejects an overlay whose overlay.missionId differs from the path missionId", async () => {
    const { deps } = memoryDeps();
    const store = createMissionStore(deps);
    await store.create(CREATE);
    await expect(
      store.recordScaffoldOverlay("mission_001", {
        id: "overlay_evil",
        missionId: "mission_999",
        planId: "plan_1",
        truthStatus: "planned",
        createdAt: "t",
      } as never),
    ).rejects.toThrow("scaffold overlay missionId mismatch");
  });
});
