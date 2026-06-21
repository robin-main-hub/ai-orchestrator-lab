import { describe, expect, it } from "vitest";
import { debateTagSchema, debateUtteranceSchema } from "./index.js";

// debateUtteranceSchema is one agent's turn in a multi-agent debate round — the
// atomic unit of the OS's deliberation model. The round kind vocab and the round
// happy-path are pinned elsewhere, but the tag vocab and the utterance shape
// itself were never pinned directly. The FRESH authority angle here is a
// DELIBERATION TURN WITH A DEFERRED CONSENSUS LEDGER: (1) REQUIRED CLOSED-VOCAB
// TAGS — `tags` is a required array of the five-member debateTag vocab
// (agreement/objection/evidence/risk/coding_impact); an unknown tag is
// transitively rejected, so a turn can never be classified outside the debate
// taxonomy. The array is required but MAY be empty (an untagged turn is legal;
// an absent tags field is not). (2) THE CONSENSUS LEDGER ACCRETES LATER — the
// accept/reject bookkeeping (acceptedBy, rejectedBy, decisionId, evidenceRefIds,
// codingImpactRefs) and the reply pointer (parentUtteranceId) are ALL optional,
// so an utterance is recorded the moment it is spoken, before anyone has
// accepted or rejected it; consensus is layered on afterwards rather than being
// a precondition of recording the turn. Only id/agentId/roundId/content/
// createdAt (+ tags) are required. (3) PLAIN-OBJECT STRIP — being a plain
// z.object, an unknown key is stripped, not carried. Enum members read back via
// `.options`.

const utterance = {
  id: "utt-1",
  agentId: "agent-architect",
  roundId: "round-1",
  content: "pin Event Storage first",
  tags: ["evidence", "coding_impact"],
  createdAt: "2026-06-21T00:00:00.000Z",
};

describe("debateTag — closed deliberation taxonomy", () => {
  it("admits exactly the five declared tags", () => {
    expect(debateTagSchema.options).toEqual([
      "agreement",
      "objection",
      "evidence",
      "risk",
      "coding_impact",
    ]);
    expect(debateTagSchema.safeParse("nitpick").success).toBe(false);
  });
});

describe("debateUtterance — required closed-vocab tags", () => {
  it("accepts a fully-formed utterance", () => {
    expect(debateUtteranceSchema.safeParse(utterance).success).toBe(true);
  });

  it("requires the tags array but allows it to be empty (an untagged turn is legal)", () => {
    expect(debateUtteranceSchema.safeParse({ ...utterance, tags: [] }).success).toBe(true);
    const { tags: _omit, ...without } = utterance;
    expect(debateUtteranceSchema.safeParse(without).success).toBe(false); // absent tags is not legal
  });

  it("transitively rejects an unknown tag (a turn cannot leave the taxonomy)", () => {
    expect(debateUtteranceSchema.safeParse({ ...utterance, tags: ["evidence", "bogus"] }).success).toBe(false);
  });
});

describe("debateUtterance — consensus ledger accretes after the turn", () => {
  it("records a bare turn with no accept/reject bookkeeping", () => {
    // none of acceptedBy/rejectedBy/decisionId/evidenceRefIds/codingImpactRefs/parentUtteranceId
    expect(debateUtteranceSchema.safeParse(utterance).success).toBe(true);
  });

  it("layers the full consensus ledger on later", () => {
    const adjudicated = {
      ...utterance,
      parentUtteranceId: "utt-0",
      acceptedBy: ["agent-orchestrator"],
      rejectedBy: ["agent-reviewer"],
      decisionId: "decision-1",
      evidenceRefIds: ["ev-1"],
      codingImpactRefs: ["packet.verificationPlan"],
    };
    expect(debateUtteranceSchema.safeParse(adjudicated).success).toBe(true);
  });

  it("requires the core fields — a missing content fails", () => {
    const { content: _omit, ...without } = utterance;
    expect(debateUtteranceSchema.safeParse(without).success).toBe(false);
  });

  it("strips unknown keys rather than carrying them", () => {
    const parsed = debateUtteranceSchema.parse({ ...utterance, forgedScore: 99 });
    expect("forgedScore" in parsed).toBe(false);
  });
});
