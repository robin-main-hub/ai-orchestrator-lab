import { describe, expect, it } from "vitest";
import { buildPersonaCard, rarityClassName, rarityForScore } from "./personaCard";

describe("rarityForScore", () => {
  it("tiers SSR/SR/R/N by composite score", () => {
    expect(rarityForScore(0.95)).toBe("SSR");
    expect(rarityForScore(0.75)).toBe("SR");
    expect(rarityForScore(0.55)).toBe("R");
    expect(rarityForScore(0.3)).toBe("N");
  });
});

describe("buildPersonaCard", () => {
  it("maps memory->HP, trust->MP and derives rarity from the role tier", () => {
    const card = buildPersonaCard({ personaName: "kurumi", displayName: "쿠루미", role: "companion" });
    expect(card.hp).toBe(90); // companion memory 0.9
    expect(card.mp).toBe(93); // companion trust 0.93
    expect(card.rarity).toBe("SSR");
    expect(card.emblem).toBe("본체");
    expect(rarityClassName(card.rarity)).toBe("persona-card-rarity-ssr");
  });

  it("honors explicit memory/trust overrides", () => {
    const card = buildPersonaCard({ personaName: "x", role: "skeptic", memoryQuality: 0.2, trust: 0.2 });
    expect(card.hp).toBe(20);
    expect(card.mp).toBe(20);
    expect(card.rarity).toBe("N");
  });

  it("falls back to a default tier for an unknown role and clamps to 0..100", () => {
    const card = buildPersonaCard({ personaName: "y", role: "made_up_role", memoryQuality: 1.5, trust: -0.3 });
    expect(card.hp).toBe(100);
    expect(card.mp).toBe(0);
    expect(card.emblem).toBe("에이전트");
  });

  it("defaults displayName to personaName", () => {
    expect(buildPersonaCard({ personaName: "yohane", role: "skeptic" }).displayName).toBe("yohane");
  });
});
