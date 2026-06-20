import { describe, expect, it } from "vitest";
import { buildPersonaCard, rarityBadgeVariant, rarityClassName, rarityForScore } from "./personaCard";
import type { PersonaRarity } from "./personaCard";
import type { StatusBadgeVariant } from "@/ui/status-badge";

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

// Characterization tests (no behavior change) for the previously-unasserted export
// rarityBadgeVariant. The block above drives rarityForScore / buildPersonaCard /
// rarityClassName, but never the rarity->badge-variant projection that styles the card.
// Its load-bearing contract: it is a TOTAL map from the PersonaRarity union to a real
// StatusBadgeVariant — each of the four tiers gets a distinct variant, and the N arm
// doubles as the default catch-all so any value still yields a valid (muted) variant.
describe("rarityBadgeVariant", () => {
  const ALL_RARITIES: PersonaRarity[] = ["SSR", "SR", "R", "N"];
  // mirror of the StatusBadgeVariant union (status-badge.tsx) — variantStyles is not
  // exported, so we pin "returns a real variant" against this literal copy.
  const VALID_VARIANTS = new Set<StatusBadgeVariant>([
    "default", "primary", "success", "warning", "danger", "muted",
    "orchestrator", "architect", "builder", "reviewer", "expert", "companion",
  ]);

  it("maps each rarity tier to its distinct badge variant", () => {
    expect(rarityBadgeVariant("SSR")).toBe("warning");
    expect(rarityBadgeVariant("SR")).toBe("reviewer");
    expect(rarityBadgeVariant("R")).toBe("primary");
    expect(rarityBadgeVariant("N")).toBe("muted");
    const variants = ALL_RARITIES.map(rarityBadgeVariant);
    expect(new Set(variants).size).toBe(ALL_RARITIES.length); // all distinct
  });

  it("only ever returns a real StatusBadgeVariant", () => {
    for (const rarity of ALL_RARITIES) {
      expect(VALID_VARIANTS.has(rarityBadgeVariant(rarity))).toBe(true);
    }
  });

  it("falls through to the muted default for an out-of-union value (N arm is the catch-all)", () => {
    expect(rarityBadgeVariant("UNRANKED" as PersonaRarity)).toBe("muted");
  });

  it("couples to rarityForScore: a composite score styles the card end to end", () => {
    expect(rarityBadgeVariant(rarityForScore(0.95))).toBe("warning"); // SSR
    expect(rarityBadgeVariant(rarityForScore(0.75))).toBe("reviewer"); // SR
    expect(rarityBadgeVariant(rarityForScore(0.55))).toBe("primary"); // R
    expect(rarityBadgeVariant(rarityForScore(0.3))).toBe("muted"); // N
  });
});
