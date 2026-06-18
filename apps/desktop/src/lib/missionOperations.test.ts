import { describe, expect, it } from "vitest";
import {
  buildMissionOperationsMap,
  groupMissionOperationsByState,
  summarizeMissionOperations,
  type MissionOperationsInput,
} from "./missionOperations";

const input: MissionOperationsInput = {
  runnerTheater: [
    {
      id: "mission-alpha",
      title: "alpha runner",
      role: "implementer",
      agent: "agent-alpha",
      model: "route: default",
      status: "running",
      lane: "active",
      liveness: "live",
      ageMinutes: 1,
      heartbeatAt: "2026-06-18T12:00:00.000Z",
      lastOutput: "observed heartbeat",
      eventCount: 2,
      artifactCount: 1,
      branch: "agent/alpha",
      note: "runner theater · read-only · observed only",
    },
  ],
  patchCandidates: [
    {
      id: "patch-alpha",
      candidateId: "patch-alpha",
      runnerId: "mission-alpha",
      missionId: "mission-alpha",
      createdAt: "2026-06-18T12:01:00.000Z",
      changedFileCount: 2,
      additions: 12,
      deletions: 3,
      safetyStatus: "warning",
      verificationStatus: "claimed",
      source: "runner",
      observed: true,
      files: [],
      safetyBlockers: [],
      safetyWarnings: ["review required"],
      secretFindingCount: 0,
      evidenceRefs: ["ev-alpha"],
      note: "patch candidate · read-only · preview only",
    },
  ],
  workItemCandidates: [
    {
      id: "wic-alpha",
      title: "alpha candidate",
      kind: "patch",
      lane: "now",
      status: "candidate",
      risk: "medium",
      sourceRefs: ["patch-alpha", "agent/alpha", "source-alpha"],
      evidenceRefs: ["ev-alpha"],
      createdAt: "2026-06-18T12:02:00.000Z",
      observed: true,
      reason: "patch safety warning",
      note: "work item candidate · read-only · not committed work",
    },
  ],
  evidenceDraft: {
    id: "draft-alpha",
    title: "alpha draft",
    claims: [{ id: "claim-alpha", text: "alpha claim", footnotes: [1], supported: true }],
    footnotes: [
      {
        n: 1,
        refId: "ev-alpha",
        label: "alpha evidence",
        freshness: "fresh",
        ageHours: 1,
      },
    ],
    missing: [],
    freshnessSummary: { fresh: 1, aging: 0, stale: 0, unknown: 0 },
    staleCount: 0,
  },
  learningMemory: {
    learning: {
      total: 1,
      byStage: {
        failed: 0,
        investigating: 0,
        hypothesis_recorded: 0,
        verified: 1,
        distilled: 0,
        consulted: 0,
        rejected: 0,
      },
      active: 0,
      settled: 1,
      rejected: 0,
      verifiedHypotheses: 1,
      rejectedHypotheses: 0,
    },
    memory: { total: 1, suggested: 1, written: 0, observed: 0 },
    evalHealth: {
      reports: 1,
      pass: 0,
      warning: 1,
      fail: 0,
      forbiddenHits: 0,
      staleHits: 1,
      contradictedHits: 0,
      supersededHits: 0,
      blocked: 0,
    },
    flags: ["1 stale hit"],
    hasData: true,
  },
  sourceHealth: [{ pluginId: "source-alpha", health: "stale" }],
};

