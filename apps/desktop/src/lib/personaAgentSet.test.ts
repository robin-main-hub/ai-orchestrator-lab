import type { AgentProfile } from "@ai-orchestrator/protocol";
import { describe, expect, it } from "vitest";
import {
  agentSetHeaderLine,
  DEFAULT_HERMES_RESET_COMMAND,
  resolvePersonaAgentSet,
} from "./personaAgentSet";

describe("resolvePersonaAgentSet", () => {
  it("binds a registered persona to its declared profile and pane role", () => {
    const set = resolvePersonaAgentSet("kurumi");
    expect(set.backend).toBe("hermes");
    expect(set.profile?.role).toBe("companion");
    expect(set.profile?.permissionLevel).toBe("write_files");
    expect(set.preferredPaneRole).toBe("orchestrator"); // companion runs the show
    expect(set.bootSteps).toEqual([]); // sticky slot reuse: no reset by default
  });

  it("yuno's auditor set lands on the qa pane", () => {
    const set = resolvePersonaAgentSet("yuno");
    expect(set.profile?.role).toBe("auditor");
    expect(set.preferredPaneRole).toBe("qa");
  });

  it("an unregistered persona gets no profile and no boot by default", () => {
    const set = resolvePersonaAgentSet("totally_new_character");
    expect(set.profile).toBeUndefined();
    expect(set.preferredPaneRole).toBeUndefined();
    expect(set.bootSteps).toEqual([]);
  });

  it("carries the sticky slot id and explicit reset boot steps", () => {
    const set = resolvePersonaAgentSet("kurumi", {
      slotId: "hermes-03",
      bootSteps: [DEFAULT_HERMES_RESET_COMMAND],
    });
    expect(set.slotId).toBe("hermes-03");
    expect(set.bootSteps).toEqual(["/new"]);
  });

  it("accepts a custom profile registry (imported personas)", () => {
    const profiles: AgentProfile[] = [
      {
        id: "agent_custom",
        name: "Custom",
        kind: "virtual",
        role: "builder",
        personaName: "custom",
        soulMode: "full",
        configSource: "markdown",
        enabled: true,
      },
    ];
    const set = resolvePersonaAgentSet("custom", { profiles });
    expect(set.profile?.role).toBe("builder");
    expect(set.preferredPaneRole).toBe("code");
  });
});

describe("agentSetHeaderLine", () => {
  it("announces slot, persona, pane, declared role and permission", () => {
    const header = agentSetHeaderLine(resolvePersonaAgentSet("kurumi", { slotId: "hermes-01" }), "orchestrator");
    expect(header).toContain("hermes agent (slot hermes-01)");
    expect(header).not.toContain("freshly reset"); // reuse: no reset claim
    expect(header).toContain('"kurumi"');
    expect(header).toContain("orchestrator pane");
    expect(header).toContain("Declared role: companion");
    expect(header).toContain("permission: write_files");
  });

  it("mentions the fresh reset only when boot steps are present", () => {
    const header = agentSetHeaderLine(
      resolvePersonaAgentSet("nobody", { slotId: "hermes-05", bootSteps: ["/new"] }),
      "code",
    );
    expect(header).toContain("freshly reset session");
    expect(header).not.toContain("Declared role");
  });
});
