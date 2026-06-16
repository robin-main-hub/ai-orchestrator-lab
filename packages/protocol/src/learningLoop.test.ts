import { describe, it, expect } from "vitest";
import {
  failureInvestigationSchema,
  failureHypothesisSchema,
  memoryConsultRecordSchema,
  createDistilledCandidate,
  recordMemoryConsult,
} from "./learningLoop.js";

describe("Learning Loop Invariant Tests", () => {
  const nowStr = () => "2026-06-16T12:00:00.000Z";

  describe("Failure Investigation", () => {
    it("should pass when sandboxErrorCardId is present", () => {
      const parsed = failureInvestigationSchema.safeParse({
        id: "inv-1",
        missionId: "mission-1",
        sandboxErrorCardId: "err-1",
        rootFailureSummary: "TypeScript compiler error TS2532",
        artifactIds: ["art-1"],
        createdAt: nowStr(),
      });
      expect(parsed.success).toBe(true);
    });

    it("should pass when verificationReportId is present", () => {
      const parsed = failureInvestigationSchema.safeParse({
        id: "inv-2",
        missionId: "mission-1",
        verificationReportId: "rep-1",
        rootFailureSummary: "Vitest test suite failed",
        artifactIds: ["art-2"],
        createdAt: nowStr(),
      });
      expect(parsed.success).toBe(true);
    });

    it("should fail when neither sandboxErrorCardId nor verificationReportId is present", () => {
      const parsed = failureInvestigationSchema.safeParse({
        id: "inv-3",
        missionId: "mission-1",
        rootFailureSummary: "General error",
        artifactIds: [],
        createdAt: nowStr(),
      });
      expect(parsed.success).toBe(false);
    });
  });

  describe("Failure Hypothesis", () => {
    it("should pass status: verified when evidenceRefs is present", () => {
      const parsed = failureHypothesisSchema.safeParse({
        id: "hyp-1",
        missionId: "mission-1",
        investigationId: "inv-1",
        claim: "Null pointer error in index.ts",
        evidenceRefs: ["ref-1"],
        status: "verified",
        confidence: "high",
        createdAt: nowStr(),
      });
      expect(parsed.success).toBe(true);
    });

    it("should pass status: verified when artifactIds is present", () => {
      const parsed = failureHypothesisSchema.safeParse({
        id: "hyp-2",
        missionId: "mission-1",
        investigationId: "inv-1",
        claim: "Null pointer error in index.ts",
        artifactIds: ["art-1"],
        status: "verified",
        confidence: "medium",
        createdAt: nowStr(),
      });
      expect(parsed.success).toBe(true);
    });

    it("should fail status: verified when both evidenceRefs and artifactIds are empty", () => {
      const parsed = failureHypothesisSchema.safeParse({
        id: "hyp-3",
        missionId: "mission-1",
        investigationId: "inv-1",
        claim: "Null pointer error in index.ts",
        evidenceRefs: [],
        artifactIds: [],
        status: "verified",
        confidence: "low",
        createdAt: nowStr(),
      });
      expect(parsed.success).toBe(false);
    });

    it("should pass non-verified status even when empty refs/artifacts", () => {
      const parsed = failureHypothesisSchema.safeParse({
        id: "hyp-4",
        missionId: "mission-1",
        investigationId: "inv-1",
        claim: "Null pointer error in index.ts",
        evidenceRefs: [],
        artifactIds: [],
        status: "draft",
        confidence: "low",
        createdAt: nowStr(),
      });
      expect(parsed.success).toBe(true);
    });
  });

  describe("Distilled Learning Candidate", () => {
    const verifiedHypothesis = {
      id: "hyp-v",
      missionId: "mission-1",
      investigationId: "inv-1",
      claim: "Null check needed on payload.user",
      evidenceRefs: ["ref-1"],
      artifactIds: [],
      probeCommands: [],
      status: "verified" as const,
      confidence: "high" as const,
      createdAt: nowStr(),
    };

    const rejectedHypothesis = {
      ...verifiedHypothesis,
      id: "hyp-r",
      status: "rejected" as const,
    };

    const draftHypothesis = {
      ...verifiedHypothesis,
      id: "hyp-d",
      status: "draft" as const,
    };

    it("should create distilled candidate when hypothesis is verified", () => {
      const candidate = createDistilledCandidate(
        verifiedHypothesis,
        {
          id: "dist-1",
          title: "Avoid TS2532 on user payload",
          rule: "Add user check guard",
          target: "skill",
          trustStatus: "suggested",
        },
        nowStr,
      );
      expect(candidate.missionId).toBe("mission-1");
      expect(candidate.hypothesisId).toBe("hyp-v");
      expect(candidate.trustStatus).toBe("suggested");
    });

    it("should throw error when hypothesis is rejected", () => {
      expect(() =>
        createDistilledCandidate(
          rejectedHypothesis,
          {
            id: "dist-2",
            title: "Rules",
            rule: "Always do X",
            target: "memory",
            trustStatus: "curator_required",
          },
          nowStr,
        ),
      ).toThrow("Rejected hypothesis cannot be used to distill a learning candidate");
    });

    it("should throw error when hypothesis is draft", () => {
      expect(() =>
        createDistilledCandidate(
          draftHypothesis,
          {
            id: "dist-3",
            title: "Rules",
            rule: "Always do Y",
            target: "workflow_template",
            trustStatus: "curator_required",
          },
          nowStr,
        ),
      ).toThrow("Verified hypothesis is required to distill a learning candidate");
    });
  });

  describe("Memory Consult Record", () => {
    it("should record normal memory consult", () => {
      const record = recordMemoryConsult(
        {
          id: "cons-1",
          missionId: "mission-1",
          query: "how to build",
          consultedRecordIds: ["rec-1", "rec-2"],
        },
        nowStr,
      );
      expect(record.consultedRecordIds).toEqual(["rec-1", "rec-2"]);
      expect(record.skippedReason).toBeUndefined();
    });

    it("should record skipped consult with non-empty reason", () => {
      const record = recordMemoryConsult(
        {
          id: "cons-2",
          missionId: "mission-1",
          query: "how to build",
          skippedReason: "No relevant memory exists",
        },
        nowStr,
      );
      expect(record.skippedReason).toBe("No relevant memory exists");
      expect(record.consultedRecordIds).toEqual([]);
    });

    it("should throw error if skippedReason is empty string", () => {
      expect(() =>
        recordMemoryConsult(
          {
            id: "cons-3",
            missionId: "mission-1",
            query: "how to build",
            skippedReason: " ",
          },
          nowStr,
        ),
      ).toThrow("consult.skipped requires a non-empty skippedReason");
    });
  });
});