describe("Mission Operations projection", () => {
  it("builds a read-only operation map from runner, patch, candidate, evidence, source, and memory refs", () => {
    const map = buildMissionOperationsMap(input);

    expect(map.nodes.map((node) => `${node.kind}:${node.ref}`)).toEqual([
      "mission:mission-alpha",
      "runner:mission-alpha",
      "patch:patch-alpha",
      "candidate:wic-alpha",
      "evidence:ev-alpha",
      "memory:learning-memory-console",
      "source:source-alpha",
    ]);
    expect(map.edges.map((edge) => `${edge.from}->${edge.to}:${edge.kind}`)).toEqual([
      "runner:mission-alpha->mission:mission-alpha:mission",
      "patch:patch-alpha->mission:mission-alpha:mission",
      "patch:patch-alpha->runner:mission-alpha:runner",
      "patch:patch-alpha->evidence:ev-alpha:evidence",
      "candidate:wic-alpha->patch:patch-alpha:patch",
      "candidate:wic-alpha->runner:mission-alpha:runner",
      "candidate:wic-alpha->source:source-alpha:source",
      "candidate:wic-alpha->evidence:ev-alpha:evidence",
      "memory:learning-memory-console->candidate:wic-alpha:memory",
    ]);
    expect(map.unresolvedRefs).toEqual([]);
  });

  it("preserves unresolved refs honestly without fabricating links", () => {
    const map = buildMissionOperationsMap({
      workItemCandidates: [
        {
          id: "wic-missing",
          title: "missing candidate",
          kind: "source",
          lane: "watch",
          status: "candidate",
          risk: "low",
          sourceRefs: ["source-missing"],
          evidenceRefs: ["ev-missing"],
          observed: false,
          reason: "source health unknown",
          note: "work item candidate · read-only · not committed work",
        },
      ],
    });

    expect(map.edges).toEqual([]);
    expect(map.unresolvedRefs).toEqual([
      {
        ownerId: "candidate:wic-missing",
        ownerKind: "candidate",
        ref: "source-missing",
        expectedKind: "source",
        reason: "source ref unresolved",
      },
      {
        ownerId: "candidate:wic-missing",
        ownerKind: "candidate",
        ref: "ev-missing",
        expectedKind: "evidence",
        reason: "evidence ref unresolved",
      },
    ]);
  });

  it("summarizes counts and groups state deterministically", () => {
    const map = buildMissionOperationsMap(input);
    const summary = summarizeMissionOperations(map);
    const groups = groupMissionOperationsByState(map);

    expect(summary).toMatchObject({
      totalNodes: 7,
      totalEdges: 9,
      unresolvedRefs: 0,
      active: 1,
      attention: 3,
      ready: 3,
      blocked: 0,
      evidenceMissing: 0,
      memoryWarning: 1,
      byKind: {
        mission: 1,
        runner: 1,
        patch: 1,
        candidate: 1,
        evidence: 1,
        memory: 1,
        source: 1,
      },
    });
    expect(groups.active.map((node) => node.id)).toEqual(["runner:mission-alpha"]);
    expect(groups.attention.map((node) => node.id)).toEqual([
      "patch:patch-alpha",
      "memory:learning-memory-console",
      "source:source-alpha",
    ]);
    expect(groups.ready.map((node) => node.id)).toEqual([
      "mission:mission-alpha",
      "candidate:wic-alpha",
      "evidence:ev-alpha",
    ]);
  });

  it("uses deterministic sorting when timestamps are missing", () => {
    const map = buildMissionOperationsMap({
      runnerTheater: [
        {
          id: "runner-b",
          title: "runner b",
          role: "implementer",
          agent: "agent-b",
          model: "route: default",
          status: "done",
          lane: "done",
          liveness: "unknown",
          ageMinutes: null,
          lastOutput: "",
          eventCount: 0,
          artifactCount: 0,
          note: "runner theater · read-only · observed only",
        },
        {
          id: "runner-a",
          title: "runner a",
          role: "implementer",
          agent: "agent-a",
          model: "route: default",
          status: "done",
          lane: "done",
          liveness: "unknown",
          ageMinutes: null,
          lastOutput: "",
          eventCount: 0,
          artifactCount: 0,
          note: "runner theater · read-only · observed only",
        },
      ],
    });

    expect(map.nodes.map((node) => node.id)).toEqual([
      "mission:runner-a",
      "mission:runner-b",
      "runner:runner-a",
      "runner:runner-b",
    ]);
  });

  it("keeps the projection generic and free of side-effect language", () => {
    const blob = JSON.stringify(buildMissionOperationsMap(input)).toLowerCase();

    expect(blob).toContain("read-only");
    expect(blob).toContain("ref-only");
    expect(blob).not.toMatch(
      /erp|company|customer|create workitem|committed lifecycle|launch|eventstorage append|server write|runner dispatch|patch apply|external send/,
    );
  });
});
