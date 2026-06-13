import { describe, expect, it } from "vitest";
import {
  blueprintDebateReviewSchema,
  debateDecisionToBlueprintInput,
  deriveBlueprintDebateReview,
  shouldDebateBeforeMission,
  type DebateDecisionPacket,
} from "./debateBridge.js";
import { designBlueprintInputSchema } from "./designBlueprint.js";
import { buildMissionCreateFromBlueprint } from "./designMission.js";
import { missionCreateRequestSchema } from "./productKernel.js";

const packet = (over: Partial<DebateDecisionPacket> = {}): DebateDecisionPacket => ({
  id: "dp1",
  debateId: "debate_1",
  kind: "design",
  summary: "대시보드를 한눈에 보이게 개편",
  adoptedDecisions: ["상단에 건강 신호 1개", "카드는 도감 위로"],
  rejectedOptions: ["탭 4개로 분리"],
  openQuestions: ["모바일 레이아웃은?"],
  ...over,
});

describe("shouldDebateBeforeMission", () => {
  it("forces debate for large/architecture/multi-surface design, skips small fixes", () => {
    expect(shouldDebateBeforeMission({ scope: "small" })).toBe(false);
    expect(shouldDebateBeforeMission({ kind: "architecture" })).toBe(true);
    expect(shouldDebateBeforeMission({ kind: "design", surfacesChanged: 2 })).toBe(true);
    expect(shouldDebateBeforeMission({ kind: "design", surfacesChanged: 1 })).toBe(false);
    expect(shouldDebateBeforeMission({ scope: "large" })).toBe(true);
  });
});

describe("debateDecisionToBlueprintInput", () => {
  it("converts an actionable debate packet into a schema-valid blueprint input", () => {
    const input = debateDecisionToBlueprintInput(packet());
    expect(input).not.toBeNull();
    expect(() => designBlueprintInputSchema.parse(input)).not.toThrow();
    expect(input!.screens[0]!.primaryAction).toBe("상단에 건강 신호 1개");
    expect(input!.acceptanceCriteria).toContain("미해결: 모바일 레이아웃은?");
  });

  it("returns null when the debate produced no actionable decisions (no mission promotion)", () => {
    expect(debateDecisionToBlueprintInput(packet({ adoptedDecisions: [] }))).toBeNull();
  });

  it("the produced blueprint promotes to a schema-valid mission carrying the debate id", () => {
    const input = debateDecisionToBlueprintInput(packet())!;
    const request = buildMissionCreateFromBlueprint(input, { missionId: "m1", debateId: "debate_1" });
    expect(() => missionCreateRequestSchema.parse(request)).not.toThrow();
    expect(request.debateId).toBe("debate_1"); // provenance
    expect(request.truthStatus).toBe("planned");
  });
});

describe("deriveBlueprintDebateReview (point 5)", () => {
  const blueprint = { title: "대시보드 개편", acceptanceCriteria: ["카드는 도감 위로"] };

  it("토론 결과를 원본 초안 리뷰로 되돌려 잇는다 — 실제 패킷에서 derive", () => {
    const review = deriveBlueprintDebateReview(blueprint, packet(), { sourceSessionId: "s1" });
    expect(() => blueprintDebateReviewSchema.parse(review)).not.toThrow();
    expect(review.blueprintTitle).toBe("대시보드 개편");
    expect(review.sourceSessionId).toBe("s1");
    expect(review.adopted).toEqual(["상단에 건강 신호 1개", "카드는 도감 위로"]);
    expect(review.rejected).toEqual(["탭 4개로 분리"]);
    expect(review.risks).toEqual(["모바일 레이아웃은?"]);
    // 토론 결과는 모델 출력 — 절대 observed 아님
    expect(review.truthStatus).toBe("generated");
  });

  it("blueprintDelta = 원본 수용 기준에 없던 채택 결정만(결정적 diff)", () => {
    const review = deriveBlueprintDebateReview(blueprint, packet());
    // "카드는 도감 위로"는 원본 기준에 이미 있음 → delta에서 제외, "상단에 건강 신호 1개"만 변경
    expect(review.blueprintDelta).toEqual(["상단에 건강 신호 1개"]);
  });

  it("recommendedNextAction — 미해결 있으면 revise, 없으면 promote, 채택 없으면 ask_user", () => {
    expect(deriveBlueprintDebateReview(blueprint, packet()).recommendedNextAction).toBe("revise_blueprint");
    expect(deriveBlueprintDebateReview(blueprint, packet({ openQuestions: [] })).recommendedNextAction).toBe("promote_to_mission");
    expect(deriveBlueprintDebateReview(blueprint, packet({ adoptedDecisions: [] })).recommendedNextAction).toBe("ask_user");
  });
});
