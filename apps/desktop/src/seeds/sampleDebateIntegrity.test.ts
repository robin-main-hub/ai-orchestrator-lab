import { describe, expect, it } from "vitest";
import { debateRoundKindSchema } from "@ai-orchestrator/protocol";
import { sampleDebateSession } from "./sampleDebate";

// Characterization tests (no behavior change, pure, no I/O) for the captured debate
// fixture. sampleDebate.ts is auto-generated (a real DGX-02 vLLM debate capture) and
// 0-ref across the test tree, yet it is the seed the workbench replays as a finished
// debate — so its internal referential integrity is load-bearing. Regeneration must
// keep the round/utterance graph self-consistent; a capture whose utterance points at
// a non-existent round or a speaker who never joined would replay a broken transcript.
// We assert structure only (id linkage, speaker membership, the canonical pipeline
// order, decision placement) — never the (model-authored, domain-flavored) content.

const session = sampleDebateSession;

describe("sampleDebateSession — captured debate referential integrity", () => {
  it("links every round to the session and every utterance to its own round, with globally unique ids", () => {
    const utteranceIds: string[] = [];
    for (const round of session.rounds) {
      expect(round.debateId).toBe(session.id);
      expect(round.id.startsWith(`${session.id}_round_`)).toBe(true);
      for (const utterance of round.utterances) {
        expect(utterance.roundId).toBe(round.id);
        utteranceIds.push(utterance.id);
      }
    }
    expect(new Set(utteranceIds).size).toBe(utteranceIds.length);
  });

  it("attributes every utterance to a declared participant (no orphan speaker)", () => {
    const participantIds = new Set(session.participants.map((participant) => participant.agentId));
    for (const round of session.rounds) {
      for (const utterance of round.utterances) {
        expect(participantIds.has(utterance.agentId)).toBe(true);
      }
    }
  });

  it("ran the full canonical debate pipeline in order", () => {
    expect(session.rounds.map((round) => round.kind)).toEqual(debateRoundKindSchema.options);
  });

  it("stamps a decisionId on exactly the final_decision round's utterances and nowhere else", () => {
    for (const round of session.rounds) {
      for (const utterance of round.utterances) {
        expect(Boolean(utterance.decisionId)).toBe(round.kind === "final_decision");
      }
    }
  });
});
