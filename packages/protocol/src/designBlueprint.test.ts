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
