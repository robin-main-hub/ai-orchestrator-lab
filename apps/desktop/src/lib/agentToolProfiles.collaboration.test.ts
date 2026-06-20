import { describe, expect, it } from "vitest";
import type { AgentRole } from "@ai-orchestrator/protocol";
import { seededAgentProfiles } from "../seeds/agents";
import { getAgentToolCollaborationProfile } from "./agentToolProfiles";

// Characterization tests for getAgentToolCollaborationProfile (no behavior
// change), the only export in agentToolProfiles.ts the existing
// agentToolProfiles.test.ts leaves uncovered (that suite pins getAgentToolProfile,
// getAgentToolBadgeLabels, getAgentToolProfileSummary, getRoleToolDefinitionGaps,
// and createAgentToolRuntimeSummary). It is pure: it reads the static
// roleCollaborationProfiles Record and returns the row for the role, falling back
// to the `external` row for any role outside the map. We pin a known role's exact
// 4-field profile, the full-population invariant across every seeded role, and the
// `?? roleCollaborationProfiles.external` fallback for an unmapped (cast) role.

describe("getAgentToolCollaborationProfile", () => {
  it("returns the four-field profile for a known role", () => {
    const profile = getAgentToolCollaborationProfile("orchestrator");
    expect(profile.focusLabel).toBe("우선순위와 대기열");
    expect(profile.handoffLabel).toBe("결정·승인 정리");
    expect(profile.headline.length).toBeGreaterThan(0);
    expect(profile.rhythmLabel.length).toBeGreaterThan(0);
  });

  it("yields a fully-populated profile for every seeded agent role", () => {
    expect(seededAgentProfiles.length).toBeGreaterThanOrEqual(17);
    for (const agent of seededAgentProfiles) {
      const profile = getAgentToolCollaborationProfile(agent.role);
      expect(profile.focusLabel.length, agent.role).toBeGreaterThan(0);
      expect(profile.handoffLabel.length, agent.role).toBeGreaterThan(0);
      expect(profile.headline.length, agent.role).toBeGreaterThan(0);
      expect(profile.rhythmLabel.length, agent.role).toBeGreaterThan(0);
    }
  });

  it("falls back to the external profile for an unmapped role", () => {
    const unmapped = getAgentToolCollaborationProfile("not_a_real_role" as AgentRole);
    expect(unmapped).toEqual(getAgentToolCollaborationProfile("external"));
  });
});
