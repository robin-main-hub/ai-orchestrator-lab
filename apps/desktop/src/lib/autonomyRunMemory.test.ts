import { memoryRecordSchema } from "@ai-orchestrator/protocol";
import { describe, expect, it } from "vitest";
import { createAutonomyRunMemoryCandidate } from "./autonomyRunMemory";

const base = {
  runId: "desktop_42",
  sessionId: "s1",
  personaName: "makise",
  role: "qa",
  goal: "Add a rate limiter to the ingress guard",
  loopStatus: "completed" as const,
  stepCount: 3,
  createdAt: "2026-06-10T00:00:00.000Z",
};

describe("createAutonomyRunMemoryCandidate", () => {
  it("produces a schema-valid memory record summarizing the run", () => {
    const candidate = createAutonomyRunMemoryCandidate(base);
    expect(() => memoryRecordSchema.parse(candidate.record)).not.toThrow();
    expect(candidate.record.id).toBe("memory_autonomy_run_desktop_42");
    expect(candidate.record.kind).toBe("workflow");
    expect(candidate.record.content).toContain("makise");
    expect(candidate.record.content).toContain("완료");
    expect(candidate.record.tags).toContain("status:completed");
    expect(candidate.record.tags).toContain("agent:makise");
    expect(candidate.agentId).toBe("makise");
  });

  it("reflects a failed run's status", () => {
    const candidate = createAutonomyRunMemoryCandidate({ ...base, loopStatus: "failed", stepCount: 1 });
    expect(candidate.record.content).toContain("실패");
    expect(candidate.record.tags).toContain("status:failed");
  });

  it("falls back to a safe agent label when persona is blank", () => {
    const candidate = createAutonomyRunMemoryCandidate({ ...base, personaName: "" });
    expect(candidate.agentId).toBe("agent");
    expect(() => memoryRecordSchema.parse(candidate.record)).not.toThrow();
  });
});
