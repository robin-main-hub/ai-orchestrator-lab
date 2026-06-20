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

// The status filter is tested for completed/pending/blocked but not the OTHER
// included status ("running"), the ut() helper only ever sets a single tag (so
// the multi-tag fan-out branch never fires), a marker-only utterance (strips to
// empty → dropped) is untested, and the minimal-context path (falsy
// conversationSummary not seeded) plus the structural invariants (goal comes
// from context.problem, filesToInspect/verificationPlan are ALWAYS []) are
// unpinned. Pin them, self-consistent (derived from the rounds/context).
describe("extractCodingPacketFromDebate — running rounds, multi-tag fan-out, empty/minimal edges", () => {
  it("a RUNNING (in-progress) round's utterances are extracted, not just completed ones", () => {
    const rounds = [
      round("r1", "problem_definition", "running", [
        ut("orch", "진행 중 결정 [[tag:agreement]]", "agreement"),
      ]),
    ];
    const packet = extractCodingPacketFromDebate(CTX, rounds);
    expect(packet.decisions).toHaveLength(1);
    expect(packet.decisions[0]).toContain("진행 중 결정");
  });

  it("a single utterance with MULTIPLE tags fans into every mapped field", () => {
    const multi: DebateUtterance = {
      id: "u_multi",
      agentId: "orch",
      roundId: "r1",
      content: "결정이자 구현 영향", // no trailing marker — same cleaned line lands in both fields
      tags: ["agreement", "coding_impact"],
      createdAt: "2026-05-26T09:00:00.000Z",
    };
    const rounds = [round("r1", "problem_definition", "completed", [multi])];
    const packet = extractCodingPacketFromDebate(CTX, rounds);
    expect(packet.decisions.some((d) => d.includes("결정이자 구현 영향"))).toBe(true);
    expect(packet.implementationPlan.some((p) => p.includes("결정이자 구현 영향"))).toBe(true);
  });

  it("an utterance that is only a tag marker strips to empty and is dropped (the real one survives)", () => {
    const rounds = [
      round("r1", "problem_definition", "completed", [
        ut("orch", "[[tag:agreement]]", "agreement"), // strips to "" → skipped
        ut("arch", "진짜 결정 [[tag:agreement]]", "agreement"),
      ]),
    ];
    const packet = extractCodingPacketFromDebate(CTX, rounds);
    expect(packet.decisions).toHaveLength(1);
    expect(packet.decisions[0]).toContain("진짜 결정");
  });

  it("minimal context: a falsy conversationSummary is not seeded; goal=problem, files/verification always []", () => {
    const MIN: DebateContext = {
      sessionId: "s_min",
      problem: "문제만 있다",
      conversationSummary: "", // falsy → not pushed into context
      constraints: [],
      openQuestions: [],
      userPreferences: [],
      memoryTraceIds: [],
    };
    const packet = extractCodingPacketFromDebate(MIN, []);
    expect(packet.goal).toBe("문제만 있다"); // goal comes from context.problem, never bucketed
    expect(packet.context).toEqual([]); // empty summary + no prefs → nothing seeded
    expect(packet.constraints).toEqual([]);
    expect(packet.reviewerNotes).toEqual([]);
    expect(packet.filesToInspect).toEqual([]); // engine doesn't emit these — always []
    expect(packet.verificationPlan).toEqual([]);
  });
});

// Three clearly-intended invariants stay unpinned. (1) ORDER: the seeding pass
// (lines 73-76) runs before the round walk, so DebateContext-derived lines lead
// each bucket — conversationSummary then userPreferences ahead of debate evidence
// in `context`, and seeded open-questions ahead of risk notes in `reviewerNotes`;
// existing tests only assert presence, never this seeded-before-extracted order.
// (2) The tag-marker strip is anchored `$`, so a leading/mid `[[tag:...]]` SURVIVES
// while only a trailing one is removed (no over-stripping). (3) The maxItemsPerField
// cap is per-field — every cap test fills a single field, so it never proves the
// caps are independent rather than a shared budget. Pin them, self-consistent.
describe("extractCodingPacketFromDebate — seeded-before-extracted order, trailing-only strip, independent caps", () => {
  it("seeds DebateContext lines AHEAD of debate-derived ones in context and reviewerNotes", () => {
    const rounds = [
      round("r1", "problem_definition", "completed", [
        ut("orch", "증거 한 줄 [[tag:evidence]]", "evidence"),
        ut("rev", "리스크 한 줄 [[tag:risk]]", "risk"),
      ]),
    ];
    const packet = extractCodingPacketFromDebate(CTX, rounds);
    // context: conversationSummary first, then each userPreference, then debate evidence last
    expect(packet.context[0]).toBe(CTX.conversationSummary);
    expect(packet.context[1]).toBe(`사용자 선호: ${CTX.userPreferences[0]}`);
    expect(packet.context.at(-1)).toContain("증거 한 줄");
    // reviewerNotes: seeded open question first, debate risk note appended after
    expect(packet.reviewerNotes[0]).toBe(`미결 질문: ${CTX.openQuestions[0]}`);
    expect(packet.reviewerNotes.at(-1)).toContain("리스크 한 줄");
  });

  it("strips only the TRAILING tag marker — a leading marker survives (pattern anchored at end)", () => {
    const rounds = [
      round("r1", "problem_definition", "completed", [
        ut("orch", "[[tag:risk]] 시작과 끝 [[tag:agreement]]", "agreement"),
      ]),
    ];
    const packet = extractCodingPacketFromDebate(CTX, rounds);
    const decision = packet.decisions[0]!;
    expect(decision).toContain("[[tag:risk]] 시작과 끝"); // the leading marker is NOT stripped
    expect(decision).not.toContain("[[tag:agreement]]"); // only the trailing marker is removed
  });

  it("applies maxItemsPerField independently per field, not as a shared budget", () => {
    const utterances = [
      ...Array.from({ length: 3 }, (_, i) => ut(`a${i}`, `동의 ${i} [[tag:agreement]]`, "agreement")),
      ...Array.from({ length: 3 }, (_, i) => ut(`o${i}`, `반대 ${i} [[tag:objection]]`, "objection")),
    ];
    const rounds = [round("r1", "problem_definition", "completed", utterances)];
    const packet = extractCodingPacketFromDebate(CTX, rounds, { maxItemsPerField: 2 });
    expect(packet.decisions).toHaveLength(2); // agreement field capped at 2
    expect(packet.rejectedOptions).toHaveLength(2); // objection field independently capped at 2
  });
});
