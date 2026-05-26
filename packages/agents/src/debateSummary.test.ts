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
