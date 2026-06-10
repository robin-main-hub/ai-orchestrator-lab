import type { CodingPacket, DebateRound, DebateUtterance } from "@ai-orchestrator/protocol";
import { describe, expect, it } from "vitest";
import type { DebateContext } from "./index.js";
import {
  chairmanDecisionToNotes,
  synthesizeChairmanDecision,
  withChairmanSynthesis,
} from "./chairmanSynthesis.js";

const context: DebateContext = {
  sessionId: "s1",
  problem: "캐시 무효화 전략을 정한다",
  conversationSummary: "",
  constraints: [],
  openQuestions: [],
  userPreferences: [],
  memoryTraceIds: [],
};

const utt = (over: Partial<DebateUtterance>): DebateUtterance => ({
  id: over.id ?? "u",
  agentId: over.agentId ?? "agent",
  roundId: "r1",
  content: over.content ?? "",
  tags: over.tags ?? [],
  acceptedBy: over.acceptedBy,
  rejectedBy: over.rejectedBy,
  createdAt: "2026-06-10T00:00:00.000Z",
});

const round = (utterances: DebateUtterance[]): DebateRound => ({
  id: "r1",
  debateId: "d1",
  kind: "final_decision",
  title: "결정",
  status: "completed",
  utterances,
});

describe("synthesizeChairmanDecision", () => {
  it("ranks adopted points by support and picks the top as the statement", () => {
    const decision = synthesizeChairmanDecision(context, [
      round([
        utt({ id: "a", agentId: "makise", content: "TTL 기반 무효화", tags: ["agreement"], acceptedBy: ["x", "y", "z"] }),
        utt({ id: "b", agentId: "asuka", content: "이벤트 기반 무효화", tags: ["agreement"], acceptedBy: ["x"] }),
      ]),
    ]);
    expect(decision.adopted[0]).toMatchObject({ point: "TTL 기반 무효화", support: 3 });
    expect(decision.statement).toBe("TTL 기반 무효화");
    expect(decision.consensusLevel).toBe("strong");
    expect(decision.confidence).toBe(1);
  });

  it("separates contested points and collects rejections + risks", () => {
    const decision = synthesizeChairmanDecision(context, [
      round([
        utt({ id: "c", content: "전체 캐시 flush", acceptedBy: ["x"], rejectedBy: ["y", "z"] }),
        utt({ id: "d", content: "수동 무효화는 위험", tags: ["risk"] }),
        utt({ id: "e", content: "글로벌 락 사용", tags: ["objection"] }),
      ]),
    ]);
    expect(decision.contested).toEqual([{ point: "전체 캐시 flush", for: 1, against: 2 }]);
    expect(decision.rejected).toContain("글로벌 락 사용");
    expect(decision.risks).toContain("수동 무효화는 위험");
    expect(decision.consensusLevel).toBe("split"); // 1 accept vs 2 reject
  });

  it("defaults to 0.5 confidence and a problem-based statement when nothing is voted", () => {
    const decision = synthesizeChairmanDecision(context, [round([])]);
    expect(decision.confidence).toBe(0.5);
    expect(decision.statement).toContain("캐시 무효화 전략");
  });

  it("ignores pending/blocked rounds", () => {
    const pending = { ...round([utt({ content: "무시됨", tags: ["agreement"], acceptedBy: ["x"] })]), status: "pending" as const };
    expect(synthesizeChairmanDecision(context, [pending]).adopted).toHaveLength(0);
  });
});

describe("withChairmanSynthesis", () => {
  const basePacket: CodingPacket = {
    goal: "g",
    context: [],
    decisions: ["기존 결정"],
    rejectedOptions: [],
    constraints: [],
    filesToInspect: [],
    implementationPlan: [],
    verificationPlan: [],
    reviewerNotes: ["기존 노트"],
  };

  it("adds the chairman summary to reviewerNotes without changing decision counts", () => {
    const decision = synthesizeChairmanDecision(context, [
      round([utt({ content: "TTL 무효화", tags: ["agreement"], acceptedBy: ["x", "y"] })]),
    ]);
    const packet = withChairmanSynthesis(basePacket, decision);
    // decisions/rejectedOptions untouched — chairman enriches, doesn't double-count
    expect(packet.decisions).toEqual(["기존 결정"]);
    expect(packet.reviewerNotes[0]).toContain("[Chairman 종합]");
    expect(packet.reviewerNotes.some((n) => n.includes("채택(지지 2): TTL 무효화"))).toBe(true);
    expect(packet.reviewerNotes).toContain("기존 노트");
  });

  it("chairmanDecisionToNotes includes consensus + contested lines", () => {
    const decision = synthesizeChairmanDecision(context, [
      round([utt({ content: "flush", acceptedBy: ["x"], rejectedBy: ["y"] })]),
    ]);
    const notes = chairmanDecisionToNotes(decision);
    expect(notes.some((n) => n.includes("합의 수준"))).toBe(true);
    expect(notes.some((n) => n.includes("쟁점:"))).toBe(true);
  });
});
