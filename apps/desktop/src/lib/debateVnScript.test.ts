import type { DebateRound, DebateUtterance } from "@ai-orchestrator/protocol";
import { describe, expect, it } from "vitest";
import { buildDebateVnScript, finishLine } from "./debateVnScript";

const utt = (over: Partial<DebateUtterance>): DebateUtterance => ({
  id: over.id ?? "u",
  agentId: over.agentId ?? "agent",
  roundId: "r",
  content: over.content ?? "",
  tags: over.tags ?? [],
  createdAt: "2026-06-10T00:00:00.000Z",
});

const round = (kind: DebateRound["kind"], utterances: DebateUtterance[]): DebateRound => ({
  id: `r_${kind}`,
  debateId: "d",
  kind,
  title: kind,
  status: "completed",
  utterances,
});

describe("buildDebateVnScript", () => {
  it("turns utterances into VN lines, marking objections as counters", () => {
    const lines = buildDebateVnScript([
      round("initial_proposals", [
        utt({ agentId: "makise", content: "TTL 캐시로 가자 [[tag:agreement]]", tags: ["agreement"] }),
        utt({ agentId: "asuka", content: "그건 stale 위험 있어 [[tag:objection]]", tags: ["objection"] }),
      ]),
    ]);
    expect(lines[0]).toMatchObject({ speaker: "makise", text: "TTL 캐시로 가자", effect: "normal" });
    expect(lines[1]).toMatchObject({ speaker: "asuka", effect: "counter" });
  });

  it("marks final-decision round lines as finish", () => {
    const lines = buildDebateVnScript([round("final_decision", [utt({ agentId: "chair", content: "TTL 채택" })])]);
    expect(lines[0]!.effect).toBe("finish");
    expect(finishLine(lines)?.speaker).toBe("chair");
  });

  it("skips pending rounds and respects maxLines", () => {
    const pending = { ...round("refinement", [utt({ content: "ignored" })]), status: "pending" as const };
    expect(buildDebateVnScript([pending])).toHaveLength(0);
    const many = round(
      "cross_critique",
      Array.from({ length: 10 }, (_, i) => utt({ id: `u${i}`, content: `line ${i}` })),
    );
    expect(buildDebateVnScript([many], { maxLines: 3 })).toHaveLength(3);
  });

  it("returns undefined finishLine when there is no final decision", () => {
    expect(finishLine(buildDebateVnScript([round("refinement", [utt({ content: "x" })])]))).toBeUndefined();
  });
});
