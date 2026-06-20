import { describe, expect, it } from "vitest";
import type { AgentProfile, AgentRole } from "@ai-orchestrator/protocol";
import {
  allowedToolsForMissionMode,
  buildPersonaContinuitySystemReminder,
  canMissionModeMutateFiles,
  canMissionModeRunCommands,
  createAgentMissionCapability,
  createHermesPersonaContinuity,
  createMissionWorkerAssignment,
  missionCapabilitiesForProfiles,
  missionCapabilityModeForRole,
  personaSlugForMission,
  requiresMissionSandbox,
} from "./productKernelContracts";

function makeProfile(overrides: Partial<AgentProfile> & { id: string; role: AgentRole }): AgentProfile {
  return {
    name: overrides.name ?? overrides.id,
    kind: "virtual",
    soulMode: "summary",
    configSource: "internal",
    enabled: true,
    permissionLevel: "read_only",
    ...overrides,
  };
}

describe("product kernel persona/capability contracts", () => {
  it("preserves companion character voice without granting file mutation", () => {
    const profile = makeProfile({
      id: "agent_kurumi",
      name: "쿠루미",
      role: "companion",
      personaName: "kurumi",
      soulMode: "full",
      configSource: "markdown",
      permissionLevel: "write_files",
    });

    const capability = createAgentMissionCapability(profile);

    expect(capability.mode).toBe("merge_recommend");
    expect(capability.canMutateFiles).toBe(false);
    expect(capability.requiresSandbox).toBe(false);
    expect(capability.allowedTools).toContain("merge_recommend");
    expect(capability.allowedTools).not.toContain("write");
    expect(capability.personaContinuity.voice.preserveCharacterVoice).toBe(true);
    expect(capability.personaContinuity.hermes.slotId).toBe("hermes:kurumi");
    expect(capability.personaContinuity.identityFiles.map((file) => file.path)).toContain(
      "agents/kurumi/SOUL.md",
    );
  });

  it("turns builder into a sandbox build worker rather than completion-only advice", () => {
    const profile = makeProfile({
      id: "agent_builder",
      name: "Builder",
      role: "builder",
    });

    const capability = createAgentMissionCapability(profile);

    expect(capability.mode).toBe("sandbox_build");
    expect(capability.canMutateFiles).toBe(true);
    expect(capability.canRunCommands).toBe(true);
    expect(capability.requiresSandbox).toBe(true);
    expect(capability.defaultSandboxKind).toBe("docker_gvisor");
    expect(capability.allowedTools).toEqual(expect.arrayContaining(["write", "edit", "bash", "verify"]));
    expect(capability.requiresHumanApprovalFor).toEqual(expect.arrayContaining(["write", "edit", "bash"]));
  });

  it("lets verifier run checks while blocking product file writes", () => {
    const profile = makeProfile({
      id: "agent_verifier",
      name: "Verifier",
      role: "verifier",
    });

    const capability = createAgentMissionCapability(profile);

    expect(capability.mode).toBe("sandbox_verify");
    expect(capability.canMutateFiles).toBe(false);
    expect(capability.canRunCommands).toBe(true);
    expect(capability.requiresSandbox).toBe(true);
    expect(capability.allowedTools).toEqual(expect.arrayContaining(["bash", "verify", "diff"]));
    expect(capability.allowedTools).not.toContain("write");
    expect(capability.allowedTools).not.toContain("edit");
  });

  it("creates sticky Hermes continuity for internal personas too", () => {
    const profile = makeProfile({
      id: "agent_skeptic_yohane",
      name: "Yohane",
      role: "skeptic",
      personaName: "yohane",
    });

    const continuity = createHermesPersonaContinuity(profile);

    expect(continuity.personaSlug).toBe("yohane");
    expect(continuity.hermes.sticky).toBe(true);
    expect(continuity.hermes.memoryScope).toBe("persona:yohane:role:skeptic");
    expect(continuity.identityFiles.every((file) => file.required === false)).toBe(true);
    expect(continuity.voice.forbiddenSuppressionReasons).toContain("sandbox_execution");
  });

  it("builds mission worker assignments with capability attached", () => {
    const profile = makeProfile({
      id: "agent_builder",
      role: "builder",
    });

    const assignment = createMissionWorkerAssignment({
      missionId: "mission_001",
      profile,
      now: "2026-06-12T00:00:00.000Z",
      sandboxId: "sandbox_001",
      worktreePath: "/repo/.worktrees/mission_001",
      branchName: "agent/mission_001",
    });

    expect(assignment.id).toBe("worker_mission_001_agent_builder");
    expect(assignment.capability.mode).toBe(missionCapabilityModeForRole("builder"));
    expect(assignment.sandboxId).toBe("sandbox_001");
  });

  it("system reminder explicitly separates persona preservation from side-effect authority", () => {
    const capability = createAgentMissionCapability(makeProfile({ id: "agent_builder", role: "builder" }));
    const reminder = buildPersonaContinuitySystemReminder(capability);

    expect(reminder).toContain("Keep the character's speech style");
    expect(reminder).toContain("Mission sandbox/worktree");
  });
});

