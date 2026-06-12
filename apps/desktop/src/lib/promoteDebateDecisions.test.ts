import type { DebateRound } from "@ai-orchestrator/protocol";
import { describe, expect, it } from "vitest";
import { promoteDebateDecisions } from "./promoteDebateDecisions";

function round(overrides: Partial<DebateRound>): DebateRound {
  return {
    id: "round_x",
    debateId: "debate_x",
    kind: "final_decision",
    title: "최종 결정",
    status: "completed",
    utterances: [],
    ...overrides,
  };
}

function utterance(id: string, overrides: Partial<DebateRound["utterances"][number]> = {}) {
  return {
    id,
    agentId: "agent_orchestrator",
    roundId: "round_x",
    content: "발언",
    tags: ["agreement" as const],
    createdAt: "2026-06-12T00:00:00.000Z",
    ...overrides,
  };
}

describe("promoteDebateDecisions", () => {
  it("assigns decision ids to completed final_decision utterances, preserving existing ones", () => {
    const rounds = promoteDebateDecisions([
      round({ utterances: [utterance("u1"), utterance("u2", { decisionId: "decision_custom" })] }),
    ]);
    expect(rounds[0]!.utterances[0]!.decisionId).toBe("round_x_decision_1");
    expect(rounds[0]!.utterances[1]!.decisionId).toBe("decision_custom");
  });

  it("adds coding_impact to completed coding_packet utterances exactly once", () => {
    const rounds = promoteDebateDecisions([
      round({
        kind: "coding_packet",
        title: "코딩 패킷",
        utterances: [utterance("u1"), utterance("u2", { tags: ["coding_impact"] })],
      }),
    ]);
    expect(rounds[0]!.utterances[0]!.tags).toEqual(["agreement", "coding_impact"]);
    expect(rounds[0]!.utterances[1]!.tags).toEqual(["coding_impact"]);
  });

  it("leaves non-completed and other rounds untouched", () => {
    const pending = round({ status: "running", utterances: [utterance("u1")] });
    const critique = round({ kind: "cross_critique", title: "상호 비판", utterances: [utterance("u2")] });
    const rounds = promoteDebateDecisions([pending, critique]);
    expect(rounds[0]!.utterances[0]!.decisionId).toBeUndefined();
    expect(rounds[1]!.utterances[0]!.decisionId).toBeUndefined();
    expect(rounds[1]!.utterances[0]!.tags).toEqual(["agreement"]);
  });
});
