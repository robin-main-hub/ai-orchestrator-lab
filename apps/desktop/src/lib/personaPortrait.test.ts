import { describe, expect, it, vi } from "vitest";

vi.mock("./personaAvatars", () => ({
  getPersonaAvatarUrl: (dir: string | undefined) => {
    const map: Record<string, string> = {
      kurumi: "/assets/kurumi.png",
      orchestrator: "/assets/orchestrator.png",
    };
    return dir ? map[dir] : undefined;
  },
}));

const { resolvePersonaPortraitUrl } = await import("./personaPortrait");

describe("resolvePersonaPortraitUrl", () => {
  it("personaName이 있으면 그걸 우선", () => {
    expect(resolvePersonaPortraitUrl("kurumi", "executor")).toBe("/assets/kurumi.png");
  });

  it("personaName이 없거나 매칭 실패면 role로 폴백", () => {
    expect(resolvePersonaPortraitUrl(undefined, "orchestrator")).toBe("/assets/orchestrator.png");
    expect(resolvePersonaPortraitUrl("unknown", "orchestrator")).toBe("/assets/orchestrator.png");
  });

  it("둘 다 없으면 undefined (이니셜 폴백)", () => {
    expect(resolvePersonaPortraitUrl(undefined, undefined)).toBeUndefined();
    expect(resolvePersonaPortraitUrl("nope", "alsonope")).toBeUndefined();
  });
});
