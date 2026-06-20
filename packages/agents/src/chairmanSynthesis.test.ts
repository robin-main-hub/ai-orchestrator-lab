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

// The happy cases above only adopt/reject via the agreement/objection *tags*,
// only ever see completed/pending rounds, never feed a [[tag:…]] marker or an
// over-length line, and never hit the moderate band, the contested+risk skip,
// dedupeAdopted, or the 반려 reviewer notes. Pin those branches, self-consistent
// (expected values derived from the same utterances/votes).
describe("chairmanSynthesis — vote-only routing, marker/truncate, contested-risk skip, dedupe, running", () => {
  it("routes by vote balance when no tag is present and lands in the moderate band at 0.5", () => {
    const decision = synthesizeChairmanDecision(context, [
      round([
        utt({ id: "a", agentId: "m", content: "투표 채택", acceptedBy: ["x"] }), // forCount 1, no tag → adopted
        utt({ id: "b", agentId: "n", content: "투표 반려", rejectedBy: ["y"] }), // againstCount>forCount, no tag → rejected
      ]),
    ]);
    expect(decision.adopted).toEqual([{ point: "투표 채택", support: 1, by: "m" }]);
    expect(decision.rejected).toEqual(["투표 반려"]);
    expect(decision.confidence).toBe(0.5); // accepts 1 / (1 reject) → 0.5
    expect(decision.consensusLevel).toBe("moderate"); // >=0.5 && <0.75
  });

  it("clean strips a trailing [[tag:…]] marker and truncates over-length content to (max-1)+…", () => {
    const long = "y".repeat(50) + " [[tag:agreement]]";
    const decision = synthesizeChairmanDecision(
      context,
      [
        round([
          utt({ id: "m1", content: "결정입니다 [[tag:agreement]]", tags: ["agreement"], acceptedBy: ["x"] }),
          utt({ id: "m2", content: long, tags: ["agreement"], acceptedBy: ["x"] }),
        ]),
      ],
      { truncateLength: 10 },
    );
    expect(decision.adopted.some((p) => p.point === "결정입니다")).toBe(true); // marker gone, no leftover brackets
    expect(decision.adopted.some((p) => p.point === `${"y".repeat(9)}…`)).toBe(true); // slice(0,9)+…
  });

  it("a contested utterance carrying a risk tag is NOT added to risks (the contested continue skips it)", () => {
    const decision = synthesizeChairmanDecision(context, [
      round([utt({ content: "위험한 쟁점", tags: ["risk"], acceptedBy: ["x"], rejectedBy: ["y"] })]),
    ]);
    expect(decision.contested).toEqual([{ point: "위험한 쟁점", for: 1, against: 1 }]);
    expect(decision.risks).toEqual([]); // contested branch `continue`d before the risk push
  });

  it("dedupeAdopted collapses identical adopted points to a single entry", () => {
    const decision = synthesizeChairmanDecision(context, [
      round([
        utt({ id: "a", agentId: "m", content: "동일 채택", tags: ["agreement"], acceptedBy: ["x", "y"] }),
        utt({ id: "b", agentId: "n", content: "동일 채택", tags: ["agreement"], acceptedBy: ["z"] }),
      ]),
    ]);
    expect(decision.adopted).toHaveLength(1);
    expect(decision.adopted[0]).toMatchObject({ point: "동일 채택", support: 2 }); // higher-support kept after sort
  });

  it("a RUNNING round contributes utterances just like a completed one", () => {
    const running = { ...round([utt({ content: "진행 중 채택", tags: ["agreement"], acceptedBy: ["x"] })]), status: "running" as const };
    expect(synthesizeChairmanDecision(context, [running]).adopted).toHaveLength(1);
  });

  it("withChairmanSynthesis emits 반려 notes for rejected points and dedupes against existing notes", () => {
    const decision = synthesizeChairmanDecision(context, [
      round([utt({ content: "반려 대상", tags: ["objection"] })]),
    ]);
    const packet: CodingPacket = {
      goal: "g",
      context: [],
      decisions: [],
      rejectedOptions: [],
      constraints: [],
      filesToInspect: [],
      implementationPlan: [],
      verificationPlan: [],
      reviewerNotes: ["반려: 반려 대상"], // pre-existing identical note
    };
    const out = withChairmanSynthesis(packet, decision);
    expect(out.reviewerNotes.filter((n) => n === "반려: 반려 대상")).toHaveLength(1); // deduped, not doubled
  });
});

