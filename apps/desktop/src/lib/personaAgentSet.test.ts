import type { AgentProfile, AgentRole } from "@ai-orchestrator/protocol";
import { agentRoleSchema, tmuxPaneRoleSchema } from "@ai-orchestrator/protocol";
import { describe, expect, it } from "vitest";
import {
  AGENT_BACKEND,
  AGENT_ROLE_TO_PANE_ROLE,
  agentSetHeaderLine,
  DEFAULT_HERMES_RESET_COMMAND,
  resolvePersonaAgentSet,
} from "./personaAgentSet";

const profileWithRole = (role: AgentRole, personaName: string): AgentProfile => ({
  id: `agent_${personaName}`,
  name: personaName,
  kind: "virtual",
  role,
  personaName,
  soulMode: "full",
  configSource: "markdown",
  enabled: true,
});

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

// Characterization tests (no behavior change) for the two previously-unasserted
// constant exports of personaAgentSet.ts: AGENT_BACKEND and AGENT_ROLE_TO_PANE_ROLE.
// The resolvePersonaAgentSet block above spot-checks three role->pane mappings
// (companion->orchestrator, auditor->qa, builder->code) but never pins the table's
// own validity, its documented station collapses, or its coupling to the resolver.
//
//   - AGENT_BACKEND is the single backend literal stamped onto every resolved set
//     ("hermes"); it is the union under which a persona's sticky slot and history
//     live, so it must be a stable constant, not drift per call.
//   - AGENT_ROLE_TO_PANE_ROLE is the role->workstation map. Load-bearing:
//       * every KEY is a real AgentRole and every VALUE a real TmuxPaneRole — a
//         typo'd key would never match a profile and a typo'd value would route a
//         persona to a non-existent pane,
//       * the documented station collapses hold: the QA-family roles (reviewer/
//         skeptic/verifier/auditor) all share the "qa" station, builder/executor
//         share "code", researcher/domain_expert share "research", and companion
//         (the 만능 secretary) is the documented exception that maps to
//         "orchestrator" rather than a single specialist station,
//       * the table is actually consulted by the resolver across its WHOLE extent
//         (not just the three spot-checked rows), and a valid-but-unmapped role
//         (the Partial<Record> gap, e.g. negotiator) intentionally resolves to an
//         undefined preferredPaneRole.

describe("AGENT_BACKEND", () => {
  it("is the stable hermes backend literal stamped onto every resolved set", () => {
    expect(AGENT_BACKEND).toBe("hermes");
    // stamped regardless of whether the persona is registered
    expect(resolvePersonaAgentSet("kurumi").backend).toBe("hermes");
    expect(resolvePersonaAgentSet("totally_new_character").backend).toBe("hermes");
  });
});

describe("AGENT_ROLE_TO_PANE_ROLE", () => {
  const entries = Object.entries(AGENT_ROLE_TO_PANE_ROLE) as [AgentRole, string][];

  it("maps only real AgentRole keys to real TmuxPaneRole values", () => {
    expect(entries.length).toBeGreaterThan(0);
    for (const [role, pane] of entries) {
      expect(agentRoleSchema.safeParse(role).success).toBe(true);
      expect(tmuxPaneRoleSchema.safeParse(pane).success).toBe(true);
    }
  });

  it("collapses the documented role families onto shared stations", () => {
    // the QA family shares one station
    for (const role of ["reviewer", "skeptic", "verifier", "auditor"] as const) {
      expect(AGENT_ROLE_TO_PANE_ROLE[role]).toBe("qa");
    }
    // build roles share the code station
    expect(AGENT_ROLE_TO_PANE_ROLE.builder).toBe("code");
    expect(AGENT_ROLE_TO_PANE_ROLE.executor).toBe("code");
    // research roles share the research station
    expect(AGENT_ROLE_TO_PANE_ROLE.researcher).toBe("research");
    expect(AGENT_ROLE_TO_PANE_ROLE.domain_expert).toBe("research");
    // companion is the documented exception — runs the show, not a single station
    expect(AGENT_ROLE_TO_PANE_ROLE.companion).toBe("orchestrator");
  });

  it("is consulted by the resolver across its whole extent", () => {
    for (const [role, pane] of entries) {
      const set = resolvePersonaAgentSet("probe", { profiles: [profileWithRole(role, "probe")] });
      expect(set.preferredPaneRole).toBe(pane);
    }
  });

  it("leaves a valid-but-unmapped role (the Partial gap) with no preferred pane", () => {
    // negotiator is a real AgentRole but intentionally has no pane station
    expect(agentRoleSchema.safeParse("negotiator").success).toBe(true);
    expect(AGENT_ROLE_TO_PANE_ROLE.negotiator).toBeUndefined();
    const set = resolvePersonaAgentSet("probe", { profiles: [profileWithRole("negotiator", "probe")] });
    expect(set.profile?.role).toBe("negotiator");
    expect(set.preferredPaneRole).toBeUndefined();
  });
});
