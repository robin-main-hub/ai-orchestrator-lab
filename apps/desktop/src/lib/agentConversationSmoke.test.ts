import { describe, expect, it } from "vitest";
import { seededAgentProfiles } from "../seeds/agents";
import { createAgentConversationSmokeResults } from "./agentConversationSmoke";

describe("agent conversation smoke coverage", () => {
  it("proves every seeded agent has persona identity, scoped memory, and role tools in its prompt", () => {
    const results = createAgentConversationSmokeResults(seededAgentProfiles);

    expect(results).toHaveLength(seededAgentProfiles.length);
    expect(results.length).toBeGreaterThanOrEqual(17);

    for (const result of results) {
      expect(result.failures, result.agentId).toEqual([]);
      expect(result.displayName, result.agentId).toBeTruthy();
      const seededAgent = seededAgentProfiles.find((agent) => agent.id === result.agentId);
      expect(seededAgent, result.agentId).toBeTruthy();
      expect(
        result.displayName !== seededAgent?.name || /[가-힣]/.test(result.displayName),
        result.agentId,
      ).toBe(true);
      expect(result.personaDirectory, result.agentId).toBeTruthy();
      expect(result.soulLoaded, result.agentId).toBe(true);
      expect(result.agentsLoaded, result.agentId).toBe(true);
      expect(result.identityContractBound, result.agentId).toBe(true);
      expect(result.scopedMemoryBound, result.agentId).toBe(true);
      expect(result.crossAgentMemoryBlocked, result.agentId).toBe(true);
      expect(result.toolContractBound, result.agentId).toBe(true);
      expect(result.toolBadges.length, result.agentId).toBeGreaterThan(0);
    }
  });
});
