import { describe, expect, it } from "vitest";
import type { DebateRound, DebateUtterance, DesignBlueprintInput } from "@ai-orchestrator/protocol";
import type { Stage3DebateSession } from "../runtime/stage3Runtime";
import { computeBlueprintReviewForSession, extractDesignDecisionPacket } from "./designPacketFromDebate";

function utterance(agentId: string, content: string, tags: DebateUtterance["tags"]): DebateUtterance {
  return { id: `u_${agentId}_${content.slice(0, 6)}`, agentId, roundId: "r1", content, tags, createdAt: "t" };
}

function round(utterances: DebateUtterance[], status: DebateRound["status"] = "completed"): DebateRound {
  return { id: "r1", debateId: "debate_1", kind: "initial_proposals", title: "1라운드", status, utterances };
}

function session(over: Partial<Stage3DebateSession> = {}): Stage3DebateSession {
  return {
    id: "debate_1",
    problem: "[앱 초안 검토·반박·개선] 대시보드",
    summary: "요약",
    contextPreview: [],
    participants: [],
    rounds: [
      round([
        utterance("designer", "상단에 건강 신호 1개 [[tag:agreement]]", ["agreement"]),
        utterance("critic", "탭 4개 분리는 과함 [[tag:objection]]", ["objection"]),
        utterance("a11y", "모바일 빈 상태 누락 위험 [[tag:risk]]", ["risk"]),
        utterance("verifier", "근거 자료 [[tag:evidence]]", ["evidence"]), // evidence는 design packet에 안 들어감
      ]),
    ],
    humanPeek: [],
    statusHub: [],
    promotedAt: "t",
    ...over,
  };
}

const blueprint: Pick<DesignBlueprintInput, "title" | "acceptanceCriteria"> = {
  title: "대시보드 개편",
  acceptanceCriteria: ["탭 4개 분리는 과함"], // 이미 원본에 있던 기준
};

describe("extractDesignDecisionPacket — 발화 태그에서 design 결정 도출", () => {
  it("agreement→adopted, objection→rejected, risk→open (evidence 제외), 마커 제거", () => {
    const packet = extractDesignDecisionPacket(session());
    expect(packet.kind).toBe("design");
    expect(packet.debateId).toBe("debate_1");
    expect(packet.adoptedDecisions).toEqual(["상단에 건강 신호 1개"]);
    expect(packet.rejectedOptions).toEqual(["탭 4개 분리는 과함"]);
    expect(packet.openQuestions).toEqual(["모바일 빈 상태 누락 위험"]);
    // 합성 없음 — 발화에 없던 건 안 들어감
    expect(packet.adoptedDecisions.join()).not.toContain("근거 자료");
  });

  it("pending/blocked 라운드는 건너뛴다", () => {
    const s = session({ rounds: [round([utterance("x", "보류 결정 [[tag:agreement]]", ["agreement"])], "pending")] });
    expect(extractDesignDecisionPacket(s).adoptedDecisions).toEqual([]);
  });
});

describe("computeBlueprintReviewForSession — 초안 출처 토론만 review 생성", () => {
  it("blueprintContext 있으면 review를 만들고 generated로 표기", () => {
    const review = computeBlueprintReviewForSession(
      session({ blueprintContext: { ...blueprint } as DesignBlueprintInput, sourceSessionId: "s1" }),
    );
    expect(review).toBeDefined();
    expect(review!.truthStatus).toBe("generated"); // observed 아님
    expect(review!.sourceSessionId).toBe("s1");
    expect(review!.adopted).toEqual(["상단에 건강 신호 1개"]);
    expect(review!.rejected).toEqual(["탭 4개 분리는 과함"]);
    expect(review!.risks).toEqual(["모바일 빈 상태 누락 위험"]);
    // 원본 수용 기준에 이미 있던 "탭 4개..."는 adopted가 아니라 rejected라 delta 무관, "상단에..."는 신규 → delta
    expect(review!.blueprintDelta).toEqual(["상단에 건강 신호 1개"]);
    expect(review!.recommendedNextAction).toBe("revise_blueprint"); // 미해결 위험 있음
  });

  it("일반 대화 토론(blueprintContext 없음)은 review를 만들지 않는다", () => {
    expect(computeBlueprintReviewForSession(session())).toBeUndefined();
  });
});
