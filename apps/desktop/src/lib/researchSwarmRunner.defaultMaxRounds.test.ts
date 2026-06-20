import { describe, expect, it, vi } from "vitest";
import {
  RESEARCH_DEFAULT_MAX_ROUNDS,
  createKnowledgeStepExecutor,
  runResearchAgent,
  type ResearchCompleteFn,
  type ResearchWireMessage,
} from "./researchSwarmRunner";

// Characterization tests (no behavior change) for RESEARCH_DEFAULT_MAX_ROUNDS, the
// only export in researchSwarmRunner.ts the existing researchSwarmRunner.test.ts
// leaves unasserted (that suite drives runResearchAgent through the "done" and
// "cancelled" exits, and pins parseResearchReply / buildResearchSystemPrompt /
// createKnowledgeStepExecutor — but never the "max_rounds" exit nor the default cap
// that bounds it).
//
// RESEARCH_DEFAULT_MAX_ROUNDS (16) is the termination-safety bound: when the caller
// omits maxRounds, it is the hard ceiling that stops a never-concluding agent from
// looping forever. The load-bearing invariant is that this constant is the *actual*
// loop bound — not just a number. We pin it through the runResearchAgent seam with a
// model that always emits an actionable step and never a conclusion: it must stop at
// exactly RESEARCH_DEFAULT_MAX_ROUNDS rounds with status "max_rounds", calling the
// completion exactly that many times; an explicit maxRounds must override it (proving
// 16 is only the default); and the late-round wind-down warning (maxRounds - 4) must
// fire within the default horizon.

// A reply that is a single actionable search fence with no trailing conclusion text
// → parseResearchReply yields one actionable directive and an empty conclusion, so
// runResearchAgent never takes the "done" exit and runs to the cap.
const NEVER_CONCLUDES = '```step\n{"kind":"search","query":"q","title":"q"}\n```';

describe("RESEARCH_DEFAULT_MAX_ROUNDS", () => {
  it("is 16, comfortably above the maxRounds-4 wind-down window", () => {
    expect(RESEARCH_DEFAULT_MAX_ROUNDS).toBe(16);
    expect(RESEARCH_DEFAULT_MAX_ROUNDS).toBeGreaterThan(4);
  });

  it("bounds a never-concluding agent at exactly the default cap (max_rounds exit)", async () => {
    const complete = vi.fn(async () => ({ content: NEVER_CONCLUDES }));
    const outcome = await runResearchAgent({
      systemPrompt: "sys",
      kickoff: "go",
      complete,
      executeStep: createKnowledgeStepExecutor(() => {}),
      onEvent: () => {},
      makeStepId: (r, i) => `${r}-${i}`,
      // maxRounds omitted → RESEARCH_DEFAULT_MAX_ROUNDS is the bound
    });

    expect(outcome.status).toBe("max_rounds");
    expect(outcome.rounds).toBe(RESEARCH_DEFAULT_MAX_ROUNDS);
    expect(complete).toHaveBeenCalledTimes(RESEARCH_DEFAULT_MAX_ROUNDS);
  });

  it("is only the default — an explicit maxRounds overrides it", async () => {
    const complete = vi.fn(async () => ({ content: NEVER_CONCLUDES }));
    const outcome = await runResearchAgent({
      systemPrompt: "sys",
      kickoff: "go",
      complete,
      executeStep: createKnowledgeStepExecutor(() => {}),
      onEvent: () => {},
      makeStepId: (r, i) => `${r}-${i}`,
      maxRounds: 3,
    });

    expect(outcome.status).toBe("max_rounds");
    expect(outcome.rounds).toBe(3);
    expect(complete).toHaveBeenCalledTimes(3);
    expect(outcome.rounds).toBeLessThan(RESEARCH_DEFAULT_MAX_ROUNDS);
  });

  it("fires the wind-down warning (maxRounds - 4) within the default horizon", async () => {
    const complete = vi.fn<ResearchCompleteFn>(async () => ({ content: NEVER_CONCLUDES }));
    await runResearchAgent({
      systemPrompt: "sys",
      kickoff: "go",
      complete,
      executeStep: createKnowledgeStepExecutor(() => {}),
      onEvent: () => {},
      makeStepId: (r, i) => `${r}-${i}`,
    });

    // The final completion call sees a conversation whose latest user payload was
    // assembled in a late round (>= maxRounds - 4), so it carries the wind-down note.
    const lastCall = complete.mock.calls.at(-1)!;
    const conversation: ResearchWireMessage[] = lastCall[0];
    const lastUser = [...conversation].reverse().find((m) => m.role === "user")!;
    expect(lastUser.content).toContain("곧 종료");
    expect(lastUser.content).toContain(`/${RESEARCH_DEFAULT_MAX_ROUNDS}`);
  });
});