// The suites above never exercise: the maxItems cap that bounds every output
// list (an unbounded synthesis would let a packet grow without limit), the
// confidence boundary at exactly 0.75 (>=0.75 ⇒ strong, inclusive) and the
// 2-decimal rounding, or the "no-signal" route — a clean, non-empty utterance
// with neither a routing tag nor any vote lands in NO bucket (not adopted, not
// rejected, not risk). Pin these, self-consistent (derived from the votes/tags).
describe("chairmanSynthesis — maxItems cap, confidence boundary/rounding, no-signal route", () => {
  it("caps every output list at maxItems (default 6, and a custom cap)", () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      utt({ id: `a${i}`, agentId: `m${i}`, content: `채택 ${i}`, tags: ["agreement"], acceptedBy: ["x"] }),
    );
    const def = synthesizeChairmanDecision(context, [round(many)]);
    expect(def.adopted).toHaveLength(6); // default cap

    const capped = synthesizeChairmanDecision(context, [round(many)], { maxItems: 2 });
    expect(capped.adopted).toHaveLength(2);
  });

  it("consensus is strong at exactly 0.75 (inclusive boundary)", () => {
    const decision = synthesizeChairmanDecision(context, [
      round([
        utt({ id: "a", agentId: "m", content: "채택", tags: ["agreement"], acceptedBy: ["x", "y", "z"] }), // accepts 3
        utt({ id: "b", agentId: "n", content: "반려", tags: ["objection"], rejectedBy: ["w"] }), // rejects 1
      ]),
    ]);
    expect(decision.confidence).toBe(0.75); // 3 / (3+1)
    expect(decision.consensusLevel).toBe("strong"); // >= 0.75 is strong
  });

  it("rounds confidence to two decimals (2/3 → 0.67, moderate band)", () => {
    const decision = synthesizeChairmanDecision(context, [
      round([
        utt({ id: "a", agentId: "m", content: "채택", tags: ["agreement"], acceptedBy: ["x", "y"] }), // accepts 2
        utt({ id: "b", agentId: "n", content: "반려", tags: ["objection"], rejectedBy: ["z"] }), // rejects 1
      ]),
    ]);
    expect(decision.confidence).toBe(0.67); // Math.round(66.67)/100
    expect(decision.consensusLevel).toBe("moderate");
  });

  it("a clean utterance with no tag and no votes routes to nothing (no-signal deny)", () => {
    const decision = synthesizeChairmanDecision(context, [
      round([utt({ id: "x", agentId: "m", content: "그냥 중립 의견" })]), // no tags, no acceptedBy/rejectedBy
    ]);
    expect(decision.adopted).toEqual([]);
    expect(decision.rejected).toEqual([]);
    expect(decision.risks).toEqual([]);
    expect(decision.contested).toEqual([]);
    expect(decision.confidence).toBe(0.5); // total votes 0 → default
    expect(decision.statement).toContain("합의 형성 필요"); // problem-based fallback, not the utterance
  });
});

// One guard the suites above never trip: `if (!point) continue` (line 64) sits
// BEFORE the `accepts += forCount` / `rejects += againstCount` tally. So an
// utterance whose content cleans to the empty string — a marker-only line, or
// pure whitespace — is dropped WHOLE: not adopted/rejected, and crucially its
// votes never reach the confidence denominator. Every existing marker test
// feeds content that still has a non-empty remainder after the strip; none feed
// a line that cleans to "". Pin it, self-consistent (the votes vanish, so the
// council reads as if it never spoke ⇒ default 0.5).
describe("chairmanSynthesis — empty-after-clean utterance is skipped before its votes are tallied", () => {
  it("a marker-only line with votes is dropped whole — its accepts never move the denominator", () => {
    const decision = synthesizeChairmanDecision(context, [
      round([
        // strips to "" → `!point` continue fires before accepts += 2
        utt({ id: "m", agentId: "a", content: "[[tag:agreement]]", tags: ["agreement"], acceptedBy: ["x", "y"] }),
      ]),
    ]);
    expect(decision.adopted).toEqual([]); // never reached the adopted push
    expect(decision.confidence).toBe(0.5); // its 2 accepts never entered total → total 0 → default, NOT 1
    expect(decision.statement).toContain("합의 형성 필요"); // no adopted[0] ⇒ problem-based fallback
  });

  it("a whitespace-only line is likewise skipped, leaving a co-occurring real vote to stand alone", () => {
    const decision = synthesizeChairmanDecision(context, [
      round([
        utt({ id: "blank", agentId: "a", content: "   ", rejectedBy: ["z"] }), // trims to "" → skipped before rejects += 1
        utt({ id: "real", agentId: "b", content: "실제 채택", tags: ["agreement"], acceptedBy: ["x"] }), // the only counted vote
      ]),
    ]);
    expect(decision.rejected).toEqual([]); // the blank line contributed no rejection
    expect(decision.adopted).toEqual([{ point: "실제 채택", support: 1, by: "b" }]);
    expect(decision.confidence).toBe(1); // 1 accept / (1 accept + 0 reject) — the blank's reject was never tallied
  });
});
