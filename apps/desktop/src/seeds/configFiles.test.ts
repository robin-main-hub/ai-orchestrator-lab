import { defaultAgentProfiles } from "@ai-orchestrator/agents";
import { describe, expect, it } from "vitest";
import { initialAgentConfigFiles } from "./configFiles";

const defaultAgentIds = defaultAgentProfiles.map((agent) => agent.id);

function expectLinkedToEveryDefaultAgent(configId: string): void {
  const config = initialAgentConfigFiles.find((item) => item.id === configId);
  expect(config, `${configId} should exist`).toBeDefined();

  const linkedAgentIds = config?.linkedAgentIds ?? [];
  expect(new Set(linkedAgentIds).size).toBe(linkedAgentIds.length);
  expect(linkedAgentIds.sort()).toEqual([...defaultAgentIds].sort());
}

describe("seeded EvolveMemento config files", () => {
  it("links the project memory policy to every default agent", () => {
    expectLinkedToEveryDefaultAgent("config_memory_project_only_v1");
  });

  it("links the continuity skill to every default agent", () => {
    const skill = initialAgentConfigFiles.find((item) => item.id === "config_skill_evolvememento_continuity_v1");

    expect(skill?.kind).toBe("skill");
    expect(skill?.body).toContain("Recall Trace");
    expect(skill?.body).toContain("agentId");
    expectLinkedToEveryDefaultAgent("config_skill_evolvememento_continuity_v1");
  });
});
