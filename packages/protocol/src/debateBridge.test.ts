import { describe, expect, it } from "vitest";
import {
  blueprintDebateReviewSchema,
  buildBlueprintRevisionDraft,
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

describe("buildBlueprintRevisionDraft", () => {
  const baseline = { title: "건강 신호 보드", acceptanceCriteria: ["상단 신호 1개"] };
  const REVIEW_BASE = deriveBlueprintDebateReview(baseline, packet());

  it("(#1) baseline 없음 → review만으로 부분 draft, addedCriteria는 blueprintDelta 그대로", () => {
    const draft = buildBlueprintRevisionDraft(REVIEW_BASE, undefined);
    expect(draft.title).toBe(REVIEW_BASE.blueprintTitle);
    expect(draft.addedCriteria).toEqual(REVIEW_BASE.blueprintDelta);
    expect(draft.riskNotes.length).toBe(REVIEW_BASE.risks.length);
    expect(draft.truthStatus).toBe("planned");
  });

  it("(#2) baseline + review → 기존 결정 유지, 새 결정만 added, 위험은 '미해결:' prefix로 추가", () => {
    const draft = buildBlueprintRevisionDraft(REVIEW_BASE, baseline);
    expect(draft.title).toBe(baseline.title);
    expect(draft.acceptanceCriteria[0]).toBe("상단 신호 1개"); // baseline 1번 유지
    // 카드는 도감 위로 — baseline에 없으니 added로 들어감
    expect(draft.addedCriteria).toContain("카드는 도감 위로");
    // 위험은 미해결 prefix
    expect(draft.riskNotes[0]).toBe("미해결: 모바일 레이아웃은?");
  });

  it("(#3) 중복 결정은 addedCriteria에서 제거(case-insensitive)", () => {
    const reviewWithDup = { ...REVIEW_BASE, blueprintDelta: ["상단 신호 1개", "새 항목"] };
    const draft = buildBlueprintRevisionDraft(reviewWithDup, baseline);
    expect(draft.addedCriteria).toEqual(["새 항목"]); // "상단 신호 1개"는 중복 제외
  });

  it("(#4) 변경 사항 없음(blueprintDelta 0 + risks 0) → noop=true", () => {
    const reviewEmpty = { ...REVIEW_BASE, blueprintDelta: [], risks: [] };
    const draft = buildBlueprintRevisionDraft(reviewEmpty, baseline);
    expect(draft.noop).toBe(true);
    expect(draft.addedCriteria).toEqual([]);
    expect(draft.riskNotes).toEqual([]);
  });

  it("(#5) acceptanceCriteria는 64개로 제한(스키마 한도와 동일)", () => {
    const longBaseline = { title: "t", acceptanceCriteria: Array.from({ length: 60 }, (_, i) => `b${i}`) };
    const reviewMany = {
      ...REVIEW_BASE,
      blueprintDelta: Array.from({ length: 20 }, (_, i) => `d${i}`),
      risks: Array.from({ length: 20 }, (_, i) => `r${i}`),
    };
    const draft = buildBlueprintRevisionDraft(reviewMany, longBaseline);
    expect(draft.acceptanceCriteria.length).toBe(64);
    // 앞쪽에 baseline 유지
    expect(draft.acceptanceCriteria[0]).toBe("b0");
  });

  it("(#6) 사용자 적용 전 baseline 불변(순수 함수 — input mutate X)", () => {
    const frozenBase = { title: "fz", acceptanceCriteria: ["a", "b"] };
    const before = JSON.stringify(frozenBase);
    buildBlueprintRevisionDraft(REVIEW_BASE, frozenBase);
    expect(JSON.stringify(frozenBase)).toBe(before);
  });
});
