import { describe, expect, it } from "vitest";
import type { Stage3DebateSession } from "../runtime/stage3Runtime";
import { resolveInitialDebateSession } from "./initialDebateSession";

function session(overrides: Partial<Stage3DebateSession> = {}): Stage3DebateSession {
  return {
    id: "debate_sample",
    problem: "문제",
    summary: "요약",
    contextPreview: [],
    participants: [],
    rounds: [
      {
        id: "round_1",
        debateId: "debate_sample",
        kind: "problem_definition",
        title: "문제 정의",
        status: "completed",
        utterances: [
          {
            id: "utt_1",
            roundId: "round_1",
            agentId: "agent_orchestrator",
            content: "실제 발언",
            tags: [],
            createdAt: "2026-06-12T00:00:00.000Z",
          },
        ],
      },
    ] satisfies Stage3DebateSession["rounds"],
    humanPeek: [],
    statusHub: [],
    promotedAt: "2026-06-12T00:00:00.000Z",
    runState: "live",
    ...overrides,
  };
}

describe("resolveInitialDebateSession", () => {
  it("prefers a live sample that has real utterances", () => {
    const sample = session();
    const result = resolveInitialDebateSession({ sample, fallback: () => session({ id: "debate_fallback" }) });
    expect(result.id).toBe("debate_sample");
  });

  it("falls back when the sample is not a live capture", () => {
    const sample = session({ runState: "mock" });
    const result = resolveInitialDebateSession({ sample, fallback: () => session({ id: "debate_fallback" }) });
    expect(result.id).toBe("debate_fallback");
  });

  it("falls back when the sample has no utterances or no sample at all", () => {
    const empty = session({ rounds: [] });
    expect(
      resolveInitialDebateSession({ sample: empty, fallback: () => session({ id: "debate_fallback" }) }).id,
    ).toBe("debate_fallback");
    expect(
      resolveInitialDebateSession({ sample: undefined, fallback: () => session({ id: "debate_fallback" }) }).id,
    ).toBe("debate_fallback");
  });
});
