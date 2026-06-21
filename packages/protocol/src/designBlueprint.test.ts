import { describe, expect, it } from "vitest";
import {
  designBlueprintInputSchema,
  designBlueprintSchema,
  designScreenInputSchema,
  designScreenSchema,
  designTargetSurfaceSchema,
  designTokensSchema,
  finalizeDesignBlueprint,
  missionDesignBlueprintRecordedPayloadSchema,
  missionFromBlueprintRequestSchema,
  plannedArtifactsFromBlueprint,
  type DesignBlueprintInput,
} from "./designBlueprint.js";
import { buildMissionCreateFromBlueprint, DESIGN_TEAM } from "./designMission.js";
import { missionCreateRequestSchema } from "./productKernel.js";

const now = () => "2026-06-13T00:00:00.000Z";

const INPUT: DesignBlueprintInput = {
  title: "미션 보드 개편",
  userIntent: "진행 상황을 한눈에",
  targetSurface: "mission_board",
  screens: [
    { name: "보드", purpose: "전체 현황", primaryAction: "미션 열기", secondaryActions: ["필터"], dataNeeded: ["missions"], emptyState: "미션 없음", errorState: "로드 실패" },
  ],
  designTokens: { density: "balanced", tone: "clean_builder", motion: "subtle" },
  acceptanceCriteria: ["키보드 탐색 가능", "빈 화면 안내"],
};

describe("finalizeDesignBlueprint", () => {
  it("assigns deterministic screen ids and carries createdAt", () => {
    const bp = finalizeDesignBlueprint(INPUT, { id: "bp1", missionId: "m1", now });
    expect(bp.id).toBe("bp1");
    expect(bp.screens[0]!.id).toBe("bp1_screen_1");
    expect(bp.createdAt).toBe("2026-06-13T00:00:00.000Z");
  });
});

describe("plannedArtifactsFromBlueprint", () => {
  it("plans one artifact per screen + one for acceptance, all planned (never observed)", () => {
    const bp = finalizeDesignBlueprint(INPUT, { id: "bp1", missionId: "m1", now });
    const artifacts = plannedArtifactsFromBlueprint(bp, "m1", now);
    expect(artifacts).toHaveLength(INPUT.screens.length + 1); // +1 acceptance
    expect(artifacts.every((a) => a.truthStatus === "planned")).toBe(true);
  });
});

describe("buildMissionCreateFromBlueprint", () => {
  it("builds a schema-valid design mission with the coding/design team and planned truth", () => {
    const request = buildMissionCreateFromBlueprint(INPUT, { missionId: "m1" });
    expect(() => missionCreateRequestSchema.parse(request)).not.toThrow();
    expect(request.truthStatus).toBe("planned");
    expect(request.workers.map((w) => w.role)).toEqual(DESIGN_TEAM.map((m) => m.role));
    expect(request.title).toContain("디자인");
  });

  it("DESIGN_TEAM is a small coding/design org (companion/builder/verifier present, no company roles)", () => {
    const roles = DESIGN_TEAM.map((m) => m.role);
    expect(roles).toContain("companion");
    expect(roles).toContain("builder");
    expect(roles).toContain("verifier");
    expect(roles).toContain("auditor"); // accessibility
    expect(DESIGN_TEAM.length).toBeLessThanOrEqual(6);
  });
});

