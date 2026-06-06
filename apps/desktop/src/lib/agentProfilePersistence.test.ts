import { describe, expect, it } from "vitest";
import type { WorkbenchAgent } from "../types";
import { parseStoredAgentProfiles, parseStoredSelectedAgentId } from "./agentProfilePersistence";

const seededAgents: WorkbenchAgent[] = [
  {
    id: "agent_seed_1",
    name: "Seed One",
    kind: "real",
    role: "orchestrator",
    soulMode: "summary",
    configSource: "internal",
    enabled: true,
  },
  {
    id: "agent_seed_2",
    name: "Seed Two",
    kind: "virtual",
    role: "verifier",
    soulMode: "retrieved",
    configSource: "internal",
    enabled: true,
  },
];

describe("agent profile persistence", () => {
  it("falls back to seeded agents when stored data is corrupt", () => {
    expect(parseStoredAgentProfiles({ broken: true }, seededAgents)).toEqual(seededAgents);
    expect(parseStoredAgentProfiles([{ id: "missing-fields" }], seededAgents)).toEqual(seededAgents);
  });

  it("restores stored provider and model assignments while appending new seeded agents", () => {
    const restored = parseStoredAgentProfiles(
      [
        {
          id: "agent_seed_1",
          name: "Seed One Custom",
          kind: "real",
          role: "orchestrator",
          providerProfileId: "provider_custom",
          modelId: "custom-model",
          soulMode: "full",
          configSource: "markdown",
          enabled: true,
        },
      ],
      seededAgents,
    );

    expect(restored).toHaveLength(2);
    expect(restored[0]).toMatchObject({
      id: "agent_seed_1",
      modelId: "custom-model",
      providerProfileId: "provider_custom",
    });
    expect(restored[1]?.id).toBe("agent_seed_2");
  });

  it("restores selected agent only when it still exists", () => {
    expect(parseStoredSelectedAgentId("agent_seed_2", seededAgents)).toBe("agent_seed_2");
    expect(parseStoredSelectedAgentId("missing", seededAgents)).toBe("agent_seed_1");
  });
});
