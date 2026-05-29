import { describe, expect, it, vi } from "vitest";
import { useDebateStore } from "./useDebateStore";
import type { Stage3DebateSession } from "../runtime/stage3Runtime";
import type { DebateRound, DebateUtterance } from "@ai-orchestrator/protocol";

describe("useDebateStore", () => {
  const mockParticipants = [
    { agentId: "orchestrator-id", name: "Orchestrator Agent", providerName: "openai", modelId: "gpt-4" },
    { agentId: "architect-id", name: "Architect Agent", providerName: "openai", modelId: "gpt-4" },
    { agentId: "risk-officer-id", name: "Risk Officer Agent", providerName: "openai", modelId: "gpt-4" },
  ];

  const createMockUtterance = (
    id: string,
    agentId: string,
    content: string,
    extra: Partial<DebateUtterance> = {}
  ): DebateUtterance => ({
    id,
    agentId,
    content,
    roundId: "r1",
    tags: [],
    createdAt: new Date().toISOString(),
    ...extra,
  });

  const createMockRound = (
    id: string,
    title: string,
    utterances: DebateUtterance[]
  ): DebateRound => ({
    id,
    debateId: "d1",
    kind: "problem_definition",
    title,
    status: "completed",
    utterances,
  });

  const createMockSession = (
    id: string,
    rounds: DebateRound[]
  ): Stage3DebateSession => ({
    id,
    problem: "Mock Problem",
    summary: "Mock Summary",
    contextPreview: [],
    participants: mockParticipants,
    rounds,
    humanPeek: [],
    statusHub: [],
    promotedAt: new Date().toISOString(),
  });

  it("should incrementally compute and cache roundNodes derived from debate session and utterances", () => {
    const utterance1 = createMockUtterance("u1", "orchestrator-id", "초기 요구사항 정의\n두 번째 줄");
    const utterance2 = createMockUtterance("u2", "architect-id", "설계 제안합니다.");
    const round1 = createMockRound("r1", "문제 정의", [utterance1, utterance2]);

    const session = createMockSession("s1", [round1]);

    // Initial run
    useDebateStore.getState().setSession(session);
    const nodes1 = useDebateStore.getState().roundNodes["s1"];
    expect(nodes1).toBeDefined();
    expect(nodes1!.length).toBe(1);
    expect(nodes1![0]).toEqual({
      id: "r1",
      title: "문제 정의",
      type: "conflict", // default since no decision and no risk words
      agents: ["Orchestrator Agent", "Architect Agent"],
      summary: "설계 제안합니다.",
      keywords: ["대안탐색", "상호비평"],
      utteranceCount: 2,
      lastUtteranceId: "u2",
    });

    // Run again with the same session reference and values
    // It should skip state update and keep identical references
    useDebateStore.getState().setSession(session);
    const nodes2 = useDebateStore.getState().roundNodes["s1"];
    expect(nodes2).toBe(nodes1); // exact referential match

    // Add a new utterance (new session ref, round reference changes, but utteranceCount changes)
    const utterance3 = createMockUtterance("u3", "risk-officer-id", "보안 취약점 발견: OAuth token 누출 위험이 있습니다.");
    const round1Updated = createMockRound("r1", "문제 정의", [utterance1, utterance2, utterance3]);
    const sessionUpdated = createMockSession("s1", [round1Updated]);

    useDebateStore.getState().setSession(sessionUpdated);
    const nodes3 = useDebateStore.getState().roundNodes["s1"];
    expect(nodes3).not.toBe(nodes1);
    const firstNode3 = nodes3![0];
    expect(firstNode3).toBeDefined();
    if (!firstNode3) throw new Error("firstNode3 is undefined");
    expect(firstNode3.utteranceCount).toBe(3);
    expect(firstNode3.lastUtteranceId).toBe("u3");
    expect(firstNode3.type).toBe("risk"); // risk keyword detected
    expect(firstNode3.keywords).toContain("보안검증");
    expect(firstNode3.keywords).toContain("OAuth"); // oauth word detected in content
  });

  it("should support caching unchanged rounds when other rounds change", () => {
    const utterance1 = createMockUtterance("u1", "orchestrator-id", "라운드 1 본문");
    const round1 = createMockRound("r1", "라운드 1", [utterance1]);

    const utterance2 = createMockUtterance("u2", "architect-id", "라운드 2 본문");
    const round2 = createMockRound("r2", "라운드 2", [utterance2]);

    const session = createMockSession("s2", [round1, round2]);
    useDebateStore.getState().setSession(session);
    const nodesFirst = useDebateStore.getState().roundNodes["s2"];
    expect(nodesFirst!.length).toBe(2);

    const node1First = nodesFirst![0];
    const node2First = nodesFirst![1];

    // Create session updated with a modified round 2, but round 1 is unchanged
    const utterance2Updated = createMockUtterance("u2", "architect-id", "라운드 2 합의 완료", { decisionId: "d1" });
    const round2Updated = createMockRound("r2", "라운드 2", [utterance2Updated]);
    const sessionUpdated = createMockSession("s2", [round1, round2Updated]);

    useDebateStore.getState().setSession(sessionUpdated);
    const nodesSecond = useDebateStore.getState().roundNodes["s2"];
    expect(nodesSecond!.length).toBe(2);

    // Round 1 should reuse the exact same node reference from cache
    expect(nodesSecond![0]).toBe(node1First);

    // Round 2 node should be newly computed
    expect(nodesSecond![1]).not.toBe(node2First);
    const secondNodeSecond = nodesSecond![1];
    expect(secondNodeSecond).toBeDefined();
    if (!secondNodeSecond) throw new Error("secondNodeSecond is undefined");
    expect(secondNodeSecond.type).toBe("agreement");
    expect(secondNodeSecond.keywords).toContain("합의성공");
  });

  it("should not perform state update if session and nodes are identical (strict referential gating)", () => {
    const originalState = useDebateStore.getState();
    const session = createMockSession("s3", []);

    useDebateStore.getState().setSession(session);
    const stateAfterFirst = useDebateStore.getState();

    // Now call with the same session reference
    useDebateStore.getState().setSession(session);
    const stateAfterSecond = useDebateStore.getState();

    expect(stateAfterSecond).toBe(stateAfterFirst);
  });
});
