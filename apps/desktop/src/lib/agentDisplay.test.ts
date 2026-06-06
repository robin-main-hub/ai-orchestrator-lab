import { describe, expect, it } from "vitest";
import type { WorkbenchAgent } from "../types";
import {
  agentInitialsForDisplay,
  agentPrimaryDisplayName,
  agentSecondaryDisplayLabel,
} from "./agentDisplay";

function agent(patch: Partial<WorkbenchAgent>): WorkbenchAgent {
  return {
    id: "agent_orchestrator",
    name: "Orchestrator",
    kind: "virtual",
    role: "orchestrator",
    soulMode: "summary",
    configSource: "internal",
    enabled: true,
    permissionLevel: "read_only",
    ...patch,
  } as WorkbenchAgent;
}

describe("agentDisplay", () => {
  it("uses Korean character names as primary conversation identity", () => {
    expect(agentPrimaryDisplayName(agent({ role: "orchestrator", name: "Orchestrator" }))).toBe("마키마");
    expect(agentPrimaryDisplayName(agent({ role: "verifier", name: "Verifier" }))).toBe("마키세 크리스");
  });

  it("keeps personaName overrides distinct from shared roles", () => {
    const yohane = agent({
      id: "agent_skeptic_yohane",
      name: "Yohane",
      personaName: "yohane",
      role: "skeptic",
    });

    expect(agentPrimaryDisplayName(yohane)).toBe("츠시마 요시코");
    expect(agentSecondaryDisplayLabel(yohane)).toBe("Skeptic · 4차원 아이디어 뱅크");
    expect(agentInitialsForDisplay(yohane)).toBe("츠시");
  });
});
