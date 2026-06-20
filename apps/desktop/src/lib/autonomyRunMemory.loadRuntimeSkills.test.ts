import { describe, expect, it } from "vitest";
import type {
  SkillArchiveCandidate,
  SkillRuntimeActivationRecord,
} from "@ai-orchestrator/protocol";
import { loadRuntimeSkills } from "./autonomyRunMemory";

// Characterization tests (no behavior change) for loadRuntimeSkills, the
// previously-unasserted second export of autonomyRunMemory.ts (the existing
// autonomyRunMemory.test.ts only drives createAutonomyRunMemoryCandidate).
//
// loadRuntimeSkills is the consumer-side gate between the curator/skill-archive
// domain and the agent runtime: it runs the protocol's buildSkillRuntimeManifest
// and then projects ONLY the loadable candidateIds into AgentConfigFile (kind
// "skill") records the runtime can mount. The load-bearing safety boundary —
// spelled out in the source comment — is that trustStatus alone is NEVER enough:
// a skill loads only when its activation contract says active + eval-basis +
// not-quarantined (L8 PR3). Everything else is filtered out. We pin that gate and
// the exact projection shape; we do NOT re-test the protocol manifest itself
// (skillArchive.test.ts covers that), only this function's filter + mapping.

function candidate(overrides: Partial<SkillArchiveCandidate> & { id: string }): SkillArchiveCandidate {
  return {
    missionId: "mission_1",
    source: "merge_pattern",
    title: "머지 패턴 스킬",
    summary: "검증 통과 후 순차 머지",
    triggerPatterns: [],
    relatedFiles: [],
    confidence: "medium",
    trustStatus: "curator_approved",
    createdAt: "2026-06-10T00:00:00.000Z",
    ...overrides,
  };
}

// An activation that satisfies the runtime-loadable contract: active + eval basis.
function activeActivation(candidateId: string, overrides: Partial<SkillRuntimeActivationRecord> = {}): SkillRuntimeActivationRecord {
  return { candidateId, activationStatus: "active", evalRunId: `eval_${candidateId}`, ...overrides };
}

describe("loadRuntimeSkills", () => {
  it("projects a loadable skill into the exact AgentConfigFile shape", () => {
    const c = candidate({ id: "skill_a", title: "Rate limiter fix", summary: "ingress에 limiter 추가", source: "verification_fix" });
    const files = loadRuntimeSkills([c], [activeActivation("skill_a")]);

    expect(files).toHaveLength(1);
    expect(files[0]).toEqual({
      id: "config_skill_learned_skill_a",
      kind: "skill",
      scope: "global",
      path: "agents/skills/skill_a.md",
      label: "Rate limiter fix",
      body: "ingress에 limiter 추가",
      linkedAgentIds: [],
      tags: ["learned_skill", "verification_fix"],
      version: 1,
      updatedAt: "2026-06-10T00:00:00.000Z",
    });
  });

  it("appends the reusablePrompt to the body (double-newline) only when present", () => {
    const withPrompt = candidate({ id: "skill_p", summary: "요약", reusablePrompt: "재사용 프롬프트" });
    const withoutPrompt = candidate({ id: "skill_n", summary: "요약" });

    const filePrompt = loadRuntimeSkills([withPrompt], [activeActivation("skill_p")])[0]!;
    const fileNoPrompt = loadRuntimeSkills([withoutPrompt], [activeActivation("skill_n")])[0]!;

    expect(filePrompt.body).toBe("요약\n\n재사용 프롬프트");
    expect(fileNoPrompt.body).toBe("요약"); // no trailing newline when prompt absent
  });

  it("GATE: a trusted (pinned) skill with no active activation is filtered out — trustStatus alone is insufficient", () => {
    const pinned = candidate({ id: "skill_pinned", trustStatus: "pinned" });
    // no activation record at all → treated as inactive → blocked
    expect(loadRuntimeSkills([pinned], [])).toEqual([]);
    // an explicit non-active activation is also filtered out
    expect(loadRuntimeSkills([pinned], [{ candidateId: "skill_pinned", activationStatus: "eval_passed", evalRunId: "e1" }])).toEqual([]);
  });

  it("GATE: a quarantined activation is excluded even when pinned with an eval basis", () => {
    const pinned = candidate({ id: "skill_q", trustStatus: "pinned" });
    const quarantined: SkillRuntimeActivationRecord = {
      candidateId: "skill_q",
      activationStatus: "quarantined",
      evalRunId: "eval_q",
      quarantinedReason: "regression",
    };
    expect(loadRuntimeSkills([pinned], [quarantined])).toEqual([]);
  });

  it("defaults activations to [] — with no activations every candidate is inactive, so nothing loads", () => {
    const files = loadRuntimeSkills([candidate({ id: "skill_x" }), candidate({ id: "skill_y" })]);
    expect(files).toEqual([]);
  });

  it("emits only the loadable subset from a mixed list, mapping each survivor", () => {
    const loadableA = candidate({ id: "skill_ok_1", source: "successful_prompt" });
    const blockedB = candidate({ id: "skill_blocked", trustStatus: "suggested" }); // not trusted
    const loadableC = candidate({ id: "skill_ok_2", source: "workflow_template" });

    const files = loadRuntimeSkills(
      [loadableA, blockedB, loadableC],
      [activeActivation("skill_ok_1"), activeActivation("skill_blocked"), activeActivation("skill_ok_2")],
    );

    const ids = files.map((f) => f.id);
    expect(ids).toEqual(["config_skill_learned_skill_ok_1", "config_skill_learned_skill_ok_2"]);
    // the blocked candidate never reaches the runtime even with an active activation,
    // because suggested trustStatus fails the loadability contract
    expect(ids).not.toContain("config_skill_learned_skill_blocked");
    expect(files.map((f) => f.tags[1])).toEqual(["successful_prompt", "workflow_template"]);
  });
});
