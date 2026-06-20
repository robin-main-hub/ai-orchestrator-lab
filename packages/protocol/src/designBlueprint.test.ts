import { describe, expect, it } from "vitest";
import {
  finalizeDesignBlueprint,
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
