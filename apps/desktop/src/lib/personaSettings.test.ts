import { describe, expect, it } from "vitest";
import type { WorkbenchAgent } from "../types";
import { agentProfileSlug, createDefaultPersonaSettings } from "./helpers";

function agent(patch: Partial<WorkbenchAgent>): WorkbenchAgent {
  return {
    configSource: "internal",
    enabled: true,
    id: "agent_orchestrator",
    kind: "virtual",
    name: "Orchestrator",
    permissionLevel: "read_only",
    role: "orchestrator",
    soulMode: "summary",
    ...patch,
  } as WorkbenchAgent;
}

describe("persona settings", () => {
  it("uses personaName as the default SOUL/AGENTS directory when an agent has a named character override", () => {
    const yohane = agent({
      id: "agent_skeptic_yohane",
      name: "Yohane",
      personaName: "yohane",
      role: "skeptic",
    });

    expect(agentProfileSlug(yohane)).toBe("yohane");
    expect(createDefaultPersonaSettings(yohane).soulMdPath).toBe("agents/yohane/SOUL.md");
    expect(createDefaultPersonaSettings(yohane).agentsMdPath).toBe("agents/yohane/AGENTS.md");
  });

  it("preserves underscore role directories for canonical multi-word roles", () => {
    const memoryCurator = agent({
      id: "agent_memory_curator",
      name: "Memory Curator",
      role: "memory_curator",
    });

    expect(agentProfileSlug(memoryCurator)).toBe("memory_curator");
    expect(createDefaultPersonaSettings(memoryCurator).soulMdPath).toBe("agents/memory_curator/SOUL.md");
  });
});
