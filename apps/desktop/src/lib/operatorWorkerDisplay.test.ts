import { describe, expect, it } from "vitest";
import type { AgentRole } from "@ai-orchestrator/protocol";
import { agentRoleSchema } from "@ai-orchestrator/protocol";
import {
  normalizeOperatorWorkerPersonaKey,
  operatorKoreanRoleLabelByRole,
  operatorPersonaKeyByWorkerId,
  operatorPersonaNameByKey,
  operatorPersonaRoleOverrideByKey,
  resolveOperatorWorkerDisplay,
} from "./operatorWorkerDisplay";

// Characterization tests for the operator worker persona/role display resolution
// (no behavior change). normalizeOperatorWorkerPersonaKey walks four resolution
// rungs (worker-id map → worker-id-is-already-a-persona-key → strip agent_ prefix
// → fall back to role); resolveOperatorWorkerDisplay folds that key into a
// display name, portrait id and a "<role> · <detail>" label with a role override
// or the "기본 역할" default. These pin each rung and the display projection's
// fallbacks. All pure dictionary lookups.
describe("normalizeOperatorWorkerPersonaKey", () => {
  it("maps a known worker id to its persona key (rung 1)", () => {
    expect(normalizeOperatorWorkerPersonaKey("agent_auditor", "auditor")).toBe("yuno");
    expect(normalizeOperatorWorkerPersonaKey("agent_architect", "architect")).toBe("architect");
  });

  it("returns the worker id when it is already a persona key (rung 2)", () => {
    expect(normalizeOperatorWorkerPersonaKey("kurumi", "executor")).toBe("kurumi");
  });

  it("strips the agent_ prefix when the suffix is a persona key (rung 3)", () => {
    // agent_yohane is not in the worker-id map, but "yohane" is a persona key
    expect(normalizeOperatorWorkerPersonaKey("agent_yohane", "skeptic")).toBe("yohane");
  });

  it("falls back to the role when nothing else resolves (rung 4)", () => {
    expect(normalizeOperatorWorkerPersonaKey("agent_unknown_worker", "researcher")).toBe("researcher");
    expect(normalizeOperatorWorkerPersonaKey("totally-opaque", "companion")).toBe("companion");
  });
});

describe("resolveOperatorWorkerDisplay", () => {
  it("resolves a mapped worker into name, portrait and default-role label", () => {
    expect(resolveOperatorWorkerDisplay({ workerId: "agent_auditor", role: "auditor" })).toEqual({
      displayName: "가사이 유노",
      portraitAgentId: "yuno",
      roleLabel: "감사자 · 기본 역할",
    });
  });

  it("applies the persona role override in the detail segment", () => {
    expect(resolveOperatorWorkerDisplay({ workerId: "agent_skeptic", role: "skeptic" })).toEqual({
      displayName: "소류 아스카 랭그레이",
      portraitAgentId: "skeptic",
      roleLabel: "비판자 · UX 비판자",
    });
    expect(resolveOperatorWorkerDisplay({ workerId: "agent_skeptic_yohane", role: "skeptic" })).toEqual({
      displayName: "츠시마 요시코",
      portraitAgentId: "yohane",
      roleLabel: "비판자 · 4차원 아이디어 뱅크",
    });
  });

  it("uses the role-derived persona key when the worker id is unknown", () => {
    expect(resolveOperatorWorkerDisplay({ workerId: "agent_unknown_worker", role: "researcher" })).toEqual({
      displayName: "마오마오",
      portraitAgentId: "researcher",
      roleLabel: "조사자 · 기본 역할",
    });
  });

  it("falls back to the worker id as display name when the persona key has no name", () => {
    // role "companion" is a valid role label but has no persona name entry
    expect(resolveOperatorWorkerDisplay({ workerId: "agent_unknown_worker", role: "companion" })).toEqual({
      displayName: "agent_unknown_worker",
      portraitAgentId: "companion",
      roleLabel: "동행자 · 기본 역할",
    });
  });
});

