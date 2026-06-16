import { describe, expect, it } from "vitest";
import { projectWorkItemsLite, workItemFromEvent, workItemFromRecord } from "./workItemLite";

describe("Batch 9 — LINE D: WorkItem-lite projection (read-only)", () => {
  it("projects an observed event with category/source/observed honesty", () => {
    const w = workItemFromEvent({
      id: "e1",
      type: "runner.gate.changed",
      createdAt: "2026-06-17T09:00:00.000Z",
      source: "dgx",
    });
    expect(w).toMatchObject({
      id: "e1",
      title: "runner.gate.changed",
      category: "runner",
      status: "observed",
      source: "dgx",
      observed: true,
    });
  });

  it("projects a project record as a suggested, not-observed candidate", () => {
    const w = workItemFromRecord({ missionId: "m-1", title: "proj one" });
    expect(w).toMatchObject({
      id: "project-m-1",
      title: "proj one",
      category: "project",
      status: "suggested",
      source: "project_record",
      observed: false,
    });
  });

  it("merges events + records newest-first without mutating inputs", () => {
    const events = [
      { id: "e1", type: "session.started", createdAt: "2026-06-14T00:00:00.000Z" },
      { id: "e2", type: "memory.candidate", createdAt: "2026-06-16T00:00:00.000Z" },
    ];
    const records = [{ missionId: "m-1", title: "p" }];
    const snapshot = JSON.parse(JSON.stringify(events));
    const out = projectWorkItemsLite(events, records);
    expect(out[0]!.id).toBe("e2"); // newest event first
    expect(out.some((w) => w.id === "project-m-1")).toBe(true);
    expect(events).toEqual(snapshot); // inputs untouched
  });

  it("falls back to a generic source for events without one", () => {
    expect(workItemFromEvent({ id: "x", type: "x", createdAt: "" }).source).toBe("event");
  });
});
