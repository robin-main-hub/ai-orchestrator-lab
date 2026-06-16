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
    for (const banned of ["erp", "gio", "customer", "sales", "example-domain", "서흥"]) {
      expect(blob.includes(banned)).toBe(false);
    }
  });
});
