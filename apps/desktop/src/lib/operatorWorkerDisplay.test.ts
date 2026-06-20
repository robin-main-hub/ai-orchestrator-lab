import { describe, expect, it } from "vitest";
import {
  normalizeOperatorWorkerPersonaKey,
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
