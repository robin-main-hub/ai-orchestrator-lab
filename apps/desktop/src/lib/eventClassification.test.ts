import { describe, expect, it } from "vitest";
import { classifyEvent, EVENT_CATEGORIES } from "./eventClassification";

describe("Batch 9 — LINE A: generic event classifier", () => {
  it("maps representative event types to readable categories", () => {
    expect(classifyEvent("learning.failure_recorded")).toBe("learning"); // learning beats failure
    expect(classifyEvent("learning.hypothesis_verified")).toBe("learning");
    expect(classifyEvent("sandbox.error_card")).toBe("failure");
    expect(classifyEvent("runner.gate.changed")).toBe("runner");
    expect(classifyEvent("approval.requested")).toBe("approval");
    expect(classifyEvent("memory.candidate_suggested")).toBe("memory");
    expect(classifyEvent("project.record_updated")).toBe("project");
    expect(classifyEvent("session.started")).toBe("system");
  });

  it("is deterministic and honest about the unknown", () => {
    expect(classifyEvent("")).toBe("unknown");
    expect(classifyEvent(undefined)).toBe("unknown");
    expect(classifyEvent("totally.opaque.event")).toBe("unknown");
    // stable across calls
    expect(classifyEvent("runner.gate.changed")).toBe(classifyEvent("runner.gate.changed"));
  });

  it("uses neutral category names only (no domain terms)", () => {
    const blob = JSON.stringify(EVENT_CATEGORIES).toLowerCase();
    for (const banned of ["erp", "gio", "customer", "sales", "giolite", "서흥"]) {
      expect(blob.includes(banned)).toBe(false);
    }
  });
});

// Characterization tests for the previously-uncovered input-normalization and
// rule-ordering precedence branches (no behavior change). The existing suite
// pins representative types and the single learning>failure ordering; these pin
// the null/whitespace-only normalization, case-insensitivity + surrounding-
// whitespace trim, the remaining precedence rungs (failure>approval & >runner,
// learning>failure&loop, runner>project, memory>project, project>system), the
// alternate keyword in each rule's alternation, and that EVENT_CATEGORIES omits
// "unknown" while listing all seven UI categories in rule order. All pure.
describe("eventClassification — normalization & rule-ordering precedence characterization", () => {
  it("treats null and whitespace-only input as unknown", () => {
    expect(classifyEvent(null)).toBe("unknown");
    expect(classifyEvent("   ")).toBe("unknown");
    expect(classifyEvent("\t\n ")).toBe("unknown");
  });

  it("lowercases and trims surrounding whitespace before matching", () => {
    expect(classifyEvent("  APPROVAL.Requested  ")).toBe("approval");
    expect(classifyEvent("RUNNER.GATE")).toBe("runner");
  });

  it("ranks failure above approval and runner when keywords coexist", () => {
    expect(classifyEvent("approval.rejected")).toBe("failure");
    expect(classifyEvent("runner.execution_failed")).toBe("failure");
  });

  it("ranks learning above failure and loop-keyword runner", () => {
    expect(classifyEvent("investigation.loop_crashed")).toBe("learning");
    expect(classifyEvent("hypothesis.error")).toBe("learning");
  });

  it("ranks runner above project for execution/sandbox events", () => {
    expect(classifyEvent("task.executed")).toBe("runner");
    expect(classifyEvent("mission.sandbox_check")).toBe("runner");
  });

  it("ranks memory above project, and project above system", () => {
    expect(classifyEvent("memory.record_distilled")).toBe("memory");
    expect(classifyEvent("mission.provider_ready")).toBe("project");
  });

  it("matches the alternate keyword in each rule's alternation", () => {
    expect(classifyEvent("hypothesis.formed")).toBe("learning");
    expect(classifyEvent("consent.granted")).toBe("approval");
    expect(classifyEvent("permission.elevated")).toBe("approval");
    expect(classifyEvent("agent.remembered")).toBe("memory");
    expect(classifyEvent("evidence.attached")).toBe("memory");
    expect(classifyEvent("node.heartbeat")).toBe("system");
    expect(classifyEvent("config.loaded")).toBe("system");
  });

  it("excludes unknown from EVENT_CATEGORIES and lists all seven UI categories in rule order", () => {
    expect(EVENT_CATEGORIES).toEqual(["failure", "learning", "runner", "approval", "memory", "project", "system"]);
    expect(EVENT_CATEGORIES).not.toContain("unknown");
  });
});
