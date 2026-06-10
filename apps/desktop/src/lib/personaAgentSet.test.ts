import type { AgentProfile } from "@ai-orchestrator/protocol";
import { describe, expect, it } from "vitest";
import {
  agentSetHeaderLine,
  DEFAULT_HERMES_BOOT_STEPS,
  resolvePersonaAgentSet,
} from "./personaAgentSet";

describe("resolvePersonaAgentSet", () => {
  it("binds a registered persona to its declared profile, pane role, and fresh hermes boot", () => {
    const set = resolvePersonaAgentSet("kurumi");
    expect(set.backend).toBe("hermes");
    expect(set.profile?.role).toBe("companion");
    expect(set.profile?.permissionLevel).toBe("write_files");
    expect(set.preferredPaneRole).toBe("orchestrator"); // companion runs the show
    expect(set.bootSteps).toEqual([...DEFAULT_HERMES_BOOT_STEPS]);
  });

  it("yuno's auditor set lands on the qa pane", () => {
    const set = resolvePersonaAgentSet("yuno");
    expect(set.profile?.role).toBe("auditor");
    expect(set.preferredPaneRole).toBe("qa");
  });

  it("an unregistered persona still gets a fresh hermes boot, with no profile", () => {
    const set = resolvePersonaAgentSet("totally_new_character");
    expect(set.profile).toBeUndefined();
    expect(set.preferredPaneRole).toBeUndefined();
    expect(set.bootSteps).toEqual(["/new"]);
  });

  it("boot steps are overridable (empty = reuse the pane's current agent session)", () => {
    expect(resolvePersonaAgentSet("kurumi", { bootSteps: [] }).bootSteps).toEqual([]);
    expect(resolvePersonaAgentSet("kurumi", { bootSteps: ["/reset", "/login"] }).bootSteps).toEqual([
      "/reset",
      "/login",
    ]);
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
  it("announces fresh session, persona, pane, declared role and permission", () => {
    const header = agentSetHeaderLine(resolvePersonaAgentSet("kurumi"), "orchestrator");
    expect(header).toContain("fresh hermes agent session");
    expect(header).toContain('"kurumi"');
    expect(header).toContain("orchestrator pane");
    expect(header).toContain("Declared role: companion");
    expect(header).toContain("permission: write_files");
  });

  it("omits the declared-role clause for unregistered personas", () => {
    const header = agentSetHeaderLine(resolvePersonaAgentSet("nobody"), "code");
    expect(header).not.toContain("Declared role");
  });
});
