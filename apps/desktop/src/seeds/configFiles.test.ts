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

  it("links the role tool profile skill to every default agent without embedding secrets", () => {
    const skill = initialAgentConfigFiles.find((item) => item.id === "config_skill_role_tool_profiles_v1");

    expect(skill?.kind).toBe("skill");
    expect(skill?.body).toContain("Orchestrator");
    expect(skill?.body).toContain("Reviewer");
    expect(skill?.body).toContain("Executor");
    expect(skill?.body).toContain("memory.recall");
    expect(skill?.body).toContain("tool.call");
    expect(skill?.body).toContain("기본 차단");
    expect(skill?.body).toContain("trusted provider");
    expect(skill?.body).not.toContain("MIMO_API_KEY=");
    expectLinkedToEveryDefaultAgent("config_skill_role_tool_profiles_v1");
  });
});