// The cases above only exercise builder/executor-class (sandbox) and the
// companion merge_recommend path. The read-only least-privilege half of the
// kernel is unpinned: the plan_only/research/memory_curate/conversation_only
// modes, the memory_write_request approval gate, the reminder's *negative*
// authority lines, the persona-slug/restorePolicy fallbacks, and the 0-ref
// batch entry point. Pin them, self-consistent (derived from the role→mode map).
describe("productKernelContracts — read-only modes, approval gating, fallbacks, batch entry", () => {
  it("missionCapabilityModeForRole maps every remaining role family as documented", () => {
    expect(missionCapabilityModeForRole("executor")).toBe("sandbox_build");
    for (const r of ["reviewer", "skeptic", "auditor", "risk_officer", "watchdog"] as const) {
      expect(missionCapabilityModeForRole(r)).toBe("sandbox_verify");
    }
    expect(missionCapabilityModeForRole("architect")).toBe("plan_only");
    expect(missionCapabilityModeForRole("memory_curator")).toBe("memory_curate");
    for (const r of ["researcher", "external", "domain_expert"] as const) {
      expect(missionCapabilityModeForRole(r)).toBe("research");
    }
    for (const r of ["orchestrator", "mediator", "negotiator"] as const) {
      expect(missionCapabilityModeForRole(r)).toBe("merge_recommend");
    }
  });

  it("the read-only modes grant no file mutation, no commands, no sandbox, and no write/edit/bash tools", () => {
    for (const mode of ["plan_only", "research", "memory_curate", "conversation_only"] as const) {
      expect(canMissionModeMutateFiles(mode)).toBe(false);
      expect(canMissionModeRunCommands(mode)).toBe(false);
      expect(requiresMissionSandbox(mode)).toBe(false);
      const tools = allowedToolsForMissionMode(mode);
      expect(tools).not.toContain("write");
      expect(tools).not.toContain("edit");
      expect(tools).not.toContain("bash");
    }
    // conversation_only is the narrowest surface: talk + recall + todo only
    expect(allowedToolsForMissionMode("conversation_only")).toEqual(["complete", "memory_recall", "todo"]);
  });

  it("memory_curator gates memory_write_request behind human approval without any mutate/run power", () => {
    const cap = createAgentMissionCapability(makeProfile({ id: "agent_mem", role: "memory_curator" }));
    expect(cap.mode).toBe("memory_curate");
    expect(cap.canMutateFiles).toBe(false);
    expect(cap.canRunCommands).toBe(false);
    expect(cap.requiresSandbox).toBe(false);
    expect(cap.defaultSandboxKind).toBe("disabled"); // no sandbox required ⇒ disabled, not the docker default
    expect(cap.allowedTools).toContain("memory_write_request");
    // the only thing needing approval is the memory write request — never write/edit/bash
    expect(cap.requiresHumanApprovalFor).toEqual(["memory_write_request"]);
  });

  it("architect plan_only capability needs no approvals and its reminder asserts the NEGATIVE authority lines", () => {
    const cap = createAgentMissionCapability(makeProfile({ id: "agent_arch", role: "architect" }));
    expect(cap.mode).toBe("plan_only");
    expect(cap.defaultSandboxKind).toBe("disabled");
    expect(cap.requiresHumanApprovalFor).toEqual([]); // nothing to mutate/run/gate
    const reminder = buildPersonaContinuitySystemReminder(cap);
    expect(reminder).toContain("Do not mutate files");
    expect(reminder).toContain("Do not claim command execution");
  });

  it("persona slug falls back to role and an 'off' soulMode yields summary_only restore; markdown forces required identity files", () => {
    const offProfile = makeProfile({ id: "agent_x", role: "researcher", soulMode: "off" }); // no personaName
    const off = createHermesPersonaContinuity(offProfile);
    expect(off.personaSlug).toBe("researcher"); // personaName ?? role
    expect(off.hermes.slotId).toBe("hermes:researcher");
    expect(off.hermes.memoryScope).toBe("persona:researcher:role:researcher");
    expect(off.hermes.restorePolicy).toBe("summary_only"); // off ⇒ summary_only
    expect(off.identityFiles.every((f) => f.required === false)).toBe(true); // not full/markdown

    const mdProfile = makeProfile({ id: "agent_y", role: "builder", configSource: "markdown" });
    const md = createHermesPersonaContinuity(mdProfile);
    expect(md.identityFiles.every((f) => f.required === true)).toBe(true); // markdown ⇒ required
    expect(md.hermes.restorePolicy).toBe("restore_when_available"); // non-off
  });

  it("missionCapabilitiesForProfiles drops disabled profiles and maps only the enabled ones", () => {
    const profiles = [
      makeProfile({ id: "on_builder", role: "builder", enabled: true }),
      makeProfile({ id: "off_arch", role: "architect", enabled: false }),
    ];
    const caps = missionCapabilitiesForProfiles(profiles);
    expect(caps).toHaveLength(1);
    expect(caps[0]!.agentId).toBe("on_builder");
    expect(caps[0]!.mode).toBe("sandbox_build");
  });
});

