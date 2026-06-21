import { describe, expect, it } from "vitest";
import { branchExperimentSchema } from "./index.js";

// branchExperimentSchema is the record for a SPECULATIVE FORK — a named what-if
// alternative spun off a live session so an agent can explore a different line
// without disturbing the source. The status enum's vocabulary is pinned elsewhere
// (uiLabels label-exhaustiveness via `.options`), but the RECORD itself is never
// validated: the only references pass `branchExperiments={[]}`. The FRESH authority
// angle here is SPECULATIVE-FORK PROVENANCE BINDING: a fork can never be anonymous
// or origin-less. (1) DUAL MANDATORY PROVENANCE — `sourceSessionId` (which session
// this forked from) and `agentName` (who authored the fork) are both required, so
// every speculative branch is traceable back to its origin AND its author; neither
// can be omitted. (2) READINESS VOCAB ON THE RECORD — `status` accepts exactly the
// three readiness rungs {drafting, ready, adopted} and rejects anything else, so a
// fork's lifecycle stage is always one of the declared rungs (validated here
// through the record, not the standalone enum). (3) FULLY-SPECIFIED, NO PARTIAL
// DRAFT — id/sourceSessionId/title/agentName/status/summary/createdAt are all
// required: a branch experiment is recorded as a complete record, never a stub.
// (4) PLAIN-OBJECT STRIP — being a plain z.object, an unknown key is stripped.

const experiment = {
  id: "branch-1",
  sourceSessionId: "session-7",
  title: "try the streaming-first router",
  agentName: "architect",
  status: "drafting",
  summary: "fork exploring an alternate routing seam",
  createdAt: "2026-06-21T00:00:00.000Z",
};

describe("branchExperiment — speculative-fork provenance binding", () => {
  it("accepts a fully-formed fork record", () => {
    expect(branchExperimentSchema.safeParse(experiment).success).toBe(true);
  });

  it("binds dual provenance — a fork cannot be origin-less or anonymous", () => {
    const { sourceSessionId: _omitSrc, ...noSource } = experiment;
    const { agentName: _omitAgent, ...noAgent } = experiment;
    expect(branchExperimentSchema.safeParse(noSource).success).toBe(false);
    expect(branchExperimentSchema.safeParse(noAgent).success).toBe(false);
  });

  it("requires the remaining core fields — a missing title fails", () => {
    const { title: _omit, ...without } = experiment;
    expect(branchExperimentSchema.safeParse(without).success).toBe(false);
  });
});

describe("branchExperiment — readiness vocab on the record", () => {
  it("accepts each readiness rung and rejects anything else", () => {
    for (const status of ["drafting", "ready", "adopted"]) {
      expect(branchExperimentSchema.safeParse({ ...experiment, status }).success).toBe(true);
    }
    expect(branchExperimentSchema.safeParse({ ...experiment, status: "merged" }).success).toBe(false);
  });
});

describe("branchExperiment — plain-object strip", () => {
  it("strips an unknown key rather than carrying it", () => {
    const parsed = branchExperimentSchema.parse({ ...experiment, forgedAuthority: "elevated" });
    expect("forgedAuthority" in parsed).toBe(false);
  });
});
