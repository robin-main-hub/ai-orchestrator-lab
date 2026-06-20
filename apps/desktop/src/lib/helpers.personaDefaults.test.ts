import { describe, expect, it } from "vitest";
import type { WorkbenchAgent } from "../types";
import {
  agentRoleLabel,
  createDefaultPersonaSettings,
  defaultAgentsInstructionForAgent,
  defaultForbiddenStyleForAgent,
  defaultSoulExampleDialogueForAgent,
  defaultSoulSummaryForAgent,
} from "./helpers";
import { getBundledAgentPersonaContent } from "./agentPersonaContent";

// Characterization tests (no behavior change, distinct slice from the existing
// helpers.test.ts / helpersAgentIdentity.test.ts / helpers.draftAttachment.test.ts
// suites — those pin provider/model labels, role→voice/creativity maps, initials,
// slug, attachment size/modality, and getMessageAttachments). The persona-default
// *content* builders (defaultSoulSummaryForAgent / defaultSoulExampleDialogueForAgent
// / defaultAgentsInstructionForAgent / defaultForbiddenStyleForAgent) and the
// composition createDefaultPersonaSettings were all left unasserted.
//
// These functions seed a brand-new agent's editable persona (SOUL / AGENTS.md /
// forbidden-style). The load-bearing invariants: (1) each builder routes known
// roles to a specialized template and an UNKNOWN role to a generic fallback that
// still substitutes the agent's name and its localized role label (no "undefined"
// leaking into a persona); (2) the orchestrator and generic forbidden-style
// templates forbid leaking secrets (the reviewer one targets review rigor); and (3)
// createDefaultPersonaSettings lets bundled persona markdown OVERRIDE the role
// defaults for soul/AGENTS while example-dialogue and forbidden-style always come
// from the role defaults, and derives the persona paths from the agent slug.

function makeAgent(overrides: Partial<WorkbenchAgent> & { role: WorkbenchAgent["role"] }): WorkbenchAgent {
  return {
    id: "agent_test",
    name: "Test Agent",
    kind: "virtual",
    soulMode: "summary",
    configSource: "internal",
    enabled: true,
    ...overrides,
  };
}

// A role that hits none of the specialized arms → the generic fallback branch.
const FALLBACK_ROLE: WorkbenchAgent["role"] = "companion";

