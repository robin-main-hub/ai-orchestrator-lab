import { describe, expect, it } from "vitest";
import {
  projectWorkItemCandidates,
  candidatesFromPatchCandidates,
  candidatesFromRunnerTheater,
  candidatesFromEvidenceDraft,
  candidatesFromLearningMemory,
  candidatesFromSourceHealth,
  deriveWorkItemCandidates,
  summarizeWorkItemCandidates,
  EXAMPLE_WORK_ITEM_CANDIDATE_INPUTS,
  type WorkItemCandidateInput,
} from "./workItemCandidate";
import type { PatchCandidate } from "./plugins/patchCandidateSource";
import type { RunnerTheaterRow } from "./runnerTheater";
import type { EvidenceDraft } from "./evidenceDraft";
import type { LearningMemoryConsole } from "./learningMemoryConsole";

const FORBIDDEN = ["giolite", "erp", "customer", "sales", "quotation", "buyer", "factory"];

describe("E5 — WorkItem candidate (candidate-only seed)", () => {
  it("normalizes, drops invalid, de-dupes, and sorts by lane then risk", () => {
    const inputs: WorkItemCandidateInput[] = [
      { id: "b", title: "watch-low", kind: "evidence", lane: "watch", status: "candidate", risk: "low" },
      { id: "a", title: "now-high", kind: "patch", lane: "now", status: "blocked", risk: "high" },
      { id: "a", title: "dup", kind: "patch", lane: "now", status: "blocked", risk: "high" }, // dup id dropped
      { id: "", title: "no-id", kind: "patch", lane: "now", status: "blocked", risk: "high" }, // invalid
      { id: "c", title: "bad-kind", kind: "nope" as never, lane: "now", status: "blocked", risk: "high" }, // invalid
    ];
    const rows = projectWorkItemCandidates(inputs);
    expect(rows.map((r) => r.id)).toEqual(["a", "b"]); // invalid + dup dropped, now-high first
    expect(rows[0]?.note).toContain("not committed work");
    expect(rows[0]?.observed).toBe(false); // honest default
    expect(rows[1]?.reason).toBe("flagged as a work candidate"); // default reason
  });

  it("derives candidates from patch candidates (blocked/warning only)", () => {
    const patches = [
      { candidateId: "p1", missionId: "m1", safetyStatus: "blocked", observed: true, evidenceRefs: ["e1"] },
      { candidateId: "p2", missionId: "m2", safetyStatus: "warning", observed: false, evidenceRefs: [] },
      { candidateId: "p3", missionId: "m3", safetyStatus: "pass", observed: true, evidenceRefs: [] },
    ] as unknown as PatchCandidate[];
    const out = candidatesFromPatchCandidates(patches);
    expect(out.map((c) => c.id)).toEqual(["wic-patch-p1", "wic-patch-p2"]); // pass excluded
    expect(out[0]).toMatchObject({ lane: "now", risk: "high", status: "blocked", kind: "patch" });
    expect(out[0]?.evidenceRefs).toEqual(["e1"]);
    expect(out[1]).toMatchObject({ lane: "soon", risk: "medium", status: "candidate" });
  });

  it("derives candidates from runner attention + stalled-active", () => {
    const rows = [
      { id: "r1", title: "blocked runner", lane: "attention", liveness: "idle", status: "blocked" },
      { id: "r2", title: "stalled runner", lane: "active", liveness: "stale", status: "running" },
      { id: "r3", title: "healthy runner", lane: "active", liveness: "live", status: "running" },
    ] as unknown as RunnerTheaterRow[];
    const out = candidatesFromRunnerTheater(rows);
    expect(out.map((c) => c.id)).toEqual(["wic-runner-r1", "wic-runner-r2"]); // healthy excluded
    expect(out[1]?.reason).toContain("stale");
  });

  it("derives candidates from evidence draft missing-info and memory health", () => {
    const draft = {
      id: "d1",
      missing: [{ claimId: "c4", text: "downstream not assessed", ask: "ask the operator to attach evidence" }],
    } as unknown as EvidenceDraft;
    const ev = candidatesFromEvidenceDraft(draft);
    expect(ev[0]).toMatchObject({ kind: "evidence", lane: "watch", risk: "low" });
    expect(ev[0]?.id).toBe("wic-evidence-d1-c4");

    const console = {
      evalHealth: { fail: 1, forbiddenHits: 2, contradictedHits: 1 },
    } as unknown as LearningMemoryConsole;
    const mem = candidatesFromLearningMemory(console);
    expect(mem.map((c) => c.id)).toEqual(["wic-memory-eval-fail", "wic-memory-hygiene"]);
    expect(mem[0]).toMatchObject({ lane: "now", risk: "high" });
  });

  it("derives candidates from source health (error/stale only)", () => {
    const out = candidatesFromSourceHealth([
      { pluginId: "src-a", health: "error" },
      { pluginId: "src-b", health: "stale" },
      { pluginId: "src-c", health: "connected" },
    ]);
    expect(out.map((c) => c.id)).toEqual(["wic-source-src-a", "wic-source-src-b"]); // connected excluded
    expect(out[0]).toMatchObject({ lane: "now", risk: "high" });
    expect(out[1]).toMatchObject({ lane: "watch", risk: "low" });
  });

  it("the central axis composes all surfaces and stays honest-empty with nothing", () => {
    expect(deriveWorkItemCandidates({})).toEqual([]);
    const merged = deriveWorkItemCandidates({
      sourceHealth: [{ pluginId: "src-a", health: "error" }],
      extra: [{ id: "x1", title: "manual", kind: "patch", lane: "soon", status: "candidate", risk: "medium" }],
    });
    expect(merged.map((c) => c.id)).toEqual(["wic-source-src-a", "x1"]); // now before soon
  });

  it("summarizes by lane + kind", () => {
    const rows = projectWorkItemCandidates(EXAMPLE_WORK_ITEM_CANDIDATE_INPUTS);
    const s = summarizeWorkItemCandidates(rows);
    expect(s.total).toBe(4);
    expect(s.now).toBe(2);
    expect(s.watch).toBe(2);
    expect(s.byKind.patch).toBe(1);
    expect(s.byKind.runner).toBe(1);
  });

  it("is deterministic and carries no domain vocabulary", () => {
    const a = JSON.stringify(projectWorkItemCandidates(EXAMPLE_WORK_ITEM_CANDIDATE_INPUTS));
    const b = JSON.stringify(projectWorkItemCandidates(EXAMPLE_WORK_ITEM_CANDIDATE_INPUTS));
    expect(a).toBe(b);
    const blob = a.toLowerCase();
    for (const term of FORBIDDEN) expect(blob.includes(term)).toBe(false);
  });
});