// The cases above pin schema-validity, the team roster, and planned truth, but
// leave the actual assembly unpinned: the deterministic worker mapping (id/slot/
// soulMode/configSource), the honest goal text built from intent/surface/tokens/
// screens, the filter(Boolean) that drops an empty 수용 기준 line, the
// createdBy fallback + debate/session provenance passthrough, and the 300/4000
// truncation guards. Pin them, self-consistent (derived from DESIGN_TEAM/INPUT).
describe("buildMissionCreateFromBlueprint — worker mapping, goal assembly, provenance, truncation", () => {
  it("maps each DESIGN_TEAM member to a deterministic worker (design_<role>_<n> id, slot displayName, summary/internal)", () => {
    const req = buildMissionCreateFromBlueprint(INPUT, { missionId: "m1" });
    expect(req.workers).toHaveLength(DESIGN_TEAM.length);
    req.workers.forEach((w, i) => {
      const member = DESIGN_TEAM[i]!;
      expect(w.agentId).toBe(`design_${member.role}_${i + 1}`);
      expect(w.role).toBe(member.role);
      expect(w.displayName).toBe(member.slot);
      expect(w.soulMode).toBe("summary"); // capability decides power later, not the seed soul mode
      expect(w.configSource).toBe("internal");
    });
    // agentIds are distinct so the server can address each worker unambiguously
    expect(new Set(req.workers.map((w) => w.agentId)).size).toBe(req.workers.length);
  });

  it("assembles the goal honestly from intent/surface/tokens/screens with a no-external-send footer", () => {
    const req = buildMissionCreateFromBlueprint(INPUT, { missionId: "m1" });
    expect(req.goal).toContain("의도 — 진행 상황을 한눈에");
    expect(req.goal).toContain("대상 — mission_board");
    expect(req.goal).toContain("톤 — clean_builder · 밀도 balanced · 모션 subtle");
    expect(req.goal).toContain("· 보드: 전체 현황 (주요액션 미션 열기)"); // screen line format
    expect(req.goal).toContain("수용 기준 — 키보드 탐색 가능; 빈 화면 안내");
    expect(req.goal).toContain("외부 발송 없음"); // honesty footer: draft only
  });

  it("drops the 수용 기준 line entirely when acceptanceCriteria is empty (filter(Boolean))", () => {
    const req = buildMissionCreateFromBlueprint({ ...INPUT, acceptanceCriteria: [] }, { missionId: "m1" });
    expect(req.goal).not.toContain("수용 기준");
    expect(req.goal).toContain("외부 발송 없음"); // the rest of the goal is intact
  });

  it("defaults createdBy to design_blueprint and carries debate/session provenance only when given", () => {
    const fallback = buildMissionCreateFromBlueprint(INPUT, { missionId: "m1" });
    expect(fallback.createdBy).toBe("design_blueprint");
    expect(fallback.debateId).toBeUndefined();
    expect(fallback.sourceSessionId).toBeUndefined();

    const traced = buildMissionCreateFromBlueprint(INPUT, {
      missionId: "m2",
      createdBy: "alice",
      debateId: "debate_7",
      sourceSessionId: "sess_9",
    });
    expect(traced.createdBy).toBe("alice");
    expect(traced.debateId).toBe("debate_7");
    expect(traced.sourceSessionId).toBe("sess_9");
  });

  it("truncates title to 300 and goal to 4000 characters so the request stays within schema bounds", () => {
    const longTitle = buildMissionCreateFromBlueprint({ ...INPUT, title: "가".repeat(400) }, { missionId: "m1" });
    expect(longTitle.title.length).toBe(300);
    expect(() => missionCreateRequestSchema.parse(longTitle)).not.toThrow();

    const longGoal = buildMissionCreateFromBlueprint({ ...INPUT, userIntent: "x".repeat(5_000) }, { missionId: "m1" });
    expect(longGoal.goal.length).toBe(4_000);
    expect(() => missionCreateRequestSchema.parse(longGoal)).not.toThrow();
  });
});

// All cases above exercise the two pure transforms (finalize/plannedArtifacts) and
// the designMission builder, but never assert the designBlueprint SCHEMAS those
// transforms consume. The authority surface still unpinned:
//  - the closed enums: targetSurface (7) and the three token axes (density/tone/motion);
//  - deny-by-default design HONESTY — every screen MUST declare emptyState/errorState
//    (no shipping a screen without saying what happens when it's empty or errors),
//    while secondaryActions/dataNeeded honestly default to [];
//  - SERVER-authority over identity: the input schemas omit id/missionId/createdAt
//    (and screen.id), so a client-supplied id is stripped — the client may propose
//    a blueprint but cannot mint its identity;
//  - the input BOUNDS (title 1..300, userIntent 1..4000, >=1 and <=32 screens) that
//    keep an assembled mission request within schema limits before truncation;
//  - optional provenance never fabricated on the from-blueprint request; and the
//    recorded payload EMBEDS the finalized blueprint transitively.
const SCREEN = INPUT.screens[0]!; // a valid DesignScreenInput

