import { describe, expect, it } from "vitest";
import {
  blueprintDebateReviewSchema,
  buildBlueprintRevisionDraft,
  debateDecisionKindSchema,
  debateDecisionToBlueprintInput,
  deriveBlueprintDebateReview,
  recommendedDebateNextActionSchema,
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

// The debate-bridge enums are 0-ref vocab, and shouldDebateBeforeMission is the
// gate that decides whether a change is forced through debate before it can
// become a Mission. The existing test hits each branch in isolation but not
// the *precedence*: a "small" scope must short-circuit to false BEFORE the
// architecture/large checks (a small fix is never dragged into debate, even an
// architecture-kinded one), and design defaults surfacesChanged to 1 (a
// single-surface design skips debate). A precedence bug here would either force
// debate on trivial fixes or — worse — let a large change skip the gate.
describe("debateBridge vocab + shouldDebateBeforeMission precedence", () => {
  it("pins the decision-kind and next-action enum memberships", () => {
    expect(debateDecisionKindSchema.options).toEqual(["coding", "design", "architecture"]);
    expect(recommendedDebateNextActionSchema.options).toEqual([
      "promote_to_mission",
      "revise_blueprint",
      "ask_user",
    ]);
  });

  it("a small scope short-circuits to false BEFORE the architecture/large checks", () => {
    // small wins even when the kind would otherwise force debate
    expect(shouldDebateBeforeMission({ scope: "small", kind: "architecture" })).toBe(false);
    expect(shouldDebateBeforeMission({ scope: "small", kind: "design", surfacesChanged: 5 })).toBe(false);
  });

  it("design defaults surfacesChanged to 1 — a single-surface design skips debate", () => {
    expect(shouldDebateBeforeMission({ kind: "design" })).toBe(false); // surfacesChanged ?? 1 → 1 < 2
    expect(shouldDebateBeforeMission({ kind: "coding" })).toBe(false);
    expect(shouldDebateBeforeMission({})).toBe(false); // no signal → no forced debate
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

  it("primary = first decision, secondaryActions = decisions 2..4 only, targetSurface overridable", () => {
    const input = debateDecisionToBlueprintInput(
      packet({ adoptedDecisions: ["d1", "d2", "d3", "d4", "d5"] }),
      { targetSurface: "dashboard" },
    )!;
    expect(input.targetSurface).toBe("dashboard");
    expect(input.screens[0]!.primaryAction).toBe("d1");
    expect(input.screens[0]!.secondaryActions).toEqual(["d2", "d3", "d4"]); // slice(1,4) — caps at 3, drops d5
  });

  it("falls back to a placeholder title/purpose when the summary is empty (no blank screen)", () => {
    const input = debateDecisionToBlueprintInput(packet({ summary: "", adoptedDecisions: ["오직 하나"] }))!;
    expect(input.title).toBe("토론 설계안");
    expect(input.screens[0]!.purpose).toBe("토론에서 합의된 주요 흐름");
    expect(input.screens[0]!.secondaryActions).toEqual([]); // single decision → no secondaries
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

// Two honesty-relevant branches survive the suite above: (1) deriveBlueprint-
// DebateReview omits sourceSessionId entirely when none is supplied (the spread
// `...(opts.sourceSessionId ? {…} : {})`), and its blueprintDelta diff matches
// the original acceptanceCriteria case- AND whitespace-insensitively — the
// existing delta test only uses an exact string match, so a decision that
// differs from a criterion only by case/padding would WRONGLY be reported as a
// change. (2) debateDecisionToBlueprintInput's userIntent is never asserted by
// content: it joins summary + adopted decisions with " · ", dropping an empty
// summary via filter(Boolean), and the acceptanceCriteria fold adopted +
// "미해결: <q>" openQuestions. Pin them, self-consistent.
describe("debateBridge — review diff honesty + blueprint userIntent assembly", () => {
  it("deriveBlueprintDebateReview omits sourceSessionId when none given and computes a case/space-insensitive delta", () => {
    const review = deriveBlueprintDebateReview(
      { title: "T", acceptanceCriteria: ["  카드는 도감 위로  ", "Keyboard Nav"] },
      packet({ adoptedDecisions: ["카드는 도감 위로", "keyboard nav", "진짜 새 결정"] }),
    );
    // no opts.sourceSessionId → the key is absent entirely (not an undefined value)
    expect("sourceSessionId" in review).toBe(false);
    // both the padded hangul and the differently-cased English decision collapse
    // onto existing criteria → only the genuinely new decision is a delta
    expect(review.blueprintDelta).toEqual(["진짜 새 결정"]);
  });

  it("debateDecisionToBlueprintInput builds an honest userIntent and acceptanceCriteria from the packet", () => {
    const input = debateDecisionToBlueprintInput(
      packet({ summary: "요약", adoptedDecisions: ["d1", "d2"], openQuestions: ["q1"] }),
    )!;
    expect(input.userIntent).toBe("요약 · d1 · d2"); // summary + decisions, " · "-joined
    expect(input.acceptanceCriteria).toEqual(["d1", "d2", "미해결: q1"]); // adopted + risk-prefixed questions

    // an empty summary is dropped by filter(Boolean) — no leading " · "
    const noSummary = debateDecisionToBlueprintInput(
      packet({ summary: "", adoptedDecisions: ["오직"], openQuestions: [] }),
    )!;
    expect(noSummary.userIntent).toBe("오직");
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
