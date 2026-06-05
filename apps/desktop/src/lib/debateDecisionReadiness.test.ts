import { describe, expect, it } from "vitest";
import type { Stage3DebateSession } from "../runtime/stage3Runtime";
import { deriveDebateDecisionReadiness } from "./debateDecisionReadiness";

function createSession(patch: Partial<Stage3DebateSession> = {}): Stage3DebateSession {
  return {
    id: "debate_session_test",
    problem: "운영 결정을 패킷으로 반영할지 판단",
    summary: "테스트용 토론",
    participants: [
      { agentId: "agent_orchestrator", modelId: "model-orchestrator", name: "마키마", providerName: "provider-a", role: "orchestrator" },
      { agentId: "agent_reviewer", modelId: "model-reviewer", name: "시노미야 카구야", providerName: "provider-b", role: "reviewer" },
    ],
    rounds: [
      {
        debateId: "debate_session_test",
        id: "round_1",
        kind: "problem_definition",
        title: "Round 1",
        status: "completed",
        utterances: [],
      },
    ],
    contextPreview: [],
    humanPeek: [],
    promotedAt: "2026-06-05T00:00:00.000Z",
    statusHub: [],
    ...patch,
  };
}

describe("deriveDebateDecisionReadiness", () => {
  it("결정 노드와 코딩 영향이 있으면 패킷 반영 가능 상태를 만든다", () => {
    const readiness = deriveDebateDecisionReadiness(
      createSession({
        rounds: [
          {
            debateId: "debate_session_test",
            id: "round_1",
            kind: "final_decision",
            title: "Round 1",
            status: "completed",
            utterances: [
              {
                id: "utt_decision",
                agentId: "agent_orchestrator",
                content: "이 방향으로 확정합니다.",
                createdAt: "2026-06-05T00:01:00.000Z",
                decisionId: "decision_1",
                roundId: "round_1",
                tags: ["agreement", "coding_impact"],
              },
              {
                id: "utt_evidence",
                agentId: "agent_reviewer",
                content: "근거가 충분합니다.",
                createdAt: "2026-06-05T00:02:00.000Z",
                roundId: "round_1",
                tags: ["evidence"],
              },
            ],
          },
        ],
      }),
    );

    expect(readiness.state).toBe("ready");
    expect(readiness.headline).toBe("패킷 반영 가능");
    expect(readiness.decisionCount).toBe(1);
    expect(readiness.codingImpactCount).toBe(1);
  });

  it("결정 노드가 없으면 차단 상태를 만든다", () => {
    const readiness = deriveDebateDecisionReadiness(
      createSession({
        rounds: [
          {
            debateId: "debate_session_test",
            id: "round_1",
            kind: "cross_critique",
            title: "Round 1",
            status: "completed",
            utterances: [
              {
                id: "utt_risk",
                agentId: "agent_reviewer",
                content: "아직 위험합니다.",
                createdAt: "2026-06-05T00:02:00.000Z",
                roundId: "round_1",
                tags: ["risk"],
              },
            ],
          },
        ],
      }),
    );

    expect(readiness.state).toBe("blocked");
    expect(readiness.blockers).toContain("결정 노드 없음");
  });

  it("진행 중 라운드는 추가 검토 상태로 남긴다", () => {
    const readiness = deriveDebateDecisionReadiness(
      createSession({
        rounds: [
          {
            debateId: "debate_session_test",
            id: "round_1",
            kind: "final_decision",
            title: "Round 1",
            status: "running",
            utterances: [
              {
                id: "utt_decision",
                agentId: "agent_orchestrator",
                content: "임시 결정입니다.",
                createdAt: "2026-06-05T00:01:00.000Z",
                decisionId: "decision_1",
                roundId: "round_1",
                tags: ["coding_impact"],
              },
            ],
          },
        ],
      }),
    );

    expect(readiness.state).toBe("needs_review");
    expect(readiness.blockers[0]).toContain("아직 진행 중");
  });
});
