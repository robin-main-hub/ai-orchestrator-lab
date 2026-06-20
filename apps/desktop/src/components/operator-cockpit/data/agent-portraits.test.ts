import { afterEach, describe, expect, it } from "vitest";
import {
  agentPortraitRegistry,
  createFallbackPortraitSet,
  getAgentPortraitSet,
  roleGlowColors,
} from "./agent-portraits";

// Characterization tests for the operator-cockpit agent-portrait registry (no
// behavior change). createFallbackPortraitSet builds a no-assets, neutral set
// whose portraits map carries one /portraits/<agentId>/<expression>.png path for
// each of the 10 AgentExpression keys. roleGlowColors is a partial role→hex map
// (unknown roles fall through to the caller's default). getAgentPortraitSet
// short-circuits to a registry hit by agentId before ever consulting bundled
// art. The registry-find and fallback builder are deterministic; only the
// middle persona-glob lookup is not, so it is left out. No network.

const ALL_EXPRESSIONS = [
  "neutral",
  "thinking",
  "speaking",
  "agreeing",
  "disagreeing",
  "surprised",
  "focused",
  "idle",
  "error",
  "success",
];

afterEach(() => {
  // getAgentPortraitSet reads a shared module-level registry; keep it empty.
  agentPortraitRegistry.length = 0;
});

describe("createFallbackPortraitSet", () => {
  it("builds a neutral, no-assets set with a portrait path per expression", () => {
    const set = createFallbackPortraitSet({ agentId: "a1", glowColor: "#abcdef", name: "Agent One" });
    expect(set.defaultExpression).toBe("neutral");
    expect(set.imageAssetsAvailable).toBe(false);
    expect(set.glowColor).toBe("#abcdef");
    expect(set.name).toBe("Agent One");
    expect(Object.keys(set.portraits).sort()).toEqual([...ALL_EXPRESSIONS].sort());
    for (const expr of ALL_EXPRESSIONS) {
      expect(set.portraits[expr as keyof typeof set.portraits]).toBe(`/portraits/a1/${expr}.png`);
    }
  });
});

describe("roleGlowColors", () => {
  it("pins the known role glow colors and stays partial for unmapped roles", () => {
    expect(roleGlowColors.architect).toBe("#a78bfa");
    expect(roleGlowColors.orchestrator).toBe("#22d3ee");
    expect(roleGlowColors.verifier).toBe("#a3e635");
    expect(roleGlowColors.companion).toBe("#38bdf8");
    expect(roleGlowColors.negotiator).toBeUndefined();
  });
});

describe("getAgentPortraitSet", () => {
  it("returns a registered portrait set verbatim, bypassing bundled-art lookup", () => {
    const registered = createFallbackPortraitSet({ agentId: "custom", glowColor: "#101010", name: "Custom" });
    agentPortraitRegistry.push(registered);
    expect(getAgentPortraitSet("custom", "builder")).toBe(registered);
  });
});
