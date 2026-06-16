import { describe, expect, it } from "vitest";
import {
  buildLearningRuntimeManifest,
  isLearningSkillLoadable,
} from "./learningRuntimeManifest.js";
import type { SkillArchiveCandidate, SkillRuntimeActivationRecord, SkillTrustStatus } from "./skillArchive.js";
import type { MemoryEvalReport, MemoryEvalVerdict } from "./memoryEval.js";

function cand(id: string, trustStatus: SkillTrustStatus): SkillArchiveCandidate {
  return {
    id,
    missionId: "m1",
    source: "merge_pattern",
    title: `skill ${id}`,
    summary: "…",
    triggerPatterns: [],
    relatedFiles: [],
    confidence: "medium",
    trustStatus,
    createdAt: "2026-06-16T00:00:00.000Z",
  };
}

function activation(
  candidateId: string,
  over: Partial<SkillRuntimeActivationRecord> = {},
): SkillRuntimeActivationRecord {
  return { candidateId, activationStatus: "active", ...over };
}

function evalReport(verdict: MemoryEvalVerdict): MemoryEvalReport {
  return {
    evalCaseId: "case_1",
    k: 5,
    verdict,
    recallAtK: verdict === "fail" ? 0 : 1,
    expectedHitIds: [],
    missingExpectedIds: [],
    forbiddenHitIds: [],
    forbiddenHitRate: 0,
    staleHitIds: [],
    staleHitRate: 0,
    contradictedHitIds: [],
    supersededHitIds: [],
    unknownRetrievedIds: [],
    blockers: [],
    warnings: [],
  };
}

