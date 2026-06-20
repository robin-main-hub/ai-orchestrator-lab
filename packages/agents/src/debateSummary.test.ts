import { describe, expect, it } from "vitest";
import type { DebateRound, DebateUtterance } from "@ai-orchestrator/protocol";
import { buildDebateSummary, countTagDistribution } from "./debateSummary.js";
import type { DebateContext } from "./index.js";

function makeUtterance(agentId: string, content: string, tag: DebateUtterance["tags"][number]): DebateUtterance {
  return { id: `u_${agentId}`, agentId, roundId: "r1", content, tags: [tag], createdAt: "2026-05-26T00:00:00.000Z" };
}

function makeRound(
  id: string,
  kind: DebateRound["kind"],
  title: string,
  status: DebateRound["status"],
  utterances: DebateUtterance[],
): DebateRound {
  return { id, debateId: "d1", kind, title, status, utterances };
}

const CTX: DebateContext = {
  sessionId: "s1",
  problem: "어떻게 시작할까?",
  conversationSummary: "사용자가 간단히 시작하길 원함",
  constraints: [],
  openQuestions: [],
  userPreferences: [],
  memoryTraceIds: [],
};

describe("countTagDistribution", () => {
  it("counts tags across utterances", () => {
    const utterances = [
      makeUtterance("a", "동의", "agreement"),
      makeUtterance("b", "반대", "objection"),
      makeUtterance("c", "증거", "agreement"),
    ];
    const dist = countTagDistribution(utterances);
    expect(dist.agreement).toBe(2);
    expect(dist.objection).toBe(1);
    expect(dist.evidence).toBe(0);
  });

  it("returns zeroed counts for empty array", () => {
    const dist = countTagDistribution([]);
    expect(dist.agreement).toBe(0);
    expect(dist.coding_impact).toBe(0);
  });
});

describe("buildDebateSummary", () => {
  it("includes problem and background", () => {
    const summary = buildDebateSummary(CTX, [], { includeTagDistribution: false });
    expect(summary).toContain("어떻게 시작할까?");
    expect(summary).toContain("사용자가 간단히 시작하길 원함");
  });

  it("lists completed round utterances", () => {
    const rounds = [
      makeRound("r1", "problem_definition", "문제 정의", "completed", [
        makeUtterance("agent_architect", "아키텍처 제안", "evidence"),
        makeUtterance("agent_skeptic", "반박한다", "objection"),
      ]),
    ];
    const summary = buildDebateSummary(CTX, rounds);
    expect(summary).toContain("아키텍처 제안");
    expect(summary).toContain("반박한다");
  });

  it("skips pending round utterances but shows heading", () => {
    const rounds = [
      makeRound("r1", "problem_definition", "문제 정의", "pending", [
        makeUtterance("a", "이 발언은 보이면 안 됨", "evidence"),
      ]),
    ];
    const summary = buildDebateSummary(CTX, rounds, { includeTagDistribution: false });
    expect(summary).toContain("문제 정의");
    expect(summary).not.toContain("이 발언은 보이면 안 됨");
  });

  it("caps utterances per round at maxUtterancesPerRound", () => {
    const utterances = Array.from({ length: 5 }, (_, i) =>
      makeUtterance(`agent_${i}`, `발언 ${i}`, "evidence"),
    );
    const rounds = [makeRound("r1", "initial_proposals", "1차 제안", "completed", utterances)];
    const summary = buildDebateSummary(CTX, rounds, { maxUtterancesPerRound: 2, includeTagDistribution: false });
    expect(summary).toContain("외 3건 생략");
  });

  it("includes tag distribution table when utterances exist", () => {
    const rounds = [
      makeRound("r1", "cross_critique", "상호 비판", "completed", [
        makeUtterance("a", "동의", "agreement"),
        makeUtterance("b", "리스크", "risk"),
      ]),
    ];
    const summary = buildDebateSummary(CTX, rounds, { includeTagDistribution: true });
    expect(summary).toContain("의견 분포");
    expect(summary).toContain("agreement");
    expect(summary).toContain("risk");
  });

  it("omits tag distribution table when disabled", () => {
    const rounds = [makeRound("r1", "final_decision", "최종 결정", "completed", [
      makeUtterance("a", "최종 결정", "agreement"),
    ])];
    const summary = buildDebateSummary(CTX, rounds, { includeTagDistribution: false });
    expect(summary).not.toContain("의견 분포");
  });
});

