import { describe, expect, it } from "vitest";
import {
  projectWorkItemCandidates,
  type WorkItemCandidateInput,
} from "./workItemCandidate";
import type { RunnerTheaterRow } from "./runnerTheater";
import { linkCandidatesToRunnerSignals } from "./workItemCandidateRunnerSignals";

const candidates: WorkItemCandidateInput[] = [
  {
    id: "wic-runner-ms-stale",
    title: "stale runner candidate",
    kind: "runner",
    lane: "now",
    status: "observed",
    risk: "high",
    sourceRefs: ["agent/stale-branch"],
    observed: true,
    reason: "runner running · heartbeat stale",
  },
  {
    id: "wic-runner-missing",
    title: "missing runner ref",
    kind: "runner",
    lane: "watch",
    status: "candidate",
    risk: "medium",
    sourceRefs: ["agent/missing-branch"],
    reason: "runner ref only",
  },
];

const runners: RunnerTheaterRow[] = [
  {
    id: "ms-stale",
    title: "stale runner candidate",
    role: "Implementer",
    agent: "implementer",
    model: "route: policy",
    status: "running",
    lane: "active",
    liveness: "stale",
    ageMinutes: 45,
    heartbeatAt: "2026-06-18T11:15:00.000Z",
    lastOutput: "waiting on heartbeat",
    eventCount: 2,
    artifactCount: 1,
    branch: "agent/stale-branch",
    note: "runner theater · read-only · observed only",
  },
];

describe("E16 — WorkItem Candidate runner signal links", () => {
  it("links candidates to existing runner theater rows by id or source ref", () => {
    const projected = projectWorkItemCandidates(candidates);
    const links = linkCandidatesToRunnerSignals(projected, runners);

    expect(links.byCandidateId["wic-runner-ms-stale"]?.signals.map((s) => s.signal)).toEqual([
      "runner-stalled",
    ]);
    expect(links.byCandidateId["wic-runner-ms-stale"]?.signals[0]).toMatchObject({
      runnerId: "ms-stale",
      missionId: "ms-stale",
      branch: "agent/stale-branch",
      lane: "active",
      liveness: "stale",
    });
    expect(links.byRunnerId["ms-stale"]?.candidateIds).toEqual(["wic-runner-ms-stale"]);
  });

  it("keeps unresolved runner refs honest without fabricating links", () => {
    const projected = projectWorkItemCandidates(candidates);
    const links = linkCandidatesToRunnerSignals(projected, runners);

    expect(links.byCandidateId["wic-runner-missing"]?.signals).toEqual([]);
    expect(links.byCandidateId["wic-runner-missing"]?.unresolvedRefs).toEqual([
      "agent/missing-branch",
    ]);
  });
});