// Four reachable contract details stay unpinned. (1) createCapabilityNotes' mode-
// specific HONESTY lines — capability.notes is never asserted, yet those lines
// ("must not write product files", "sequential merge queue owns the side effect")
// are the human-readable side-effect boundary. (2) The fullMarkdown OR's second
// operand: soulMode "full" ALONE (configSource NOT markdown) must force required
// identity files — every existing case ties soulMode:full to configSource:markdown.
// (3) The options.truthStatus override on identity files (default "configured").
// (4) Least-privilege on the sandbox-kind override: options.defaultSandboxKind is
// honored for a sandbox mode but CANNOT escalate a read-only mode off "disabled".
// Pin them, self-consistent (derived from the role→mode map and the OR operands).
describe("productKernelContracts — capability notes honesty, soulMode-full operand, option overrides", () => {
  it("capability.notes carry the mode-specific side-effect honesty line for build/verify/merge_recommend", () => {
    const base = [
      "persona voice is preserved; capabilities only constrain side effects",
    ];
    const build = createAgentMissionCapability(makeProfile({ id: "b", role: "builder" }));
    expect(build.notes).toContain("role builder maps to mission capability mode sandbox_build");
    expect(build.notes).toEqual(expect.arrayContaining(base));
    expect(build.notes).toContain("file mutation is allowed only inside the assigned sandbox/worktree");

    const verify = createAgentMissionCapability(makeProfile({ id: "v", role: "verifier" }));
    expect(verify.notes).toContain("verification may run commands, but must not write product files");

    const merge = createAgentMissionCapability(makeProfile({ id: "o", role: "orchestrator" }));
    expect(merge.notes).toContain("orchestration can recommend merge, but sequential merge queue owns the side effect");

    // a read-only (plan_only) mode carries ONLY the base lines — none of the side-effect notes
    const plan = createAgentMissionCapability(makeProfile({ id: "a", role: "architect" }));
    expect(plan.notes).toEqual(["role architect maps to mission capability mode plan_only", ...base]);
  });

  it("soulMode 'full' ALONE (configSource not markdown) forces required identity files (the OR's second operand)", () => {
    const full = createHermesPersonaContinuity(
      makeProfile({ id: "f", role: "researcher", soulMode: "full", configSource: "internal" }),
    );
    expect(full.identityFiles.every((file) => file.required === true)).toBe(true);
    expect(full.hermes.restorePolicy).toBe("restore_when_available"); // non-off ⇒ restore
  });

  it("honors options.truthStatus on identity files (default would be 'configured')", () => {
    const continuity = createHermesPersonaContinuity(
      makeProfile({ id: "t", role: "skeptic" }),
      { truthStatus: "observed" },
    );
    expect(continuity.identityFiles.every((file) => file.truthStatus === "observed")).toBe(true);
  });

  it("options.defaultSandboxKind is honored for a sandbox mode but CANNOT escalate a read-only mode off 'disabled'", () => {
    const builder = createAgentMissionCapability(
      makeProfile({ id: "b2", role: "builder" }),
      { defaultSandboxKind: "firecracker" },
    );
    expect(builder.defaultSandboxKind).toBe("firecracker"); // sandbox mode → override honored

    const curator = createAgentMissionCapability(
      makeProfile({ id: "m2", role: "memory_curator" }),
      { defaultSandboxKind: "firecracker" },
    );
    expect(curator.requiresSandbox).toBe(false);
    expect(curator.defaultSandboxKind).toBe("disabled"); // read-only mode pins disabled despite the override
  });
});

