import { describe, expect, it } from "vitest";
import type { AgentProfile, AgentRole } from "@ai-orchestrator/protocol";
import {
  buildPersonaContinuitySystemReminder,
  createAgentMissionCapability,
  createHermesPersonaContinuity,
  createMissionWorkerAssignment,
  missionCapabilityModeForRole,
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
