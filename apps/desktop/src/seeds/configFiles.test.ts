import { defaultAgentProfiles } from "@ai-orchestrator/agents";
import { describe, expect, it } from "vitest";
import { initialAgentConfigFiles, initialAgentProfilePacks } from "./configFiles";

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

// initialAgentProfilePacks is 0-ref across the test tree, yet a pack is what the UI
// applies as a bundle — so its references must resolve. A pack whose configFileIds
// points at a config file that doesn't exist would apply a half-empty bundle, and a
// pack bound to a role no default agent holds would be unbindable. We pin only the
// structural/referential invariants (existence, uniqueness, role binding), deriving
// the valid sets from initialAgentConfigFiles and defaultAgentProfiles themselves.
describe("seeded agent profile packs", () => {
  const configFileIds = new Set(initialAgentConfigFiles.map((file) => file.id));
  const defaultAgentRoles = new Set(defaultAgentProfiles.map((agent) => agent.role));

  it("gives every pack a unique id and non-empty id/label/description", () => {
    const ids = initialAgentProfilePacks.map((pack) => pack.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const pack of initialAgentProfilePacks) {
      expect(pack.id.trim().length).toBeGreaterThan(0);
      expect(pack.label.trim().length).toBeGreaterThan(0);
      expect(pack.description.trim().length).toBeGreaterThan(0);
    }
  });

  it("references only existing config files, with at least one and no duplicate per pack", () => {
    for (const pack of initialAgentProfilePacks) {
      expect(pack.configFileIds.length).toBeGreaterThan(0);
      expect(new Set(pack.configFileIds).size).toBe(pack.configFileIds.length);
      for (const configId of pack.configFileIds) {
        expect(configFileIds.has(configId)).toBe(true);
      }
    }
  });

  it("binds every pack to a role that a default agent actually holds", () => {
    for (const pack of initialAgentProfilePacks) {
      expect(defaultAgentRoles.has(pack.agentRole)).toBe(true);
    }
  });
});