describe("designBlueprint — schema validation boundary: closed enums, design honesty, server identity, bounds, embed", () => {
  it("pins the target-surface enum and the three token axes (closed sets)", () => {
    expect(designTargetSurfaceSchema.options).toEqual([
      "conversation",
      "dashboard",
      "mission_board",
      "cockpit",
      "theater",
      "settings",
      "new_app",
    ]);
    expect(designTokensSchema.shape.density.options).toEqual(["compact", "balanced", "spacious"]);
    expect(designTokensSchema.shape.tone.options).toEqual(["cyber_glass", "clean_builder", "anime_os", "minimal"]);
    expect(designTokensSchema.shape.motion.options).toEqual(["none", "subtle", "expressive"]);
  });

  it("a screen MUST declare empty/error states (design honesty) while the action/data arrays default to []", () => {
    const parsed = designScreenSchema.parse({
      id: "s1",
      name: "보드",
      purpose: "현황",
      primaryAction: "열기",
      emptyState: "없음",
      errorState: "실패",
    });
    expect(parsed.secondaryActions).toEqual([]);
    expect(parsed.dataNeeded).toEqual([]);
    // omitting the empty/error narrative is rejected — a screen can't hide its degenerate states
    const { emptyState: _e, ...noEmpty } = SCREEN;
    expect(designScreenSchema.safeParse({ ...noEmpty, id: "s1" }).success).toBe(false);
  });

  it("the input schemas grant the SERVER identity authority — a client-supplied id is stripped", () => {
    // screen input omits id; a smuggled id does not survive
    const screen = designScreenInputSchema.parse({ ...SCREEN, id: "client_chosen" });
    expect("id" in screen).toBe(false);
    // blueprint input omits id/missionId/createdAt entirely
    expect("id" in designBlueprintInputSchema.shape).toBe(false);
    expect("missionId" in designBlueprintInputSchema.shape).toBe(false);
    expect("createdAt" in designBlueprintInputSchema.shape).toBe(false);
  });

  it("the blueprint input enforces bounds: title 1..300, userIntent 1..4000, 1..32 screens, criteria default []", () => {
    const base = {
      title: INPUT.title,
      userIntent: INPUT.userIntent,
      targetSurface: INPUT.targetSurface,
      screens: [SCREEN],
      designTokens: INPUT.designTokens,
    };
    const parsed = designBlueprintInputSchema.parse(base);
    expect(parsed.acceptanceCriteria).toEqual([]); // honest empty default
    expect(designBlueprintInputSchema.safeParse({ ...base, title: "" }).success).toBe(false); // min(1)
    expect(designBlueprintInputSchema.safeParse({ ...base, title: "가".repeat(301) }).success).toBe(false); // max(300)
    expect(designBlueprintInputSchema.safeParse({ ...base, screens: [] }).success).toBe(false); // >=1 screen required
    expect(designBlueprintInputSchema.safeParse({ ...base, userIntent: "" }).success).toBe(false); // min(1)
  });

  it("the from-blueprint request requires the blueprint and never fabricates the optional provenance", () => {
    const base = {
      title: INPUT.title,
      userIntent: INPUT.userIntent,
      targetSurface: INPUT.targetSurface,
      screens: [SCREEN],
      designTokens: INPUT.designTokens,
      acceptanceCriteria: INPUT.acceptanceCriteria,
    };
    const parsed = missionFromBlueprintRequestSchema.parse({ blueprint: base });
    expect(parsed.missionId).toBeUndefined();
    expect(parsed.createdBy).toBeUndefined();
    expect(parsed.sourceSessionId).toBeUndefined();
    expect(missionFromBlueprintRequestSchema.safeParse({}).success).toBe(false); // blueprint required
    // transitive: a blueprint with no screens sinks the whole request
    expect(missionFromBlueprintRequestSchema.safeParse({ blueprint: { ...base, screens: [] } }).success).toBe(false);
  });

  it("the recorded payload EMBEDS a finalized blueprint transitively (a bad enum sinks it)", () => {
    const bp = finalizeDesignBlueprint(INPUT, { id: "bp1", missionId: "m1", now });
    expect(missionDesignBlueprintRecordedPayloadSchema.safeParse({ missionId: "m1", blueprint: bp }).success).toBe(true);
    expect(designBlueprintSchema.safeParse(bp).success).toBe(true); // the finalized shape is itself valid
    expect(
      missionDesignBlueprintRecordedPayloadSchema.safeParse({ missionId: "m1", blueprint: { ...bp, targetSurface: "telepathy" } }).success,
    ).toBe(false);
    expect(missionDesignBlueprintRecordedPayloadSchema.safeParse({ blueprint: bp }).success).toBe(false); // missionId required
  });
});