describe("defaultSoulSummaryForAgent", () => {
  it("routes known roles to specialized souls (reviewer/verifier and executor/builder collapse)", () => {
    expect(defaultSoulSummaryForAgent(makeAgent({ role: "orchestrator" }))).toMatch(/^# Orchestrator Soul/);
    expect(defaultSoulSummaryForAgent(makeAgent({ role: "architect" }))).toMatch(/^# Architect Soul/);
    expect(defaultSoulSummaryForAgent(makeAgent({ role: "reviewer" }))).toMatch(/^# Reviewer Soul/);
    expect(defaultSoulSummaryForAgent(makeAgent({ role: "verifier" }))).toMatch(/^# Reviewer Soul/);
    expect(defaultSoulSummaryForAgent(makeAgent({ role: "executor" }))).toMatch(/^# Executor Soul/);
    expect(defaultSoulSummaryForAgent(makeAgent({ role: "builder" }))).toMatch(/^# Executor Soul/);
  });

  it("falls back to a generic soul that embeds the agent name and localized role label", () => {
    const agent = makeAgent({ role: FALLBACK_ROLE, name: "Kurumi" });
    const soul = defaultSoulSummaryForAgent(agent);
    expect(soul).toContain("# Kurumi Soul");
    expect(soul).toContain(agentRoleLabel(FALLBACK_ROLE));
    expect(soul).not.toContain("undefined");
  });
});

describe("defaultSoulExampleDialogueForAgent", () => {
  it("specializes orchestrator and reviewer/verifier, else a generic name-stamped exchange", () => {
    expect(defaultSoulExampleDialogueForAgent(makeAgent({ role: "orchestrator" }))).toContain("Orchestrator:");

    const reviewer = defaultSoulExampleDialogueForAgent(makeAgent({ role: "reviewer", name: "Rin" }));
    expect(reviewer).toContain("Rin:");
    expect(reviewer).toContain("Event Storage, permission, redaction, provider trust");
    expect(defaultSoulExampleDialogueForAgent(makeAgent({ role: "verifier", name: "Rin" }))).toContain("Rin:");

    const generic = defaultSoulExampleDialogueForAgent(makeAgent({ role: FALLBACK_ROLE, name: "Kurumi" }));
    expect(generic).toContain("Kurumi:");
    expect(generic).not.toContain("undefined");
  });
});

describe("defaultAgentsInstructionForAgent", () => {
  it("routes known roles to specialized AGENTS.md and unknown to a generic name+label header", () => {
    expect(defaultAgentsInstructionForAgent(makeAgent({ role: "orchestrator" }))).toMatch(/^# Orchestrator AGENTS\.md/);
    expect(defaultAgentsInstructionForAgent(makeAgent({ role: "architect" }))).toMatch(/^# Architect AGENTS\.md/);
    expect(defaultAgentsInstructionForAgent(makeAgent({ role: "reviewer" }))).toMatch(/^# Reviewer AGENTS\.md/);
    expect(defaultAgentsInstructionForAgent(makeAgent({ role: "verifier" }))).toMatch(/^# Reviewer AGENTS\.md/);

    const agent = makeAgent({ role: FALLBACK_ROLE, name: "Kurumi" });
    const generic = defaultAgentsInstructionForAgent(agent);
    expect(generic).toContain("# Kurumi AGENTS.md");
    expect(generic).toContain(agentRoleLabel(FALLBACK_ROLE));
    expect(generic).not.toContain("undefined");
  });
});

describe("defaultForbiddenStyleForAgent", () => {
  it("specializes orchestrator and reviewer/verifier, else a generic line", () => {
    expect(defaultForbiddenStyleForAgent(makeAgent({ role: "orchestrator" }))).toContain("secret 원문 요청");
    expect(defaultForbiddenStyleForAgent(makeAgent({ role: "reviewer" }))).toContain("검증 생략");
    expect(defaultForbiddenStyleForAgent(makeAgent({ role: "verifier" }))).toContain("검증 생략");
    expect(defaultForbiddenStyleForAgent(makeAgent({ role: FALLBACK_ROLE }))).toContain("secret 원문 노출");
  });

  it("the orchestrator and generic templates forbid leaking secrets (the reviewer one is about review rigor, not secrets)", () => {
    expect(defaultForbiddenStyleForAgent(makeAgent({ role: "orchestrator" }))).toContain("secret");
    expect(defaultForbiddenStyleForAgent(makeAgent({ role: FALLBACK_ROLE }))).toContain("secret");
    // the reviewer/verifier template forbids review laxity, not secret leakage
    expect(defaultForbiddenStyleForAgent(makeAgent({ role: "reviewer" }))).not.toContain("secret");
  });
});

describe("createDefaultPersonaSettings", () => {
  it("lets bundled persona markdown override the role defaults for soul/AGENTS, keeps role example+forbidden, derives paths", () => {
    // role "orchestrator", no personaName → slug "orchestrator", which has a
    // bundled persona directory (agents/orchestrator/{SOUL,AGENTS}.md).
    const agent = makeAgent({ role: "orchestrator" });
    const bundled = getBundledAgentPersonaContent("orchestrator");
    // guard: this fixture genuinely exercises the bundled-override branch
    expect(bundled?.soulMd).toBeTruthy();
    expect(bundled?.agentsMd).toBeTruthy();

    const settings = createDefaultPersonaSettings(agent);
    expect(settings.soulSummary).toBe(bundled!.soulMd);
    expect(settings.agentsInstruction).toBe(bundled!.agentsMd);
    // example dialogue and forbidden style never consult the bundle
    expect(settings.soulExampleDialogue).toBe(defaultSoulExampleDialogueForAgent(agent));
    expect(settings.forbiddenStyle).toBe(defaultForbiddenStyleForAgent(agent));
    expect(settings.agentsMdPath).toBe("agents/orchestrator/AGENTS.md");
    expect(settings.soulMdPath).toBe("agents/orchestrator/SOUL.md");
  });

  it("falls back to the role-default builders when the slug has no bundled persona", () => {
    // a personaName that is not a bundled directory → getBundledAgentPersonaContent
    // returns undefined, so soul/AGENTS fall through to the role defaults.
    const agent = makeAgent({ role: FALLBACK_ROLE, name: "Kurumi", personaName: "no_such_persona_zzz" });
    expect(getBundledAgentPersonaContent("no_such_persona_zzz")).toBeUndefined();

    const settings = createDefaultPersonaSettings(agent);
    expect(settings.soulSummary).toBe(defaultSoulSummaryForAgent(agent));
    expect(settings.agentsInstruction).toBe(defaultAgentsInstructionForAgent(agent));
    expect(settings.agentsMdPath).toBe("agents/no_such_persona_zzz/AGENTS.md");
    expect(settings.soulMdPath).toBe("agents/no_such_persona_zzz/SOUL.md");
  });
});
