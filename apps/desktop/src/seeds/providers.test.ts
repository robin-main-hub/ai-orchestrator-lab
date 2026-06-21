import { describe, expect, it } from "vitest";
import { providerProfileSchema } from "@ai-orchestrator/protocol";
import { seededProviderProfiles } from "./providers";

// seededProviderProfiles is the set of provider profiles the desktop OS boots with —
// the routing table that decides which model endpoint an agent's completion is sent
// to. The sibling agents.test.ts asserts specific CONTENT (the mimo openai/anthropic
// profiles are present; no mock provider; no "mock" tag) but never runtime-validates
// any profile against providerProfileSchema, so a seeded profile could typecheck and
// still be a malformed routing record (the refinements the inferred type cannot
// express — min/max bounds, enum closure, the secretRef-by-reference shape — are
// enforced only at parse time). The FRESH authority angle here is PROVIDER-ROUTING
// SEED CONFORMANCE: the boot routing table is a set of valid, unambiguous protocol
// records. (1) NON-EMPTY ROUTING TABLE — at least one provider profile is seeded, so
// the OS boots with somewhere to route. (2) EVERY PROFILE PARSES — each
// seededProviderProfiles entry round-trips through providerProfileSchema (a runtime
// check strictly stronger than the type the content test relies on). (3) PROFILE IDS
// ARE UNIQUE — no two seeded profiles share an id, so provider resolution by id is
// never ambiguous (a duplicate id would silently shadow one routing target with
// another).

describe("provider seeds — boot routing table conforms to the protocol schema", () => {
  it("seeds a non-empty routing table", () => {
    expect(seededProviderProfiles.length).toBeGreaterThan(0);
  });

  it("every seeded provider profile parses against providerProfileSchema", () => {
    for (const profile of seededProviderProfiles) {
      expect(providerProfileSchema.safeParse(profile).success).toBe(true);
    }
  });

  it("keeps every seeded profile id unique — provider resolution is never ambiguous", () => {
    const ids = seededProviderProfiles.map((profile) => profile.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
