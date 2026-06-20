import { describe, expect, it } from "vitest";
import { agentRoleSchema } from "@ai-orchestrator/protocol";
import { PERSONA_CODEX } from "./personaCodex";
import { listBundledAgentPersonaContent } from "./agentPersonaContent";

// Characterization tests (no behavior change) for personaCodex.ts, a module with
// no test file. It exports a single constant — PERSONA_CODEX, the persona 도감
// roster (one gacha card per persona). Nothing pins its cross-table invariants.
//
// The load-bearing contract (from the source doc-comment): each entry's
// personaName is a slug that "binds to agents/<slug>/ bundles" — avatar art and
// SOUL/AGENTS persona content load automatically from that folder. So a card
// whose personaName does NOT match a real bundled agents/<slug> dir would render
// with no portrait and no persona content, silently. We pin:
//   - every field is a non-empty trimmed string,
//   - personaName (the slug / bundle key) is unique across the roster,
//   - every personaName binds to a real bundled persona dir (self-consistent with
//     listBundledAgentPersonaContent's build-time glob over agents/<dir>),
//   - every role is a valid protocol AgentRole (validated against agentRoleSchema),
//   - role is NOT required to be unique (skeptic is shared by skeptic + yohane).
// We do not pin display names / captions verbatim (pure cosmetic copy).

describe("PERSONA_CODEX", () => {
  it("ships a non-empty roster where every card field is a non-empty trimmed string", () => {
    expect(PERSONA_CODEX.length).toBeGreaterThan(0);
    for (const entry of PERSONA_CODEX) {
      for (const value of [entry.personaName, entry.displayName, entry.role, entry.caption]) {
        expect(typeof value).toBe("string");
        expect(value.trim()).toBe(value);
        expect(value.length).toBeGreaterThan(0);
      }
    }
  });

  it("keys each card by a unique personaName (the agents/<slug> bundle key)", () => {
    const slugs = PERSONA_CODEX.map((entry) => entry.personaName);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("binds every personaName to a real bundled agents/<slug> persona dir", () => {
    // self-consistent with the build-time glob over agents/<dir>/{AGENTS,SOUL}.md
    const bundledSlugs = new Set(Object.keys(listBundledAgentPersonaContent()));
    expect(bundledSlugs.size).toBeGreaterThan(0);
    for (const entry of PERSONA_CODEX) {
      expect(bundledSlugs.has(entry.personaName)).toBe(true);
    }
  });

  it("assigns every card a valid protocol AgentRole", () => {
    for (const entry of PERSONA_CODEX) {
      expect(agentRoleSchema.safeParse(entry.role).success).toBe(true);
    }
  });

  it("allows a role to be shared by more than one persona (slug unique, role not)", () => {
    const skeptics = PERSONA_CODEX.filter((entry) => entry.role === "skeptic").map((e) => e.personaName);
    // skeptic + yohane both occupy the skeptic role — the roster is slug-keyed, not role-keyed
    expect(skeptics).toContain("skeptic");
    expect(skeptics).toContain("yohane");
    expect(skeptics.length).toBeGreaterThan(1);
  });
});
