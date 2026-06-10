import { describe, expect, it } from "vitest";
import type { DebateRound, DebateUtterance } from "@ai-orchestrator/protocol";
import { applyDebateCrossLinks } from "./debateEngine.js";

function utt(id: string, agentId: string, content: string): DebateUtterance {
  return { id, agentId, roundId: "r", content, tags: ["evidence"], createdAt: "2026-06-11T00:00:00.000Z" };
}
function round(id: string, utterances: DebateUtterance[]): DebateRound {
  return { id, kind: "cross_critique", title: id, status: "completed", utterances, debateId: "d" } as unknown as DebateRound;
}

describe("patch 3 — 상호 인용 링크", () => {
  it("[[reject:architect]]가 설계자 발언의 rejectedBy에 인용자를 추가", () => {
    const rounds = [
      round("r1", [utt("u_arch", "agent_architect", "어댑터 분리를 제안")]),
      round("r2", [utt("u_skep", "agent_skeptic", "마이그레이션 위험 [[reject:architect]]")]),
    ];
    const linked = applyDebateCrossLinks(rounds);
    const archUtt = linked[0]!.utterances[0]!;
    expect(archUtt.rejectedBy).toEqual(["agent_skeptic"]);
    // 비판 발언엔 parentUtteranceId
    expect(linked[1]!.utterances[0]!.parentUtteranceId).toBe("u_arch");
  });

  it("[[accept:...]]는 acceptedBy 채움 — confidence가 0.5에서 벗어날 신호", () => {
    const rounds = [
      round("r1", [utt("u_a", "agent_architect", "제안 A")]),
      round("r2", [
        utt("u_b", "agent_builder", "동의 [[accept:architect]]"),
        utt("u_c", "agent_reviewer", "동의 [[accept:architect]]"),
      ]),
    ];
    const linked = applyDebateCrossLinks(rounds);
    expect(linked[0]!.utterances[0]!.acceptedBy?.sort()).toEqual(["agent_builder", "agent_reviewer"]);
  });

  it("마커 없으면 발언 그대로 (변형 없음)", () => {
    const rounds = [round("r1", [utt("u1", "a", "마커 없는 발언")])];
    const linked = applyDebateCrossLinks(rounds);
    expect(linked[0]!.utterances[0]!.acceptedBy).toBeUndefined();
    expect(linked[0]!.utterances[0]!.parentUtteranceId).toBeUndefined();
  });

  it("본인 발언은 인용 대상에서 제외", () => {
    const rounds = [round("r1", [utt("u1", "agent_architect", "자기참조 [[accept:architect]]")])];
    const linked = applyDebateCrossLinks(rounds);
    expect(linked[0]!.utterances[0]!.acceptedBy).toBeUndefined();
  });
});