// Still-unpinned reachable residuals, all in the same least-privilege / honesty
// spirit. (1) The reminder has THREE shapes but only two are pinned: builder
// (mutate+run, both POSITIVE lines) and architect (neither, both NEGATIVE). The
// ASYMMETRIC verify shape — mutate=false BUT run=true — emits the "Do not mutate
// files" negative line together with the "Commands must run through the sandbox
// runner" positive line, a combination no prior case exercises. (2) verifier's
// requiresHumanApprovalFor is only ever checked for builder via arrayContaining;
// verifier gates EXACTLY ["bash"] (no write/edit — it cannot mutate). (3)
// allowedToolsForMissionMode returns a FRESH copy ([...X]) each call, so a caller
// mutating the result cannot poison the shared module-level tool list — a real
// least-privilege guarantee. (4) createMissionWorkerAssignment leaves
// sandboxId/worktreePath/branchName undefined when omitted (never synthesized) and
// threads options into the capability. (5) personaSlugForMission directly, and (6)
// identity files default truthStatus to "configured" with no option. Self-
// consistent (derived from the role→mode map and the function bodies).
describe("productKernelContracts — asymmetric reminder branch, fresh tool copies, honest optional assignment", () => {
  function makeP(overrides: Partial<AgentProfile> & { id: string; role: AgentRole }): AgentProfile {
    return {
      name: overrides.id,
      kind: "virtual",
      soulMode: "summary",
      configSource: "internal",
      enabled: true,
      permissionLevel: "read_only",
      ...overrides,
    };
  }

  it("the verify reminder pairs the 'do not mutate' negative line with the 'commands run through the sandbox' positive line", () => {
    const verify = createAgentMissionCapability(makeP({ id: "v", role: "verifier" }));
    expect(verify.canMutateFiles).toBe(false);
    expect(verify.canRunCommands).toBe(true);
    const reminder = buildPersonaContinuitySystemReminder(verify);
    // mutate=false ⇒ the NEGATIVE file line, NOT the positive "File changes are allowed" line
    expect(reminder).toContain("Do not mutate files");
    expect(reminder).not.toContain("File changes are allowed only inside");
    // run=true ⇒ the POSITIVE command line, NOT the negative "Do not claim command execution"
    expect(reminder).toContain("Commands must run through the sandbox runner");
    expect(reminder).not.toContain("Do not claim command execution");
  });

  it("verifier gates EXACTLY ['bash'] for human approval — no write/edit because it cannot mutate", () => {
    const verify = createAgentMissionCapability(makeP({ id: "v2", role: "verifier" }));
    expect(verify.requiresHumanApprovalFor).toEqual(["bash"]);
    // builder, by contrast, gates write+edit+bash in declaration order
    const builder = createAgentMissionCapability(makeP({ id: "b", role: "builder" }));
    expect(builder.requiresHumanApprovalFor).toEqual(["write", "edit", "bash"]);
  });

  it("allowedToolsForMissionMode returns a fresh copy each call — mutating one result cannot poison the next", () => {
    const first = allowedToolsForMissionMode("sandbox_build");
    const second = allowedToolsForMissionMode("sandbox_build");
    expect(first).toEqual(second);
    expect(first).not.toBe(second); // distinct array instances, not a shared module constant
    first.push("write"); // a caller poisoning its own copy…
    expect(allowedToolsForMissionMode("sandbox_build")).toEqual(second); // …leaves the module list intact
  });

  it("createMissionWorkerAssignment leaves omitted sandbox/worktree/branch undefined (never synthesized) and threads options", () => {
    const assignment = createMissionWorkerAssignment({
      missionId: "mission_x",
      profile: makeP({ id: "agent_b", role: "builder" }),
      now: "2026-06-21T00:00:00.000Z",
      options: { defaultSandboxKind: "firecracker" },
    });
    expect(assignment.id).toBe("worker_mission_x_agent_b");
    expect(assignment.status).toBe("planned");
    expect(assignment.assignedAt).toBe("2026-06-21T00:00:00.000Z");
    expect(assignment.sandboxId).toBeUndefined(); // omitted ⇒ undefined, not a fabricated id
    expect(assignment.worktreePath).toBeUndefined();
    expect(assignment.branchName).toBeUndefined();
    expect(assignment.capability.defaultSandboxKind).toBe("firecracker"); // options reached the capability
  });

  it("personaSlugForMission prefers personaName and falls back to role", () => {
    expect(personaSlugForMission({ role: "skeptic", personaName: "yohane" })).toBe("yohane");
    expect(personaSlugForMission({ role: "skeptic" })).toBe("skeptic");
  });

  it("identity files default truthStatus to 'configured' when no option is supplied", () => {
    const continuity = createHermesPersonaContinuity(makeP({ id: "t0", role: "researcher" }));
    expect(continuity.identityFiles.every((file) => file.truthStatus === "configured")).toBe(true);
  });
});