// The happy cases above only ever exercise completed/pending rounds, a single
// tag per utterance, a present conversationSummary, and never look at the
// distribution table's zero-count omission / percentage math, the empty-tags
// label fallback, an active-but-empty round, or truncation. Pin those branches,
// self-consistent (expected values derived from the same rounds/context).
describe("debateSummary — running rounds, distribution math, fallbacks, truncation", () => {
  it("countTagDistribution fans a single multi-tag utterance into every one of its tags", () => {
    const multi: DebateUtterance = {
      id: "u_multi",
      agentId: "orch",
      roundId: "r1",
      content: "동의이자 리스크",
      tags: ["agreement", "risk", "coding_impact"],
      createdAt: "2026-05-26T00:00:00.000Z",
    };
    const dist = countTagDistribution([multi]);
    expect(dist.agreement).toBe(1);
    expect(dist.risk).toBe(1);
    expect(dist.coding_impact).toBe(1);
    expect(dist.objection).toBe(0); // untagged on this utterance
  });

  it("a RUNNING round is active: its utterances are quoted just like a completed one", () => {
    const rounds = [
      makeRound("r1", "initial_proposals", "진행 중", "running", [
        makeUtterance("agent_architect", "진행 중 발언", "evidence"),
      ]),
    ];
    const summary = buildDebateSummary(CTX, rounds, { includeTagDistribution: false });
    expect(summary).toContain("진행 중 발언"); // running ⇒ shown, not hidden behind a *status* note
    expect(summary).not.toContain("*running*");
  });

  it("a falsy conversationSummary is not seeded as a 배경 line", () => {
    const min: DebateContext = { ...CTX, conversationSummary: "" };
    const summary = buildDebateSummary(min, [], { includeTagDistribution: false });
    expect(summary).toContain("어떻게 시작할까?"); // problem still present
    expect(summary).not.toContain("**배경:**"); // empty summary ⇒ background omitted
  });

  it("the distribution table omits zero-count tags and renders the rounded percentage", () => {
    const rounds = [
      makeRound("r1", "cross_critique", "분포", "completed", [
        makeUtterance("a", "동의1", "agreement"),
        makeUtterance("b", "동의2", "agreement"),
        makeUtterance("c", "리스크", "risk"),
        makeUtterance("d", "리스크2", "risk"),
      ]),
    ];
    const summary = buildDebateSummary(CTX, rounds, { includeTagDistribution: true });
    // 2 of 4 each ⇒ 50%; objection/evidence/coding_impact are 0 ⇒ no row at all
    expect(summary).toContain("| agreement | 2 | 50% |");
    expect(summary).toContain("| risk | 2 | 50% |");
    expect(summary).not.toContain("| objection |");
    expect(summary).not.toContain("| coding_impact |");
  });

  it("an utterance with no tags is labeled [evidence] via the tags[0] fallback", () => {
    const noTag: DebateUtterance = {
      id: "u_notag",
      agentId: "orch",
      roundId: "r1",
      content: "태그 없는 발언",
      tags: [],
      createdAt: "2026-05-26T00:00:00.000Z",
    };
    const rounds = [makeRound("r1", "problem_definition", "무태그", "completed", [noTag])];
    const summary = buildDebateSummary(CTX, rounds, { includeTagDistribution: false });
    expect(summary).toContain("**[evidence]** `orch`: 태그 없는 발언");
  });

  it("an active round with zero utterances renders the 발언 없음 note", () => {
    const rounds = [makeRound("r1", "final_decision", "빈 라운드", "completed", [])];
    const summary = buildDebateSummary(CTX, rounds, { includeTagDistribution: false });
    expect(summary).toContain("빈 라운드");
    expect(summary).toContain("*발언 없음*");
  });

  it("over-long utterance content is truncated to (max-1) chars plus an ellipsis", () => {
    const long = "x".repeat(50);
    const rounds = [
      makeRound("r1", "problem_definition", "긴 발언", "completed", [makeUtterance("a", long, "evidence")]),
    ];
    const summary = buildDebateSummary(CTX, rounds, { includeTagDistribution: false, utteranceTruncateLength: 10 });
    expect(summary).toContain(`${"x".repeat(9)}…`); // slice(0, 9) + …
    expect(summary).not.toContain("x".repeat(11)); // never the full 50-char body
  });
});

// Three boundary/guard branches stay unpinned. (1) The distribution table is
// gated by `includeTagDistribution && allUtterances.length > 0` — every existing
// table test toggles the FIRST operand; the SECOND (enabled but NO utterances
// anywhere) is the honest "no data ⇒ no fabricated distribution" path and never
// fires. (2) The overflow note is `if (overflow > 0)`, strict `>`, so a round
// whose utterance count EXACTLY equals maxUtterancesPerRound shows every line and
// NO "…생략" note. (3) truncate uses `<=`, so content whose length EXACTLY equals
// the limit is rendered verbatim with no ellipsis. Pin them, self-consistent
// (derived from the same rounds and the truncate/overflow formulas).
describe("debateSummary — empty-data distribution guard, exact-cap overflow, exact-length truncate", () => {
  it("omits the distribution table when enabled but no utterances exist anywhere (the && length>0 second operand)", () => {
    // an ACTIVE but empty round → distribution enabled by default, yet allUtterances is empty
    const rounds = [makeRound("r1", "final_decision", "빈 라운드", "completed", [])];
    const summary = buildDebateSummary(CTX, rounds); // includeTagDistribution defaults to true
    expect(summary).not.toContain("의견 분포"); // no data ⇒ no table, even though enabled
    expect(summary).toContain("*발언 없음*"); // ...the active-empty round still renders its note
  });

  it("renders no overflow note when the utterance count exactly equals maxUtterancesPerRound (overflow===0)", () => {
    const utterances = Array.from({ length: 3 }, (_, i) => makeUtterance(`agent_${i}`, `발언 ${i}`, "evidence"));
    const rounds = [makeRound("r1", "initial_proposals", "정확히 cap", "completed", utterances)];
    const summary = buildDebateSummary(CTX, rounds, { maxUtterancesPerRound: 3, includeTagDistribution: false });
    expect(summary).toContain("발언 2"); // all three are shown
    expect(summary).not.toContain("생략"); // overflow === 0 ⇒ strict > guard is false, no note
  });

  it("renders content verbatim (no ellipsis) when its length exactly equals utteranceTruncateLength (<= boundary)", () => {
    const exact = "x".repeat(10);
    const rounds = [
      makeRound("r1", "problem_definition", "정확 길이", "completed", [makeUtterance("a", exact, "evidence")]),
    ];
    const summary = buildDebateSummary(CTX, rounds, { includeTagDistribution: false, utteranceTruncateLength: 10 });
    expect(summary).toContain(exact); // 10 <= 10 ⇒ kept whole
    expect(summary).not.toContain("…"); // no ellipsis anywhere (and no overflow note to introduce one)
  });
});
