import { describe, expect, it } from "vitest";
import type { DebateRound } from "@ai-orchestrator/protocol";
import { deriveStanceTrajectories, debateHadPositionChanges, tagPolarity } from "./debateEngine.js";

function round(id: string, kind: DebateRound["kind"], utterances: Array<{ agentId: string; tag: string }>): DebateRound {
  return {
    id,
    kind,
    title: id,
    status: "completed",
    utterances: utterances.map((u, i) => ({
      id: `${id}_${i}`,
      roundId: id,
      agentId: u.agentId,
      content: `발언 ${u.tag}`,
      tags: [u.tag as never],
      createdAt: "2026-06-11T00:00:00.000Z",
    })),
    debateId: "debate_test",
  } as unknown as DebateRound;
}

describe("patch 5 — stance trajectory", () => {
  it("태그 극성 매핑", () => {
    expect(tagPolarity("agreement")).toBe("support");
    expect(tagPolarity("objection")).toBe("oppose");
    expect(tagPolarity("risk")).toBe("oppose");
    expect(tagPolarity("evidence")).toBe("neutral");
  });

  it("비판 후 입장을 바꾸면 changeCount가 잡힌다 (reasoning 신호)", () => {
    const rounds = [
      round("r1", "initial_proposals", [{ agentId: "skeptic", tag: "objection" }]),
      round("r2", "refinement", [{ agentId: "skeptic", tag: "agreement" }]),
    ];
    const traj = deriveStanceTrajectories(rounds);
    const skeptic = traj.find((t) => t.agentId === "skeptic")!;
    expect(skeptic.changeCount).toBe(1);
    expect(skeptic.finalPolarity).toBe("support");
    expect(skeptic.summary).toContain("입장 변화");
    expect(debateHadPositionChanges(rounds)).toBe(true);
  });

  it("아무도 안 바뀌면 parallel-monologue로 탐지", () => {
    const rounds = [
      round("r1", "initial_proposals", [{ agentId: "a", tag: "agreement" }, { agentId: "b", tag: "objection" }]),
      round("r2", "cross_critique", [{ agentId: "a", tag: "agreement" }, { agentId: "b", tag: "objection" }]),
    ];
    expect(debateHadPositionChanges(rounds)).toBe(false);
    const a = deriveStanceTrajectories(rounds).find((t) => t.agentId === "a")!;
    expect(a.summary).toContain("일관된 지지");
  });

  it("중립(evidence)은 극성 변화로 안 침", () => {
    const rounds = [
      round("r1", "initial_proposals", [{ agentId: "x", tag: "objection" }]),
      round("r2", "cross_critique", [{ agentId: "x", tag: "evidence" }]),
      round("r3", "refinement", [{ agentId: "x", tag: "objection" }]),
    ];
    const x = deriveStanceTrajectories(rounds).find((t) => t.agentId === "x")!;
    expect(x.changeCount).toBe(0); // oppose → neutral → oppose, 결정적 극성은 그대로
  });
});
