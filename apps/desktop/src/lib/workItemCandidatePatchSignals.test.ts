import { describe, expect, it } from "vitest";
import {
  projectWorkItemCandidates,
  type WorkItemCandidateInput,
} from "./workItemCandidate";
import {
  projectPatchCandidates,
  type PatchCandidateInput,
} from "./plugins/patchCandidateSource";
import { linkCandidatesToPatchSignals } from "./workItemCandidatePatchSignals";

const workItemCandidates: WorkItemCandidateInput[] = [
  {
    id: "wic-patch-patch-001",
    title: "blocked patch candidate",
    kind: "patch",
    lane: "now",
    status: "blocked",
    risk: "high",
    sourceRefs: ["mission-alpha"],
    evidenceRefs: ["ev-risk"],
    observed: true,
    reason: "patch safety blocked",
  },
  {
    id: "wic-patch-missing",
    title: "missing patch candidate",
    kind: "patch",
    lane: "watch",
    status: "candidate",
    risk: "medium",
    sourceRefs: ["patch-missing"],
    evidenceRefs: ["ev-missing"],
    reason: "patch ref only",
  },
];

const patchCandidates: PatchCandidateInput[] = [
  {
    candidateId: "patch-001",
    runnerId: "runner-alpha",
    missionId: "mission-alpha",
    createdAt: "2026-06-18T12:00:00.000Z",
    changedFileCount: 2,
    additions: 12,
    deletions: 3,
    safetyStatus: "blocked",
    verificationStatus: "not_run",
    source: "runner",
    observed: true,
    files: [
      { path: "src/app.tsx", change: "modified", additions: 10, deletions: 2 },
      { path: "src/app.test.tsx", change: "modified", additions: 2, deletions: 1 },
    ],
    evidenceRefs: ["ev-risk"],
  },
];

describe("E17 — WorkItem Candidate patch signal links", () => {
  it("links candidates to existing patch rows by id, source ref, or evidence ref", () => {
    const candidates = projectWorkItemCandidates(workItemCandidates);
    const patches = projectPatchCandidates(patchCandidates);
    const links = linkCandidatesToPatchSignals(candidates, patches);

    expect(links.byCandidateId["wic-patch-patch-001"]?.signals.map((s) => s.signal)).toEqual([
      "patch-blocked",
      "diff-preview-available",
    ]);
    expect(links.byCandidateId["wic-patch-patch-001"]?.signals[0]).toMatchObject({
      patchCandidateId: "patch-001",
      runnerId: "runner-alpha",
      missionId: "mission-alpha",
      safetyStatus: "blocked",
      verificationStatus: "not_run",
      changedFileCount: 2,
      refStatus: "matched-row",
    });
    expect(links.byPatchCandidateId["patch-001"]?.candidateIds).toEqual(["wic-patch-patch-001"]);
  });

  it("keeps unresolved patch refs honest without fabricating links", () => {
    const candidates = projectWorkItemCandidates(workItemCandidates);
    const patches = projectPatchCandidates(patchCandidates);
    const links = linkCandidatesToPatchSignals(candidates, patches);

    expect(links.byCandidateId["wic-patch-missing"]?.signals).toEqual([]);
    expect(links.byCandidateId["wic-patch-missing"]?.unresolvedRefs).toEqual([
      "patch-missing",
      "ev-missing",
    ]);
  });
});
