import { describe, expect, it } from "vitest";
import { debateDecisionToBlueprintInput, shouldDebateBeforeMission, type DebateDecisionPacket } from "./debateBridge.js";
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
