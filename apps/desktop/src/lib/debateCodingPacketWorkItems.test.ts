import { describe, expect, it } from "vitest";
import type { Stage3DebateSession } from "../runtime/stage3Runtime";
import {
  createDebateCodingPacketProjection,
  createDebateCodingPacketWorkItems,
} from "./debateCodingPacketWorkItems";

function session(): Stage3DebateSession {
  return {
    id: "debate_session_001",
    problem: "운영자 관제판을 실사용 가능한 OS로 정리한다.",
    summary: "토론 결과를 코딩 패킷으로 넘긴다.",
    participants: [
      { agentId: "agent_orchestrator", modelId: "mimo-v2.5-pro", name: "마키마", providerName: "MiMo", role: "orchestrator" },
      { agentId: "agent_reviewer", modelId: "claude-opus-4-8", name: "시노미야 카구야", providerName: "Claude", role: "reviewer" },
    ],
    rounds: [
      {
        debateId: "debate_session_001",
        id: "round_final",
        kind: "final_decision",
        title: "최종 결정",
        status: "completed",
        utterances: [
          {
            id: "utt_decision",
            agentId: "agent_orchestrator",
            content: "Debate 메인은 토론과 합의만 남긴다.",
            createdAt: "2026-06-06T12:00:00.000Z",
            decisionId: "decision_clean_debate",
            roundId: "round_final",
            tags: ["agreement", "coding_impact"],
          },
          {
            id: "utt_evidence",
            agentId: "agent_reviewer",
            content: "운영 로그와 증거는 Annex와 Cockpit으로 분리해야 한다.",
            createdAt: "2026-06-06T12:01:00.000Z",
            roundId: "round_final",
            tags: ["evidence"],
          },
        ],
      },
    ],
    contextPreview: ["현재 v0 검은 테마를 유지한다."],
    humanPeek: [],
    promotedAt: "2026-06-06T12:02:00.000Z",
    statusHub: [],
  };
}

describe("debateCodingPacketWorkItems", () => {
  it("준비된 Debate 세션을 전용 CodingPacket 후보로 변환한다", () => {
    const projection = createDebateCodingPacketProjection({
      contextPackTier: "full",
      session: session(),
      sessionId: "session_desktop_001",
      userPreferences: ["v0 디자인을 그대로 이식"],
    });

    expect(projection.readiness.state).toBe("ready");
    expect(projection.packet.goal).toBe("운영자 관제판을 실사용 가능한 OS로 정리한다.");
    expect(projection.packet.decisions.join(" ")).toContain("Debate 메인은 토론과 합의만 남긴다");
    expect(projection.packet.implementationPlan.join(" ")).toContain("Debate 메인은 토론과 합의만 남긴다");
    expect(projection.packet.context.join(" ")).toContain("운영 로그와 증거는 Annex와 Cockpit으로 분리");
    expect(projection.packet.context[0]).toBe("컨텍스트 팩 등급: full");
    expect(projection.packet.context[1]).toBe("토론 세션: debate_session_001");
    expect(projection.packet.context.join(" ")).not.toContain("ContextPack tier");
    expect(projection.packet.context.join(" ")).not.toContain("Debate session");
    expect(projection.packet.reviewerNotes.join(" ")).toContain("토론 준비 상태: 준비됨");
    expect(projection.packet.reviewerNotes.join(" ")).not.toContain("Debate readiness");
  });

  it("CodingPacket WorkItem과 실행 슬롯 Handoff를 함께 만든다", () => {
    const projection = createDebateCodingPacketProjection({
      contextPackTier: "full",
      session: session(),
      sessionId: "session_desktop_001",
    });
    const result = createDebateCodingPacketWorkItems({
      createdAt: "2026-06-06T12:03:00.000Z",
      ownerAgentId: "agent_orchestrator",
      projection,
      sessionId: "session_desktop_001",
    });

    expect(result.workItem.surface).toBe("coding_packet");
    expect(result.workItem.lane).toBe("approve");
    expect(result.workItem.status).toBe("waiting_approval");
    expect(result.workItem.kind).toBe("spec_doc");
    expect(result.workItem.priority).toBe("high");
    expect(result.workItem.summary).toBe("결정 1개 / 구현 단계 1개");
    expect(result.workItem.summary).not.toContain("decisions");
    expect(result.workItem.evidenceRefs[0]).toEqual(
      expect.objectContaining({
        kind: "artifact",
        reference: "coding_packet://session_desktop_001",
      }),
    );
    expect(result.handoff.workItemId).toBe(result.workItem.id);
    expect(result.handoff.targetSurface).toBe("execution_slot");
    expect(result.handoff.approvalState).toBe("required");
    expect(result.handoff.payloadRef).toBe("coding_packet://session_desktop_001");
  });
});