describe("buildLearningRuntimeManifest — eval gate over activation contract", () => {
  it("(C3-1) active + evalRunId + eval pass → loadable", () => {
    const m = buildLearningRuntimeManifest({
      candidates: [cand("s", "curator_approved")],
      activations: [activation("s", { evalRunId: "e1" })],
      evalReportsByRunId: { e1: evalReport("pass") },
    });
    expect(m.loadable.map((e) => e.candidateId)).toEqual(["s"]);
    expect(m.loadable[0]!.evalVerdict).toBe("pass");
    expect(m.loadable[0]!.evalWarned).toBe(false);
  });

  it("(C3-2) eval fail blocks load even when activation is active", () => {
    const m = buildLearningRuntimeManifest({
      candidates: [cand("s", "curator_approved")],
      activations: [activation("s", { evalRunId: "e1" })],
      evalReportsByRunId: { e1: evalReport("fail") },
    });
    expect(m.loadable).toEqual([]);
    expect(m.blocked.find((b) => b.candidateId === "s")?.reasons).toContain("eval_failed");
  });

  it("(C3-3) eval warning surfaces but does NOT fake pass (still loadable, evalWarned=true)", () => {
    const m = buildLearningRuntimeManifest({
      candidates: [cand("s", "pinned")],
      activations: [activation("s", { evalRunId: "e1" })],
      evalReportsByRunId: { e1: evalReport("warning") },
    });
    expect(m.loadable.map((e) => e.candidateId)).toEqual(["s"]);
    expect(m.loadable[0]!.evalVerdict).toBe("warning");
    expect(m.loadable[0]!.evalWarned).toBe(true);
  });

  it("(C3-4) evalRunId present but report missing → conservative block (no fake pass)", () => {
    const m = buildLearningRuntimeManifest({
      candidates: [cand("s", "curator_approved")],
      activations: [activation("s", { evalRunId: "e_missing" })],
      evalReportsByRunId: {},
    });
    expect(m.loadable).toEqual([]);
    expect(m.blocked.find((b) => b.candidateId === "s")?.reasons).toContain("eval_failed");
  });

  it("(C3-5) waiver path (no evalRunId) bypasses eval gate but stays loadable", () => {
    const m = buildLearningRuntimeManifest({
      candidates: [cand("s", "pinned")],
      activations: [activation("s", { evalWaiverReason: "bootstrap" })],
    });
    expect(m.loadable.map((e) => e.candidateId)).toEqual(["s"]);
    expect(m.loadable[0]!.evalWarned).toBe(false);
  });

  it("(C3-6) pinned without eval basis is not loadable (activation contract blocks)", () => {
    const m = buildLearningRuntimeManifest({
      candidates: [cand("s", "pinned")],
      activations: [activation("s")], // no evalRunId, no waiver
    });
    expect(m.loadable).toEqual([]);
    expect(m.blocked.find((b) => b.candidateId === "s")?.reasons).toContain("no_eval_basis");
  });

  it("(C3-7) quarantined never loadable even with passing eval", () => {
    const m = buildLearningRuntimeManifest({
      candidates: [cand("s", "pinned")],
      activations: [activation("s", { activationStatus: "quarantined", evalRunId: "e1" })],
      evalReportsByRunId: { e1: evalReport("pass") },
    });
    expect(m.loadable).toEqual([]);
    expect(m.blocked.find((b) => b.candidateId === "s")?.reasons).toContain("quarantined");
  });

  it("(C3-8) suggested never loadable regardless of eval", () => {
    const m = buildLearningRuntimeManifest({
      candidates: [cand("s", "suggested")],
      activations: [activation("s", { evalRunId: "e1" })],
      evalReportsByRunId: { e1: evalReport("pass") },
    });
    expect(m.loadable).toEqual([]);
    expect(m.blocked.find((b) => b.candidateId === "s")?.reasons).toContain("not_trusted");
  });

  it("(C3-9) deterministic order + identical output for reordered input", () => {
    const candidates = [cand("c", "curator_approved"), cand("a", "pinned"), cand("b", "curator_approved")];
    const activations = [
      activation("c", { evalRunId: "e1" }),
      activation("a", { evalWaiverReason: "x" }),
      activation("b", { evalRunId: "e2" }),
    ];
    const reports = { e1: evalReport("pass"), e2: evalReport("fail") };
    const m1 = buildLearningRuntimeManifest({ candidates, activations, evalReportsByRunId: reports });
    const m2 = buildLearningRuntimeManifest({
      candidates: [...candidates].reverse(),
      activations: [...activations].reverse(),
      evalReportsByRunId: reports,
    });
    expect(m1).toEqual(m2);
    expect(m1.loadable.map((e) => e.candidateId)).toEqual(["a", "c"]); // b blocked by eval fail
    expect(m1.blocked.map((b) => b.candidateId)).toContain("b");
  });

  it("(C3-10) empty input → empty manifest", () => {
    const m = buildLearningRuntimeManifest({ candidates: [], activations: [] });
    expect(m.loadable).toEqual([]);
    expect(m.blocked).toEqual([]);
  });
});

describe("isLearningSkillLoadable — single-skill convenience", () => {
  it("(C3-11) active+approved+evalRunId+pass → loadable", () => {
    const v = isLearningSkillLoadable(
      cand("s", "curator_approved"),
      activation("s", { evalRunId: "e1" }),
      evalReport("pass"),
    );
    expect(v.loadable).toBe(true);
    expect(v.evalWarned).toBe(false);
  });

  it("(C3-12) eval fail → not loadable", () => {
    const v = isLearningSkillLoadable(
      cand("s", "curator_approved"),
      activation("s", { evalRunId: "e1" }),
      evalReport("fail"),
    );
    expect(v.loadable).toBe(false);
    expect(v.reasons).toContain("eval_failed");
  });

  it("(C3-13) activation contract failure short-circuits before eval", () => {
    const v = isLearningSkillLoadable(cand("s", "rejected"), activation("s", { evalRunId: "e1" }), evalReport("pass"));
    expect(v.loadable).toBe(false);
    expect(v.reasons).toContain("not_trusted");
  });

  it("(C3-14) evalRunId present but no report passed → conservative block", () => {
    const v = isLearningSkillLoadable(cand("s", "curator_approved"), activation("s", { evalRunId: "e1" }), undefined);
    expect(v.loadable).toBe(false);
    expect(v.reasons).toContain("eval_failed");
  });
});
