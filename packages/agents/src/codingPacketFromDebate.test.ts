import { describe, it, expect } from "vitest";
import type { DebateRound, DebateUtterance } from "@ai-orchestrator/protocol";

import { extractCodingPacketFromDebate } from "./codingPacketFromDebate.js";
import {
  assertSafeCodingPacket,
  validateCodingPacketSafety,
  type DebateContext,
} from "./index.js";

const CTX: DebateContext = {
  sessionId: "session_extract_001",
  problem: "v0 conversation parity 우선순위 결정",
  conversationSummary: "v0 디자인 기준 정렬 필요.",
  constraints: ["Codex 영역 미접촉"],
  openQuestions: ["오른쪽 rail 폭은 어떻게 할지"],
  userPreferences: ["테스트 통과 후 머지"],
  memoryTraceIds: [],
};

function ut(agentId: string, content: string, tag: DebateUtterance["tags"][number]): DebateUtterance {
  return {
    id: `ut_${agentId}_${tag}`,
    agentId,
    roundId: "r1",
    content,
    tags: [tag],
    createdAt: "2026-05-26T09:00:00.000Z",
  };
}

function round(id: string, kind: DebateRound["kind"], status: DebateRound["status"], utterances: DebateUtterance[]): DebateRound {
  return { id, debateId: "d1", kind, title: id, status, utterances };
}

describe("extractCodingPacketFromDebate", () => {
  it("buckets utterances into matching CodingPacket fields by tag", () => {
    const rounds = [
      round("r1", "problem_definition", "completed", [
        ut("orch", "v0 parity로 좁힌다 [[tag:evidence]]", "evidence"),
        ut("skep", "오른쪽 rail 폭은 v0와 다르다 [[tag:objection]]", "objection"),
      ]),
      round("r2", "initial_proposals", "completed", [
        ut("arch", "AgentsSidebar 폭을 480px로 [[tag:coding_impact]]", "coding_impact"),
        ut("rev", "각 patch에 audit 항목 [[tag:risk]]", "risk"),
        ut("orch", "rail 폭 결정에 동의 [[tag:agreement]]", "agreement"),
      ]),
    ];

    const packet = extractCodingPacketFromDebate(CTX, rounds);

    expect(packet.goal).toBe(CTX.problem);
    // tag-mapped fields
    expect(packet.decisions.some((d) => d.includes("rail 폭 결정에 동의"))).toBe(true);
    expect(packet.rejectedOptions.some((r) => r.includes("v0와 다르다"))).toBe(true);
    expect(packet.implementationPlan.some((p) => p.includes("AgentsSidebar 폭"))).toBe(true);
    expect(packet.reviewerNotes.some((n) => n.includes("audit 항목"))).toBe(true);
    // context seeded from DebateContext + evidence utterance
    expect(packet.context.some((c) => c === CTX.conversationSummary)).toBe(true);
    expect(packet.context.some((c) => c.includes("v0 parity로 좁힌다"))).toBe(true);
    expect(packet.context.some((c) => c.includes("사용자 선호:"))).toBe(true);
    // constraints from context
    expect(packet.constraints).toEqual(CTX.constraints);
    // open questions surface as reviewer notes
    expect(packet.reviewerNotes.some((n) => n.startsWith("미결 질문:"))).toBe(true);
  });

  it("strips the trailing [[tag:...]] marker from extracted lines", () => {
    const rounds = [
      round("r1", "problem_definition", "completed", [
        ut("orch", "이건 결정입니다 [[tag:agreement]]", "agreement"),
      ]),
    ];

    const packet = extractCodingPacketFromDebate(CTX, rounds);

    const decision = packet.decisions[0]!;
    expect(decision).not.toContain("[[tag:agreement]]");
    expect(decision).toContain("이건 결정입니다");
  });

  it("skips pending and blocked rounds", () => {
    const rounds = [
      round("r1", "problem_definition", "pending", [
        ut("orch", "이건 안 들어가야 함 [[tag:agreement]]", "agreement"),
      ]),
      round("r2", "initial_proposals", "blocked", [
        ut("orch", "이것도 안 들어감 [[tag:agreement]]", "agreement"),
      ]),
      round("r3", "cross_critique", "completed", [
        ut("orch", "이건 들어감 [[tag:agreement]]", "agreement"),
      ]),
    ];

    const packet = extractCodingPacketFromDebate(CTX, rounds);

    expect(packet.decisions.length).toBe(1);
    expect(packet.decisions[0]).toContain("이건 들어감");
  });

  it("respects maxItemsPerField cap", () => {
    const utterances = Array.from({ length: 12 }, (_, i) =>
      ut(`agent_${i}`, `agreement ${i} [[tag:agreement]]`, "agreement"),
    );
    const rounds = [round("r1", "problem_definition", "completed", utterances)];

    const packet = extractCodingPacketFromDebate(CTX, rounds, { maxItemsPerField: 4 });

    expect(packet.decisions.length).toBe(4);
  });

  it("truncates long utterances", () => {
    const longContent = "x".repeat(500) + " [[tag:agreement]]";
    const rounds = [
      round("r1", "problem_definition", "completed", [ut("orch", longContent, "agreement")]),
    ];

    const packet = extractCodingPacketFromDebate(CTX, rounds, { utteranceTruncateLength: 100 });

    expect(packet.decisions[0]!.length).toBeLessThanOrEqual(120); // includes "(orch) " prefix
    expect(packet.decisions[0]!.endsWith("…")).toBe(true);
  });

  it("returns a CodingPacket that passes validateCodingPacketSafety", () => {
    const rounds = [
      round("r1", "problem_definition", "completed", [
        ut("orch", "결정 한 줄 [[tag:agreement]]", "agreement"),
        ut("arch", "구현 한 줄 [[tag:coding_impact]]", "coding_impact"),
      ]),
    ];

    const packet = extractCodingPacketFromDebate(CTX, rounds);
    const result = validateCodingPacketSafety(packet);

    expect(result.safe).toBe(true);
    expect(result.violations).toEqual([]);
    // assertSafeCodingPacket should not throw
    expect(() => assertSafeCodingPacket(packet)).not.toThrow();
  });

  it("dedupes identical (agent, content) pairs within a field", () => {
    const rounds = [
      round("r1", "problem_definition", "completed", [
        ut("orch", "동일한 결정 [[tag:agreement]]", "agreement"),
      ]),
      round("r2", "initial_proposals", "completed", [
        ut("orch", "동일한 결정 [[tag:agreement]]", "agreement"),
      ]),
    ];

    const packet = extractCodingPacketFromDebate(CTX, rounds);

    expect(packet.decisions.length).toBe(1);
  });
});