// Characterization tests (no behavior change) for the four previously-unasserted
// dictionary exports the resolver above leans on. The function block pins the
// resolution rungs through hand-picked examples, but never the tables' own validity,
// totality, or cross-table coupling — which is what guarantees a *mapped* worker never
// falls through to the raw-id display.
//   - operatorKoreanRoleLabelByRole must be a TOTAL Record<AgentRole, string>: exactly
//     the protocol's AgentRole union as keys (a missing role would render no label, an
//     extra key would be dead), each label non-empty and distinct.
//   - operatorPersonaKeyByWorkerId: every key is an "agent_"-prefixed worker id and
//     every value is a persona key that EXISTS in operatorPersonaNameByKey — the
//     coupling that makes resolveOperatorWorkerDisplay surface a real name, not the id.
//   - operatorPersonaNameByKey: every display name non-empty; the documented alias
//     auditor === yuno (both "가사이 유노") holds.
//   - operatorPersonaRoleOverrideByKey: keyed only by real persona keys, non-empty
//     detail labels, and each override actually surfaces in the resolver's detail
//     segment (never the "기본 역할" default).
describe("operatorKoreanRoleLabelByRole", () => {
  const roleOptions = agentRoleSchema.options as AgentRole[];

  it("is a total map over exactly the AgentRole union", () => {
    expect(Object.keys(operatorKoreanRoleLabelByRole).sort()).toEqual([...roleOptions].sort());
  });

  it("gives every role a non-empty, distinct Korean label", () => {
    const labels = roleOptions.map((role) => operatorKoreanRoleLabelByRole[role]);
    for (const label of labels) {
      expect(label.trim().length).toBeGreaterThan(0);
    }
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe("operatorPersonaKeyByWorkerId", () => {
  it("keys are agent_-prefixed and every value resolves to a real persona name", () => {
    for (const [workerId, personaKey] of Object.entries(operatorPersonaKeyByWorkerId)) {
      expect(workerId.startsWith("agent_")).toBe(true);
      // coupling: the persona key a worker maps to must have a display name
      expect(operatorPersonaNameByKey[personaKey]).toBeDefined();
    }
  });

  it("every mapped worker resolves through the resolver to its persona name, not the raw id", () => {
    for (const [workerId, personaKey] of Object.entries(operatorPersonaKeyByWorkerId)) {
      const display = resolveOperatorWorkerDisplay({ workerId, role: "companion" });
      expect(display.portraitAgentId).toBe(personaKey);
      expect(display.displayName).toBe(operatorPersonaNameByKey[personaKey]);
      expect(display.displayName).not.toBe(workerId);
    }
  });
});

describe("operatorPersonaNameByKey", () => {
  it("gives every persona key a non-empty display name", () => {
    for (const name of Object.values(operatorPersonaNameByKey)) {
      expect(name.trim().length).toBeGreaterThan(0);
    }
  });

  it("keeps the documented auditor/yuno alias", () => {
    expect(operatorPersonaNameByKey.auditor).toBe("가사이 유노");
    expect(operatorPersonaNameByKey.auditor).toBe(operatorPersonaNameByKey.yuno);
  });
});

describe("operatorPersonaRoleOverrideByKey", () => {
  it("is keyed only by real persona keys with non-empty detail labels", () => {
    for (const [key, detail] of Object.entries(operatorPersonaRoleOverrideByKey)) {
      expect(operatorPersonaNameByKey[key]).toBeDefined();
      expect(detail.trim().length).toBeGreaterThan(0);
    }
  });

  it("surfaces each override in the resolver's detail segment (not the default)", () => {
    for (const key of Object.keys(operatorPersonaRoleOverrideByKey)) {
      const display = resolveOperatorWorkerDisplay({ workerId: key, role: "skeptic" });
      expect(display.roleLabel.endsWith(operatorPersonaRoleOverrideByKey[key]!)).toBe(true);
      expect(display.roleLabel).not.toContain("기본 역할");
    }
  });
});
